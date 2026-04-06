const { 
  createRoom, 
  joinRoom, 
  leaveRoom, 
  kickPlayer, 
  transferHost, 
  voteByRoom, 
  getMostVotedResult, 
  getRoomMessages, 
  sendRoomMessage 
} = require('../services/roomService');
const { primeSubscription } = require('../services/gameService');
const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');

/**
 * @desc    Tạo phòng mới
 * @route   POST /api/rooms
 */
const createRoomController = async (req, res, next) => {
  try {
    const { is_private, room_code, is_special_round } = req.body || {};
    const user = req.user;

    const room = await createRoom(user._id, is_private === true || is_private === 'true', room_code, is_special_round === true || is_special_round === 'true');

    res.status(201).json({
      room_id: room._id.toString(),
      room_code: room.roomCode,
      is_special_round: room.isSpecialRound,
      host: {
        user_id: user._id.toString(),
        display_name: user.displayName || user.username
      },
      status: room.status,
      current_players: room.currentPlayers
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy danh sách phòng công khai
 * @route   GET /api/rooms
 */
const getRoomsController = async (req, res, next) => {
  try {
    const rooms = await Room.find({ status: 'waiting', isPrivate: false });
    
    const roomList = rooms.map(r => ({
      room_id: r._id.toString(),
      room_code: r.roomCode,
      current_players: r.currentPlayers,
      max_players: r.maxPlayers,
      status: r.status
    }));

    res.json({
      rooms: roomList,
      total: roomList.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tham gia phòng
 * @route   POST /api/rooms/:roomCode/join
 */
const joinRoomController = async (req, res, next) => {
  try {
    const { roomCode } = req.params;
    const user = req.user;

    const room = await joinRoom(roomCode, user._id);
    const players = await RoomPlayer.find({ roomId: room._id });

    res.json({
      room_id: room._id.toString(),
      room_code: room.roomCode,
      current_players: room.currentPlayers,
      players: players.map(p => ({
        user_id: p.userId.toString(),
        display_name: p.displayName
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Rời phòng
 * @route   POST /api/rooms/:roomId/leave
 */
const leaveRoomController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const user = req.user;

    await leaveRoom(roomId, user._id);

    res.json({ message: 'Đã rời phòng thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy danh sách người chơi trong phòng
 * @route   GET /api/rooms/:roomId/players
 */
const getPlayersController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const players = await RoomPlayer.find({ roomId });

    res.json({
      room_id: roomId,
      players: players.map(p => ({
        user_id: p.userId.toString(),
        display_name: p.displayName,
        username: p.username
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy thông tin chi tiết phòng
 * @route   GET /api/rooms/:roomId
 */
const getRoomDetailController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const user = req.user;
    const room = await Room.findById(roomId);

    if (!room) {
      res.status(404);
      throw new Error('Không tìm thấy phòng');
    }

    const players = await RoomPlayer.find({ roomId: room._id });

    // Đăng ký cho WS nhận diện qua hàng đợi subscribe cho topic phòng
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    primeSubscription(ip, `/topic/room/${room._id.toString()}`, user._id, user.displayName || user.username);
    primeSubscription(ip, `/topic/room/${room.roomCode}`, user._id, user.displayName || user.username);
    primeSubscription(ip, `/user/queue/role`, user._id, user.displayName || user.username); // Priming cho cả queue/role

    // Thông tin cơ bản
    const responseData = {
      room_id: room._id.toString(),
      room_code: room.roomCode,
      host_id: room.hostId.toString(),
      current_players: room.currentPlayers,
      max_players: room.maxPlayers,
      status: room.status,
      is_private: room.isPrivate,
      is_special_round: room.isSpecialRound, // Thêm is_special_round cho FE
      isSpecialRound: room.isSpecialRound,
      players: players.map(p => ({
        user_id: p.userId.toString(),
        id: p.userId.toString(), // Thêm id cho FE cũ
        display_name: p.displayName,
        username: p.username,
        isHost: String(p.userId) === String(room.hostId) // Thêm isHost cho Round1Enter
      }))
    };

    // Nếu đang chơi, bổ sung thông tin từ Match
    if (room.status === 'playing') {
      const match = await Match.findOne({ roomId: room._id, status: 'in_progress' });
      if (match) {
        const playerMatch = await MatchPlayer.findOne({ matchId: match._id, userId: user._id });
        
        if (playerMatch && playerMatch.role) {
          const roleUpper = playerMatch.role.toUpperCase();
          const keyword = (roleUpper === 'SPY' || roleUpper === 'INFECTED') 
            ? match.spyKeyword 
            : match.civilianKeyword;
            
          responseData.your_keyword = keyword;
          responseData.yourKeyword = keyword; 
          responseData.keyword = keyword;
          responseData.your_description = keyword;
          responseData.yourDescription = keyword;
          responseData.description = keyword;
          responseData.your_role = roleUpper;
          responseData.match_id = match._id.toString();

          // Cập nhật keyword cho từng player object nếu là chính mình
          responseData.players = responseData.players.map(p => {
            if (String(p.user_id) === String(user._id)) {
              return {
                ...p,
                role: roleUpper,
                keyword: keyword,
                yourKeyword: keyword,
                description: keyword,
                yourDescription: keyword
              };
            }
            return p;
          });
        }
      }
    }

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy thông tin phòng bằng mã phòng
 * @route   GET /api/rooms/code/:roomCode
 */
const getRoomByCodeController = async (req, res, next) => {
  try {
    const { roomCode } = req.params;
    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });

    if (!room) {
      res.status(404);
      throw new Error('Không tìm thấy phòng');
    }

    res.json({
      room_id: room._id.toString(),
      room_code: room.roomCode,
      current_players: room.currentPlayers,
      max_players: room.maxPlayers,
      status: room.status,
      is_private: room.isPrivate
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Đuổi người chơi (Host/Admin)
 * @route   POST /api/rooms/:roomId/kick
 */
const kickPlayerController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { user_id } = req.body || {};
    const adminId = req.user._id;

    await kickPlayer(roomId, adminId, user_id);

    res.json({ message: 'Đã đuổi người chơi thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Chuyển quyền chủ phòng (Host/Admin)
 * @route   POST /api/rooms/:roomId/transfer-host
 */
const transferHostController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { user_id } = req.body || {};
    const currentHostId = req.user._id;

    await transferHost(roomId, currentHostId, user_id);

    res.json({ message: 'Đã chuyển quyền chủ phòng thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Vote trong phòng (Lobby)
 * @route   POST /api/rooms/:roomId/vote
 */
const voteByRoomController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { targetId } = req.body || {};
    const user = req.user;

    await voteByRoom(roomId, user._id, targetId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy kết quả được vote nhiều nhất
 * @route   GET /api/rooms/:roomId/result/most-voted
 */
const getMostVotedResultController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const result = await getMostVotedResult(roomId);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy danh sách tin nhắn trong phòng
 * @route   GET /api/rooms/:roomId/messages
 */
const getRoomMessagesController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const messages = await getRoomMessages(roomId);

    res.json({ messages });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Gửi tin nhắn trong phòng
 * @route   POST /api/rooms/:roomId/messages
 */
const sendRoomMessageController = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { content } = req.body;
    const user = req.user;

    const message = await sendRoomMessage(roomId, user._id, content);

    res.json(message);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tạo phòng đặc biệt (Special Round)
 * @route   POST /api/rooms/create-special
 */
const createSpecialRoomController = async (req, res, next) => {
  try {
    const { room_code } = req.body || {};
    const user = req.user;

    const room = await createRoom(user._id, false, room_code, true);

    res.status(201).json({
      room_id: room._id.toString(),
      room_code: room.roomCode,
      host: {
        user_id: user._id.toString(),
        display_name: user.displayName || user.username
      },
      status: room.status,
      current_players: room.currentPlayers,
      is_special_round: true
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoom: createRoomController,
  createSpecialRoom: createSpecialRoomController,
  getRooms: getRoomsController,
  joinRoom: joinRoomController,
  leaveRoom: leaveRoomController,
  getPlayers: getPlayersController,
  getRoomDetail: getRoomDetailController,
  getRoomByCode: getRoomByCodeController,
  kickPlayer: kickPlayerController,
  transferHost: transferHostController,
  voteByRoom: voteByRoomController,
  getMostVotedResult: getMostVotedResultController,
  getRoomMessages: getRoomMessagesController,
  sendRoomMessage: sendRoomMessageController,
};