const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  walletPaidCents: { type: Number, default: 0 },
  walletRefund: {
    type: new mongoose.Schema({
      amountCents: { type: Number, required: true, min: 0 },
      percent: { type: Number, required: true, min: 0, max: 100 },
      status: { type: String, required: true, enum: ['credited', 'not_due'] }
    }, { _id: false }),
    default: undefined
  },
  cancelledAt: Date,
  status: {
    type: String,
    enum: ['requested', 'confirmed', 'completed', 'cancelled', 'no-show'],
    default: 'confirmed'
  },
  cancelledBy: { type: String, enum: ['client', 'provider', null], default: null },
  notes: { type: String, trim: true },
  reminderSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// MANDATORY compound index for performance & quick conflict checks
appointmentSchema.index({ providerId: 1, slotStart: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
