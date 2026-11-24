const mongoose = require('mongoose');

const weeklyHourSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0=Sunday
  startTime: { type: String, required: true }, // "09:00"
  endTime: { type: String, required: true }    // "18:00"
}, { _id: false });

const blockedRangeSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  reason: { type: String, default: 'Unavailable' }
});

const availabilitySchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, unique: true },
  timezone: String,
  weeklyHours: [weeklyHourSchema],
  blockedRanges: [blockedRangeSchema]
});

module.exports = mongoose.model('Availability', availabilitySchema);
