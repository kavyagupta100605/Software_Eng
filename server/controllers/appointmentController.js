const { checkHolds, releaseHold } = require('../services/slotHolds');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const Provider = require('../models/Provider');
const User = require('../models/User');
const { checkSlotConflict, getAvailableSlots } = require('../services/availabilityEngine');
const { lockSchedule, claimableOffer, advanceWaitlist } = require('../services/waitlist');
const calculateWalletRefund = require('../services/walletRefund');
const { sendBookingConfirmation, sendBookingCancellation, sendRescheduleEmail } = require('../services/notifyService');

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
    const reserve = async (session) => {
      // All booking and offer writes for a provider share this transaction lock.
      const lockedProvider = await lockSchedule(providerId, session);
      const currentService = await Service.findById(serviceId).session(session);
      const priceCents = Math.round((currentService?.price ?? 0) * 100);
      if (req.body.expectedPriceCents !== undefined && req.body.expectedPriceCents !== priceCents) {
        throw Object.assign(new Error('The service price changed. Refresh the provider page before booking.'), {
          statusCode: 409, code: 'PRICE_CHANGED'
        });
      }
      if (req.body.paymentMethod !== 'demo_wallet' && priceCents > 0) {
        throw Object.assign(new Error('Please pay with your demo wallet.'), { statusCode: 400, code: 'WALLET_REQUIRED' });
      }

      const availableSlots = await getAvailableSlots(providerId, serviceId, start, start, session);
      const slot = availableSlots.find(({ slotStart }) => new Date(slotStart).getTime() === start.getTime());
      if (!slot) {
        throw Object.assign(new Error('Selected time is outside the available booking slots'), {
          statusCode: 400, code: 'INVALID_SLOT'
        });
      }
      const slotEnd = new Date(slot.slotEnd ?? end);
      const conflict = await checkSlotConflict(providerId, start, slotEnd, session);
      if (conflict.hasConflict) {
        throw Object.assign(new Error(conflict.reason || 'Requested time slot is no longer available'), {
          statusCode: 409, code: 'SLOT_CONFLICT'
        });
      }

      const reservation = {
        providerId, serviceId, clientId, start, end: slotEnd,
        bufferMs: (lockedProvider?.bufferMinutes ?? 10) * 60_000, session
      };
      const offer = await claimableOffer(reservation);
      const hold = await checkHolds(reservation);
      if (req.body.holdId && (!hold || String(hold._id) !== req.body.holdId)) {
        throw Object.assign(new Error('Your hold expired. Select the slot again.'), { statusCode: 409, code: 'HOLD_EXPIRED' });
      }

      let payer;
      if (priceCents > 0) {
        payer = await User.findOneAndUpdate({
          _id: clientId,
          walletBalanceCents: { $gte: priceCents }
        }, { $inc: { walletBalanceCents: -priceCents } }, { new: true, session });
        if (!payer) {
          throw Object.assign(new Error('Add funds to your demo wallet before booking.'), {
            statusCode: 409, code: 'INSUFFICIENT_WALLET_BALANCE'
          });
        }
      }

      const appointment = new Appointment({
        clientId, providerId, serviceId, slotStart: start, slotEnd,
        status: 'confirmed', notes, walletPaidCents: priceCents
      });
      await appointment.save({ session });
      if (hold) await releaseHold(hold._id, clientId, session);
      if (offer) {
        offer.status = 'claimed';
        await offer.save({ session });
      }
      const client = payer ?? await User.findById(clientId, null, { session });
      if (client?.email) {
        await sendBookingConfirmation({
          clientEmail: client.email,
          clientName: client.name,
          providerName: lockedProvider.businessName,
          serviceName: currentService.name,
          slotStart: start,
          paidCents: appointment.walletPaidCents,
          balanceCents: payer?.walletBalanceCents,
          session
        });
      }
      return { appointment, payer };
    };

    const { appointment, payer } = await Appointment.db.transaction(reserve);

    res.status(201).json({
      data: { appointment, walletBalanceCents: payer?.walletBalanceCents }
    });
  } catch (err) {
    if (err.statusCode && err.code) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    if (err.code === 20) {
      return res.status(503).json({
        error: { code: 'BOOKING_DATABASE_UNAVAILABLE', message: 'Booking requires MongoDB with transaction support.' }
      });
    }
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

async function queueCancellation(appointment, provider, balanceCents, session) {
  const client = await User.findById(appointment.clientId, null, { session });
  const owner = provider ? await User.findById(provider.userId, null, { session }) : null;
  const service = await Service.findById(appointment.serviceId, null, { session });
  const recipients = new Set([client?.email, owner?.email].filter(Boolean));
  for (const email of recipients) {
    await sendBookingCancellation({
      email,
      serviceName: service?.name || 'Booked service',
      providerName: provider?.businessName || 'your provider',
      slotStart: appointment.slotStart,
      walletRefund: email === client?.email ? appointment.walletRefund : undefined,
      balanceCents: email === client?.email ? balanceCents : undefined,
      session
    });
  }
}

async function saveCancellation(appointment, provider, cancelledBy, cancelledAt, res) {
  const walletRefund = appointment.walletPaidCents > 0
    ? calculateWalletRefund(appointment.walletPaidCents, appointment.slotStart, cancelledAt, cancelledBy)
    : undefined;
  const changes = { status: 'cancelled', cancelledBy, cancelledAt };
  if (walletRefund) changes.walletRefund = walletRefund;

  const apply = async (session) => {
    const result = await Appointment.updateOne(
      { _id: appointment._id, status: appointment.status },
      { $set: changes },
      { session }
    );
    if (!result.modifiedCount) return { updated: false };

    let balanceCents;
    if (walletRefund?.amountCents > 0) {
      const client = await User.findByIdAndUpdate(appointment.clientId, {
        $inc: { walletBalanceCents: walletRefund.amountCents }
      }, { new: true, session });
      if (!client) {
        throw Object.assign(new Error('The wallet account could not be found.'), {
          statusCode: 409, code: 'WALLET_ACCOUNT_MISSING'
        });
      }
      balanceCents = client.walletBalanceCents;
    }
    await queueCancellation({
      clientId: appointment.clientId, serviceId: appointment.serviceId,
      slotStart: appointment.slotStart, walletRefund
    }, provider, balanceCents, session);
    return { updated: true };
  };

  const { updated } = await Appointment.db.transaction(apply);
  if (!updated) {
    return res.status(409).json({ error: {
      code: 'STATUS_CHANGED', message: 'The appointment status changed. Refresh and try again.'
    } });
  }

  Object.assign(appointment, changes);
  void advanceWaitlist(appointment.providerId).catch(error => {
    console.error('Waitlist advancement failed:', error.message);
  });
  return res.json({ data: { appointment } });
}

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

    const cancelledAt = new Date();
    const cancelledBy = isClient && !isProviderOwner && req.user.role !== 'admin' ? 'client' : 'provider';
    if (cancelledBy === 'client') {
      if (appointment.walletPaidCents > 0) {
        if (cancelledAt >= appointment.slotStart) {
          return res.status(403).json({ error: {
            code: 'CANCELLATION_WINDOW_EXPIRED', message: 'Cancel before the appointment starts.'
          } });
        }
      } else {
        const windowHours = provider?.cancellationWindowHours ?? 2;
        const cutoff = appointment.slotStart.getTime() - windowHours * 60 * 60 * 1000;
        if (cancelledAt.getTime() > cutoff) {
          return res.status(403).json({ error: {
            code: 'CANCELLATION_WINDOW_EXPIRED',
            message: `Appointments cannot be cancelled within ${windowHours} hours of the scheduled start time`
          } });
        }
      }
    }

    return await saveCancellation(appointment, provider, cancelledBy, cancelledAt, res);
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

    if (status === 'cancelled') {
      return await saveCancellation(appointment, provider, 'provider', new Date(), res);
    }
    const result = await Appointment.updateOne(
      { _id: appointment._id, status: appointment.status },
      { $set: { status } }
    );
    if (!result.modifiedCount) {
      return res.status(409).json({ error: { code: 'STATUS_CHANGED', message: 'The appointment status changed. Refresh and try again.' } });
    }
    appointment.status = status;
    res.json({ data: { appointment } });
  } catch (err) {
    next(err);
  }
};

const rescheduleAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const clientId = req.user.id;
    const start = new Date(req.body.slotStart);
    const existing = await Appointment.findOne({ _id: id, clientId });
    if (!existing) return res.status(404).json({ error: { message: 'Appointment not found.' } });

    await Appointment.db.transaction(async session => {
      const provider = await lockSchedule(existing.providerId, session);
      const current = await Appointment.findOne({ _id: id, clientId, status: 'confirmed',
        slotStart: { $eq: existing.slotStart, $gt: new Date() }
      }).session(session);
      if (!current || !provider?.isApproved || start <= new Date() || +start === +current.slotStart) {
        throw Object.assign(new Error('Only a future confirmed appointment can be moved to a different available time.'), { statusCode: 409 });
      }

      const { providerId, serviceId } = current;
      const slots = await getAvailableSlots(providerId, serviceId, start, start, session);
      const slot = slots.find(item => Date.parse(item.slotStart) === +start);
      if (!slot) throw Object.assign(new Error('The new time is no longer available.'), { statusCode: 409 });
      const end = new Date(slot.slotEnd);
      const reservation = { providerId, serviceId, clientId, start, end,
        bufferMs: (provider.bufferMinutes ?? 10) * 60_000, session };
      const offer = await claimableOffer(reservation);
      const hold = await checkHolds(reservation);
      if (req.body.holdId && (!hold || String(hold._id) !== req.body.holdId)) {
        throw Object.assign(new Error('Your hold expired. Select the slot again.'), { statusCode: 409, code: 'HOLD_EXPIRED' });
      }
      const updated = await Appointment.updateOne(
        { _id: id, status: 'confirmed', slotStart: current.slotStart },
        { $set: { slotStart: start, slotEnd: end, reminderSent: false } }, { session }
      );
      if (!updated.modifiedCount) throw Object.assign(new Error('The appointment changed. Refresh and try again.'), { statusCode: 409 });
      if (hold) await releaseHold(hold._id, clientId, session);
      if (offer) {
        offer.status = 'claimed';
        await offer.save({ session });
      }
      const client = await User.findById(clientId, null, { session });
      const owner = await User.findById(provider.userId, null, { session });
      const service = await Service.findById(serviceId, null, { session });
      const recipients = new Set([client?.email, owner?.email].filter(Boolean));
      for (const email of recipients) {
        await sendRescheduleEmail({
          email, serviceName: service?.name || 'Booked service',
          previousStart: current.slotStart, slotStart: start, session
        });
      }
    });
    void advanceWaitlist(existing.providerId).catch(error => console.error('Waitlist advancement failed:', error.message));
    res.json({ data: { id, slotStart: start } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAppointment,
  rescheduleAppointment,
  getClientAppointments,
  getProviderAppointments,
  cancelAppointment,
  updateAppointmentStatus
};
