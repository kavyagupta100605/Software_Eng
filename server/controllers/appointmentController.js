const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const Provider = require('../models/Provider');
const User = require('../models/User');
const { checkSlotConflict, getAvailableSlots } = require('../services/availabilityEngine');
const { sendBookingConfirmation } = require('../services/notifyService');

const createAppointment = async (req, res, next) => {
  try {
    const { providerId, serviceId, slotStart, notes } = req.body;
    const clientId = req.user.id;

    const service = await Service.findById(serviceId);
    if (!service || !service.isActive || service.providerId.toString() !== providerId.toString()) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Selected service is not active or does not exist' }
      });
    }

    const provider = await Provider.findById(providerId);
    if (!provider || !provider.isApproved) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Selected provider does not exist' }
      });
    }

    const start = new Date(slotStart);
    const end = new Date(start.getTime() + service.durationMins * 60000);

    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
      return res.status(400).json({ error: { code: 'INVALID_SLOT', message: 'Appointment start must be a valid future time' } });
    }
    // Reuse discovery rules: opening hours, closing boundaries, slot grid and buffers.
    const availableSlots = await getAvailableSlots(providerId, serviceId, start, start);
    if (!availableSlots.some(slot => new Date(slot.slotStart).getTime() === start.getTime())) {
      return res.status(400).json({ error: { code: 'INVALID_SLOT', message: 'Selected time is outside the available booking slots' } });
    }

    // Final conflict recheck (atomic reservation handling is separate follow-up work)
    const conflict = await checkSlotConflict(providerId, start, end);
    if (conflict.hasConflict) {
      return res.status(409).json({
        error: {
          code: 'SLOT_CONFLICT',
          message: conflict.reason || 'Requested time slot is no longer available'
        }
      });
    }

    const appointment = new Appointment({
      clientId,
      providerId,
      serviceId,
      slotStart: start,
      slotEnd: end,
      status: 'confirmed',
      notes
    });

    await appointment.save();

    // Trigger async email notification (do not block API response)
    User.findById(clientId).then(clientUser => {
      if (clientUser) {
        sendBookingConfirmation({
          clientEmail: clientUser.email,
          clientName: clientUser.name,
          providerName: provider.businessName,
          serviceName: service.name,
          slotStart: start
        }).catch(err => console.error('Email notify error:', err));
      }
    });

    res.status(201).json({
      data: { appointment }
    });
  } catch (err) {
    next(err);
  }
};

const getClientAppointments = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { clientId: req.user.id };

    if (status) {
      filter.status = status;
    }

    const appointments = await Appointment.find(filter)
      .populate('providerId', 'businessName category location phone')
      .populate('serviceId', 'name durationMins price')
      .sort({ slotStart: -1 })
      .lean();

    res.json({ data: { appointments } });
  } catch (err) {
    next(err);
  }
};

const getProviderAppointments = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    if (provider.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized to view schedule' } });
    }

    const { date, status } = req.query;
    const filter = { providerId: provider._id };

    if (status) {
      filter.status = status;
    }

    if (date) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      filter.slotStart = { $gte: dayStart, $lte: dayEnd };
    }

    const appointments = await Appointment.find(filter)
      .populate('clientId', 'name email phone')
      .populate('serviceId', 'name durationMins price')
      .sort({ slotStart: 1 })
      .lean();

    res.json({ data: { appointments } });
  } catch (err) {
    next(err);
  }
};

const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found' } });
    }

    // State machine check: only confirmed appointments can be cancelled
    if (appointment.status !== 'confirmed' && appointment.status !== 'requested') {
      return res.status(400).json({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot cancel an appointment with status '${appointment.status}'`
        }
      });
    }

    const isClient = appointment.clientId.toString() === req.user.id;
    const provider = await Provider.findById(appointment.providerId);
    const isProviderOwner = provider && provider.userId.toString() === req.user.id;

    if (!isClient && !isProviderOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized to cancel this appointment' } });
    }

    // If client is cancelling, enforce cancellation window rule
    if (isClient && !isProviderOwner && req.user.role !== 'admin') {
      const windowHours = provider ? provider.cancellationWindowHours : 2;
      const cutoffTime = new Date(appointment.slotStart.getTime() - windowHours * 60 * 60 * 1000);

      if (new Date() > cutoffTime) {
        return res.status(403).json({
          error: {
            code: 'CANCELLATION_WINDOW_EXPIRED',
            message: `Appointments cannot be cancelled within ${windowHours} hours of the scheduled start time`
          }
        });
      }
    }

    appointment.status = 'cancelled';
    appointment.cancelledBy = isClient ? 'client' : 'provider';
    await appointment.save();

    res.json({ data: { appointment } });
  } catch (err) {
    next(err);
  }
};

const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body; // 'completed' | 'no-show' | 'cancelled'
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found' } });
    }

    const provider = await Provider.findById(appointment.providerId);
    if (!provider || (provider.userId.toString() !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the provider can update status' } });
    }

    // Enforce State Machine transition rules
    if (appointment.status !== 'confirmed' && appointment.status !== 'requested') {
      return res.status(400).json({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot change status of an appointment that is currently '${appointment.status}'`
        }
      });
    }

    appointment.status = status;
    if (status === 'cancelled') {
      appointment.cancelledBy = 'provider';
    }
    await appointment.save();

    res.json({ data: { appointment } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createAppointment,
  getClientAppointments,
  getProviderAppointments,
  cancelAppointment,
  updateAppointmentStatus
};
