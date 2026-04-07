const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  civilianKeyword: { type: String, required: true },
  spyKeyword: { type: String, required: true },
  civilianDescription: { type: String, default: '' },
  spyDescription: { type: String, default: '' },
  isSpecialRound: { type: Boolean, default: false },
  spyUserId: { type: String },
  aiPlayerId: { type: String },
  infectedUserId: { type: String },
  winnerRole: { type: String, enum: ['CIVILIAN', 'SPY', 'INFECTED', 'AI'] },
  totalRounds: { type: Number, default: 0 },
  aiEliminatedRound: { type: Number },
  status: { type: String, enum: ['in_progress', 'finished'], default: 'in_progress' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);
