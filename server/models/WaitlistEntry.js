const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  status: { type: String, enum: ['waiting', 'offered', 'expired', 'claimed'], default: 'waiting' },
  offerExpiresAt: Date,
  notifiedAt: Date
}, { timestamps: true });

schema.index({ providerId: 1, status: 1, slotStart: 1 });
schema.index({ providerId: 1, serviceId: 1, slotStart: 1, clientId: 1 }, { unique: true });
module.exports = mongoose.model('WaitlistEntry', schema);
