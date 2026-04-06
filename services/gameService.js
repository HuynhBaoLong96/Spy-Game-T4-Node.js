const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const GameSettings = require('../models/GameSettings');
const { getRandomKeywordPair, generateHint } = require('./keywordService');
const { deductEntryFee, addReward } = require('./economyService');
const { getAiDescription } = require('./aiService');

// Lazy load socketService to avoid circular dependencies
const getSocketService = () => require('./socketService');

// Lưu trữ các phiên chơi đang diễn ra trong bộ nhớ
const gameSessions = new Map();

const DEFAULT_PHASE_DURATIONS = {
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
 * Lấy cấu hình thời gian từ Database
 */
const getDurations = async () => {
  try {
    // Luôn fetch mới từ DB để tránh cache
    const settings = await GameSettings.findOne({ _id: 'global' }).lean();
    if (!settings) {
      console.log('[ADMIN] No settings found, using defaults.');
      return { ...DEFAULT_PHASE_DURATIONS };
    }
    
    const durations = {
      ROLE_ASSIGN: 10,
      DESCRIBING: Number(settings.describeDuration) || DEFAULT_PHASE_DURATIONS.DESCRIBING,
      DISCUSSING: Number(settings.discussDuration) || DEFAULT_PHASE_DURATIONS.DISCUSSING,
      VOTING: Number(settings.voteDuration) || DEFAULT_PHASE_DURATIONS.VOTING,
      VOTE_TIE: 10,
      ROUND_RESULT: 5,
      ROLE_CHECK: Number(settings.roleCheckDuration) || DEFAULT_PHASE_DURATIONS.ROLE_CHECK,
      ROLE_CHECK_RESULT: Number(settings.roleCheckResultDuration) || DEFAULT_PHASE_DURATIONS.ROLE_CHECK_RESULT,
      GAME_OVER: 0
    };
    
    // Log để kiểm tra giá trị thực tế
    console.log('[ADMIN] Fetched durations from DB:', {
      describe: settings.describeDuration,
      discuss: settings.discussDuration,
      vote: settings.voteDuration
    });
    return durations;
  } catch (error) {
    console.error('[ADMIN] Error fetching durations:', error);
    return { ...DEFAULT_PHASE_DURATIONS };
  }
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
  console.log(`[GAME-SERVICE] Keyword pair selected: Civilian=${keywordPair.civilianKeyword}, Spy=${keywordPair.spyKeyword}, Category=${keywordPair.category}`);

  // 2.5 Lấy cấu hình thời gian
  const durations = await getDurations();

  // 2.7 Chuẩn bị từ khóa và hint (nếu là phòng đặc biệt)
  const isSpecialRound = room.isSpecialRound || false;
  console.log(`[GAME-SERVICE] isSpecialRound: ${isSpecialRound}`);
  
  const civilianHint = isSpecialRound ? generateHint(keywordPair.civilianKeyword, keywordPair.category) : keywordPair.civilianKeyword;
  const spyHint = isSpecialRound ? generateHint(keywordPair.spyKeyword, keywordPair.category) : keywordPair.spyKeyword;
  console.log(`[GAME-SERVICE] Hints prepared: CivilianHint=${civilianHint}, SpyHint=${spyHint}`);

  // 3. Tạo Match trong DB
  const match = await Match.create({
    roomId,
    civilianKeyword: civilianHint,
    spyKeyword: spyHint,
    realCivilianKeyword: keywordPair.civilianKeyword,
    realSpyKeyword: keywordPair.spyKeyword,
    isSpecialRound: isSpecialRound,
    status: 'in_progress'
  });

  // 4. Khởi tạo GameSession trong bộ nhớ
  const session = {
    matchId: match._id.toString(),
    roomId,
    roomCode: room.roomCode,
    isSpecialRound: isSpecialRound,
    civilianKeyword: civilianHint,
    spyKeyword: spyHint,
    realCivilianKeyword: keywordPair.civilianKeyword,
    realSpyKeyword: keywordPair.spyKeyword,
    currentRound: 1,
    state: 'ROLE_ASSIGN',
    players: [],
    descriptions: { 1: {} }, // round -> userId -> content (khởi tạo sẵn round 1)
    votes: { 1: {} },        // round -> userId -> targetId (khởi tạo sẵn round 1)
    roleCheckResults: {}, // userId -> correct (boolean)
    roleCheckDone: false,
    aiDiscussUsedThisRound: false,
    phaseStartTime: Date.now(),
    phaseEndTime: Date.now() + (durations.ROLE_ASSIGN * 1000),
    currentTurnUserId: null,
    durations, // Lưu durations vào session để dùng cho các phase sau
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
      role: 'CIVILIAN', // Chuẩn hóa chữ hoa
      isAlive: true,
      isAi: false
    });
  }

  // Luôn thêm 1 AI với tên ngẫu nhiên giống người chơi
  const aiNames = ['Gấu Trúc', 'Sóc Chuột', 'Voi Con', 'Ngựa Vằn', 'Cá Heo', 'Chim Cánh Cụt', 'Thỏ Ngọc', 'Cáo Nhỏ'];
  const randomAiName = aiNames[Math.floor(Math.random() * aiNames.length)];

  players.push({
    userId: 'ai_official',
    username: randomAiName,
    displayName: randomAiName,
    color: shuffledColors[roomPlayers.length] || 'black',
    role: 'CIVILIAN', // AI cũng là một dân thường (mặc định)
    isAlive: true,
    isAi: true
  });

  // 6. Chọn Spy (Ưu tiên người được chủ phòng chỉ định)
  const humans = players.filter(p => !p.isAi);
  let selectedSpyId = room.adminSelectedSpyId;

  // Kiểm tra nếu spy được chọn vẫn còn trong phòng (so sánh string-to-string)
  if (selectedSpyId && !humans.some(p => String(p.userId) === String(selectedSpyId))) {
    console.log(`[DEBUG] Selected Spy ${selectedSpyId} is no longer in the room. Resetting to random.`);
    selectedSpyId = null;
  }

  if (selectedSpyId) {
    // Gán role SPY cho người được chọn
    humans.forEach(p => {
      if (String(p.userId) === String(selectedSpyId)) {
        p.role = 'SPY';
        session.spyUserId = p.userId;
      } else {
        p.role = 'CIVILIAN';
      }
    });
    console.log(`[DEBUG] Spy assigned by Host: ${selectedSpyId}`);
  } else if (humans.length > 0) {
    // Nếu không có ai được chọn, chọn ngẫu nhiên như cũ
    const spyIndex = Math.floor(Math.random() * humans.length);
    humans[spyIndex].role = 'SPY';
    session.spyUserId = humans[spyIndex].userId;
    
    // Đảm bảo những người còn lại là CIVILIAN
    humans.forEach((p, idx) => {
      if (idx !== spyIndex) p.role = 'CIVILIAN';
    });
    console.log(`[DEBUG] Selected random Spy: ${humans[spyIndex].username} (${humans[spyIndex].userId})`);
  } else {
    console.error('[ERROR] No humans found to assign Spy!');
  }

  // Đăng ký ngay lập tức cho Smart Inject để đảm bảo phase đầu tiên (ROLE_ASSIGN) có từ khóa
  getSocketService().setMatchData(match._id.toString(), {
    civilianKeyword: session.civilianKeyword,
    spyKeyword: session.spyKeyword,
    spyUserId: session.spyUserId.toString(),
    infectedUserId: null,
    isSpecialRound: session.isSpecialRound || false
  });

  // Reset adminSelectedSpyId sau khi đã dùng để tránh ván sau bị lặp lại nếu chủ phòng quên chọn
  room.adminSelectedSpyId = null;
  await room.save();

  session.players = players;
  gameSessions.set(match._id.toString(), session);

  // 7. Cập nhật Match với Spy ID
  match.spyUserId = session.spyUserId;
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
  
  // 9.5 Đăng ký match data cho Smart Broadcast của socketService
  getSocketService().setMatchData(match._id.toString(), {
    civilianKeyword: session.civilianKeyword,
    spyKeyword: session.spyKeyword,
    spyUserId: session.spyUserId.toString(),
    infectedUserId: session.infectedUserId ? session.infectedUserId.toString() : null,
    isSpecialRound: session.isSpecialRound || false
  });

  // Thông báo cho Lobby
  const { broadcastLobbyRoomEvent } = require('./roomService');
  broadcastLobbyRoomEvent(room, 'UPDATED');

  // 10. Thông báo bắt đầu game qua Socket
  getSocketService().emitToRoom(room, 'GAME_START', {
    type: 'GAME_START',
    room_id: roomId,
    match_id: match._id.toString(),
    matchId: match._id.toString(),
    is_special_round: false, // Để FE hiện khung to
    isSpecialRound: false
  });

  // Chuyển sang phase ROLE_ASSIGN
  broadcastRoles(session);
  startPhaseTimer(session, session.durations.ROLE_ASSIGN * 1000, moveToDescribing);

  return session;
};

