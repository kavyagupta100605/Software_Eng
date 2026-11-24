const SlotHold = require('../models/SlotHold');
const { getAvailableSlots } = require('./availabilityEngine');
const { lockSchedule, claimableOffer } = require('./waitlist');

function findActiveHolds(providerId, start, end, bufferMs) {
  return SlotHold.find({
    providerId, expiresAt: { $gt: new Date() },
    slotStart: { $lt: new Date(+end + bufferMs) },
    slotEnd: { $gt: new Date(+start - bufferMs) }
  });
}

async function checkHolds({ providerId, serviceId, clientId, start, end, bufferMs, session }) {
  const holds = await findActiveHolds(providerId, start, end, bufferMs).session(session);
  const own = holds.find(hold => String(hold.clientId) === String(clientId)
    && String(hold.serviceId) === String(serviceId) && +hold.slotStart === +start);
  if (holds.some(hold => hold !== own)) {
    throw Object.assign(new Error('Another client is holding this time. Try again shortly.'), {
      statusCode: 409, code: 'SLOT_HELD'
    });
  }
  return own;
}

async function createHold(providerId, serviceId, clientId, start) {
  return SlotHold.db.transaction(async session => {
    const provider = await lockSchedule(providerId, session);
    const candidates = await getAvailableSlots(providerId, serviceId, start, start, session);
    const slot = candidates.find(item => Date.parse(item.slotStart) === +start);
    if (!slot) throw Object.assign(new Error('This time is no longer available.'), {
      statusCode: 409, code: 'SLOT_UNAVAILABLE'
    });
    const end = new Date(slot.slotEnd);
    const params = { providerId, serviceId, clientId, start, end, bufferMs: (provider.bufferMinutes ?? 10) * 60_000, session };
    const offer = await claimableOffer(params);
    const own = await checkHolds(params);
    if (own) return own;
    await SlotHold.deleteMany({ providerId, clientId }, { session });
    const expiresAt = new Date(Math.min(+start, Date.now() + 5 * 60_000, offer ? +offer.offerExpiresAt : Infinity));
    const [hold] = await SlotHold.create([{ providerId, serviceId, clientId, slotStart: start, slotEnd: end, expiresAt }], { session });
    return hold;
  });
}

function releaseHold(holdId, clientId, session) {
  return SlotHold.deleteOne({ _id: holdId, clientId }, session ? { session } : undefined);
}

async function showHolds(providerId, slots, clientId, bufferMs) {
  if (!slots.length) return slots;
  const start = new Date(Math.min(...slots.map(slot => Date.parse(slot.slotStart))));
  const end = new Date(Math.max(...slots.map(slot => Date.parse(slot.slotEnd))));
  const holds = await findActiveHolds(providerId, start, end, bufferMs).lean();
  return slots.map(slot => {
    if (!slot.available) return slot;
    const hold = holds.find(item => +item.slotStart < Date.parse(slot.slotEnd) + bufferMs
      && +item.slotEnd + bufferMs > Date.parse(slot.slotStart));
    if (!hold) return slot;
    if (clientId && String(hold.clientId) === String(clientId) && +hold.slotStart === Date.parse(slot.slotStart)) return slot;
    return { ...slot, available: false, status: 'held' };
  });
}

module.exports = { createHold, checkHolds, releaseHold, showHolds };
