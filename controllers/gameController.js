const { startGame, getSession, submitDescription, submitVote } = require('../services/gameService');

/**
 * @desc    Bắt đầu game
 * @route   POST /api/rooms/:roomId/start
 */
const startGameController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const user = req.user;

    const session = await startGame(roomId, user._id);

    res.json({
      match_id: session.matchId,
      message: 'Game đã bắt đầu'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy trạng thái game hiện tại
 * @route   GET /api/game/:matchId/state
 */
const getGameStateController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const user = req.user;
    const session = getSession(matchId);

    if (!session) {
      res.status(404);
      throw new Error('Không tìm thấy phiên chơi');
    }

    // Trả về state phù hợp với người dùng
    const player = session.players.find(p => p.userId === user._id.toString());
    
    res.json({
      match_id: session.matchId,
      room_id: session.roomId,
      state: session.state,
      current_round: session.currentRound,
      phase_start_time: session.phaseStartTime,
      phase_end_time: session.phaseEndTime,
      players: session.players.map(p => ({
        user_id: p.userId,
        username: p.username,
        display_name: p.displayName,
        color: p.color,
        is_alive: p.isAlive,
        is_ai: p.isAi,
        role: p.userId === user._id.toString() ? p.role : 'hidden'
      })),
      my_keyword: player && player.role === 'SPY' ? session.spyKeyword : session.civilianKeyword
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Nộp mô tả
 * @route   POST /api/game/:matchId/describe
 */
const submitDescriptionController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { content } = req.body;
    const user = req.user;

    await submitDescription(matchId, user._id, content);

    res.json({
      submitted: true,
      word_count: content.trim().split(/\s+/).length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Nộp vote
 * @route   POST /api/game/:matchId/vote
 */
const submitVoteController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { target_id } = req.body;
    const user = req.user;

    await submitVote(matchId, user._id, target_id);

    res.json({ submitted: true });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startGame: startGameController,
  getGameState: getGameStateController,
  submitDescription: submitDescriptionController,
  submitVote: submitVoteController,
};
