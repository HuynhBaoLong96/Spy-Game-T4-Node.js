const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const GameSettings = require('../models/GameSettings');
const { getRandomKeywordPair } = require('./keywordService');
const { deductEntryFee, addReward } = require('./economyService');
const { emitToRoom, emitToUser, emitToTopic } = require('./socketService');
const { getAiDescription } = require('./aiService');

// Lưu trữ các phiên chơi đang diễn ra trong bộ nhớ
const gameSessions = new Map();

/**
 * Khởi tạo một phiên chơi mới
 */
const startGame = async (roomId, hostUserId) => {
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Không tìm thấy phòng');
  if (room.hostId.toString() !== hostUserId) throw new Error('Chỉ chủ phòng mới có thể bắt đầu game');
  if (room.currentPlayers < 2) throw new Error('Cần ít nhất 2 người chơi để bắt đầu');

  // 1. Thu phí vào cửa (0 xu theo bản cập nhật Java mới nhất)
  const entryFee = 0;
  const roomPlayers = await RoomPlayer.find({ roomId });
  for (const rp of roomPlayers) {
    await deductEntryFee(rp.userId, entryFee);
  }

  // 2. Lấy từ khóa ngẫu nhiên
  const keywordPair = await getRandomKeywordPair();

  // 3. Tạo Match trong DB
  const match = await Match.create({
    roomId,
    civilianKeyword: keywordPair.civilianKeyword,
    spyKeyword: keywordPair.spyKeyword,
    status: 'in_progress'
  });

  // 4. Khởi tạo GameSession trong bộ nhớ
  const session = {
    matchId: match._id.toString(),
    roomId,
    roomCode: room.roomCode,
    civilianKeyword: keywordPair.civilianKeyword,
    spyKeyword: keywordPair.spyKeyword,
    currentRound: 1,
    state: 'ROLE_ASSIGN',
    players: [],
    descriptions: {}, // round -> userId -> content
    votes: {},        // round -> userId -> targetId
    roleCheckResults: {}, // userId -> correct (boolean)
    phaseStartTime: Date.now(),
    phaseEndTime: Date.now() + 10000, // 10s xem vai
  };

  // 5. Tạo danh sách người chơi (bao gồm 1 AI)
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
  const shuffledColors = colors.sort(() => Math.random() - 0.5);

  const players = [];
  // Thêm Human players
  for (let i = 0; i < roomPlayers.length; i++) {
    const rp = roomPlayers[i];
    players.push({
      userId: rp.userId.toString(),
      username: rp.username,
      displayName: rp.displayName || rp.username,
      color: shuffledColors[i],
      role: 'civilian',
      isAlive: true,
      isAi: false
    });
  }

  // Luôn thêm 1 AI
  players.push({
    userId: 'ai_official',
    username: 'AI KeywordSpy',
    displayName: 'AI KeywordSpy',
    color: shuffledColors[roomPlayers.length] || 'black',
    role: 'AI',
    isAlive: true,
    isAi: true
  });

  // 6. Chọn Spy ngẫu nhiên (chỉ chọn từ Human)
  const humans = players.filter(p => !p.isAi);
  const spyPlayer = humans[Math.floor(Math.random() * humans.length)];
  spyPlayer.role = 'SPY';
  session.spyUserId = spyPlayer.userId;

  session.players = players;
  gameSessions.set(match._id.toString(), session);

  // 7. Cập nhật Match với Spy ID
  match.spyUserId = spyPlayer.userId;
  await match.save();

  // 8. Lưu MatchPlayer vào DB
  for (const p of players) {
    if (p.isAi) continue;
    await MatchPlayer.create({
      matchId: match._id,
      userId: p.userId,
      color: p.color,
      role: p.role
    });
  }

  // 9. Cập nhật trạng thái phòng
  room.status = 'playing';
  await room.save();
  
  // Thông báo cho Lobby
  const { broadcastLobbyRoomEvent } = require('./roomService');
  broadcastLobbyRoomEvent(room, 'UPDATED');

  // 10. Thông báo bắt đầu game qua Socket
  emitToRoom(roomId, 'GAME_START', {
    type: 'GAME_START',
    room_id: roomId,
    match_id: match._id
  });

  // Chuyển sang phase ROLE_ASSIGN
  broadcastRoles(session);
  startPhaseTimer(session, 10000, moveToDescribing);

  return session;
};

