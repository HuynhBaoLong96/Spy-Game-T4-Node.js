const { dailyCheckin, applyRelief, getLeaderboard } = require('../services/economyService');
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
    res.json({
      balance: user.balance,
      ranking_points: user.rankingPoints,
      rank_tier: calculateRankTier(user.rankingPoints)
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
    await dailyCheckin(req.user._id);
    res.json({ message: 'Điểm danh thành công! +200 xu' });
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
    const topUsers = await getLeaderboard();
    const response = topUsers.map(u => ({
      username: u.username,
      display_name: u.displayName || u.username,
      ranking_points: u.rankingPoints,
      rank_tier: calculateRankTier(u.rankingPoints)
    }));
    res.json(response);
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

module.exports = {
  getBalance,
  dailyCheckin: dailyCheckinController,
  getRelief: getReliefController,
  getLeaderboard: getLeaderboardController,
  getTransactions,
};
