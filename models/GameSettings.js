const mongoose = require('mongoose');

const gameSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  describeDuration: { type: Number, default: 60 },
  discussDuration: { type: Number, default: 90 },
  voteDuration: { type: Number, default: 30 },
  roleCheckDuration: { type: Number, default: 10 },
  roleCheckResultDuration: { type: Number, default: 10 }
}, { timestamps: true });

module.exports = mongoose.model('GameSettings', gameSettingsSchema);
