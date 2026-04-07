const { 
  startGame, 
  getSession, 
  getAnonymousName, 
  handlePlayerQuit, 
  submitDescription, 
  submitVote, 
  submitChat, 
  submitRoleGuess, 
  confirmSpyAbility, 
  useFakeMessageAbility, 
  useAiManipulationAbility, 
  infectPlayer, 
  useAbility: useAbilityService, 
  adminSetSpy, 
  adjustRewards, 
  setGameState 
} = require('../services/gameService');

/**
 * @desc    Bắt đầu game
 * @route   POST /api/rooms/:roomId/start
 */
const startGameController = async (req, res, next) => {
  try {
    // Thêm log chi tiết để debug
    console.log('[DEBUG] startGameController request:', {
      params: req.params,
      body: req.body,
      user: req.user ? req.user._id : 'no-user'
    });

    // FE gửi room_id trong body hoặc params
    const roomId = (req.body && req.body.room_id) || (req.params && req.params.roomId);
    const user = req.user;

    if (!roomId) {
      return res.status(400).json({ message: 'Thiếu thông tin room_id' });
    }

    // Đảm bảo roomId là string
    const actualRoomId = roomId.toString();

    const session = await startGame(actualRoomId, user._id.toString());

    return res.json({
      match_id: session.matchId,
      message: 'Game đã bắt đầu'
    });
  } catch (error) {
    console.error('[DEBUG] startGameController error:', error.message);
    if (typeof next === 'function') {
      return next(error);
    }
    return res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Đặt người làm Spy (Chủ phòng hoặc Admin)
 * @route   POST /api/rooms/:roomId/set-spy
 */
const adminSetSpyController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { user_id } = req.body;
    const user = req.user;

    await adminSetSpy(roomId, user._id, user_id);

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
    const phaseName = session.state.toUpperCase();
    const isAnonymizedPhase = ['DESCRIBING', 'DISCUSSING', 'VOTING'].includes(phaseName);
    const isDiscussing = phaseName === 'DISCUSSING';
    
    // Lấy hàm ẩn danh chuẩn từ service hoặc định nghĩa lại y hệt
    const getAnonymousName = (p) => {
      const map = {
        red: 'Mèo Béo (Đỏ) 🎭', blue: 'Cún Con (Xanh) 🎭', green: 'Gấu Trúc (Lục) 🎭',
        yellow: 'Vịt Vàng (Vàng) 🎭', purple: 'Cáo Nhỏ (Tím) 🎭', orange: 'Hổ Con (Cam) 🎭',
        pink: 'Thỏ Ngọc (Hồng) 🎭', cyan: 'Chim Cánh Cụt (Lam) 🎭'
      };
      return map[p.color] || 'Người chơi 🎭';
    };
    
    const currentDescriptions = session.descriptions[session.currentRound] || {};
    
    res.json({
      match_id: session.matchId,
      room_id: session.roomId,
      room_code: session.roomCode,
      phase: phaseName,
      state: phaseName,
      current_round: session.currentRound,
      current_turn_user_id: session.currentTurnUserId,
      phase_start_time: session.phaseStartTime,
      phase_end_time: session.phaseEndTime,
      remaining_seconds: Math.max(0, Math.floor((session.phaseEndTime - Date.now()) / 1000)),
      players: session.players.map(p => {
        const roleUpper = p.role.toUpperCase();
        const isMe = p.userId === user._id.toString();
        const showRole = phaseName === 'GAME_OVER' || isMe;
        const scoreValue = p.lastReward || 0;
        
        return {
          user_id: p.userId.toString(),
          username: isAnonymizedPhase ? getAnonymousName(p) : p.username,
          display_name: isAnonymizedPhase ? getAnonymousName(p) : p.displayName,
          color: isDiscussing ? 'gray' : p.color,
          is_alive: p.isAlive,
          is_ai: p.isAi,
          // Trả về role in uppercase để FE dễ so sánh
          role: showRole ? roleUpper : 'hidden',
          description: currentDescriptions[p.userId] || null,
          score: scoreValue,
          score_gained: scoreValue
        };
      }),
      civilian_keyword: phaseName === 'GAME_OVER' ? session.civilianKeyword : undefined,
      spy_keyword: phaseName === 'GAME_OVER' ? session.spyKeyword : undefined,
      my_keyword: player && (player.role === 'SPY' || player.role === 'INFECTED') 
        ? (session.isSpecialRound && phaseName !== 'GAME_OVER' ? (session.spyDescription || session.spyKeyword) : session.spyKeyword) 
        : (session.isSpecialRound && phaseName !== 'GAME_OVER' ? (session.civilianDescription || session.civilianKeyword) : session.civilianKeyword),
      your_keyword: player && (player.role === 'SPY' || player.role === 'INFECTED') 
        ? (session.isSpecialRound && phaseName !== 'GAME_OVER' ? (session.spyDescription || session.spyKeyword) : session.spyKeyword) 
        : (session.isSpecialRound && phaseName !== 'GAME_OVER' ? (session.civilianDescription || session.civilianKeyword) : session.civilianKeyword),
      keyword: player && (player.role === 'SPY' || player.role === 'INFECTED') 
        ? (session.isSpecialRound && phaseName !== 'GAME_OVER' ? (session.spyDescription || session.spyKeyword) : session.spyKeyword) 
        : (session.isSpecialRound && phaseName !== 'GAME_OVER' ? (session.civilianDescription || session.civilianKeyword) : session.civilianKeyword),
      is_special_round: session.isSpecialRound,
      your_role: player && player.role ? player.role.toUpperCase() : 'UNKNOWN',
      // Thêm thông tin kỹ năng đã chọn cho Gián điệp và Đồng minh (để FE hiển thị textbox)
      selected_ability: (player && (player.role === 'SPY' || player.role === 'INFECTED')) ? session.selectedAbility : undefined,
      selectedAbility: (player && (player.role === 'SPY' || player.role === 'INFECTED')) ? session.selectedAbility : undefined,
      ai_manipulated_this_round: (player && (player.role === 'SPY' || player.role === 'INFECTED')) ? session.aiManipulatedThisRound : undefined,
      // Thêm flag nhận diện phe gián điệp để FE không phải check array string
      is_spy_team: player && (player.role === 'SPY' || player.role === 'INFECTED'),
      // Thêm thông tin kết quả chọn vai trò để FE có thể hiển thị modal qua API fallback
      personal_role_check_result: session.detailedRoleCheckResults ? session.detailedRoleCheckResults[user._id.toString()] : null
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

/**
 * @desc    Sử dụng kỹ năng Thao túng AI
 * @route   POST /api/game/:matchId/ability/manipulate-ai
 */
const useAiManipulationController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { type, content } = req.body; // type: 'DESCRIBE' hoặc 'DISCUSS'
    const user = req.user;

    const result = await useAiManipulationAbility(matchId, user._id, type, content);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Sử dụng kỹ năng (Fake Message hoặc Thao túng AI)
 * @route   POST /api/game/:matchId/use-ability
 */
const useAbilityController = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { type, content } = req.body;
    const user = req.user;

    const result = await useAbilityService(matchId, user._id, type, content);

    res.json(result);
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
  useAiManipulation: useAiManipulationController,
  useAbility: useAbilityController, // Thêm controller mới
  adjustRewards: adjustRewardsController,
  setGameState: setGameStateController,
  submitDescription: submitDescriptionController,
  submitVote: submitVoteController,
};