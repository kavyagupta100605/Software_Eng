const Service = require('../models/Service');
const Provider = require('../models/Provider');

const getProviderServices = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider || (!provider.isApproved && provider.userId.toString() !== req.user?.id && req.user?.role !== 'admin')) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Approved provider not found' } });
    }
    const services = await Service.find({ providerId: req.params.id, isActive: true }).lean();
    res.json({ data: { services } });
  } catch (err) {
    next(err);
  }
};

const createService = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized to manage services for this provider' } });
    }

    const { name, durationMins, price } = req.body;

    const service = new Service({
      providerId: provider._id,
      name,
      durationMins: parseInt(durationMins),
      price: parseFloat(price) || 0,
      isActive: true
    });

    await service.save();
    res.status(201).json({ data: { service } });
  } catch (err) {
    next(err);
  }
};

const updateService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    const provider = await Provider.findById(service.providerId);
    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized to edit this service' } });
    }

    if (req.body.name !== undefined) service.name = req.body.name;
    if (req.body.durationMins !== undefined) service.durationMins = parseInt(req.body.durationMins);
    if (req.body.price !== undefined) service.price = parseFloat(req.body.price);

    await service.save();
    res.json({ data: { service } });
  } catch (err) {
    next(err);
  }
};

const deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    const provider = await Provider.findById(service.providerId);
    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } });
    }

    // Soft delete
    service.isActive = false;
    await service.save();

    res.json({ data: { message: 'Service successfully deactivated', service } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProviderServices,
  createService,
  updateService,
  deleteService
};
