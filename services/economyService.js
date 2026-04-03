const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Lazy load socketService to avoid circular dependencies
const getSocketService = () => require('./socketService');

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
  
  // Real-time update
  getSocketService().emitToUser(userId, 'balance', { balance: user.balance });
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
  
  // Real-time update
  getSocketService().emitToUser(userId, 'balance', { 
    balance: user.balance,
    rankingPoints: user.rankingPoints
  });
  
  return user; // Trả về user đã cập nhật
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
  
  // Real-time update
  getSocketService().emitToUser(userId, 'balance', { balance: user.balance });
};

/**
 * Kiểm tra xem user đã điểm danh hôm nay chưa
 */
const hasCheckedInToday = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Không tìm thấy người dùng');
  
  if (!user.lastCheckinDate) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastCheckin = new Date(user.lastCheckinDate);
  lastCheckin.setHours(0, 0, 0, 0);
  
  return today.getTime() === lastCheckin.getTime();
};

/**
 * Điểm danh hàng ngày - có tính streak và phần thưởng tăng dần
 */
const dailyCheckin = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Không tìm thấy người dùng');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (user.lastCheckinDate) {
    const lastCheckin = new Date(user.lastCheckinDate);
    lastCheckin.setHours(0, 0, 0, 0);
    if (today.getTime() === lastCheckin.getTime()) {
      throw new Error('Bạn đã điểm danh hôm nay rồi!');
    }
  }

  // Tính toán streak
  let newStreak = 1;
  if (user.lastCheckinDate) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastCheckin = new Date(user.lastCheckinDate);
    lastCheckin.setHours(0, 0, 0, 0);

    if (yesterday.getTime() === lastCheckin.getTime()) {
      // Điểm danh liên tiếp
      newStreak = (user.checkinStreak % 7) + 1;
    } else {
      // Bị đứt chuỗi
      newStreak = 1;
    }
  }

  // Phần thưởng theo ngày: [10, 10, 10, 10, 20, 20, 30]
  const rewards = [10, 10, 10, 10, 20, 20, 30];
  const checkinAmount = rewards[newStreak - 1];

  user.balance += checkinAmount;
  user.lastCheckinDate = today;
  user.checkinStreak = newStreak;
  await user.save();

  await logTransaction(userId, checkinAmount, 'DAILY_CHECKIN', 
    `Điểm danh hàng ngày (Ngày ${newStreak}) +${checkinAmount} xu`);

  // Real-time update
  getSocketService().emitToUser(userId, 'balance', { balance: user.balance });

  return {
    amount: checkinAmount,
    streak: newStreak
  };
};

/**
 * Lấy danh sách bảng xếp hạng theo tiêu chí
 */
const getLeaderboard = async (type = 'balance') => {
  if (type === 'spy' || type === 'civilian') {
    const UserStats = require('../models/UserStats');
    const sortField = type === 'spy' ? 'winsSpy' : 'winsCivilian';
    
    const stats = await UserStats.find()
      .sort({ [sortField]: -1 })
      .limit(50)
      .populate('userId', 'username displayName avatarUrl');
      
    return stats.map(s => ({
      username: s.userId?.username,
      display_name: s.userId?.displayName || s.userId?.username,
      avatar_url: s.userId?.avatarUrl,
      score: type === 'spy' ? s.winsSpy : s.winsCivilian
    })).filter(item => item.username);
  }

  // Mặc định xếp theo Xu (balance)
  const users = await User.find()
    .sort({ balance: -1 })
    .limit(50);
    
  return users.map(u => ({
    username: u.username,
    display_name: u.displayName || u.username,
    avatar_url: u.avatarUrl,
    score: u.balance
  }));
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
  hasCheckedInToday,
  dailyCheckin,
  getLeaderboard,
};
