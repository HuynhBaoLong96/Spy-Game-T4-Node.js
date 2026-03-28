const { startGame, getSession, submitDescription, submitVote, submitChat, submitRoleGuess, confirmSpyAbility, useFakeMessageAbility, infectPlayer, adminSetSpy, adjustRewards, setGameState } = require('../services/gameService');

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
 * @desc    Admin đặt người làm Spy
 * @route   POST /api/rooms/:roomId/admin/set-spy
 */
const adminSetSpyController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { user_id } = req.body;
    const admin = req.user;

    await adminSetSpy(roomId, admin._id, user_id);

    res.json({ message: 'Đã đặt Gián điệp thành công' });
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
      room_code: session.roomCode,
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
 * @desc    Gửi tin nhắn chat
 * @route   POST /api/game/:matchId/chat
 */
const submitChatController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { content } = req.body;
    const user = req.user;

    await submitChat(matchId, user._id, content);

    res.json({ submitted: true });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Đoán vai trò
 * @route   POST /api/game/:matchId/rolecheck
 */
const submitRoleGuessController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const guessed_role = req.body.guessed_role || req.body.role;
    const user = req.user;

    const result = await submitRoleGuess(matchId, user._id, guessed_role);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Xác nhận kỹ năng Gián điệp
 * @route   POST /api/game/:matchId/rolecheck/confirm-ability
 */
const confirmSpyAbilityController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { ability_type } = req.body;
    const user = req.user;

    const result = await confirmSpyAbility(matchId, user._id, ability_type);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Sử dụng kỹ năng Tin nhắn giả
 * @route   POST /api/game/:matchId/ability/fake-message
 */
const useFakeMessageController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { content } = req.body;
    const user = req.user;

    const result = await useFakeMessageAbility(matchId, user._id, content);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Sử dụng kỹ năng Lây nhiễm
 * @route   POST /api/game/:matchId/ability/infect
 */
const infectPlayerController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const target_user_id = req.body.target_user_id || req.body.target_id || req.body.targetId;
    const user = req.user;

    const result = await infectPlayer(matchId, user._id, target_user_id);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Điều chỉnh phần thưởng (Admin)
 * @route   POST /api/game/:matchId/admin/adjust-rewards
 */
const adjustRewardsController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { civilian, spy, infected } = req.body;
    const admin = req.user;

    const result = await adjustRewards(matchId, admin._id, civilian, spy, infected);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cài đặt trạng thái game (Debug/Admin)
 * @route   POST /api/game/:matchId/set-state
 */
const setGameStateController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { state } = req.body;
    
    const result = await setGameState(matchId, state);

    res.json(result);
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
    const target_user_id = req.body.target_user_id || req.body.target_id || req.body.targetId;
    const user = req.user;

    await submitVote(matchId, user._id, target_user_id);

    res.json({ submitted: true });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startGame: startGameController,
  adminSetSpy: adminSetSpyController,
  getGameState: getGameStateController,
  submitChat: submitChatController,
  submitRoleGuess: submitRoleGuessController,
  confirmSpyAbility: confirmSpyAbilityController,
  useFakeMessage: useFakeMessageController,
  infectPlayer: infectPlayerController,
  adjustRewards: adjustRewardsController,
  setGameState: setGameStateController,
  submitDescription: submitDescriptionController,
  submitVote: submitVoteController,
};
