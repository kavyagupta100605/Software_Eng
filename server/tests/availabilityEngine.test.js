const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Provider = require('../models/Provider');
const Service = require('../models/Service');
const Availability = require('../models/Availability');
const Appointment = require('../models/Appointment');
const { getAvailableSlots, checkSlotConflict } = require('../services/availabilityEngine');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Provider.deleteMany({});
  await Service.deleteMany({});
  await Availability.deleteMany({});
  await Appointment.deleteMany({});
});

describe('Availability Engine Unit Tests', () => {
  test('Generates candidate slots matching weekly hours and buffer time', async () => {
    const user = await User.create({ name: 'Test Provider', email: 'p@test.com', passwordHash: 'hash', role: 'provider' });
    const provider = await Provider.create({
      userId: user._id,
      businessName: 'Test Business',
      category: 'Clinic',
      bufferMinutes: 15
    });

    const service = await Service.create({
      providerId: provider._id,
      name: 'General Checkup',
      durationMins: 45,
      price: 100
    });

    // Set availability for Monday only (dayOfWeek: 1) from 09:00 to 12:00
    await Availability.create({
      providerId: provider._id,
      weeklyHours: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }],
      blockedRanges: []
    });

    // Find next Monday date
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));

    const slots = await getAvailableSlots(provider._id, service._id, nextMonday, nextMonday);

    // Duration 45m + Buffer 15m = 60m total step.
    // 09:00-09:45, 10:00-10:45, 11:00-11:45 -> 3 slots total
    expect(slots.length).toBe(3);
    expect(new Date(slots[0].slotStart).getHours()).toBe(9);
    expect(new Date(slots[1].slotStart).getHours()).toBe(10);
    expect(new Date(slots[2].slotStart).getHours()).toBe(11);
  });

  test('Filters out slots that overlap blocked ranges', async () => {
    const user = await User.create({ name: 'Test Provider 2', email: 'p2@test.com', passwordHash: 'hash', role: 'provider' });
    const provider = await Provider.create({ userId: user._id, businessName: 'Biz 2', category: 'Salon', bufferMinutes: 0 });
    const service = await Service.create({ providerId: provider._id, name: 'Cut', durationMins: 60 });

    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
    nextMonday.setHours(0, 0, 0, 0);

    const blockStart = new Date(nextMonday);
    blockStart.setHours(10, 0, 0, 0);
    const blockEnd = new Date(nextMonday);
    blockEnd.setHours(11, 0, 0, 0);

    await Availability.create({
      providerId: provider._id,
      weeklyHours: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }],
      blockedRanges: [{ start: blockStart, end: blockEnd, reason: 'Maintenance' }]
    });

    const slots = await getAvailableSlots(provider._id, service._id, nextMonday, nextMonday);

    // 09:00-10:00 (available), 10:00-11:00 (blocked), 11:00-12:00 (available)
    expect(slots.length).toBe(2);
    expect(new Date(slots[0].slotStart).getHours()).toBe(9);
    expect(new Date(slots[1].slotStart).getHours()).toBe(11);
  });

  test('Detects write-time conflicts accurately', async () => {
    const user = await User.create({ name: 'Provider 3', email: 'p3@test.com', passwordHash: 'hash', role: 'provider' });
    const client = await User.create({ name: 'Client 1', email: 'c1@test.com', passwordHash: 'hash', role: 'client' });
    const provider = await Provider.create({ userId: user._id, businessName: 'Biz 3', category: 'Tutor' });
    const service = await Service.create({ providerId: provider._id, name: 'Lesson', durationMins: 60 });

    const slotStart = new Date(Date.now() + 86400000); // Tomorrow
    const slotEnd = new Date(slotStart.getTime() + 60 * 60000);

    await Appointment.create({
      clientId: client._id,
      providerId: provider._id,
      serviceId: service._id,
      slotStart,
      slotEnd,
      status: 'confirmed'
    });

    // Check overlapping slot
    const conflictResult = await checkSlotConflict(provider._id, slotStart, slotEnd);
    expect(conflictResult.hasConflict).toBe(true);

    // Check non-overlapping future slot
    const nonOverlappingStart = new Date(slotEnd.getTime() + 30 * 60000);
    const nonOverlappingEnd = new Date(nonOverlappingStart.getTime() + 60 * 60000);
    const clearResult = await checkSlotConflict(provider._id, nonOverlappingStart, nonOverlappingEnd);
    expect(clearResult.hasConflict).toBe(false);
  });
});
