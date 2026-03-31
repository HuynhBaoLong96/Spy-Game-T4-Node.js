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

const PHASE_DURATIONS = {
  ROLE_ASSIGN: 10,
  DESCRIBING: 60,
  DISCUSSING: 90,
  VOTING: 60,
  VOTE_TIE: 10,
  ROUND_RESULT: 5,
  ROLE_CHECK: 60,
  ROLE_CHECK_RESULT: 10,
  GAME_OVER: 0
};

/**
 * Khởi tạo một phiên chơi mới
 */
const startGame = async (roomIdOrCode, hostUserId) => {
  // Tìm phòng bằng ID hoặc RoomCode
  const room = await Room.findOne({
    $or: [
      { _id: roomIdOrCode.length === 24 ? roomIdOrCode : null },
      { roomCode: roomIdOrCode.toUpperCase() }
    ].filter(q => q && (q._id !== null || q.roomCode))
  });

  if (!room) throw new Error('Không tìm thấy phòng');
  if (room.hostId.toString() !== hostUserId.toString()) throw new Error('Chỉ chủ phòng mới có thể bắt đầu game');
  if (room.currentPlayers < 2) throw new Error('Cần ít nhất 2 người chơi để bắt đầu');

  const roomId = room._id.toString();

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
    descriptions: { 1: {} }, // round -> userId -> content (khởi tạo sẵn round 1)
    votes: { 1: {} },        // round -> userId -> targetId (khởi tạo sẵn round 1)
    roleCheckResults: {}, // userId -> correct (boolean)
    roleCheckDone: false,
    aiDiscussUsedThisRound: false,
    phaseStartTime: Date.now(),
    phaseEndTime: Date.now() + (PHASE_DURATIONS.ROLE_ASSIGN * 1000),
    currentTurnUserId: null,
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

  // Đảm bảo tất cả role của human là 'CIVILIAN' (viết hoa) để đồng bộ với enum DB
  humans.forEach(p => {
    if (p.role !== 'SPY') p.role = 'CIVILIAN';
  });

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
  emitToRoom(room, 'GAME_START', {
    type: 'GAME_START',
    room_id: roomId,
    match_id: match._id.toString(),
    matchId: match._id.toString()
  });

  // Chuyển sang phase ROLE_ASSIGN
  broadcastRoles(session);
  startPhaseTimer(session, PHASE_DURATIONS.ROLE_ASSIGN * 1000, moveToDescribing);

  return session;
};

const broadcastRoles = (session) => {
  session.players.forEach(player => {
    if (player.isAi) return;
    
    // Gửi thông tin vai trò riêng tư cho từng người (Java dùng /user/queue/role)
    // Cập nhật để khớp với yêu cầu của user: bao gồm phase và remaining_seconds
    emitToUser(player.userId, 'role', {
      phase: 'ROLE_ASSIGN',
      remaining_seconds: PHASE_DURATIONS.ROLE_ASSIGN,
      role: player.role.toUpperCase(),
      your_role: player.role.toUpperCase(),
      your_keyword: player.role === 'SPY' ? session.spyKeyword : session.civilianKeyword,
      keyword: player.role === 'SPY' ? session.spyKeyword : session.civilianKeyword,
      match_id: session.matchId,
      round: session.currentRound,
      color: player.color,
      players: session.players.map(p => ({
        user_id: p.userId,
        username: p.username,
        display_name: p.displayName,
        color: p.color,
        is_alive: p.isAlive,
        is_ai: p.isAi,
        role: 'unknown'
      }))
    });
  });

  // Gửi danh sách người chơi (ẩn vai trò) cho tất cả qua topic match
  emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'MATCH_UPDATE',
    phase: 'ROLE_ASSIGN',
    state: 'ROLE_ASSIGN',
    remaining_seconds: PHASE_DURATIONS.ROLE_ASSIGN,
    match_id: session.matchId,
    players: session.players.map(p => ({
      user_id: p.userId,
      username: p.username,
      display_name: p.displayName,
      color: p.color,
      is_alive: p.isAlive,
      is_ai: p.isAi,
      role: 'unknown'
    }))
  });
};

