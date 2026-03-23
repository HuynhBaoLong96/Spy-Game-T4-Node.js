const mongoose = require('mongoose');

const userStatsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalGames: { type: Number, default: 0 },
  winsCivilian: { type: Number, default: 0 },
  winsSpy: { type: Number, default: 0 },
  winsInfected: { type: Number, default: 0 },
  timesAsSpy: { type: Number, default: 0 },
  timesInfected: { type: Number, default: 0 },
  correctVotes: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('UserStats', userStatsSchema);
