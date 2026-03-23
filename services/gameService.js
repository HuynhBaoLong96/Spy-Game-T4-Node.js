const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const GameSettings = require('../models/GameSettings');
const { getRandomKeywordPair } = require('./keywordService');
const { deductEntryFee, addReward } = require('./economyService');
const { emitToRoom } = require('./socketService');
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

  // 1. Thu phí vào cửa
  const entryFee = 10;
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
    matchId: match._id,
    roomId,
    civilianKeyword: keywordPair.civilianKeyword,
    spyKeyword: keywordPair.spyKeyword,
    currentRound: 1,
    state: 'ROLE_ASSIGN',
    players: [],
    descriptions: {}, // round -> userId -> content
    votes: {},        // round -> userId -> targetId
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
    // Chỉ gửi thông tin vai trò cho chính người đó (hoặc tất cả nếu là AI/debug)
    // Thực tế FE sẽ nhận được danh sách player nhưng chỉ xem được vai của mình
    emitToRoom(session.roomId, 'ROLE_INFO', {
      players: session.players.map(p => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        color: p.color,
        isAlive: p.isAlive,
        isAi: p.isAi,
        // Chỉ gửi role nếu là chính người đó hoặc game đã kết thúc
        role: p.userId === player.userId ? p.role : 'hidden'
      }))
    });
  });
};

const startPhaseTimer = (session, durationMs, nextPhaseFn) => {
  session.phaseStartTime = Date.now();
  session.phaseEndTime = Date.now() + durationMs;
  
  emitToRoom(session.roomId, 'PHASE_UPDATE', {
    state: session.state,
    startTime: session.phaseStartTime,
    endTime: session.phaseEndTime,
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
  // ... (Tạm thời để trống để hoàn thiện sau)
  console.log('Đang xử lý kết quả vote cho trận:', session.matchId);
};

const getSession = (matchId) => gameSessions.get(matchId.toString());

module.exports = {
  startGame,
  getSession,
  submitDescription: async (matchId, userId, content) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'DESCRIBING') throw new Error('Không phải lúc mô tả');
    
    if (!session.descriptions[session.currentRound]) {
      session.descriptions[session.currentRound] = {};
    }
    session.descriptions[session.currentRound][userId] = content;

    emitToRoom(session.roomId, 'DESCRIPTION_SUBMITTED', {
      userId,
      content,
      round: session.currentRound
    });

    // AI tự động mô tả nếu đến lượt
    // ...
  },
  submitVote: async (matchId, voterId, targetId) => {
    const session = getSession(matchId);
    if (!session || session.state !== 'VOTING') return;

    if (!session.votes[session.currentRound]) {
      session.votes[session.currentRound] = {};
    }
    session.votes[session.currentRound][voterId] = targetId;

    emitToRoom(session.roomId, 'VOTE_SUBMITTED', {
      voterId,
      targetId,
      round: session.currentRound
    });
  }
};