const broadcastRoles = (session) => {
  session.players.forEach(player => {
    if (player.isAi) return;
    
    const isSpyOrInfected = player.role.toUpperCase() === 'SPY' || player.role.toUpperCase() === 'INFECTED';
    const displayKeyword = isSpyOrInfected ? session.spyKeyword : session.civilianKeyword;

    // Gửi thông tin vai trò riêng tư cho từng người (Java dùng /user/queue/role)
    // Cập nhật để khớp với yêu cầu của user: bao gồm phase và remaining_seconds
    getSocketService().emitToUser(player.userId, 'role', {
      phase: 'ROLE_ASSIGN',
      remaining_seconds: session.durations.ROLE_ASSIGN,
      role: player.role.toUpperCase(),
      your_role: player.role.toUpperCase(),
      your_keyword: displayKeyword,
      yourKeyword: displayKeyword,
      keyword: displayKeyword,
      my_keyword: displayKeyword,
      description: displayKeyword,
      your_description: displayKeyword,
      is_special_round: false, // Để false để FE hiện khung to ở giữa (nhưng nội dung vẫn là hint)
      isSpecialRound: false,
      match_id: session.matchId,
      round: session.currentRound,
      color: player.color,
      players: session.players.map(p => ({
        user_id: p.userId,
        username: p.username,
        display_name: p.displayName,
        color: p.color,
        is_alive: p.isAlive,
        is_ai: p.isAi
      }))
    });
  });

  // Gửi danh sách người chơi (ẩn vai trò) cho tất cả qua topic match
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'MATCH_UPDATE',
    phase: 'ROLE_ASSIGN',
    state: 'ROLE_ASSIGN',
    remaining_seconds: session.durations.ROLE_ASSIGN,
    match_id: session.matchId,
    players: session.players.map(p => ({
      user_id: p.userId,
      username: p.username,
      display_name: p.displayName,
      color: p.color,
      is_alive: p.isAlive,
      is_ai: p.isAi
    }))
  });
};

const startPhaseTimer = (session, durationMs, nextPhaseFn) => {
  session.phaseStartTime = Date.now();
  session.phaseEndTime = Date.now() + durationMs;
  
  const phase = session.state.toUpperCase();
  const isAnonymizedPhase = ['DESCRIBING', 'DISCUSSING', 'VOTING'].includes(phase);
  const isDiscussing = phase === 'DISCUSSING';

  // Thông báo chuyển phase tới topic match
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: phase,
    state: phase,
    match_id: session.matchId,
    startTime: session.phaseStartTime,
    endTime: session.phaseEndTime,
    phase_end_at: new Date(session.phaseEndTime).toISOString(),
    remaining_seconds: Math.floor(durationMs / 1000),
    current_round: session.currentRound,
    currentRound: session.currentRound,
    is_special_round: session.isSpecialRound || false,
    players: session.players.map(p => ({
      user_id: p.userId,
      username: isAnonymizedPhase ? getAnonymousName(p) : p.username,
      display_name: isAnonymizedPhase ? getAnonymousName(p) : p.displayName,
      color: isDiscussing ? 'gray' : p.color, // Mask color only in DISCUSSING
      is_alive: p.isAlive,
      is_ai: p.isAi
    }))
  });

  // Gửi lại keyword riêng cho từng người
  session.players.forEach(p => {
    if (p.isAi) return;
    
    const isSpyOrInfected = p.role.toUpperCase() === 'SPY' || p.role.toUpperCase() === 'INFECTED';
    const keyword = isSpyOrInfected ? session.spyKeyword : session.civilianKeyword;

    // Kiểm tra xem Spy có quyền thao túng AI không
    const canManipulateAi = isSpyOrInfected && (session.selectedAbility === 'fake_message' || session.selectedAbility === 'MANIPULATE_AI');
    const aiPlayer = session.players.find(player => player.isAi && player.isAlive);

    getSocketService().emitToUser(p.userId, 'role', {
      phase: phase,
      remaining_seconds: Math.floor(durationMs / 1000),
      your_keyword: keyword,
      yourKeyword: keyword,
      keyword: keyword,
      my_keyword: keyword,
      description: keyword,
      your_description: keyword,
      your_role: p.role.toUpperCase(),
      role: p.role.toUpperCase(),
      match_id: session.matchId,
      is_special_round: session.isSpecialRound || false,
      isSpecialRound: session.isSpecialRound || false,
      can_manipulate_ai: canManipulateAi,
      ai_user_id: aiPlayer ? aiPlayer.userId : null
    });
  });

  if (session.timerId) clearTimeout(session.timerId);
  
  session.timerId = setTimeout(async () => {
    try {
      const currentSession = gameSessions.get(session.matchId.toString());
      if (currentSession && currentSession.state === session.state) {
        await nextPhaseFn(currentSession);
      }
    } catch (error) {
      console.error(`[ERROR] Lỗi trong phase ${session.state}:`, error);
    }
  }, durationMs);
};

