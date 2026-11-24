const Appointment = require('../models/Appointment');
const { lockSchedule } = require('../services/waitlist');
const { defaultZone, formatter, normalizeHours, fitsHours, parseLocalDateTime } = require('../services/scheduleTime');
const { showHolds } = require('../services/slotHolds');
const { decorateSlots, joinWaitlist } = require('../services/waitlist');
const Availability = require('../models/Availability');
const Provider = require('../models/Provider');
const { getAvailableSlots } = require('../services/availabilityEngine');

const getAvailability = async (req, res, next) => {
  try {
    let availability = await Availability.findOne({ providerId: req.params.id }).lean();
    if (!availability) {
      availability = {
        providerId: req.params.id,
        weeklyHours: [1, 2, 3, 4, 5].map(day => ({
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00'
        })),
        blockedRanges: []
      };
    }
    res.json({ data: { availability: { ...availability, timezone: availability.timezone || defaultZone } } });
  } catch (err) {
    next(err);
  }
};

function defaultHours() {
  return [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' }));
}

async function changeSchedule(req, res, next, change) {
  try {
    const availability = await Availability.db.transaction(async session => {
      const provider = await lockSchedule(req.params.id, session);
      if (!provider) throw Object.assign(new Error('Provider not found.'), { statusCode: 404 });
      if (String(provider.userId) !== req.user.id && req.user.role !== 'admin') {
        throw Object.assign(new Error('Not authorized.'), { statusCode: 403 });
      }
      const schedule = await Availability.findOne({ providerId: provider._id }).session(session)
        || new Availability({ providerId: provider._id, weeklyHours: defaultHours() });
      const upcoming = () => Appointment.find({ providerId: provider._id,
        status: { $in: ['requested', 'confirmed'] }, slotEnd: { $gt: new Date() }
      }).session(session).select('slotStart slotEnd').lean();
      await change(schedule, upcoming);
      await schedule.save({ session });
      return schedule;
    });
    res.json({ data: { availability: { ...availability.toObject(), timezone: availability.timezone || defaultZone } } });
  } catch (error) {
    if (error.appointments) {
      return res.status(409).json({ error: { code: 'SCHEDULE_CONFLICT', message: error.message, appointments: error.appointments } });
    }
    next(error);
  }
}

function rejectConflicts(appointments) {
  if (appointments.length) throw Object.assign(new Error('Move or cancel the affected appointments before saving this schedule.'), { appointments });
}

const updateAvailability = (req, res, next) => changeSchedule(req, res, next, async (schedule, upcoming) => {
  const hours = normalizeHours(req.body.weeklyHours);
  const timezone = req.body.timezone ?? schedule.timezone ?? defaultZone;
  if (!hours || typeof timezone !== 'string' || timezone.length > 80) {
    throw Object.assign(new Error('Enter valid non-overlapping working hours and a timezone.'), { statusCode: 400 });
  }
  try { formatter(timezone); } catch {
    throw Object.assign(new Error('Enter a valid timezone such as Asia/Kolkata.'), { statusCode: 400 });
  }
  rejectConflicts((await upcoming()).filter(item => !fitsHours(item.slotStart, item.slotEnd, hours, timezone)));
  schedule.weeklyHours = hours;
  schedule.timezone = timezone;
});

const addBlockedRange = (req, res, next) => changeSchedule(req, res, next, async (schedule, upcoming) => {
  const zone = schedule.timezone || defaultZone;
  const start = req.body.localStart ? parseLocalDateTime(req.body.localStart, zone) : new Date(req.body.start);
  const end = req.body.localEnd ? parseLocalDateTime(req.body.localEnd, zone) : new Date(req.body.end);
  const reason = req.body.reason || 'Unavailable';
  if (!start || !end || !Number.isFinite(+start) || !Number.isFinite(+end) || start >= end
      || typeof reason !== 'string' || reason.length > 200) {
    throw Object.assign(new Error('Enter a valid block with an end after its start.'), { statusCode: 400 });
  }
  rejectConflicts((await upcoming()).filter(item => item.slotStart < end && item.slotEnd > start));
  schedule.blockedRanges.push({ start, end, reason });
});

const removeBlockedRange = (req, res, next) => changeSchedule(req, res, next, async schedule => {
  if (!schedule.blockedRanges.id(req.params.blockId)) {
    throw Object.assign(new Error('Blocked time not found.'), { statusCode: 404 });
  }
  schedule.blockedRanges.pull(req.params.blockId);
});

const getSlots = async (req, res, next) => {
  try {
    const { serviceId, from, to } = req.query;

    if (!serviceId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'serviceId query param is required' } });
    }

    // Default window: today to 7 days from now if not specified
    const startDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const firstDay = new Date(startDate);
    const lastDay = new Date(endDate);
    firstDay.setHours(0, 0, 0, 0);
    lastDay.setHours(0, 0, 0, 0);
    if (!Number.isFinite(+firstDay) || !Number.isFinite(+lastDay) || lastDay < firstDay
        || lastDay - firstDay > 31 * 86400_000) {
      return res.status(400).json({ error: { message: 'Choose a date range of up to 31 days.' } });
    }
    const candidates = await getAvailableSlots(req.params.id, serviceId, startDate, endDate, undefined, true);
    const slots = await decorateSlots(req.params.id, serviceId, candidates, req.user?.id);

    const provider = await Provider.findById(req.params.id);
    res.json({ data: { slots: await showHolds(req.params.id, slots, req.user?.id, (provider?.bufferMinutes ?? 10) * 60_000) } });
  } catch (err) {
    next(err);
  }
};

const joinSlotWaitlist = async (req, res, next) => {
  try {
    await joinWaitlist(req.params.id, req.body.serviceId, req.user.id, new Date(req.body.slotStart));
    res.json({ data: { joined: true } });
  } catch (error) {
    if (error.code === 20) {
      return res.status(503).json({ error: { message: 'The waitlist requires MongoDB with transaction support.' } });
    }
    next(error);
  }
};

module.exports = {
  joinSlotWaitlist,
  getAvailability,
  updateAvailability,
  addBlockedRange,
  removeBlockedRange,
  getSlots
};
