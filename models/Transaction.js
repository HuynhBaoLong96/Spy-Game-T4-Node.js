const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  type: { 
    type: String, 
    enum: [
      'INITIAL_GIFT', 'BET', 'WIN_REWARD', 'DAILY_CHECKIN', 
      'GUESS_BONUS', 'SKILL_BONUS', 'RELIEF', 'ADMIN_ADD'
    ], 
    required: true 
  },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