const startPhaseTimer = (session, durationMs, nextPhaseFn) => {
  session.phaseStartTime = Date.now();
  session.phaseEndTime = Date.now() + durationMs;
  
  const phase = session.state.toUpperCase();
  const isAnonymizedPhase = ['DESCRIBING', 'DISCUSSING', 'VOTING'].includes(phase);

  // Thông báo chuyển phase tới topic match
  emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: phase,
    state: phase,
    startTime: session.phaseStartTime,
    endTime: session.phaseEndTime,
    phase_end_at: new Date(session.phaseEndTime).toISOString(),
    remaining_seconds: Math.floor(durationMs / 1000),
    current_round: session.currentRound,
    currentRound: session.currentRound,
    players: session.players.map(p => ({
      user_id: p.userId,
      username: isAnonymizedPhase ? getAnonymousName(p) : p.username,
      display_name: isAnonymizedPhase ? getAnonymousName(p) : p.displayName,
      color: p.color,
      is_alive: p.isAlive,
      is_ai: p.isAi,
      role: 'unknown'
    }))
  });

  // Gửi lại keyword riêng cho từng người
  session.players.forEach(p => {
    if (p.isAi) return;
    emitToUser(p.userId, 'role', {
      phase: phase,
      remaining_seconds: Math.floor(durationMs / 1000),
      your_keyword: p.role === 'SPY' ? session.spyKeyword : session.civilianKeyword,
      your_role: p.role.toUpperCase(),
      role: p.role.toUpperCase(),
      match_id: session.matchId
    });
  });

  if (session.timerId) clearTimeout(session.timerId);
  
  session.timerId = setTimeout(() => {
    const currentSession = gameSessions.get(session.matchId.toString());
    if (currentSession && currentSession.state === session.state) {
      nextPhaseFn(currentSession);
    }
  }, durationMs);
};

const moveToDescribing = (session) => {
  session.state = 'DESCRIBING';
  session.currentTurnUserId = null; // Không dùng lượt miêu tả
  
  startPhaseTimer(session, PHASE_DURATIONS.DESCRIBING * 1000, moveToDiscussing);

  // Thông báo chuyển phase cho FE (Round1Enter subscribe /topic/room/:roomId/state)
  emitToTopic(`/topic/room/${session.roomId}/state`, {
    type: 'PHASE_UPDATE',
    state: 'DESCRIBING',
    match_id: session.matchId,
    room_id: session.roomId
  });

  // AI tự động miêu tả sau 5-10 giây
  setTimeout(() => {
    autoDescribeForAi(session);
  }, 5000 + Math.random() * 5000);
};

const moveToDiscussing = (session) => {
  session.state = 'DISCUSSING';
  session.currentTurnUserId = null;
  startPhaseTimer(session, PHASE_DURATIONS.DISCUSSING * 1000, moveToVoting);
};

const moveToVoting = (session) => {
  session.state = 'VOTING';
  session.currentTurnUserId = null;
  startPhaseTimer(session, PHASE_DURATIONS.VOTING * 1000, processVoteResult);
};

const processVoteResult = async (session) => {
  console.log('Đang xử lý kết quả vote cho trận:', session.matchId);
  
  const currentVotes = session.votes[session.currentRound] || {};
  const voteCounts = {};
  
  Object.values(currentVotes).forEach(targetId => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });

  const voteEntries = Object.entries(voteCounts);
  if (voteEntries.length === 0) {
    return moveToVoteTie(session);
  }

  const maxVotes = Math.max(...Object.values(voteCounts));
  const topVoted = voteEntries.filter(([id, count]) => count === maxVotes).map(([id]) => id);

  if (topVoted.length > 1) {
    moveToVoteTie(session);
  } else {
    await eliminatePlayer(session, topVoted[0]);
  }
};

