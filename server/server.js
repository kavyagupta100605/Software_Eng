const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('./config/db');
const cron = require('node-cron');
const { deliverDueEmails } = require('./jobs/emailOutbox');
const { deliverEmail } = require('./services/notifyService');
const { scanWaitlists } = require('./services/waitlist');
const initReminderCron = require('./jobs/reminderCron');
const seedDemoData = require('./config/seedData');
const SlotHold = require('./models/SlotHold');
const WaitlistEntry = require('./models/WaitlistEntry');
const EmailNotification = require('./models/EmailNotification');

const app = require('./app');

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await Promise.all([SlotHold, WaitlistEntry, EmailNotification].map(model => model.init()));
  // Seed demo data if database is empty
  if (process.env.NODE_ENV !== 'production') {
    await seedDemoData();
  }

  // Start cron jobs
  initReminderCron();
  let delivering = false;
  cron.schedule('*/10 * * * * *', async () => {
    if (delivering) return;
    delivering = true;
    try {
      await deliverDueEmails(deliverEmail);
    } catch (error) {
      console.error('Email queue failed:', error.message);
    } finally {
      delivering = false;
    }
  });
  cron.schedule('* * * * *', () => {
    void scanWaitlists().catch(error => console.error('Waitlist scan failed:', error.message));
  });

  app.listen(PORT, () => {
    console.log(`🚀 Express API server running on port ${PORT} [http://localhost:${PORT}]`);
  });
}).catch(() => {
  console.error('Server startup failed: check database configuration and connectivity.');
  process.exitCode = 1;
});
