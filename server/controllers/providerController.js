const Provider = require('../models/Provider');
const Service = require('../models/Service');
const Availability = require('../models/Availability');

const listProviders = async (req, res, next) => {
  try {
    const { category, location, search, page = 1, limit = 10 } = req.query;

    const query = { isApproved: true };

    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }

    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [providers, total] = await Promise.all([
      Provider.find(query).skip(skip).limit(limitNum).populate('userId', 'name email phone').lean(),
      Provider.countDocuments(query)
    ]);

    // Attach services count for each provider
    const providerIds = providers.map(p => p._id);
    const services = await Service.find({ providerId: { $in: providerIds }, isActive: true }).lean();

    const result = providers.map(p => ({
      ...p,
      services: services.filter(s => s.providerId.toString() === p._id.toString())
    }));

    res.json({
      data: {
        providers: result,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

const getProviderById = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id).populate('userId', 'name email phone').lean();

    if (!provider) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Provider profile not found'
        }
      });
    }

    const services = await Service.find({ providerId: provider._id, isActive: true }).lean();
    const availability = await Availability.findOne({ providerId: provider._id }).lean();

    res.json({
      data: {
        provider: {
          ...provider,
          services,
          availability
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

const createProvider = async (req, res, next) => {
  try {
    const existing = await Provider.findOne({ userId: req.user.id });
    if (existing) {
      return res.status(409).json({
        error: {
          code: 'PROFILE_EXISTS',
          message: 'Provider profile already exists for this account'
        }
      });
    }

    const { businessName, category, description, location, bufferMinutes, cancellationWindowHours } = req.body;

    const provider = new Provider({
      userId: req.user.id,
      businessName,
      category,
      description,
      location,
      bufferMinutes: bufferMinutes !== undefined ? bufferMinutes : 10,
      cancellationWindowHours: cancellationWindowHours !== undefined ? cancellationWindowHours : 2
    });

    await provider.save();

    // Default availability
    const defaultAvailability = new Availability({
      providerId: provider._id,
      weeklyHours: [1, 2, 3, 4, 5].map(day => ({
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00'
      })),
      blockedRanges: []
    });
    await defaultAvailability.save();

    res.status(201).json({
      data: { provider }
    });
  } catch (err) {
    next(err);
  }
};

const updateProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);

    if (!provider) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Provider profile not found' }
      });
    }

    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Not authorized to edit this provider profile' }
      });
    }

    const fields = ['businessName', 'category', 'description', 'location', 'bufferMinutes', 'cancellationWindowHours'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        provider[f] = req.body[f];
      }
    });

    await provider.save();

    res.json({
      data: { provider }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listProviders,
  getProviderById,
  createProvider,
  updateProvider
};
