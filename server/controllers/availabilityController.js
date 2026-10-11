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
    res.json({ data: { availability } });
  } catch (err) {
    next(err);
  }
};

const updateAvailability = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } });
    }

    const { weeklyHours } = req.body;

    let availability = await Availability.findOne({ providerId: provider._id });
    if (!availability) {
      availability = new Availability({ providerId: provider._id, weeklyHours: [], blockedRanges: [] });
    }

    availability.weeklyHours = weeklyHours;
    await availability.save();

    res.json({ data: { availability } });
  } catch (err) {
    next(err);
  }
};

const addBlockedRange = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } });
    }

    const { start, end, reason } = req.body;

    let availability = await Availability.findOne({ providerId: provider._id });
    if (!availability) {
      availability = new Availability({ providerId: provider._id, weeklyHours: [], blockedRanges: [] });
    }

    availability.blockedRanges.push({
      start: new Date(start),
      end: new Date(end),
      reason: reason || 'Unavailable'
    });

    await availability.save();

    res.json({ data: { availability } });
  } catch (err) {
    next(err);
  }
};

const getSlots = async (req, res, next) => {
  try {
    const { serviceId, from, to } = req.query;

    if (!serviceId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'serviceId query param is required' } });
    }

    // Default window: today to 7 days from now if not specified
    const startDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const slots = await getAvailableSlots(req.params.id, serviceId, startDate, endDate);

    res.json({ data: { slots } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAvailability,
  updateAvailability,
  addBlockedRange,
  getSlots
};