const eliminatePlayer = async (session, userId) => {
  const player = session.players.find(p => p.userId === userId);
  if (player) {
    player.isAlive = false;
    // Cập nhật MatchPlayer trong DB
    await MatchPlayer.updateOne(
      { matchId: session.matchId, userId: userId },
      { isAlive: false, eliminatedRound: session.currentRound }
    );
  }

  session.state = 'ROUND_RESULT';
  
  emitToTopic(`/topic/match/${session.matchId}/round-result`, {
    type: 'VOTE_RESULT',
    eliminated_user_id: userId,
    eliminated_display_name: player ? player.displayName : 'Unknown',
    role: player ? player.role : 'NONE',
    is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false,
    voting_result: {
      eliminated_user_id: userId,
      eliminated_display_name: player ? player.displayName : 'Unknown',
      role: player ? player.role : 'NONE',
      is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false
    }
  });

  // Gửi cả lên topic chính match để FE bắt sự kiện dễ hơn
  emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'VOTE_RESULT',
    eliminated_user_id: userId,
    eliminated_display_name: player ? player.displayName : 'Unknown',
    role: player ? player.role : 'NONE',
    is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false,
    voting_result: {
      eliminated_user_id: userId,
      eliminated_display_name: player ? player.displayName : 'Unknown',
      role: player ? player.role : 'NONE',
      is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false
    }
  });

  startPhaseTimer(session, PHASE_DURATIONS.ROUND_RESULT * 1000, checkWinCondition);
};

const moveToVoteTie = (session) => {
  session.state = 'VOTE_TIE';
  
  const tieMsg = {
    type: 'VOTE_RESULT',
    is_tie: true,
    message: 'Kết quả hòa! Không ai bị loại.',
    voting_result: {
      eliminated_user_id: null,
      is_tie: true
    }
  };

  emitToTopic(`/topic/match/${session.matchId}/round-result`, tieMsg);
  emitToTopic(`/topic/match/${session.matchId}`, tieMsg);

  startPhaseTimer(session, PHASE_DURATIONS.VOTE_TIE * 1000, startNextRound);
};

const checkWinCondition = async (session) => {
  const alivePlayers = session.players.filter(p => p.isAlive);
  const spyAlive = alivePlayers.some(p => p.role === 'SPY' || p.role === 'INFECTED');
  const civilianHumansAlive = alivePlayers.filter(p => !p.isAi && (p.role === 'CIVILIAN' || p.role === 'civilian')).length;

  console.log(`[DEBUG] checkWinCondition matchId=${session.matchId}: spyAlive=${spyAlive}, civiliansAlive=${civilianHumansAlive}`);

  // Nếu Spy chết, cho Spy một cơ hội đoán từ khóa (ROLE_CHECK)
  if (!spyAlive) {
    const eliminatedSpy = session.players.find(p => (p.role === 'SPY' || p.role === 'INFECTED') && !p.isAlive);
    if (eliminatedSpy && !session.roleCheckDone) {
      return moveToSpyKeywordGuess(session, eliminatedSpy.userId);
    }
    return moveToGameOver(session, 'civilians');
  } 
  
  // Nếu KHÔNG CÒN dân thường (Human) nào sống, Spy thắng
  if (civilianHumansAlive === 0) {
    return moveToGameOver(session, 'spy');
  } 
  
  // Nếu chưa ai thắng, qua vòng mới
  await startNextRound(session);
};

const moveToSpyKeywordGuess = async (session, spyUserId) => {
  session.state = 'ROLE_CHECK';
  session.currentTurnUserId = spyUserId;
  
  // Thông báo cho FE
  emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'ROLE_CHECK',
    state: 'ROLE_CHECK',
    current_turn_user_id: spyUserId,
    remaining_seconds: PHASE_DURATIONS.ROLE_CHECK
  });

  // Nếu là AI Spy, tự động đoán
  if (spyUserId === 'ai_official') {
    setTimeout(() => {
      module.exports.submitRoleGuess(session.matchId, 'ai_official', session.civilianKeyword);
    }, 3000);
  }

  startPhaseTimer(session, PHASE_DURATIONS.ROLE_CHECK * 1000, () => {
    // Hết giờ mà không đoán thì Dân thường thắng
    moveToGameOver(session, 'civilians');
  });
};

const startNextRound = async (session) => {
  session.currentRound++;
  session.aiDiscussUsedThisRound = false;
  
  // Reset descriptions và votes cho vòng mới
  session.descriptions[session.currentRound] = {};
  session.votes[session.currentRound] = {};

  // Luôn quay lại phase DESCRIBING cho vòng tiếp theo
  moveToDescribing(session);
};

