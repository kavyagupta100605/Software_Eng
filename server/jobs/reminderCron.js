const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const { sendReminderEmail } = require('../services/notifyService');

function initReminderCron() {
  // Runs every 15 minutes: "*/15 * * * *"
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron Job] Checking for appointments requiring 24h reminders...');
    try {
      const now = new Date();
      // Target window: 23 hours 45 minutes to 24 hours 15 minutes from now
      const windowStart = new Date(now.getTime() + (23 * 60 + 45) * 60000);
      const windowEnd = new Date(now.getTime() + (24 * 60 + 15) * 60000);

      const appointmentsToRemind = await Appointment.find({
        status: 'confirmed',
        reminderSent: false,
        slotStart: { $gte: windowStart, $lte: windowEnd }
      })
        .populate('clientId', 'name email')
        .populate('providerId', 'businessName')
        .populate('serviceId', 'name');

      for (const appt of appointmentsToRemind) {
        if (appt.clientId && appt.clientId.email) {
          await sendReminderEmail({
            clientEmail: appt.clientId.email,
            clientName: appt.clientId.name,
            providerName: appt.providerId ? appt.providerId.businessName : 'Provider',
            serviceName: appt.serviceId ? appt.serviceId.name : 'Service',
            slotStart: appt.slotStart
          });
        }

        appt.reminderSent = true;
        await appt.save();
        console.log(`[Cron Job] Reminder sent for appointment ${appt._id}`);
      }
    } catch (err) {
      console.error('[Cron Job Error] Failed to process reminders:', err.message);
    }
  });

  console.log('[Cron Job] Reminder cron job initialized (runs every 15 mins).');
}

module.exports = initReminderCron;
