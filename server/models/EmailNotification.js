const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  text: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'expired'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  leaseToken: String,
  expiresAt: Date,
  appointmentId: mongoose.Schema.Types.ObjectId,
  appointmentStart: Date,
  waitlistEntryId: mongoose.Schema.Types.ObjectId,
  sentAt: Date,
  deliveryMode: String,
  messageId: String,
  lastError: String
}, { timestamps: true });

schema.index({ key: 1 }, { unique: true, sparse: true });
schema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
module.exports = mongoose.model('EmailNotification', schema);