const moveToRoleCheck = async (session) => {
  session.state = 'ROLE_CHECK';
  
  // AI auto guess
  await autoRoleCheckForAi(session);
  
  startPhaseTimer(session, PHASE_DURATIONS.ROLE_CHECK * 1000, onRoleCheckPhaseEnd);
};

const onRoleCheckPhaseEnd = async (session) => {
  // Những người chưa đoán coi như sai (đã được handle trong submitRoleGuess hoặc mặc định là sai)
  await moveToRoleCheckResult(session);
};

const moveToRoleCheckResult = async (session) => {
  session.state = 'ROLE_CHECK_RESULT';
  await broadcastRoleCheckResults(session);
  startPhaseTimer(session, PHASE_DURATIONS.ROLE_CHECK_RESULT * 1000, onRoleCheckResultPhaseEnd);
};

const broadcastRoleCheckResults = async (session) => {
  const aliveHumans = session.players.filter(p => p.isAlive && !p.isAi).map(p => p.userId);

  for (const player of session.players) {
    if (player.isAi) continue;

    const correct = session.roleCheckResults[player.userId] === true;
    const isSpy = player.userId === session.spyUserId;
    
    const result = {
      correct,
      actual_role: isSpy ? 'SPY' : 'CIVILIAN',
      reward_coins: correct ? 10 : 0,
      abilities_available: (isSpy && correct) ? ['FAKE_MESSAGE', 'INFECT'] : [],
      alive_humans: (isSpy && correct) ? aliveHumans : [],
      acknowledged: false
    };

    if (correct) {
      await addReward(player.userId, 10, 'GAME_REWARD', 'Đoán đúng vai trò');
    }

    emitToUser(player.userId, 'role-check-result', result);
  }
};

const onRoleCheckResultPhaseEnd = async (session) => {
  session.roleCheckDone = true;
  moveToDescribing(session);
};

const moveToGameOver = async (session, winnerRole) => {
  session.state = 'GAME_OVER';
  
  await processEndGameRewards(session, winnerRole);

  emitToTopic(`/topic/match/${session.matchId}/game-over`, {
    winner_role: winnerRole,
    players: session.players.map(p => ({
      user_id: p.userId,
      display_name: p.displayName,
      role: p.role,
      is_alive: p.isAlive
    }))
  });

  // Cập nhật Match trong DB
  await Match.findByIdAndUpdate(session.matchId, { status: 'completed', winner: winnerRole });
  
  // Reset Room
  const room = await Room.findById(session.roomId);
  if (room) {
    room.status = 'waiting';
    await room.save();
    const { broadcastLobbyRoomEvent } = require('./roomService');
    broadcastLobbyRoomEvent(room, 'UPDATED');
  }

  gameSessions.delete(session.matchId);
};

const processEndGameRewards = async (session, winnerRole) => {
  for (const player of session.players) {
    if (player.isAi) continue;

    let reward = 0;
    let didWin = false;

    if (winnerRole === 'spy') {
      if (player.role === 'SPY' || player.role === 'INFECTED') {
        reward = 25;
        didWin = true;
      } else {
        reward = -5;
      }
    } else {
      if (player.role === 'CIVILIAN' || player.role === 'civilian') {
        reward = 15;
        didWin = true;
      } else {
        reward = -5;
      }
    }

    await addReward(player.userId, reward, 'GAME_RESULT', `Kết quả trận đấu: ${winnerRole} thắng`, true);
    
    // Update UserStats
    let stats = await UserStats.findOne({ userId: player.userId });
    if (!stats) stats = new UserStats({ userId: player.userId });
    
    stats.totalGames += 1;
    if (didWin) {
      if (player.role === 'civilian') stats.winsCivilian += 1;
      else if (player.role === 'SPY') stats.winsSpy += 1;
      else if (player.role === 'INFECTED') stats.winsInfected += 1;
    }
    if (player.role === 'SPY') stats.timesAsSpy += 1;
    if (player.role === 'INFECTED') stats.timesInfected += 1;
    await stats.save();

    // Update MatchPlayer
    await MatchPlayer.updateOne(
      { matchId: session.matchId, userId: player.userId },
      { didWin, score: reward }
    );
  }
};

/** AI Logic */
const autoRoleCheckForAi = async (session) => {
  const ai = session.players.find(p => p.isAi && p.isAlive);
  if (ai) {
    await module.exports.submitRoleGuess(session.matchId, ai.userId, 'civilian');
  }
};

