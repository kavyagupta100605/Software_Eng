const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  location: { type: String, trim: true },
  bufferMinutes: { type: Number, default: 10 },
  cancellationWindowHours: { type: Number, default: 2 },
  avgRating: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: true }
});

module.exports = mongoose.model('Provider', providerSchema);
