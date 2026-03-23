const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * Khấu trừ tiền cược khi bắt đầu ván đấu
 */
const deductEntryFee = async (userId, fee) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Không tìm thấy người dùng');

  if (user.balance < fee) {
    throw new Error('Số dư không đủ để đặt cược');
  }

  user.balance -= fee;
  await user.save();

  await logTransaction(userId, -fee, 'BET', 'Phí vào cửa ván đấu');
};

/**
 * Cộng thưởng xu và điểm xếp hạng
 */
const addReward = async (userId, amount, type, description, addToRanking = false) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Không tìm thấy người dùng');

  user.balance += amount;
  if (addToRanking) {
    user.rankingPoints += amount;
  }

  await user.save();
  await logTransaction(userId, amount, type, description);
};

/**
 * Quà cứu trợ khi hết tiền (Balance < 10)
 */
const applyRelief = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Không tìm thấy người dùng');

  if (user.balance >= 10) {
    throw new Error('Bạn vẫn còn đủ tiền, không thể nhận cứu trợ');
  }

  const reliefAmount = 50;
  user.balance += reliefAmount;
  await user.save();

  await logTransaction(userId, reliefAmount, 'RELIEF', 'Quà cứu trợ Bankruptcy Relief');
};

/**
 * Điểm danh hàng ngày
 */
const dailyCheckin = async (userId) => {
  const checkinAmount = 200;
  await addReward(userId, checkinAmount, 'DAILY_CHECKIN', 'Điểm danh hàng ngày', false);
};

/**
 * Lấy danh sách bảng xếp hạng
 */
const getLeaderboard = async () => {
  return await User.find()
    .sort({ rankingPoints: -1 })
    .limit(50);
};

const logTransaction = async (userId, amount, type, description) => {
  await Transaction.create({
    userId,
    amount,
    type,
    description
  });
};

module.exports = {
  deductEntryFee,
  addReward,
  applyRelief,
  dailyCheckin,
  getLeaderboard,
};