const autoDescribeForAi = async (session) => {
  const ai = session.players.find(p => p.isAi && p.isAlive);
  if (!ai) return;

  // Đảm bảo descriptions[round] đã được khởi tạo trước khi đọc
  if (!session.descriptions[session.currentRound]) {
    session.descriptions[session.currentRound] = {};
  }

  if (!session.descriptions[session.currentRound][ai.userId]) {
    const content = await getAiDescription(session.civilianKeyword, session.currentRound);
    await module.exports.submitDescription(session.matchId, ai.userId, content);
  }
};

const autoDiscussForAi = async (session) => {
  if (session.aiDiscussUsedThisRound) return;
  const ai = session.players.find(p => p.isAi && p.isAlive);
  if (ai) {
    const content = await getAiDescription(session.civilianKeyword, session.currentRound);
    const name = getAnonymousName(ai);
    emitToTopic(`/topic/match/${session.matchId}/chat`, {
      sender_id: ai.userId,
      sender_name: name,
      content,
      timestamp: Date.now()
    });
    session.aiDiscussUsedThisRound = true;
  }
};

const getSession = (matchId) => gameSessions.get(matchId.toString());

const getAnonymousName = (player) => {
  const map = {
    red: 'Mèo Béo (Đỏ) 🎭',
    blue: 'Cún Con (Xanh) 🎭',
    green: 'Gấu Trúc (Lục) 🎭',
    yellow: 'Vịt Vàng (Vàng) 🎭',
    purple: 'Cáo Nhỏ (Tím) 🎭',
    orange: 'Hổ Con (Cam) 🎭',
    pink: 'Thỏ Ngọc (Hồng) 🎭',
    cyan: 'Chim Cánh Cụt (Lam) 🎭'
  };
  if (player.isAi) return 'AI KeywordSpy';
  return map[player.color] || 'Người chơi 🎭';
};

const getAlivePlayer = (session, userId) => {
  const player = session.players.find(p => p.userId === userId.toString());
  if (!player) throw new Error('Không tìm thấy người chơi');
  if (!player.isAlive) throw new Error('Bạn đã bị loại, không thể thực hiện hành động này');
  return player;
};

const handlePlayerQuit = async (roomIdOrCode, userId) => {
  if (!roomIdOrCode || !userId) return;
  for (const [matchId, session] of gameSessions.entries()) {
    if (session.roomId.toString() === roomIdOrCode.toString() || session.roomCode === roomIdOrCode) {
      const player = session.players.find(p => p.userId === userId.toString());
      if (player && player.isAlive) {
        // Chỉ đánh dấu AFK nếu game đang diễn ra (không phải ROLE_ASSIGN hay GAME_OVER)
        const activePhases = ['DESCRIBING', 'DISCUSSING', 'VOTING', 'VOTE_TIE', 'ROUND_RESULT', 'ROLE_CHECK', 'ROLE_CHECK_RESULT'];
        if (!activePhases.includes(session.state)) {
          // Đang ở ROLE_ASSIGN hoặc phase khác - bỏ qua, player chưa chính thức vào game
          break;
        }

        player.isAlive = false;
        await MatchPlayer.updateOne(
          { matchId: session.matchId, userId: userId },
          { isAlive: false, afk: true }
        );
        emitToTopic(`/topic/match/${session.matchId}`, {
          type: 'PLAYER_AFK',
          user_id: userId,
          display_name: player.displayName
        });
        await checkWinCondition(session);
      }
      break;
    }
  }
};

