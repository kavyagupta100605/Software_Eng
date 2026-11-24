const nodemailer = require('nodemailer');
const { enqueueEmail } = require('../jobs/emailOutbox');

let transporter;

async function createTransporter() {
  if (process.env.EMAIL_TRANSPORT === 'json') {
    return { mode: 'json', mailer: nodemailer.createTransport({ jsonTransport: true }) };
  }
  const timeouts = { connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 45_000 };
  if (process.env.SMTP_URL) {
    return { mode: 'smtp', mailer: nodemailer.createTransport({ url: process.env.SMTP_URL, ...timeouts }) };
  }

  try {
    const account = await nodemailer.createTestAccount();
    return { mode: 'ethereal', mailer: nodemailer.createTransport({
      ...timeouts,
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass }
    }) };
  } catch (error) {
    console.warn('Email preview unavailable. Using local JSON transport.');
    return { mode: 'json', mailer: nodemailer.createTransport({ jsonTransport: true }) };
  }
}

async function deliverEmail(to, subject, text) {
  transporter ??= createTransporter();
  const { mode, mailer } = await transporter;
  const info = await mailer.sendMail({
    from: process.env.MAIL_FROM || '"BookEase Appointments" <no-reply@bookease.com>',
    to,
    subject,
    text
  });
  if (info.rejected?.length && !info.accepted?.length) {
    throw Object.assign(new Error('Mail recipient rejected'), { code: 'RECIPIENT_REJECTED' });
  }
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log('BookEase email preview:', preview);
  if (mode === 'json') {
    console.log('BookEase local email:', subject);
  }
  return { mode, messageId: info.messageId };
}

function sendEmail(to, subject, text, options) {
  return enqueueEmail({ to, subject, text }, options);
}

const money = (cents) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD'
}).format(cents / 100);

function sendWalletTopUpEmail({ clientEmail, clientName, amountCents, balanceCents, session }) {
  return sendEmail(clientEmail, 'Demo wallet funds added',
    `Hi ${clientName},\n\nDemo funds added: ${money(amountCents)}\nNew wallet balance: ${money(balanceCents)}.\nNo real payment was processed.`, { session });
}

function sendBookingConfirmation({ clientEmail, clientName, providerName, serviceName, slotStart, paidCents, balanceCents, session }) {
  const receipt = paidCents > 0
    ? `\nDemo wallet payment: ${money(paidCents)}\nRemaining demo balance: ${money(balanceCents)}.`
    : '';
  return sendEmail(clientEmail, `Appointment confirmed: ${serviceName} with ${providerName}`,
    `Hi ${clientName},\n\nYour appointment is confirmed for ${new Date(slotStart).toISOString()}.\nService: ${serviceName}\nProvider: ${providerName}${receipt}`, { session });
}

function sendReminderEmail({ clientEmail, clientName, providerName, serviceName, slotStart, appointmentId }) {
  return sendEmail(clientEmail, 'Reminder: Upcoming BookEase appointment',
    `Hi ${clientName},\n\nYour ${serviceName} appointment with ${providerName} starts at ${new Date(slotStart).toISOString()}.`,
    { key: appointmentId && `reminder:${appointmentId}:${new Date(slotStart).toISOString()}`, expiresAt: new Date(slotStart), appointmentId, appointmentStart: new Date(slotStart) });
}

function sendBookingCancellation({ email, serviceName, providerName, slotStart, walletRefund, balanceCents, session }) {
  let refundSummary = '';
  if (walletRefund?.status === 'credited') {
    refundSummary = `\n\nDemo wallet refund: ${money(walletRefund.amountCents)} (${walletRefund.percent}%).\nNew demo balance: ${money(balanceCents)}.`;
  } else if (walletRefund?.status === 'not_due') {
    refundSummary = '\n\nNo demo wallet refund was due.';
  }
  return sendEmail(email, `Appointment cancelled: ${serviceName}`,
    `The ${serviceName} appointment with ${providerName} at ${new Date(slotStart).toISOString()} has been cancelled.${refundSummary}`, { session });
}

function sendRescheduleEmail({ email, serviceName, previousStart, slotStart, session }) {
  return sendEmail(email, `BookEase appointment rescheduled: ${serviceName}`,
    `Your appointment moved from ${new Date(previousStart).toISOString()} to ${new Date(slotStart).toISOString()}.`,
    { session });
}

function sendWaitlistOffer(email, offer) {
  const route = `/providers/${offer.providerId._id}?service=${offer.serviceId._id}&slot=${offer.slotStart.toISOString()}`;
  const bookingLink = process.env.APP_URL
    ? `\nBook the slot: ${process.env.APP_URL.replace(/\/$/, '')}${route}`
    : '\nOpen the provider page in BookEase to book the slot.';
  return sendEmail(email, 'BookEase waitlist: your slot is available',
    `${offer.serviceId.name} with ${offer.providerId.businessName} is available at ${offer.slotStart.toISOString()}. The slot is reserved for you until ${offer.offerExpiresAt.toISOString()}.${bookingLink}`,
    { key: `waitlist:${offer._id}:${+offer.offerExpiresAt}`, expiresAt: offer.offerExpiresAt, waitlistEntryId: offer._id });
}

module.exports = {
  deliverEmail,
  sendRescheduleEmail,
  sendWaitlistOffer,
  sendWalletTopUpEmail,
  sendBookingConfirmation,
  sendReminderEmail,
  sendBookingCancellation
};