/**
 * Admin skip phase
 */
const skipPhase = async (matchId) => {
  const session = gameSessions.get(matchId.toString());
  if (!session) throw new Error('Không tìm thấy trận đấu');
  
  console.log(`[ADMIN] Skipping phase ${session.state} for match ${matchId}`);
  
  // Xóa timer hiện tại
  if (session.timerId) clearTimeout(session.timerId);

  // Định nghĩa phase tiếp theo dựa trên phase hiện tại
  const nextPhaseMap = {
    'ROLE_ASSIGN': moveToDescribing,
    'DESCRIBING': moveToDiscussing,
    'DISCUSSING': moveToVoting,
    'VOTING': processVoteResult,
    'VOTE_TIE': startNextRound,
    'ROUND_RESULT': checkWinCondition,
    'ROLE_CHECK': onRoleCheckPhaseEnd,
    'ROLE_CHECK_RESULT': onRoleCheckResultPhaseEnd,
    'GAME_OVER': () => {}
  };

  const nextFn = nextPhaseMap[session.state.toUpperCase()] || (() => {});
  
  // Kích hoạt ngay lập tức hàm chuyển phase tiếp theo
  await nextFn(session);
  
  return { success: true, newState: session.state };
};

/**
 * Cập nhật cấu hình cho toàn bộ session đang chạy
 */
const refreshAllDurations = async () => {
  const durations = await getDurations();
  for (const session of gameSessions.values()) {
    const oldDurations = { ...session.durations };
    session.durations = durations;
    console.log(`[ADMIN] Refreshed durations for match ${session.matchId}`);
    
    // Tính toán lại phaseEndTime dựa trên tỉ lệ thời gian đã trôi qua hoặc đơn giản là cộng thêm/bớt đi phần chênh lệch
    const currentPhase = session.state.toUpperCase();
    const newPhaseDuration = durations[currentPhase];
    const oldPhaseDuration = oldDurations[currentPhase];

    if (newPhaseDuration && oldPhaseDuration && newPhaseDuration !== oldPhaseDuration) {
      const elapsedMs = Date.now() - session.phaseStartTime;
      const newDurationMs = newPhaseDuration * 1000;
      
      // Cập nhật phaseEndTime mới
      session.phaseEndTime = session.phaseStartTime + newDurationMs;
      
      // Xóa timer cũ và tạo timer mới với thời gian còn lại
      if (session.timerId) clearTimeout(session.timerId);
      
      const remainingMs = Math.max(0, session.phaseEndTime - Date.now());
      
      // Tìm hàm chuyển phase tiếp theo
      const nextPhaseMap = {
        'ROLE_ASSIGN': moveToDescribing,
        'DESCRIBING': moveToDiscussing,
        'DISCUSSING': moveToVoting,
        'VOTING': processVoteResult,
        'VOTE_TIE': startNextRound,
        'ROUND_RESULT': checkWinCondition,
        'ROLE_CHECK': onRoleCheckPhaseEnd,
        'ROLE_CHECK_RESULT': onRoleCheckResultPhaseEnd
      };
      
      const nextFn = nextPhaseMap[currentPhase];
      if (nextFn) {
        session.timerId = setTimeout(async () => {
          try {
            const currentSession = gameSessions.get(session.matchId.toString());
            if (currentSession && currentSession.state === session.state) {
              await nextFn(currentSession);
            }
          } catch (error) {
            console.error(`[ERROR] Lỗi trong phase ${session.state} sau khi refresh:`, error);
          }
        }, remainingMs);
      }
    }

    // Gửi cập nhật timer mới cho FE ngay lập tức
    const finalRemainingMs = session.phaseEndTime - Date.now();
    getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
      type: 'PHASE_UPDATE',
      phase: session.state.toUpperCase(),
      state: session.state.toUpperCase(),
      match_id: session.matchId,
      remaining_seconds: Math.max(0, Math.floor(finalRemainingMs / 1000)),
      current_round: session.currentRound
    });
  }
};

const moveToDescribing = (session) => {
  session.state = 'DESCRIBING';
  session.currentTurnUserId = null; 
  
  startPhaseTimer(session, session.durations.DESCRIBING * 1000, moveToDiscussing);

  getSocketService().emitToTopic(`/topic/room/${session.roomId}/state`, {
    type: 'PHASE_UPDATE',
    state: 'DESCRIBING',
    match_id: session.matchId,
    room_id: session.roomId
  });

  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    state: 'DESCRIBING',
    match_id: session.matchId,
    room_id: session.roomId
  });

  setTimeout(() => {
    autoDescribeForAi(session);
  }, 5000 + Math.random() * 5000);
};

const moveToDiscussing = (session) => {
  session.state = 'DISCUSSING';
  session.currentTurnUserId = null;
  startPhaseTimer(session, session.durations.DISCUSSING * 1000, moveToVoting);
  
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'DISCUSSING',
    state: 'DISCUSSING',
    match_id: session.matchId
  });
};

const moveToVoting = (session) => {
  session.state = 'VOTING';
  session.currentTurnUserId = null;
  startPhaseTimer(session, session.durations.VOTING * 1000, processVoteResult);
  
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'VOTING',
    state: 'VOTING',
    match_id: session.matchId
  });
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
    // Chỉ cập nhật MatchPlayer trong DB nếu không phải AI (vì AI không có trong MatchPlayer table)
    if (!player.isAi) {
      await MatchPlayer.updateOne(
        { matchId: session.matchId, userId: userId },
        { isAlive: false, eliminatedRound: session.currentRound }
      );
    }
  }

  session.state = 'ROUND_RESULT';
  
  getSocketService().emitToTopic(`/topic/match/${session.matchId}/round-result`, {
    type: 'VOTE_RESULT',
    match_id: session.matchId,
    eliminated_user_id: userId,
    eliminated_display_name: player ? player.displayName : 'Unknown',
    role: player ? player.role : 'NONE',
    is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false,
    voting_result: {
      match_id: session.matchId,
      eliminated_user_id: userId,
      eliminated_display_name: player ? player.displayName : 'Unknown',
      role: player ? player.role : 'NONE',
      is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false
    }
  });

  // Gửi cả lên topic chính match để FE bắt sự kiện dễ hơn
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'VOTE_RESULT',
    match_id: session.matchId,
    eliminated_user_id: userId,
    eliminated_display_name: player ? player.displayName : 'Unknown',
    role: player ? player.role : 'NONE',
    is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false,
    voting_result: {
      match_id: session.matchId,
      eliminated_user_id: userId,
      eliminated_display_name: player ? player.displayName : 'Unknown',
      role: player ? player.role : 'NONE',
      is_spy: player ? (player.role === 'SPY' || player.role === 'INFECTED') : false
    }
  });

  // Gửi thông báo chuyển phase để FE nhận diện được ROUND_RESULT
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'ROUND_RESULT',
    state: 'ROUND_RESULT',
    match_id: session.matchId,
    remaining_seconds: session.durations.ROUND_RESULT
  });

  startPhaseTimer(session, session.durations.ROUND_RESULT * 1000, proceedToNextGameStep);
};

