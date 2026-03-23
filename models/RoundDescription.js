const mongoose = require('mongoose');

const roundDescriptionSchema = new mongoose.Schema({
  roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true, index: true },
  userId: { type: String, required: true },
  content: { type: String, required: true },
  isFake: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('RoundDescription', roundDescriptionSchema);
