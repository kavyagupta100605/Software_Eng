const Availability = require('../models/Availability');
const Service = require('../models/Service');
const Provider = require('../models/Provider');
const Appointment = require('../models/Appointment');

/**
 * Computes available time slots for a given provider and service over a date range.
 * 
 * @param {String} providerId 
 * @param {String} serviceId 
 * @param {Date|String} startDate 
 * @param {Date|String} endDate 
 * @returns {Promise<Array>} List of available slots
 */
async function getAvailableSlots(providerId, serviceId, startDate, endDate) {
  const provider = await Provider.findById(providerId);
  if (!provider) {
    throw new Error('Provider not found');
  }

  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) {
    throw new Error('Service not found or inactive');
  }

  const durationMins = service.durationMins;
  const bufferMins = provider.bufferMinutes || 10;
  const stepMins = durationMins + bufferMins;

  // Fetch availability document
  let availability = await Availability.findOne({ providerId });
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

  const start = new Date(startDate);
  const end = new Date(endDate);

  // Fetch all requested/confirmed appointments for this provider in range
  const existingAppointments = await Appointment.find({
    providerId,
    status: { $in: ['requested', 'confirmed'] },
    slotStart: { $lt: end },
    slotEnd: { $gt: start }
  }).lean();

  const availableSlots = [];

  // Iterate date by date
  let currDate = new Date(start);
  currDate.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(end);
  rangeEnd.setHours(23, 59, 59, 999);

  while (currDate <= rangeEnd) {
    const dayOfWeek = currDate.getDay(); // 0 = Sun, 1 = Mon ...
    const dayHours = availability.weeklyHours.filter(wh => wh.dayOfWeek === dayOfWeek);

    for (const range of dayHours) {
      const [startH, startM] = range.startTime.split(':').map(Number);
      const [endH, endM] = range.endTime.split(':').map(Number);

      const daySlotStart = new Date(currDate);
      daySlotStart.setHours(startH, startM, 0, 0);

      const daySlotEnd = new Date(currDate);
      daySlotEnd.setHours(endH, endM, 0, 0);

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
          return slotStart.getTime() < aEnd && slotEnd.getTime() > aStart;
        });

        if (!hasAppointmentConflict) {
          availableSlots.push({
            slotStart: slotStart.toISOString(),
            slotEnd: slotEnd.toISOString(),
            durationMins,
            available: true
          });
        }

        // Increment by duration + buffer
        slotStart = new Date(slotStart.getTime() + stepMins * 60000);
      }
    }

    // Move to next calendar day
    currDate.setDate(currDate.getDate() + 1);
  }

  return availableSlots;
}

/**
 * Validates if a requested slot is available at write-time (concurrency protection)
 */
async function checkSlotConflict(providerId, slotStart, slotEnd) {
  const sStart = new Date(slotStart);
  const sEnd = new Date(slotEnd);

  // Check existing appointments
  const conflictingAppointment = await Appointment.findOne({
    providerId,
    status: { $in: ['requested', 'confirmed'] },
    slotStart: { $lt: sEnd },
    slotEnd: { $gt: sStart }
  });

  if (conflictingAppointment) {
    return { hasConflict: true, reason: 'This time slot is already booked' };
  }

  // Check blocked ranges
  const availability = await Availability.findOne({ providerId });
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