const broadcastRoles = (session) => {
  session.players.forEach(player => {
    if (player.isAi) return;
    
    // Gửi thông tin vai trò riêng tư cho từng người (Java dùng /user/queue/role)
    emitToUser(player.userId, 'role', {
      role: player.role,
      keyword: player.role === 'SPY' ? session.spyKeyword : session.civilianKeyword,
      matchId: session.matchId
    });
  });

  // Gửi danh sách người chơi (ẩn vai trò) cho tất cả qua topic match
  emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'MATCH_UPDATE',
    matchId: session.matchId,
    state: session.state,
    players: session.players.map(p => ({
      user_id: p.userId,
      username: p.username,
      display_name: p.displayName,
      color: p.color,
      is_alive: p.isAlive,
      is_ai: p.isAi,
      role: 'hidden'
    }))
  });
};

const startPhaseTimer = (session, durationMs, nextPhaseFn) => {
  session.phaseStartTime = Date.now();
  session.phaseEndTime = Date.now() + durationMs;
  
  // Thông báo chuyển phase tới topic match
  emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    state: session.state,
    startTime: session.phaseStartTime,
    endTime: session.phaseEndTime,
    phase_end_at: new Date(session.phaseEndTime).toISOString(),
    remaining_seconds: Math.floor(durationMs / 1000),
    currentRound: session.currentRound
  });

  setTimeout(() => {
    const currentSession = gameSessions.get(session.matchId.toString());
    if (currentSession && currentSession.state === session.state) {
      nextPhaseFn(currentSession);
    }
  }, durationMs);
};

const moveToDescribing = (session) => {
  session.state = 'DESCRIBING';
  startPhaseTimer(session, 60000, moveToDiscussing); // 60s mô tả
};

const moveToDiscussing = (session) => {
  session.state = 'DISCUSSING';
  startPhaseTimer(session, 90000, moveToVoting); // 90s thảo luận
};

const moveToVoting = (session) => {
  session.state = 'VOTING';
  startPhaseTimer(session, 30000, processVoteResult); // 30s vote
};

const processVoteResult = async (session) => {
  // Logic xử lý kết quả vote (tương tự VoteManager trong Java)
  console.log('Đang xử lý kết quả vote cho trận:', session.matchId);
  
  // Broadcast kết quả vòng (Java dùng /topic/match/{matchId}/round-result)
  emitToTopic(`/topic/match/${session.matchId}/round-result`, {
    eliminated_user_id: null, // Placeholder
    eliminated_display_name: 'Không ai',
    role: 'NONE',
    is_spy: false
  });

  // Nếu game kết thúc (Java dùng /topic/match/{matchId}/game-over)
  // emitToTopic(`/topic/match/${session.matchId}/game-over`, { ... });
};

const getSession = (matchId) => gameSessions.get(matchId.toString());

const getAnonymousName = (player) => {
  if (player.isAi) return 'AI KeywordSpy';
  return `Người chơi ${player.color.charAt(0).toUpperCase() + player.color.slice(1)}`;
};

const getAlivePlayer = (session, userId) => {
  const player = session.players.find(p => p.userId === userId.toString());
  if (!player) throw new Error('Không tìm thấy người chơi');
  if (!player.isAlive) throw new Error('Bạn đã bị loại, không thể thực hiện hành động này');
  return player;
};

