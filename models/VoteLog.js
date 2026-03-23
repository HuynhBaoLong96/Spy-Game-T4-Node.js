const mongoose = require('mongoose');

const voteLogSchema = new mongoose.Schema({
  roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true, index: true },
  voterId: { type: String, required: true },
  targetId: { type: String, required: true },
  isTieBreak: { type: Boolean, default: false },
  votedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('VoteLog', voteLogSchema);
