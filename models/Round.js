const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  roundNumber: { type: Number, required: true },
  eliminatedUserId: { type: String },
  eliminatedRole: { type: String },
  tieCount: { type: Number, default: 0 },
  spyUsedAbility: { type: String, enum: ['none', 'shield', 'reveal', 'kill'], default: 'none' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Round', roundSchema);
