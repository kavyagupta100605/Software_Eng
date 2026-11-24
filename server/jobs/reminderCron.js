const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const { sendReminderEmail } = require('../services/notifyService');

function initReminderCron() {
  // Runs every 15 minutes: "*/15 * * * *"
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron Job] Checking for appointments requiring 24h reminders...');
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + (24 * 60 + 15) * 60000);

      const appointmentsToRemind = await Appointment.find({
        status: 'confirmed',
        reminderSent: false,
        slotStart: { $gt: now, $lte: windowEnd }
      })
        .populate('clientId', 'name email')
        .populate('providerId', 'businessName')
        .populate('serviceId', 'name');

      for (const appt of appointmentsToRemind) {
        if (!appt.clientId?.email) continue;
        try {
          await sendReminderEmail({
            clientEmail: appt.clientId.email,
            clientName: appt.clientId.name,
            providerName: appt.providerId ? appt.providerId.businessName : 'Provider',
            serviceName: appt.serviceId ? appt.serviceId.name : 'Service',
            appointmentId: appt._id,
            slotStart: appt.slotStart
          });
          await Appointment.updateOne({ _id: appt._id, status: 'confirmed', slotStart: appt.slotStart },
            { $set: { reminderSent: true } });
        } catch (error) {
          console.error('[Cron Job] Reminder failed:', error.message);
        }
      }
    } catch (err) {
      console.error('[Cron Job Error] Failed to process reminders:', err.message);
    }
  });

  console.log('[Cron Job] Reminder cron job initialized (runs every 15 mins).');
}

module.exports = initReminderCron;