const moveToVoteTie = (session) => {
  session.state = 'VOTE_TIE';
  
  const tieMsg = {
    type: 'VOTE_RESULT',
    match_id: session.matchId,
    is_tie: true,
    message: 'Kết quả hòa! Không ai bị loại.',
    voting_result: {
      match_id: session.matchId,
      eliminated_user_id: null,
      is_tie: true
    }
  };

  getSocketService().emitToTopic(`/topic/match/${session.matchId}/round-result`, tieMsg);
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, tieMsg);

  // Gửi thông báo chuyển phase để FE nhận diện được VOTE_TIE
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'VOTE_TIE',
    state: 'VOTE_TIE',
    match_id: session.matchId,
    remaining_seconds: session.durations.VOTE_TIE
  });

  startPhaseTimer(session, session.durations.VOTE_TIE * 1000, proceedToNextGameStep);
};

const checkWinCondition = async (session) => {
  const alivePlayers = session.players.filter(p => p.isAlive);
  
  // Đếm số lượng theo phe
  const aliveSpies = alivePlayers.filter(p => {
    const r = p.role.toUpperCase();
    return r === 'SPY' || r === 'INFECTED';
  });
  
  const aliveCivilians = alivePlayers.filter(p => {
    const r = p.role.toUpperCase();
    return r === 'CIVILIAN';
  });

  const spyAliveCount = aliveSpies.length;
  const civilianAliveCount = aliveCivilians.length;

  console.log(`[DEBUG] checkWinCondition matchId=${session.matchId}: Spies=${spyAliveCount}, Civilians=${civilianAliveCount}`);

  // 1. Nếu phe Gián điệp bị tiêu diệt hết -> Dân thường thắng
  if (spyAliveCount === 0) {
    console.log(`[DEBUG] Phe Gián điệp đã bị loại hết. Dân thường thắng!`);
    await moveToGameOver(session, 'civilian');
    return true;
  } 
  
  // 2. Nếu số lượng Dân thường nhỏ hơn hoặc bằng số lượng Gián điệp -> Gián điệp thắng
  // Tuy nhiên, chỉ kết thúc game nếu số người chơi còn lại quá ít để tiếp tục (ví dụ < 2)
  // hoặc nếu Dân thường không còn cơ hội lật kèo (số lượng dân <= số gián điệp)
  if (civilianAliveCount <= spyAliveCount) {
    console.log(`[DEBUG] Số dân thường (${civilianAliveCount}) <= Số gián điệp (${spyAliveCount}). Gián điệp thắng!`);
    await moveToGameOver(session, 'spy');
    return true;
  } 

  // 3. Nếu chỉ còn 1 người duy nhất (do những người khác out) -> Người đó thắng (hoặc game hòa)
  if (alivePlayers.length < 2) {
    console.log(`[DEBUG] Chỉ còn ${alivePlayers.length} người chơi. Kết thúc game.`);
    const winner = spyAliveCount > 0 ? 'spy' : 'civilian';
    await moveToGameOver(session, winner);
    return true;
  }

  return false;
};

/**
 * Chuyển sang phase tiếp theo (Vòng mới hoặc Role Check)
 */
const proceedToNextGameStep = async (session) => {
  // 1. Kiểm tra thắng thua trước
  const isGameOver = await checkWinCondition(session);
  if (isGameOver) return;

  // 2. Nếu chưa ai thắng, kiểm tra xem có cần chạy Role Check không (chỉ ở vòng 1)
  if (session.currentRound === 1 && !session.roleCheckDone) {
    console.log(`[DEBUG] Bắt đầu Role Check cho trận đấu ${session.matchId}`);
    return moveToRoleCheck(session);
  }

  // 3. Nếu không có gì đặc biệt, qua vòng mới
  console.log(`[DEBUG] Game continues, moving to next round`);
  await startNextRound(session);
};

const moveToSpyKeywordGuess = async (session, spyUserId) => {
  session.state = 'ROLE_CHECK';
  session.currentTurnUserId = spyUserId;
  
  // Thông báo cho FE
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'ROLE_CHECK',
    state: 'ROLE_CHECK',
    current_turn_user_id: spyUserId,
    remaining_seconds: session.durations.ROLE_CHECK
  });

  // Gửi yêu cầu đoán từ khóa cho Spy
  getSocketService().emitToUser(spyUserId, 'spy-guess-request', {
    message: 'Bạn đã bị loại! Hãy đoán từ khóa của Dân thường để thắng lật kèo.',
    remaining_seconds: session.durations.ROLE_CHECK
  });

  // Nếu là AI Spy, tự động đoán
  if (spyUserId === 'ai_official') {
    setTimeout(() => {
      module.exports.submitRoleGuess(session.matchId, 'ai_official', session.civilianKeyword);
    }, 3000);
  }

  startPhaseTimer(session, session.durations.ROLE_CHECK * 1000, () => {
    // Hết giờ mà không đoán thì Dân thường thắng
    moveToGameOver(session, 'civilian');
  });
};

const startNextRound = async (session) => {
  session.currentRound++;
  session.aiDiscussUsedThisRound = false;
  session.aiManipulatedThisRound = false; // Reset trạng thái thao túng AI mỗi vòng
  
  // Reset descriptions và votes cho vòng mới
  session.descriptions[session.currentRound] = {};
  session.votes[session.currentRound] = {};

  // Luôn quay lại phase DESCRIBING cho vòng tiếp theo
  moveToDescribing(session);
};

const moveToRoleCheck = async (session) => {
  session.state = 'ROLE_CHECK';
  session.roleCheckResults = {}; // Reset kết quả đoán từ vòng trước (nếu có)

  // Gửi thông báo phase rõ ràng cho toàn phòng
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'ROLE_CHECK',
    state: 'ROLE_CHECK',
    match_id: session.matchId,
    remaining_seconds: session.durations.ROLE_CHECK,
    current_round: session.currentRound,
    message: 'Hãy đoán vai trò của bạn trong trận đấu này!'
  });

  // Gửi hướng dẫn riêng cho từng người chơi (biết mình là spy hay civilian)
  for (const player of session.players) {
    if (player.isAi || !player.isAlive) continue;
    const isSpy = player.role === 'SPY' || player.role === 'INFECTED';
    getSocketService().emitToUser(player.userId, 'role-check-request', {
      type: 'ROLE_CHECK_REQUEST',
      phase: 'ROLE_CHECK',
      remaining_seconds: session.durations.ROLE_CHECK,
      message: isSpy
        ? 'Bạn đang là GIÁN ĐIỆP. Hãy đoán đúng vai trò để giành quyền thao túng AI!'
        : 'Hãy đoán đúng vai trò của bạn để nhận thưởng!'
    });
  }

  startPhaseTimer(session, session.durations.ROLE_CHECK * 1000, onRoleCheckPhaseEnd);
};

