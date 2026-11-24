const { randomUUID } = require('node:crypto');
const EmailNotification = require('../models/EmailNotification');
const Appointment = require('../models/Appointment');
const WaitlistEntry = require('../models/WaitlistEntry');

async function enqueueEmail(message, options = {}) {
  const { key, expiresAt, appointmentId, appointmentStart, waitlistEntryId, session } = options;
  const record = { ...message, key, expiresAt, appointmentId, appointmentStart, waitlistEntryId };
  if (!key) return session ? EmailNotification.create([record], { session }) : EmailNotification.create(record);
  try {
    await EmailNotification.updateOne({ key }, { $setOnInsert: record }, { upsert: true, session });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
}

async function isStillRelevant(job, now) {
  if (job.expiresAt && job.expiresAt <= now) return false;
  if (job.appointmentId) return Boolean(await Appointment.exists({
    _id: job.appointmentId, status: 'confirmed', slotStart: job.appointmentStart
  }));
  if (job.waitlistEntryId) return Boolean(await WaitlistEntry.exists({
    _id: job.waitlistEntryId, status: 'offered', offerExpiresAt: job.expiresAt
  }));
  return true;
}

async function deliverDueEmails(deliver, limit = 25) {
  for (let count = 0; count < limit; count++) {
    const now = new Date();
    const leaseToken = randomUUID();
    const job = await EmailNotification.findOneAndUpdate({
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'sending', leaseUntil: { $lte: now } }
      ]
    }, {
      $set: { status: 'sending', leaseUntil: new Date(+now + 120_000), leaseToken },
      $inc: { attempts: 1 }
    }, { sort: { nextAttemptAt: 1 }, new: true });
    if (!job) return;
    const claim = { _id: job._id, leaseToken };
    const clearLease = { leaseUntil: 1, leaseToken: 1 };
    if (!await isStillRelevant(job, now)) {
      await EmailNotification.updateOne(claim, { $set: { status: 'expired' }, $unset: clearLease });
      continue;
    }
    let outcome;
    try {
      outcome = await deliver(job.to, job.subject, job.text);
    } catch (error) {
      const status = job.attempts >= 5 ? 'failed' : 'pending';
      const nextAttemptAt = new Date(Date.now() + 60_000 * 2 ** (job.attempts - 1));
      await EmailNotification.updateOne(claim, {
        $set: { status, nextAttemptAt, lastError: String(error.code || 'DELIVERY_ERROR') },
        $unset: clearLease
      });
      continue;
    }
    await EmailNotification.updateOne(claim, {
      $set: { status: 'sent', sentAt: new Date(), deliveryMode: outcome?.mode, messageId: outcome?.messageId },
      $unset: { ...clearLease, lastError: 1 }
    });
  }
}

module.exports = { enqueueEmail, deliverDueEmails };
