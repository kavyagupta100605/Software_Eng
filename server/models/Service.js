const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  name: { type: String, required: true, trim: true },
  durationMins: { type: Number, required: true, min: 5, max: 1440, validate: Number.isInteger },
  price: { type: Number, default: 0, min: 0, max: 1000000 },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Service', serviceSchema);