const onRoleCheckPhaseEnd = async (session) => {
  // Những người chưa đoán coi như sai (đã được handle trong submitRoleGuess hoặc mặc định là sai)
  await moveToRoleCheckResult(session);
};

const moveToRoleCheckResult = async (session) => {
  session.state = 'ROLE_CHECK_RESULT';
  
  // Kiểm tra xem Gián điệp có đoán đúng không
  const spyId = session.spyUserId;
  const spyGuessCorrect = session.roleCheckResults && session.roleCheckResults[spyId] === true;
  
  // Nếu Gián điệp đoán đúng, cho 30s để chọn kỹ năng.
  // Nếu đoán sai (không có kỹ năng để chọn), chỉ cần 10s để mọi người xem kết quả.
  let duration = spyGuessCorrect 
    ? Math.max(session.durations.ROLE_CHECK_RESULT || 10, 30)
    : Math.max(session.durations.ROLE_CHECK_RESULT || 10, 10);
  
  // Gửi PHASE_UPDATE rõ ràng cho FE trước (để FE chuyển sang màn kết quả)
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
    type: 'PHASE_UPDATE',
    phase: 'ROLE_CHECK_RESULT',
    state: 'ROLE_CHECK_RESULT',
    match_id: session.matchId,
    remaining_seconds: duration,
    current_round: session.currentRound
  });
  
  // Phát timer chính thức
  startPhaseTimer(session, duration * 1000, onRoleCheckResultPhaseEnd);
  
  // Gửi kết quả chi tiết sau đó 800ms để đảm bảo FE đã chuyển phase xong
  setTimeout(async () => {
    await broadcastRoleCheckResults(session);
  }, 800);
};

const broadcastRoleCheckResults = async (session) => {
  const aliveHumanPlayers = session.players
    .filter(p => p.isAlive && !p.isAi)
    .map(p => ({
      user_id: p.userId,
      display_name: p.displayName,
      color: p.color
    }));
  const aiAlive = session.players.some(p => p.isAi && p.isAlive);

  for (const player of session.players) {
    if (player.isAi) continue;

    // Kiểm tra xem đã đoán chưa. Nếu chưa đoán (hết giờ) thì coi như sai.
    const hasGuessed = session.roleCheckResults[player.userId] !== undefined;
    const correct = session.roleCheckResults[player.userId] === true;
    const isSpy = String(player.userId) === String(session.spyUserId) || player.role === 'SPY' || player.role === 'INFECTED';
    
    // Nếu chưa đoán, thực hiện trừ điểm ở đây (những người đã đoán đã được cộng/trừ trong submitRoleGuess)
    let rewardAmount = 0;
    if (!hasGuessed) {
      rewardAmount = -10;
      session.roleCheckResults[player.userId] = false;
      await addReward(player.userId, rewardAmount, 'GAME_REWARD', 'Không đoán vai trò (hết giờ)');
    } else {
      rewardAmount = correct ? 10 : -10;
    }

    // Nếu là Spy và đoán đúng, kiểm tra xem có AI không để cho chọn kỹ năng
    const abilities = [];
    if (isSpy && correct) {
      if (aiAlive) {
        abilities.push({
          type: 'fake_message',
          name: 'Thao túng AI',
          description: 'Bạn có quyền điều khiển AI miêu tả hoặc thảo luận theo ý mình.'
        });
      } else {
        abilities.push({
          type: 'infection',
          name: 'Tha hóa',
          description: 'Biến một người chơi khác thành đồng minh của bạn.'
        });
      }
    }

    const roleLabel = isSpy ? 'GIÁN ĐIỆP' : 'DÂN THƯỜNG';
    const result = {
      type: 'ROLE_CHECK_RESULT',
      correct,
      actual_role: isSpy ? 'spy' : 'civilian',
      reward_coins: true, 
      reward_amount: 10,
      coins_gained: rewardAmount,
      message: correct
        ? `Chính xác! Bạn là ${roleLabel}. ${rewardAmount > 0 ? '+' : ''}${rewardAmount} xu.`
        : `Sai rồi! Bạn là ${roleLabel}. ${rewardAmount} xu.`,
      abilities_available: abilities,
      ability_available: abilities.length > 0 ? abilities[0].type : null,
      can_use_ability: abilities.length > 0,
      alive_humans: (isSpy && correct) ? aliveHumanPlayers : [],
      acknowledged: false
    };

    // Lưu lại kết quả chi tiết vào session để có thể trả về qua API fallback
    if (!session.detailedRoleCheckResults) session.detailedRoleCheckResults = {};
    session.detailedRoleCheckResults[player.userId] = result;

    console.log(`[ROLE-CHECK-RESULT] Player ${player.displayName} (${isSpy ? 'SPY' : 'CIVILIAN'}): correct=${correct}, coins=${rewardAmount}, abilities=${abilities.length}`);
    getSocketService().emitToUser(player.userId, 'role-check-result', result);
  }

  // Chờ cho đến khi phase kết thúc mới chuyển vòng
  startPhaseTimer(session, duration * 1000, onRoleCheckResultPhaseEnd);
};

const onRoleCheckResultPhaseEnd = async (session) => {
  session.roleCheckDone = true;
  // Chuyển bước tiếp theo (Vòng mới hoặc kiểm tra thắng thua)
  await proceedToNextGameStep(session);
};

const moveToGameOver = async (session, winnerRole) => {
  if (session.state === 'GAME_OVER') return;
  session.state = 'GAME_OVER';
  
  await processEndGameRewards(session, winnerRole);

  // Chuẩn hóa winner theo yêu cầu FE: "SPY" hoặc "CIVILIAN"
  const finalWinner = winnerRole.toUpperCase() === 'SPY' ? 'SPY' : 'CIVILIAN';

  const gameOverPayload = {
    type: 'GAME_OVER',
    phase: 'GAME_OVER',
    winner: finalWinner,
    winner_role: finalWinner,
    civilian_keyword: session.realCivilianKeyword || session.civilianKeyword,
    spy_keyword: session.realSpyKeyword || session.spyKeyword,
    match_id: session.matchId,
    spy_user_id: session.spyUserId, // Thêm để FE nhận diện được Spy dễ hơn
    players: session.players.map(p => {
      const scoreValue = p.lastReward !== undefined ? p.lastReward : 0;
      return {
        user_id: p.userId,
        display_name: p.displayName || p.username,
        username: p.username,
        role: p.role.toUpperCase(), // "SPY", "CIVILIAN", hoặc "INFECTED"
        score: scoreValue, // Số điểm/xu cộng thêm (ví dụ: 10 hoặc -5)
        score_gained: scoreValue, // Tương thích với FE (xem GameScreen.tsx:1442-1471)
        is_alive: p.isAlive
      };
    })
  };

  // Broadcast kết quả qua cả topic chung và topic chuyên biệt cho game-over
  getSocketService().emitToTopic(`/topic/match/${session.matchId}/game-over`, gameOverPayload);
  getSocketService().emitToTopic(`/topic/match/${session.matchId}`, gameOverPayload);

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

  // Xóa session sau 1 phút
  setTimeout(() => {
    gameSessions.delete(session.matchId);
    getSocketService().removeMatchData(session.matchId);
  }, 60000);
};

