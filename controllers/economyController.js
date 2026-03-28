const { dailyCheckin, applyRelief, getLeaderboard, hasCheckedInToday } = require('../services/economyService');
const Transaction = require('../models/Transaction');

const calculateRankTier = (points) => {
  if (points <= 1000) return 'Bronze';
  if (points <= 3000) return 'Silver';
  if (points <= 7000) return 'Gold';
  if (points <= 15000) return 'Platinum';
  return 'Diamond';
};

/**
 * @desc    Lấy số dư và điểm rank
 * @route   GET /api/economy/balance
 */
const getBalance = async (req, res, next) => {
  try {
    const user = req.user;
    const hasCheckedIn = await hasCheckedInToday(user._id);
    
    res.json({
      balance: user.balance,
      ranking_points: user.rankingPoints,
      rank_tier: calculateRankTier(user.rankingPoints),
      has_checked_in: hasCheckedIn,
      checkin_streak: user.checkinStreak || 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Điểm danh hàng ngày
 * @route   POST /api/economy/daily-checkin
 */
const dailyCheckinController = async (req, res, next) => {
  try {
    const result = await dailyCheckin(req.user._id);
    res.json({ 
      message: `Điểm danh thành công! +${result.amount} xu`,
      amount: result.amount,
      streak: result.streak
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Nhận cứu trợ
 * @route   POST /api/economy/relief
 */
const getReliefController = async (req, res, next) => {
  try {
    await applyRelief(req.user._id);
    res.json({ message: 'Nhận cứu trợ thành công! +50 xu' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy bảng xếp hạng
 * @route   GET /api/economy/leaderboard
 */
const getLeaderboardController = async (req, res, next) => {
  try {
    const { type } = req.query; // 'balance', 'spy', 'civilian'
    const leaderboard = await getLeaderboard(type);
    res.json(leaderboard);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy lịch sử giao dịch
 * @route   GET /api/economy/transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy trạng thái điểm danh hôm nay
 * @route   GET /api/economy/daily-checkin/status
 */
const getCheckinStatus = async (req, res, next) => {
  try {
    const user = req.user;
    const alreadyCheckedIn = await hasCheckedInToday(user._id);
    const currentStreak = user.checkinStreak || 0;
    
    // Phần thưởng theo ngày: [10, 10, 10, 10, 20, 20, 30]
    const rewards = [10, 10, 10, 10, 20, 20, 30];
    
    // Nếu đã điểm danh rồi thì hiển thị streak hiện tại, 
    // nếu chưa thì hiển thị streak sẽ đạt được nếu điểm danh ngay bây giờ
    const nextStreak = alreadyCheckedIn ? currentStreak : (currentStreak % 7) + 1;
    
    res.json({
      can_checkin: !alreadyCheckedIn,
      streak: alreadyCheckedIn ? currentStreak : nextStreak,
      today_reward: rewards[(alreadyCheckedIn ? currentStreak : nextStreak) - 1]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy số dư của user khác (Admin)
 * @route   GET /api/economy/balance/:userId
 */
const getUserBalance = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404);
      throw new Error('Không tìm thấy người dùng');
    }

    res.json({
      user_id: user._id,
      username: user.username,
      balance: user.balance,
      ranking_points: user.rankingPoints
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBalance,
  getUserBalance,
  getCheckinStatus,
  dailyCheckin: dailyCheckinController,
  getRelief: getReliefController,
  getLeaderboard: getLeaderboardController,
  getTransactions,
};
