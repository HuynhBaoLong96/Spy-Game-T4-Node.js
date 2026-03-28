const User = require('../models/User');
const UserStats = require('../models/UserStats');
const { getPlayerHistory } = require('../services/matchService');

/**
 * @desc    Lấy profile + stats của người dùng hiện tại
 * @route   GET /api/users/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = req.user;
    let stats = await UserStats.findOne({ userId: user._id });
    
    if (!stats) {
      stats = {
        totalGames: 0,
        winsCivilian: 0,
        winsSpy: 0,
        winsInfected: 0,
        timesAsSpy: 0,
        timesInfected: 0,
        correctVotes: 0
      };
    }

    res.json({
      user_id: user._id,
      username: user.username,
      display_name: user.displayName || '',
      avatar_url: user.avatarUrl || '',
      email: user.email,
      created_at: user.createdAt,
      balance: user.balance,
      ranking_points: user.rankingPoints,
      stats: {
        total_games: stats.totalGames,
        wins_civilian: stats.winsCivilian,
        wins_spy: stats.winsSpy,
        wins_infected: stats.winsInfected,
        times_as_spy: stats.timesAsSpy,
        times_infected: stats.timesInfected,
        correct_votes: stats.correctVotes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy stats của người dùng hiện tại
 * @route   GET /api/users/me/stats
 */
const getMyStats = async (req, res, next) => {
  try {
    const user = req.user;
    let stats = await UserStats.findOne({ userId: user._id });
    
    if (!stats) {
      stats = {
        totalGames: 0,
        winsCivilian: 0,
        winsSpy: 0,
        winsInfected: 0,
        timesAsSpy: 0,
        timesInfected: 0,
        correctVotes: 0
      };
    }

    res.json({
      total_games: stats.totalGames,
      wins_civilian: stats.winsCivilian,
      wins_spy: stats.winsSpy,
      wins_infected: stats.winsInfected,
      times_as_spy: stats.timesAsSpy,
      times_infected: stats.timesInfected,
      correct_votes: stats.correctVotes
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy lịch sử đấu của người dùng hiện tại
 * @route   GET /api/users/me/history
 */
const getMyHistory = async (req, res, next) => {
  try {
    const history = await getPlayerHistory(req.user._id);
    res.json(history);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cập nhật profile
 * @route   PUT /api/users/me
 */
const updateMe = async (req, res, next) => {
  try {
    const { display_name, avatar_url } = req.body;
    const user = await User.findById(req.user._id);

    if (display_name !== undefined) {
      if (!display_name.trim()) {
        res.status(400);
        throw new Error('Tên hiển thị không được để trống');
      }
      user.displayName = display_name;
    }

    if (avatar_url !== undefined) {
      user.avatarUrl = avatar_url;
    }

    await user.save();

    res.json({
      user_id: user._id,
      username: user.username,
      display_name: user.displayName || '',
      avatar_url: user.avatarUrl || ''
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  getMyStats,
  getMyHistory,
  updateMe,
};
