const mongoose = require('mongoose');

const matchPlayerSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  color: { type: String },
  role: { type: String, enum: ['CIVILIAN', 'SPY', 'INFECTED', 'AI', 'civilian', 'spy', 'infected', 'ai'] },
  isInfected: { type: Boolean, default: false },
  eliminatedRound: { type: Number },
  didWin: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('MatchPlayer', matchPlayerSchema);
