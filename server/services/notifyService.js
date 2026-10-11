const nodemailer = require('nodemailer');

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  // Try Ethereal test account for dev/testing
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log(`Nodemailer initialized with Ethereal test account: ${testAccount.user}`);
  } catch (err) {
    console.log('Using fallback json transport for Nodemailer');
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  return transporter;
}

async function sendBookingConfirmation({ clientEmail, clientName, providerName, serviceName, slotStart }) {
  try {
    const transport = await getTransporter();
    const formattedDate = new Date(slotStart).toLocaleString();

    const info = await transport.sendMail({
      from: '"BookEase Appointments" <no-reply@bookease.com>',
      to: clientEmail,
      subject: `Appointment Confirmed: ${serviceName} with ${providerName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Appointment Confirmed!</h2>
          <p>Hi ${clientName},</p>
          <p>Your appointment has been successfully scheduled:</p>
          <ul>
            <li><strong>Service:</strong> ${serviceName}</li>
            <li><strong>Provider:</strong> ${providerName}</li>
            <li><strong>Date & Time:</strong> ${formattedDate}</li>
          </ul>
          <p>Thank you for using BookEase!</p>
        </div>
      `
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Confirmation Email Preview URL: ${previewUrl}`);
    }
  } catch (err) {
    console.error('Failed to send booking confirmation email:', err.message);
  }
}

async function sendReminderEmail({ clientEmail, clientName, providerName, serviceName, slotStart }) {
  try {
    const transport = await getTransporter();
    const formattedDate = new Date(slotStart).toLocaleString();

    const info = await transport.sendMail({
      from: '"BookEase Appointments" <no-reply@bookease.com>',
      to: clientEmail,
      subject: `Reminder: Upcoming Appointment tomorrow at ${formattedDate}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Upcoming Appointment Reminder</h2>
          <p>Hi ${clientName},</p>
          <p>This is a reminder that you have an upcoming appointment in 24 hours:</p>
          <ul>
            <li><strong>Service:</strong> ${serviceName}</li>
            <li><strong>Provider:</strong> ${providerName}</li>
            <li><strong>Date & Time:</strong> ${formattedDate}</li>
          </ul>
        </div>
      `
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Reminder Email Preview URL: ${previewUrl}`);
    }
  } catch (err) {
    console.error('Failed to send reminder email:', err.message);
  }
}

module.exports = {
  sendBookingConfirmation,
  sendReminderEmail
};