const processEndGameRewards = async (session, winnerRole) => {
  const rewardsConfig = {
    civilian_win: 10,
    civilian_lose: -5,
    spy_win: 15,
    spy_lose: -5
  };

  for (const player of session.players) {
    if (player.isAi) {
      player.lastReward = 0;
      continue;
    }

    let reward = 0;
    let didWin = false;

    // So sánh case-insensitive
    const roleUpper = player.role.toUpperCase();
    const isSpySide = roleUpper === 'SPY' || roleUpper === 'INFECTED';
    const isCivilianSide = roleUpper === 'CIVILIAN';

    if (winnerRole === 'spy') {
      if (isSpySide) {
        reward = rewardsConfig.spy_win;
        didWin = true;
      } else {
        reward = rewardsConfig.civilian_lose;
      }
    } else {
      // civilians win
      if (isCivilianSide) {
        reward = rewardsConfig.civilian_win;
        didWin = true;
      } else {
        reward = rewardsConfig.spy_lose;
      }
    }

    player.lastReward = reward;
    await addReward(player.userId, reward, 'GAME_RESULT', `Kết quả trận đấu: ${winnerRole === 'spy' ? 'Gián điệp' : 'Dân thường'} thắng`, true);
    
    // Update UserStats
    let stats = await UserStats.findOne({ userId: player.userId });
    if (!stats) stats = new UserStats({ userId: player.userId });
    
    stats.totalGames += 1;
    if (didWin) {
      if (isCivilianSide) stats.winsCivilian += 1;
      else if (roleUpper === 'SPY') stats.winsSpy += 1;
      else if (roleUpper === 'INFECTED') stats.winsInfected += 1;
    }
    if (roleUpper === 'SPY') stats.timesAsSpy += 1;
    if (roleUpper === 'INFECTED') stats.timesInfected += 1;
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

  // Kiểm tra trạng thái trận đấu trước khi cho AI miêu tả
  if (session.state !== 'DESCRIBING') {
    return;
  }

  // Nếu Spy có kỹ năng thao túng AI, AI sẽ KHÔNG tự động miêu tả.
  const isAnySpyCorrect = Object.entries(session.roleCheckResults).some(([uid, correct]) => {
    const p = session.players.find(player => player.userId === uid);
    return correct && p && (p.role.toUpperCase() === 'SPY' || p.role.toUpperCase() === 'INFECTED');
  });

  if (session.selectedAbility === 'fake_message' || session.selectedAbility === 'MANIPULATE_AI' || (session.currentRound > 1 && isAnySpyCorrect)) {
    console.log(`[DEBUG] AI im lặng vì đang bị thao túng hoặc chờ thao túng (ability: ${session.selectedAbility}).`);
    return;
  }

  // Đảm bảo descriptions[round] đã được khởi tạo trước khi đọc
  if (!session.descriptions[session.currentRound]) {
    session.descriptions[session.currentRound] = {};
  }

  if (!session.descriptions[session.currentRound][ai.userId]) {
    try {
      const content = await getAiDescription(session.civilianKeyword, session.currentRound);
      if (session.state === 'DESCRIBING') {
        // Fix: dùng session.matchId thay vì matchId (biến không tồn tại trong scope này)
        await module.exports.submitDescription(session.matchId, ai.userId, content);
      }
    } catch (error) {
      console.error(`[ERROR] AI miêu tả lỗi:`, error.message);
    }
  }
};

const autoDiscussForAi = async (session) => {
  if (session.aiDiscussUsedThisRound) return;
  const ai = session.players.find(p => p.isAi && p.isAlive);
  if (!ai) return;

  // Nếu Spy có quyền thao túng và chưa dùng trong vòng này, AI im lặng để Spy nói hộ
  if (session.selectedAbility === 'fake_message' && !session.aiManipulatedThisRound) {
    return;
  }

  const content = await getAiDescription(session.civilianKeyword, session.currentRound);
  const name = getAnonymousName(ai);
  getSocketService().emitToTopic(`/topic/match/${session.matchId}/chat`, {
    sender_id: ai.userId,
    sender_name: name,
    content,
    timestamp: Date.now()
  });
  session.aiDiscussUsedThisRound = true;
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
        getSocketService().emitToTopic(`/topic/match/${session.matchId}`, {
          type: 'PLAYER_AFK',
          match_id: session.matchId,
          user_id: userId,
          display_name: player.displayName
        });

        // Chỉ kiểm tra win condition nếu game đang ở các phase thực sự quan trọng
        const phase = session.state.toUpperCase();
        if (['DESCRIBING', 'DISCUSSING', 'VOTING', 'VOTE_TIE', 'ROLE_CHECK', 'ROLE_CHECK_RESULT'].includes(phase)) {
          await checkWinCondition(session);
        }
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
    
    // Broadcast theo format FE yêu cầu ban đầu (bọc trong object)
    const aliveHumans = session.players.filter(p => p.isAlive && !p.isAi);
    const aiNeedsToDescribe = session.selectedAbility === 'fake_message';
    const totalRequiredCount = aliveHumans.length + (aiNeedsToDescribe ? 1 : 0);

    getSocketService().emitToTopic(`/topic/match/${matchId}/descriptions`, {
      match_id: matchId,
      descriptions: descriptions,
      all_submitted: descriptions.length >= totalRequiredCount
    });

    // Tự động chuyển phase nếu tất cả (người chơi và AI) đã xong
    if (descriptions.length >= totalRequiredCount) {
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

    getSocketService().emitToTopic(`/topic/match/${matchId}/chat`, {
      type: 'CHAT',
      match_id: matchId,
      sender_id: userId,
      user_id: userId,
      sender_name: name,
      display_name: name,
      color: isAnonymizedPhase ? 'gray' : player.color,
      content: content,
      timestamp: Date.now()
    });

    // AI auto discuss - Đã bị loại bỏ theo yêu cầu: AI không được thảo luận
    // await autoDiscussForAi(session);
  },
  submitVote: async (matchId, voterId, targetId) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'VOTING') return;

    const voter = getAlivePlayer(session, voterId);
    if (voter.isAi) return; // AI không vote

    if (!session.votes[session.currentRound]) {
      session.votes[session.currentRound] = {};
    }
    session.votes[session.currentRound][voterId.toString()] = targetId.toString();

    const currentVotes = session.votes[session.currentRound];
    const voteCounts = {};
    Object.values(currentVotes).forEach(tid => {
      voteCounts[tid] = (voteCounts[tid] || 0) + 1;
    });

    // Thông báo cập nhật lượt vote
    getSocketService().emitToTopic(`/topic/match/${matchId}/votes`, {
      match_id: matchId,
      voteCounts: voteCounts
    });

    // Tự động chuyển phase nếu tất cả (người chơi còn sống) đã vote xong
    const aliveHumans = session.players.filter(p => p.isAlive && !p.isAi);
    const totalVoted = Object.keys(currentVotes).length;

    if (totalVoted >= aliveHumans.length) {
      setTimeout(() => {
        const currentSession = gameSessions.get(matchId.toString());
        if (currentSession && currentSession.state === 'VOTING') {
          processVoteResult(currentSession);
        }
      }, 2000);
    }
  },
  submitRoleGuess: async (matchId, userId, guess) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'ROLE_CHECK') throw new Error('Không phải lúc đoán vai trò');
    
    const player = getAlivePlayer(session, userId);
    if (player.isAi) throw new Error('AI không thể đoán vai trò');

    // Kiểm tra xem người chơi đã đoán chưa
    if (session.roleCheckResults[userId.toString()] !== undefined) {
      throw new Error('Bạn đã đoán vai trò rồi');
    }

    const isSpy = player.role.toUpperCase() === 'SPY' || player.role.toUpperCase() === 'INFECTED';
    let correct = false;

    // Kiểm tra nếu là đoán Vai trò (SPY/CIVILIAN) hay đoán Từ khóa
    const normalizedGuess = guess.trim().toUpperCase();
    if (normalizedGuess === 'SPY' || normalizedGuess === 'CIVILIAN') {
      // Đoán vai trò
      correct = (isSpy && normalizedGuess === 'SPY') || (!isSpy && normalizedGuess === 'CIVILIAN');
    } else {
      // Đoán từ khóa (giữ logic cũ nếu cần)
      const realKeyword = isSpy ? session.realSpyKeyword : session.realCivilianKeyword;
      correct = guess.trim().toLowerCase() === realKeyword.toLowerCase();
    }

    session.roleCheckResults[userId.toString()] = correct; // Lưu kết quả đoán

    // Xử lý phần thưởng (Thưởng +10, Phạt -10) - Chỉ áp dụng khi đoán VAI TRÒ
    const isRoleGuess = (normalizedGuess === 'SPY' || normalizedGuess === 'CIVILIAN');
    let rewardAmount = 0;
    
    if (isRoleGuess) {
      rewardAmount = correct ? 10 : -10;
      await addReward(userId, rewardAmount, 'GAME_REWARD', correct ? 'Đoán đúng vai trò' : 'Đoán sai vai trò');
    }

    // Gửi kết quả đoán riêng tư cho người chơi ngay lập tức
    const abilities = [];
    if (isSpy && correct && isRoleGuess) {
      abilities.push({
        type: 'fake_message',
        name: 'Thao túng AI',
        description: 'Bạn có quyền điều khiển AI miêu tả hoặc thảo luận theo ý mình.'
      });
    }

    const roleLabel = isSpy ? 'GIÁN ĐIỆP' : 'DÂN THƯỜNG';
    const result = {
      type: 'ROLE_CHECK_RESULT',
      correct,
      actual_role: isSpy ? 'spy' : 'civilian',
      reward_coins: isRoleGuess,
      reward_amount: 10,
      coins_gained: rewardAmount,
      message: correct
        ? `Chính xác! Bạn là ${roleLabel}. ${rewardAmount > 0 ? '+' : ''}${rewardAmount} xu.`
        : `Sai rồi! Bạn là ${roleLabel}. ${rewardAmount} xu.`,
      abilities_available: abilities,
      ability_available: abilities.length > 0 ? abilities[0].type : null,
      can_use_ability: (isSpy && correct && isRoleGuess),
      acknowledged: false
    };

    // Lưu lại kết quả chi tiết
    if (!session.detailedRoleCheckResults) session.detailedRoleCheckResults = {};
    session.detailedRoleCheckResults[userId.toString()] = result;

    getSocketService().emitToUser(userId, 'role-check-result', result);
    console.log(`[ROLE-GUESS] Player ${player.displayName} (${isSpy ? 'SPY' : 'CIVILIAN'}) đoán ${normalizedGuess}: correct=${correct}, coins=${rewardAmount}`);

    // Kiểm tra xem tất cả người chơi còn sống (trừ AI) đã đoán xong chưa
    const aliveHumans = session.players.filter(p => p.isAlive && !p.isAi);
    const guessedCount = Object.keys(session.roleCheckResults).length;

    if (guessedCount >= aliveHumans.length) {
      // Tất cả đã đoán xong, chuyển sang phase ROLE_CHECK_RESULT
      setTimeout(() => {
        const currentSession = gameSessions.get(matchId.toString());
        if (currentSession && currentSession.state === 'ROLE_CHECK') {
          onRoleCheckPhaseEnd(currentSession);
        }
      }, 2000); 
    }

    return { submitted: true, correct };
  },
  confirmSpyAbility: async (matchId, userId, abilityType) => {
    const session = getSession(matchId);
    if (!session) throw new Error('Không tìm thấy trận đấu');

    // Cho phép chọn kỹ năng trong cả phase ROLE_CHECK_RESULT lẫn khi đã sang vòng mới
    // (Spy có thể chọn muộn nếu vừa đoán đúng)
    const allowedPhases = ['ROLE_CHECK_RESULT', 'DESCRIBING', 'DISCUSSING', 'VOTING'];
    if (!allowedPhases.includes(session.state.toUpperCase())) {
      throw new Error('Không thể chọn kỹ năng trong giai đoạn này');
    }
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể chọn kỹ năng');
    }

    // Kiểm tra Spy có đoán đúng không mới cho chọn kỹ năng
    const spyGuessCorrect = session.roleCheckResults && session.roleCheckResults[userId.toString()] === true;
    if (!spyGuessCorrect && abilityType !== 'none') {
      throw new Error('Bạn chưa đoán đúng vai trò, không thể chọn kỹ năng');
    }

    session.selectedAbility = abilityType;
    
    const abilityName = abilityType === 'fake_message' ? 'Thao túng AI'
      : abilityType === 'infection' ? 'Tha hóa'
      : 'Không dùng kỹ năng';

    getSocketService().emitToUser(userId, 'ability-result', {
      success: true,
      confirmed_ability: abilityType,
      message: `Bạn đã chọn kỹ năng: ${abilityName}`
    });

    console.log(`[ABILITY] Spy ${userId} đã chọn kỹ năng: ${abilityType}`);

    // Tự động chuyển phase nếu đang ở ROLE_CHECK_RESULT và Spy đã chọn xong kỹ năng
    if (session.state.toUpperCase() === 'ROLE_CHECK_RESULT') {
      console.log(`[DEBUG] Spy đã chọn kỹ năng xong, kết thúc phase ROLE_CHECK_RESULT sớm.`);
      if (session.timerId) clearTimeout(session.timerId);
      // Chờ 1 giây để Spy kịp thấy thông báo "Bạn đã chọn kỹ năng" trước khi chuyển phase
      setTimeout(async () => {
        const currentSession = gameSessions.get(matchId.toString());
        if (currentSession && currentSession.state === 'ROLE_CHECK_RESULT') {
          await onRoleCheckResultPhaseEnd(currentSession);
        }
      }, 1000);
    }
    
    return { confirmed: true, ability: abilityType };
  },
  useFakeMessageAbility: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể dùng kỹ năng này');
    }

    if (session.selectedAbility !== 'fake_message') {
      throw new Error('Bạn chưa chọn kỹ năng Thao túng AI');
    }

    if (session.aiManipulatedThisRound) {
      throw new Error('Bạn đã sử dụng kỹ năng này trong vòng này rồi');
    }

    const ai = session.players.find(p => p.isAi && p.isAlive);
    if (!ai) throw new Error('AI không còn sống để thao túng');

    // Tự động xác định type dựa trên state hiện tại
    let type = '';
    if (session.state === 'DESCRIBING') type = 'DESCRIBE';
    else if (session.state === 'DISCUSSING') type = 'DISCUSS';
    else throw new Error('Không thể dùng kỹ năng trong giai đoạn này');

    if (type === 'DESCRIBE') {
      await module.exports.submitDescription(matchId, ai.userId, content);
    } else {
      const name = getAnonymousName(ai);
      getSocketService().emitToTopic(`/topic/match/${matchId}/chat`, {
        sender_id: ai.userId,
        sender_name: name,
        content,
        timestamp: Date.now()
      });
    }

    session.aiManipulatedThisRound = true;
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

    // Cập nhật match data cho socketService
    getSocketService().setMatchData(matchId, {
      civilianKeyword: session.civilianKeyword,
      spyKeyword: session.spyKeyword,
      spyUserId: session.spyUserId,
      infectedUserId: session.infectedUserId
    });

    getSocketService().emitToUser(targetUserId, 'infection', {
      type: 'INFECTED',
      spy_keyword: session.spyKeyword,
      message: 'Bạn đã bị Gián điệp lây nhiễm! Hãy giúp Gián điệp chiến thắng.'
    });

    getSocketService().emitToUser(userId, 'ability-result', {
      success: true,
      type: 'INFECT',
      message: `Bạn đã lây nhiễm thành công ${target.displayName}`
    });

    return { success: true };
  },
  useAiManipulationAbility: async (matchId, userId, type, content) => {
    const session = getSession(matchId);
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể dùng kỹ năng này');
    }

    if (session.selectedAbility !== 'MANIPULATE_AI') {
      throw new Error('Bạn chưa chọn kỹ năng Thao túng AI');
    }

    if (session.aiManipulatedThisRound) {
      throw new Error('Bạn đã sử dụng kỹ năng này trong vòng này rồi');
    }

    const ai = session.players.find(p => p.isAi && p.isAlive);
    if (!ai) throw new Error('AI không còn sống để thao túng');

    if (type === 'DESCRIBE') {
      if (session.state !== 'DESCRIBING') throw new Error('Chỉ có thể miêu tả trong giai đoạn miêu tả');
      await module.exports.submitDescription(matchId, ai.userId, content);
    } else if (type === 'DISCUSS') {
      if (session.state !== 'DISCUSSING') throw new Error('Chỉ có thể thảo luận trong giai đoạn thảo luận');
      const name = getAnonymousName(ai);
      getSocketService().emitToTopic(`/topic/match/${matchId}/chat`, {
        sender_id: ai.userId,
        sender_name: name,
        content,
        timestamp: Date.now()
      });
    } else {
      throw new Error('Loại thao túng không hợp lệ');
    }

    session.aiManipulatedThisRound = true;
    return { success: true };
  },
  useAbility: async (matchId, userId, type, content) => {
    const session = getSession(matchId);
    if (!session) throw new Error('Không tìm thấy trận đấu');

    if (userId.toString() !== session.spyUserId) {
      throw new Error('Chỉ Gián điệp mới có thể dùng kỹ năng');
    }

    const ability = session.selectedAbility;
    if (!ability) throw new Error('Bạn chưa chọn kỹ năng nào');

    if (ability === 'MANIPULATE_AI') {
      return await module.exports.useAiManipulationAbility(matchId, userId, type, content);
    } else if (ability === 'FAKE_MESSAGE') {
      return await module.exports.useFakeMessageAbility(matchId, userId, content);
    } else {
      throw new Error(`Kỹ năng ${ability} không hỗ trợ dùng qua đây`);
    }
  },
  adminSetSpy: async (roomId, userId, targetUserId) => {
    const room = await Room.findById(roomId);
    if (!room) throw new Error('Không tìm thấy phòng');
    
    // Kiểm tra quyền: Phải là Chủ phòng hoặc Admin
    if (room.hostId.toString() !== userId.toString()) {
      // Nếu không phải host, kiểm tra xem có phải admin không
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (!user || user.role !== 'ROLE_ADMIN') {
        throw new Error('Bạn không có quyền thực hiện hành động này');
      }
    }

    room.adminSelectedSpyId = targetUserId;
    await room.save();
    return { success: true };
  },
  adjustRewards: async (matchId, adminId, civilian, spy, infected) => {
    const session = gameSessions.get(matchId.toString());
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    session.customRewards = {
      civilian: civilian || 15,
      spy: spy || 25,
      infected: infected || 25
    };

    return { success: true, rewards: session.customRewards };
  },
  skipPhase,
  refreshAllDurations,
  setGameState: async (matchId, state) => {
    const session = gameSessions.get(matchId.toString());
    if (!session) throw new Error('Không tìm thấy trận đấu');
    
    if (!state) {
      // Nếu không có state truyền lên, mặc định là SKIP phase hiện tại
      return await skipPhase(matchId);
    }

    console.log(`[ADMIN] Manually setting game state to ${state} for match ${matchId}`);
    
    // Xóa timer cũ
    if (session.timerId) clearTimeout(session.timerId);

    session.state = state.toUpperCase();
    
    // Định nghĩa logic chuyển phase tiếp theo cho từng state
    const phaseTransitions = {
      'ROLE_ASSIGN': moveToDescribing,
      'DESCRIBING': moveToDiscussing,
      'DISCUSSING': moveToVoting,
      'VOTING': processVoteResult,
      'VOTE_TIE': startNextRound,
      'ROUND_RESULT': checkWinCondition,
      'ROLE_CHECK': onRoleCheckPhaseEnd,
      'ROLE_CHECK_RESULT': onRoleCheckResultPhaseEnd,
      'GAME_OVER': () => {}
    };

    const nextFn = phaseTransitions[session.state] || (() => {});
    const duration = (session.durations[session.state] || 10) * 1000;

    // Khởi động timer cho phase mới
    startPhaseTimer(session, duration, nextFn);

    return { success: true, state: session.state };
  },
  primeSubscription: (ip, topic, userId, username) => primeSubscription(ip, topic, userId, username)
};