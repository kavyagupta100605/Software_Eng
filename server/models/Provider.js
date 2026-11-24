const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  location: { type: String, trim: true },
  bufferMinutes: { type: Number, default: 10, min: 0, max: 1440, validate: Number.isInteger },
  cancellationWindowHours: { type: Number, default: 2, min: 0, max: 8760 },
  avgRating: { type: Number, default: 0 },
  walletBookingRevision: { type: Number, default: 0, select: false },
  isApproved: { type: Boolean, default: false }
});

module.exports = mongoose.model('Provider', providerSchema);
