const Provider = require('../models/Provider');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

const getAllProviders = async (req, res, next) => {
  try {
    const providers = await Provider.find()
      .populate('userId', 'name email phone role')
      .sort({ _id: -1 })
      .lean();
    res.json({ data: { providers } });
  } catch (err) {
    next(err);
  }
};

const toggleProviderApproval = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    provider.isApproved = !provider.isApproved;
    await provider.save();

    res.json({ data: { provider } });
  } catch (err) {
    next(err);
  }
};

const getAllAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.find()
      .populate('clientId', 'name email')
      .populate('providerId', 'businessName category')
      .populate('serviceId', 'name price')
      .sort({ slotStart: -1 })
      .limit(100)
      .lean();

    const stats = {
      totalAppointments: await Appointment.countDocuments(),
      confirmedCount: await Appointment.countDocuments({ status: 'confirmed' }),
      completedCount: await Appointment.countDocuments({ status: 'completed' }),
      cancelledCount: await Appointment.countDocuments({ status: 'cancelled' }),
      totalUsers: await User.countDocuments(),
      totalProviders: await Provider.countDocuments()
    };

    res.json({ data: { appointments, stats } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllProviders,
  toggleProviderApproval,
  getAllAppointments
};
