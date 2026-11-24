const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'local-integration-test-only';
process.env.EMAIL_TRANSPORT = 'json';

const app = require('../app');
const User = require('../models/User');
const Provider = require('../models/Provider');
const Service = require('../models/Service');
const Availability = require('../models/Availability');
const Appointment = require('../models/Appointment');
const SlotHold = require('../models/SlotHold');
const WaitlistEntry = require('../models/WaitlistEntry');
const EmailNotification = require('../models/EmailNotification');
const { advanceWaitlist } = require('../services/waitlist');
const { deliverDueEmails } = require('../jobs/emailOutbox');
const { deliverEmail, sendReminderEmail } = require('../services/notifyService');

function authenticated(method, path, user, body) {
  const token = jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET);
  const call = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  return body ? call.send(body) : call;
}

async function eventually(check) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail('Timed out waiting for notification records');
}

test('isolated replica set verifies holds, wallet/refund, reschedule, schedule controls, FIFO and email delivery records',
  { timeout: 120_000 }, async () => {
    const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    try {
      await mongoose.connect(replica.getUri());
      await Promise.all([User, Provider, Service, Availability, Appointment, SlotHold, WaitlistEntry, EmailNotification]
        .map(model => model.init()));
      const [owner, first, second, third] = await User.create(
        ['owner', 'first', 'second', 'third'].map(name => ({
          name, role: name === 'owner' ? 'provider' : 'client', email: `${name}@example.test`, passwordHash: 'test'
        }))
      );
      const provider = await Provider.create({
        userId: owner._id, businessName: 'Integration provider', category: 'Test', isApproved: true, bufferMinutes: 0
      });
      const service = await Service.create({ providerId: provider._id, name: 'Test service', durationMins: 30, price: 20 });
      const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const mondayIndex = new Date(`${day}T12:00:00Z`).getUTCDay();
      const hours = [{ dayOfWeek: mondayIndex, startTime: '09:00', endTime: '11:00' },
        { dayOfWeek: mondayIndex, startTime: '13:00', endTime: '15:00' }];
      const url = '/api/v1/providers/' + provider._id;
      const auth = authenticated;
      await auth('put', url + '/availability', owner, { weeklyHours: hours, timezone: 'Asia/Kolkata' }).expect(200);
      const at = utc => `${day}T${utc}:00.000Z`;
      const slotA = at('03:30');
      const slotB = at('07:30');
      const slotC = at('08:00');
      const list = user => auth('get', url + '/slots', user)
        .query({ serviceId: String(service._id), from: slotA, to: slotA }).expect(200);
      const { body: { data: { slots } } } = await list(first);
      assert.equal(slots[0].slotStart, slotA);
      assert.equal(slots.length, 8);
      await auth('post', url + '/availability/block', owner, {
        localStart: `${day}T13:30`, localEnd: `${day}T14:00`, reason: 'Holiday'
      }).expect(200);
      const blocked = await list(first);
      assert(!blocked.body.data.slots.some(slot => slot.slotStart === slotC));
      const availability = await auth('get', url + '/availability', owner).expect(200);
      await auth('delete', url + '/availability/block/' + availability.body.data.availability.blockedRanges[0]._id, owner).expect(200);

      for (const client of [first, second, third]) {
        await auth('post', '/api/v1/wallet/top-up', client, { amountCents: 10_000 }).expect(200);
      }
      const selected = slotStart => ({ providerId: provider.id, serviceId: service.id, slotStart });
      const hold = (client, slotStart) => auth('post', url + '/holds', client, selected(slotStart));
      const attempt = await Promise.all([hold(first, slotA), hold(second, slotA)]);
      assert.deepEqual(attempt.map(item => item.status).sort(), [201, 409]);
      const winner = attempt[0].status === 201 ? first : second;
      const waiter = winner.id === first.id ? second : first;
      const winnerHold = attempt.find(item => item.status === 201).body.data.id;
      const book = (client, slotStart, holdId) => auth('post', '/api/v1/appointments', client,
        { ...selected(slotStart), paymentMethod: 'demo_wallet', expectedPriceCents: 2000, holdId });
      await book(waiter, slotA).expect(409);
      const booked = await book(winner, slotA, winnerHold).expect(201);
      const id = booked.body.data.appointment._id;
      assert.equal(booked.body.data.walletBalanceCents, 8000);
      await book(waiter, slotA).expect(400);

      await auth('put', url + '/availability', owner, { weeklyHours: hours.slice(1), timezone: 'Asia/Kolkata' })
        .expect(409).expect(result => assert.equal(result.body.error.appointments[0]._id, id));
      await auth('post', url + '/availability/block', owner, {
        localStart: `${day}T09:00`, localEnd: `${day}T09:30`
      }).expect(409);

      await auth('post', url + '/waitlist', waiter, selected(slotA)).expect(200);
      await auth('post', url + '/waitlist', third, selected(slotA)).expect(200);
      const reschedule = (client, slotStart, holdId) => auth('patch', `/api/v1/appointments/${id}/reschedule`, client, { slotStart, holdId });
      await reschedule(waiter, slotB).expect(404);
      await reschedule(winner, at('05:30')).expect(409);
      assert.equal((await Appointment.findById(id)).slotStart.toISOString(), slotA);
      const newHold = await hold(winner, slotB).expect(201);
      await reschedule(winner, slotB, newHold.body.data.id).expect(200);
      const moved = await Appointment.findById(id);
      assert.equal(moved.slotStart.toISOString(), slotB);
      assert.equal(moved.walletPaidCents, 2000);
      assert.equal((await User.findById(winner.id)).walletBalanceCents, 8000);
      await advanceWaitlist(provider.id);
      await deliverDueEmails(deliverEmail, 100);
      const offer = await WaitlistEntry.findOne({ status: 'offered' });
      assert.equal(String(offer.clientId), waiter.id);
      const ineligible = await book(third, slotA).expect(409);
      assert.equal(ineligible.body.error.code, 'WAITLIST_PRIORITY');
      await WaitlistEntry.updateOne({ _id: offer.id }, { $set: { offerExpiresAt: new Date(0) } });
      await eventually(async () => {
        await advanceWaitlist(provider.id);
        return WaitlistEntry.exists({ clientId: third._id, status: 'offered' });
      });
      const thirdHold = await hold(third, slotA).expect(201);
      const thirdBooking = await book(third, slotA, thirdHold.body.data.id).expect(201);
      assert.equal(await WaitlistEntry.countDocuments({ clientId: third._id, status: 'claimed' }), 1);

      const cancellation = await auth('patch', `/api/v1/appointments/${id}/cancel`, winner).expect(200);
      assert.equal(cancellation.body.data.appointment.walletRefund.amountCents, 2000);
      await auth('patch', `/api/v1/appointments/${id}/cancel`, winner).expect(400);
      assert.equal((await User.findById(winner.id)).walletBalanceCents, 10_000);

      const expiring = await hold(waiter, slotC).expect(201);
      await SlotHold.updateOne({ _id: expiring.body.data.id }, { $set: { expiresAt: new Date(0) } });
      await book(waiter, slotC, expiring.body.data.id).expect(409)
        .expect(result => assert.equal(result.body.error.code, 'HOLD_EXPIRED'));
      const replacement = await hold(waiter, slotC).expect(201);
      await auth('delete', url + '/holds/' + replacement.body.data.id, third).expect(204);
      assert(await SlotHold.exists({ _id: replacement.body.data.id }));
      await auth('delete', url + '/holds/' + replacement.body.data.id, waiter).expect(204);
      const beforeParallel = await User.findById(waiter.id);
      const results = await Promise.all([book(waiter, slotC), book(winner, slotC)]);
      assert.equal(results.filter(item => item.status === 201).length, 1);
      assert.equal(await Appointment.countDocuments({ providerId: provider._id, slotStart: slotC, status: 'confirmed' }), 1);
      const waiterPaid = results[0].status === 201;
      assert.equal((await User.findById(waiter.id)).walletBalanceCents, beforeParallel.walletBalanceCents - (waiterPaid ? 2000 : 0));

      await sendReminderEmail({ appointmentId: thirdBooking.body.data.appointment._id, clientEmail: third.email, clientName: third.name,
        providerName: provider.businessName, serviceName: service.name, slotStart: new Date(slotA) });
      await eventually(async () => (await EmailNotification.countDocuments()) >= 12);
      // Inject one SMTP-like failure before running the real Nodemailer JSON transport.
      let injectedFailure = false;
      await deliverDueEmails(async (...message) => {
        if (!injectedFailure) {
          injectedFailure = true;
          throw Object.assign(new Error('Offline'), { code: 'TEST_SMTP' });
        }
        return deliverEmail(...message);
      }, 100);
      const retry = await EmailNotification.findOne({ lastError: 'TEST_SMTP' });
      assert.equal(retry.status, 'pending');
      assert.equal(retry.attempts, 1);
      await EmailNotification.updateOne({ _id: retry.id }, { $set: { nextAttemptAt: new Date(0) } });
      await deliverDueEmails(deliverEmail, 100);
      const receipts = await EmailNotification.find({ status: 'sent', deliveryMode: 'json' });
      assert.equal(await EmailNotification.countDocuments({ status: 'expired', waitlistEntryId: { $exists: true } }), 1);
      for (const expression of [/funds added/, /confirmed/, /rescheduled/, /waitlist/, /cancelled/, /Reminder/]) {
        assert(receipts.some(item => expression.test(item.subject)), String(expression));
      }
      assert(receipts.some(item => /Demo wallet refund: \$20/.test(item.text)));
    } finally {
      await mongoose.disconnect();
      await replica.stop();
    }
  });