module.exports = {
  startGame,
  getSession,
  getAnonymousName,
  handlePlayerQuit,
  submitDescription: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'DESCRIBING') throw new Error('Không phải lúc mô tả');
    
    getAlivePlayer(session, userId);

    const words = content.trim().split(/\s+/);
    if (words.length < 1 || words.length > 30) throw new Error('Mô tả phải từ 1-30 từ');

    if (!session.descriptions[session.currentRound]) {
      session.descriptions[session.currentRound] = {};
    }

    if (session.descriptions[session.currentRound][userId.toString()]) {
      throw new Error('Bạn đã miêu tả rồi');
    }

    session.descriptions[session.currentRound][userId.toString()] = content;

    const descriptions = Object.entries(session.descriptions[session.currentRound]).map(([uid, c]) => ({
      user_id: uid,
      content: c
    }));
    
    // Broadcast theo format FE yêu cầu
    emitToTopic(`/topic/match/${matchId}/descriptions`, {
      descriptions: descriptions,
      all_submitted: descriptions.length >= session.players.filter(p => p.isAlive).length
    });

    // Tự động chuyển phase nếu tất cả (người chơi và AI) đã xong
    const alivePlayers = session.players.filter(p => p.isAlive);
    if (descriptions.length >= alivePlayers.length) {
      setTimeout(() => {
        const currentSession = gameSessions.get(matchId.toString());
        if (currentSession && currentSession.state === 'DESCRIBING') {
          moveToDiscussing(currentSession);
        }
      }, 2000);
    }
  },
  submitChat: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    // Cho phép chat trong cả lúc miêu tả và thảo luận
    if (session.state !== 'DESCRIBING' && session.state !== 'DISCUSSING') {
      throw new Error('Không phải lúc thảo luận hoặc miêu tả');
    }
    
    const player = getAlivePlayer(session, userId);
    const isAnonymizedPhase = session.state.toUpperCase() === 'DISCUSSING';
    const name = isAnonymizedPhase ? 'ĐANG GIẤU MẶT 🎭' : player.displayName;

    emitToTopic(`/topic/match/${matchId}/chat`, {
      type: 'CHAT',
      sender_id: userId,
      user_id: userId,
      sender_name: name,
      display_name: name,
      color: isAnonymizedPhase ? 'gray' : player.color,
      content: content,
      timestamp: Date.now()
    });

    // AI auto discuss
    await autoDiscussForAi(session);
  },
  submitVote: async (matchId, voterId, targetId) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'VOTING') return;

    getAlivePlayer(session, voterId);

    if (!session.votes[session.currentRound]) {
      session.votes[session.currentRound] = {};
    }
    session.votes[session.currentRound][voterId] = targetId;

    const voteCounts = {};
    Object.values(session.votes[session.currentRound]).forEach(tid => {
      voteCounts[tid] = (voteCounts[tid] || 0) + 1;
    });

    emitToTopic(`/topic/match/${matchId}/votes`, voteCounts);
  },
  submitRoleGuess: async (matchId, userId, guessedKeyword) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'ROLE_CHECK') throw new Error('Không phải lúc đoán từ khóa');
    
    const isSpy = userId.toString() === session.spyUserId || userId.toString() === session.infectedUserId;
    if (!isSpy) throw new Error('Chỉ Gián điệp bị loại mới có thể đoán từ khóa');

    const correct = guessedKeyword.trim().toLowerCase() === session.civilianKeyword.toLowerCase();

    if (correct) {
      // Gián điệp đoán đúng -> Gián điệp thắng
      await moveToGameOver(session, 'spy');
    } else {
      // Gián điệp đoán sai -> Quay lại miêu tả vòng mới
      await startNextRound(session);
    }

    return { submitted: true, correct };
  },
  confirmSpyAbility: async (matchId, userId, abilityType) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'ROLE_CHECK_RESULT') throw new Error('Không phải lúc chọn kỹ năng');
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể chọn kỹ năng');
    }

    session.selectedAbility = abilityType;
    
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

    emitToUser(targetUserId, 'infection', {
      type: 'INFECTED',
      spy_keyword: session.spyKeyword,
      message: 'Bạn đã bị Gián điệp lây nhiễm! Hãy giúp Gián điệp chiến thắng.'
    });

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
    room.adminSelectedSpyId = targetUserId;
    await room.save();
    return { success: true };
  },
  adjustRewards: async (matchId, adminId, civilian, spy, infected) => {
    return { success: true };
  },
  setGameState: async (matchId, state) => {
    const session = gameSessions.get(matchId.toString());
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    session.state = state;
    session.phaseStartTime = Date.now();
    
    emitToTopic(`/topic/match/${matchId}`, {
      type: 'PHASE_UPDATE',
      state: session.state,
      startTime: session.phaseStartTime,
      endTime: session.phaseEndTime,
      currentRound: session.currentRound
    });

    return { success: true, state };
  }
};