module.exports = {
  startGame,
  getSession,
  getAnonymousName,
  submitDescription: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'DESCRIBING') throw new Error('Không phải lúc mô tả');
    
    getAlivePlayer(session, userId);

    const words = content.trim().split(/\s+/);
    if (words.length < 1 || words.length > 30) throw new Error('Mô tả phải từ 1-30 từ');

    if (!session.descriptions[session.currentRound]) {
      session.descriptions[session.currentRound] = {};
    }
    session.descriptions[session.currentRound][userId] = content;

    // Broadcast cho match (Java dùng /topic/match/{matchId}/descriptions)
    const descriptions = Object.entries(session.descriptions[session.currentRound]).map(([uid, c]) => ({
      user_id: uid,
      content: c
    }));
    
    emitToTopic(`/topic/match/${matchId}/descriptions`, {
      descriptions,
      all_submitted: descriptions.length >= session.players.filter(p => p.isAlive).length
    });
  },
  submitChat: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'DISCUSSING') throw new Error('Không phải lúc thảo luận');
    
    const player = getAlivePlayer(session, userId);
    const name = getAnonymousName(player);

    // Broadcast tới topic chat của match (Java dùng /topic/match/{matchId}/chat)
    emitToTopic(`/topic/match/${matchId}/chat`, {
      sender_id: userId,
      sender_name: name,
      content: content,
      timestamp: Date.now()
    });
  },
  submitVote: async (matchId, voterId, targetId) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'VOTING') return;

    getAlivePlayer(session, voterId);

    if (!session.votes[session.currentRound]) {
      session.votes[session.currentRound] = {};
    }
    session.votes[session.currentRound][voterId] = targetId;

    // Broadcast vote counts tới topic votes của match (Java dùng /topic/match/{matchId}/votes)
    const voteCounts = {};
    Object.values(session.votes[session.currentRound]).forEach(tid => {
      voteCounts[tid] = (voteCounts[tid] || 0) + 1;
    });

    emitToTopic(`/topic/match/${matchId}/votes`, voteCounts);
  },
  submitRoleGuess: async (matchId, userId, guessedRole) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'ROLE_CHECK') throw new Error('Không phải lúc đoán vai');
    
    getAlivePlayer(session, userId);
    
    const isSpy = userId.toString() === session.spyUserId;
    const guessedSpy = guessedRole.toLowerCase() === 'spy';
    const correct = (isSpy && guessedSpy) || (!isSpy && !guessedSpy);

    session.roleCheckResults[userId] = correct;

    // Gửi kết quả riêng cho user (Java dùng /user/queue/role-check-result)
    emitToUser(userId, 'role-check-result', {
      correct,
      actual_role: isSpy ? 'SPY' : 'CIVILIAN',
      reward_coins: correct ? 10 : 0, // Mock reward
      abilities_available: (isSpy && correct) ? ['FAKE_MESSAGE', 'INFECT'] : [],
      acknowledged: false
    });

    return { submitted: true, correct };
  },
  confirmSpyAbility: async (matchId, userId, abilityType) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'ROLE_CHECK_RESULT') throw new Error('Không phải lúc chọn kỹ năng');
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể chọn kỹ năng');
    }

    session.selectedAbility = abilityType;
    
    // Gửi xác nhận kỹ năng riêng cho user (Java dùng /user/queue/ability-result)
    emitToUser(userId, 'ability-result', {
      success: true,
      confirmed_ability: abilityType,
      message: `Bạn đã chọn kỹ năng: ${abilityType}`
    });

    return { confirmed: true, ability: abilityType };
  },
  useFakeMessageAbility: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể dùng kỹ năng này');
    }

    if (session.state !== 'DESCRIBING' && session.state !== 'DISCUSSING') {
      throw new Error('Không thể dùng kỹ năng trong giai đoạn này');
    }

    // Broadcast fake message (Java dùng /topic/match/{matchId}/chat)
    emitToTopic(`/topic/match/${matchId}/chat`, {
      sender_id: 'system',
      sender_name: 'Ẩn danh',
      content,
      timestamp: Date.now(),
      is_fake: true
    });

    return { success: true };
  },
  infectPlayer: async (matchId, userId, targetUserId) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'ROLE_CHECK_RESULT') throw new Error('Không phải lúc lây nhiễm');
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể lây nhiễm');
    }

    const target = session.players.find(p => p.userId === targetUserId.toString());
    if (!target || !target.isAlive || target.isAi) {
      throw new Error('Mục tiêu không hợp lệ');
    }

    target.role = 'INFECTED';
    session.infectedUserId = targetUserId;

    // Gửi thông báo lây nhiễm riêng cho mục tiêu (Java dùng /user/queue/infection)
    emitToUser(targetUserId, 'infection', {
      type: 'INFECTED',
      spy_keyword: session.spyKeyword,
      message: 'Bạn đã bị Gián điệp lây nhiễm! Hãy giúp Gián điệp chiến thắng.'
    });

    // Gửi xác nhận cho Spy (Java dùng /user/queue/ability-result)
    emitToUser(userId, 'ability-result', {
      success: true,
      type: 'INFECT',
      message: `Bạn đã lây nhiễm thành công ${target.displayName}`
    });

    return { success: true };
  },
  adminSetSpy: async (roomId, adminId, targetUserId) => {
    const room = await Room.findById(roomId);
    if (!room) throw new Error('Không tìm thấy phòng');
    
    // Kiểm tra quyền admin (hoặc chủ phòng tùy logic)
    // Ở đây tạm thời lưu vào room model
    room.adminSelectedSpyId = targetUserId;
    await room.save();
    
    return { success: true };
  },
  adjustRewards: async (matchId, adminId, civilian, spy, infected) => {
    // Logic điều chỉnh phần thưởng cho trận đấu
    return { success: true };
  },
  setGameState: async (matchId, state) => {
    const session = gameSessions.get(matchId.toString());
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    session.state = state;
    session.phaseStartTime = Date.now();
    
    emitToRoom(session.roomId, 'PHASE_UPDATE', {
      state: session.state,
      startTime: session.phaseStartTime,
      endTime: session.phaseEndTime,
      currentRound: session.currentRound
    });

    return { success: true, state };
  }
};
