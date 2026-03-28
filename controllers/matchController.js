const { getPlayerHistory } = require('../services/matchService');

/**
 * @desc    Lấy lịch sử đấu của tôi
 * @route   GET /api/matches/history
 */
const getMyHistory = async (req, res, next) => {
  try {
    const history = await getPlayerHistory(req.user._id);
    res.json(history);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyHistory,
};
