const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ providerId: 1, slotStart: 1 });
module.exports = mongoose.model('SlotHold', schema);
