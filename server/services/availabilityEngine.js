const { defaultZone, calendarDay, localInstant } = require('./scheduleTime');
const Availability = require('../models/Availability');
const Service = require('../models/Service');
const Provider = require('../models/Provider');
const Appointment = require('../models/Appointment');

function inSession(query, session) {
  return session ? query.session(session) : query;
}

/**
 * Computes available time slots for a given provider and service over a date range.
 * 
 * @param {String} providerId 
 * @param {String} serviceId 
 * @param {Date|String} startDate 
 * @param {Date|String} endDate 
 * @returns {Promise<Array>} List of available slots
 */
async function getAvailableSlots(providerId, serviceId, startDate, endDate, session, includeBooked = false) {
  const provider = await inSession(Provider.findById(providerId), session);
  if (!provider || !provider.isApproved) {
    throw Object.assign(new Error('Approved provider not found'), { statusCode: 404 });
  }

  const service = await inSession(Service.findById(serviceId), session);
  if (!service || !service.isActive || service.providerId.toString() !== providerId.toString()) {
    throw Object.assign(new Error('Active service for this provider not found'), { statusCode: 404 });
  }

  const durationMins = service.durationMins;
  const bufferMins = provider.bufferMinutes ?? 10;
  const stepMins = durationMins + bufferMins;

  // Fetch availability document
  let availability = await inSession(Availability.findOne({ providerId }), session);
  if (!availability) {
    // Default availability: Mon-Fri 09:00 to 17:00 if not explicitly set
    availability = {
      weeklyHours: [1, 2, 3, 4, 5].map(day => ({
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00'
      })),
      blockedRanges: []
    };
  }

  const zone = availability.timezone || defaultZone;
  const start = calendarDay(new Date(startDate), zone);
  const end = calendarDay(new Date(endDate), zone);
  const queryStart = new Date(+start - 86_400_000);
  const queryEnd = new Date(+end + 2 * 86_400_000);
  const bufferMs = bufferMins * 60000;

  // Fetch all requested/confirmed appointments for this provider in range
  const existingAppointments = await inSession(Appointment.find({
    providerId,
    status: { $in: ['requested', 'confirmed'] },
    slotStart: { $lt: new Date(queryEnd.getTime() + bufferMs) },
    slotEnd: { $gt: new Date(queryStart.getTime() - bufferMs) }
  }).lean(), session);

  const availableSlots = [];

  for (let day = start; day <= end; day = new Date(+day + 86_400_000)) {
    const dayHours = availability.weeklyHours.filter(wh => wh.dayOfWeek === day.getUTCDay());

    for (const range of dayHours) {
      const daySlotStart = localInstant(day, range.startTime, zone);
      const daySlotEnd = localInstant(day, range.endTime, zone);
      if (!daySlotStart || !daySlotEnd) continue;

      let slotStart = new Date(daySlotStart);

      while (new Date(slotStart.getTime() + durationMins * 60000) <= daySlotEnd) {
        const slotEnd = new Date(slotStart.getTime() + durationMins * 60000);

        // Discard if slot is in the past
        if (slotStart.getTime() < Date.now()) {
          slotStart = new Date(slotStart.getTime() + stepMins * 60000);
          continue;
        }

        // Check if slot overlaps any blocked range
        const isBlocked = availability.blockedRanges.some(blocked => {
          const bStart = new Date(blocked.start).getTime();
          const bEnd = new Date(blocked.end).getTime();
          return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
        });

        if (isBlocked) {
          slotStart = new Date(slotStart.getTime() + stepMins * 60000);
          continue;
        }

        // Check if slot overlaps any active appointment
        const hasAppointmentConflict = existingAppointments.some(appt => {
          const aStart = new Date(appt.slotStart).getTime();
          const aEnd = new Date(appt.slotEnd).getTime();
          return slotStart.getTime() < aEnd + bufferMs && slotEnd.getTime() + bufferMs > aStart;
        });

        if (includeBooked || !hasAppointmentConflict) {
          availableSlots.push({
            slotStart: slotStart.toISOString(),
            slotEnd: slotEnd.toISOString(),
            durationMins,
            available: !hasAppointmentConflict
          });
        }

        // Increment by duration + buffer
        slotStart = new Date(slotStart.getTime() + stepMins * 60000);
      }
    }

  }

  return [...new Map(availableSlots.sort((a, b) => a.slotStart.localeCompare(b.slotStart))
    .map(slot => [slot.slotStart, slot])).values()];
}

/**
 * Validates if a requested slot is available at write-time (concurrency protection)
 */
async function checkSlotConflict(providerId, slotStart, slotEnd, session) {
  const sStart = new Date(slotStart);
  const sEnd = new Date(slotEnd);

  const provider = await inSession(Provider.findById(providerId), session);
  const bufferMs = (provider?.bufferMinutes ?? 10) * 60000;

  // Include turnaround time on either side of an existing appointment.
  const conflictingAppointment = await inSession(Appointment.findOne({
    providerId,
    status: { $in: ['requested', 'confirmed'] },
    slotStart: { $lt: new Date(sEnd.getTime() + bufferMs) },
    slotEnd: { $gt: new Date(sStart.getTime() - bufferMs) }
  }), session);

  if (conflictingAppointment) {
    return { hasConflict: true, reason: 'This time slot is already booked' };
  }

  // Check blocked ranges
  const availability = await inSession(Availability.findOne({ providerId }), session);
  if (availability && availability.blockedRanges) {
    const isBlocked = availability.blockedRanges.some(blocked => {
      const bStart = new Date(blocked.start).getTime();
      const bEnd = new Date(blocked.end).getTime();
      return sStart.getTime() < bEnd && sEnd.getTime() > bStart;
    });

    if (isBlocked) {
      return { hasConflict: true, reason: 'Provider is unavailable during this time window' };
    }
  }

  return { hasConflict: false };
}

module.exports = {
  getAvailableSlots,
  checkSlotConflict
};
