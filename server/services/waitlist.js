const WaitlistEntry = require('../models/WaitlistEntry');
const Provider = require('../models/Provider');
const User = require('../models/User');
const { getAvailableSlots } = require('./availabilityEngine');
const { sendWaitlistOffer } = require('./notifyService');

const OFFER_MS = 10 * 60_000;
const active = ['waiting', 'offered'];
const fifo = { createdAt: 1, _id: 1 };

function same(left, right) {
  return String(left) === String(right);
}

function overlap(entry, start, end, bufferMs) {
  return +entry.slotStart < +end + bufferMs && +entry.slotEnd + bufferMs > +start;
}

async function lockSchedule(providerId, session) {
  return Provider.findByIdAndUpdate(providerId, {
    $inc: { walletBookingRevision: 1 }
  }, { session });
}

function activeEntries(providerId, start, end, bufferMs, now) {
  return WaitlistEntry.find({
    providerId,
    slotStart: { $gt: now, $lt: new Date(+end + bufferMs) },
    slotEnd: { $gt: new Date(+start - bufferMs) },
    $or: [{ status: 'waiting' }, { status: 'offered', offerExpiresAt: { $gt: now } }]
  }).sort(fifo);
}

function describeSlot(slot, entries, serviceId, clientId, bufferMs) {
  const matches = entries.filter(entry => overlap(entry, new Date(slot.slotStart), new Date(slot.slotEnd), bufferMs));
  const own = matches.find(entry => clientId && same(entry.clientId, clientId)
    && same(entry.serviceId, serviceId) && +entry.slotStart === Date.parse(slot.slotStart));
  if (!slot.available) return { ...slot, status: own ? 'waiting' : 'booked' };
  const offer = matches.find(entry => entry.status === 'offered');
  // An offer authorizes only its original service and start time.
  if (offer && offer === own) {
    return { ...slot, status: 'offered', offerExpiresAt: offer.offerExpiresAt };
  }
  if (matches.length) return { ...slot, available: false, status: own ? 'waiting' : 'reserved' };
  return { ...slot, status: 'available' };
}

async function decorateSlots(providerId, serviceId, slots, clientId) {
  if (!slots.length) return slots;
  const provider = await Provider.findById(providerId);
  const bufferMs = (provider?.bufferMinutes ?? 10) * 60_000;
  const first = new Date(Math.min(...slots.map(slot => Date.parse(slot.slotStart))));
  const last = new Date(Math.max(...slots.map(slot => Date.parse(slot.slotEnd))));
  const entries = await activeEntries(providerId, first, last, bufferMs, new Date()).lean();
  return slots.map(slot => describeSlot(slot, entries, serviceId, clientId, bufferMs));
}

async function claimableOffer({ providerId, serviceId, clientId, start, end, bufferMs, session }) {
  const entries = await activeEntries(providerId, start, end, bufferMs, new Date()).session(session);
  if (!entries.length) return null;
  const offer = entries.find(entry => entry.status === 'offered');
  if (offer && same(offer.clientId, clientId) && same(offer.serviceId, serviceId)
      && +offer.slotStart === +start) return offer;
  throw Object.assign(new Error('This time is reserved for the waitlist.'), {
    statusCode: 409, code: 'WAITLIST_PRIORITY'
  });
}

async function joinWaitlist(providerId, serviceId, clientId, start) {
  return WaitlistEntry.db.transaction(async session => {
    await lockSchedule(providerId, session);
    const slots = await getAvailableSlots(providerId, serviceId, start, start, session, true);
    const slot = slots.find(candidate => Date.parse(candidate.slotStart) === +start);
    if (!slot || slot.available) {
      throw Object.assign(new Error('You can join only while this time is booked.'), {
        statusCode: 409, code: 'WAITLIST_SLOT_NOT_BOOKED'
      });
    }
    const key = { providerId, serviceId, clientId, slotStart: start };
    const existing = await WaitlistEntry.findOne(key).session(session);
    if (existing && active.includes(existing.status)) return;
    await WaitlistEntry.findOneAndUpdate(key, {
      $set: { slotEnd: new Date(slot.slotEnd), status: 'waiting', createdAt: new Date() },
      $unset: { offerExpiresAt: 1, notifiedAt: 1 }
    }, { upsert: true, session, timestamps: false });
  });
}

async function advanceProvider(providerId) {
  if (!await WaitlistEntry.exists({ providerId, status: { $in: active } })) return;
  await WaitlistEntry.db.transaction(async session => {
    const provider = await lockSchedule(providerId, session);
    if (!provider) return;
    const now = new Date();
    await WaitlistEntry.updateMany({
      providerId, $or: [
        { status: { $in: active }, slotStart: { $lte: now } },
        { status: 'offered', offerExpiresAt: { $lte: now } }
      ]
    }, { $set: { status: 'expired' } }, { session });
    if (!provider.isApproved) return;
    const entries = await WaitlistEntry.find({ providerId, status: { $in: active } })
      .sort(fifo).session(session);
    const offers = entries.filter(entry => entry.status === 'offered');
    const bufferMs = (provider.bufferMinutes ?? 10) * 60_000;
    for (const entry of entries) {
      if (entry.status !== 'waiting') continue;
      let slots;
      try {
        slots = await getAvailableSlots(providerId, entry.serviceId, entry.slotStart, entry.slotStart, session, true);
      } catch (error) {
        if (error.statusCode !== 404) throw error;
        slots = [];
      }
      const slot = slots.find(candidate => Date.parse(candidate.slotStart) === +entry.slotStart);
      if (!slot) {
        entry.status = 'expired';
        await entry.save({ session });
        continue;
      }
      const end = new Date(slot.slotEnd);
      if (+entry.slotEnd !== +end) {
        entry.slotEnd = end;
        await entry.save({ session });
      }
      if (!slot.available || offers.some(offer => overlap(offer, entry.slotStart, end, bufferMs))) continue;
      entry.slotEnd = end;
      entry.status = 'offered';
      entry.offerExpiresAt = new Date(Math.min(+entry.slotStart, Date.now() + OFFER_MS));
      if (entry.offerExpiresAt <= new Date()) continue;
      await entry.save({ session });
      offers.push(entry);
    }
  });

  const pending = await WaitlistEntry.find({
    providerId, status: 'offered', offerExpiresAt: { $gt: new Date() }, notifiedAt: null
  }).populate('providerId', 'businessName').populate('serviceId', 'name');
  for (const offer of pending) {
    try {
      const client = await User.findById(offer.clientId).select('email');
      if (!client?.email) continue;
      await sendWaitlistOffer(client.email, offer);
      await WaitlistEntry.updateOne({
        _id: offer._id, status: 'offered', offerExpiresAt: offer.offerExpiresAt
      }, { $set: { notifiedAt: new Date() } });
    } catch (error) {
      console.error('Waitlist email failed:', error.message);
    }
  }
}

const advancing = new Map();
function advanceWaitlist(providerId) {
  const key = String(providerId);
  if (!advancing.has(key)) {
    const pending = advanceProvider(providerId).finally(() => advancing.delete(key));
    advancing.set(key, pending);
  }
  return advancing.get(key);
}

async function scanWaitlists() {
  const providers = await WaitlistEntry.distinct('providerId', { status: { $in: active } });
  for (const providerId of providers) {
    try {
      await advanceWaitlist(providerId);
    } catch (error) {
      console.error('Waitlist advancement failed:', error.message);
    }
  }
}

module.exports = { lockSchedule, decorateSlots, describeSlot, claimableOffer, joinWaitlist, advanceWaitlist, scanWaitlists };
