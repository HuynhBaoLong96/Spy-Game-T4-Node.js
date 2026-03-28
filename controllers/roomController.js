const { createRoom, joinRoom, leaveRoom, kickPlayer, transferHost, voteByRoom, getMostVotedResult, getRoomMessages, sendRoomMessage } = require('../services/roomService');
const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');

/**
 * @desc    Tạo phòng mới
 * @route   POST /api/rooms
 */
const createRoomController = async (req, res, next) => {
  try {
    const { is_private, room_code } = req.body;
    const user = req.user;

    const room = await createRoom(user._id, is_private, room_code);

    res.status(201).json({
      room_id: room._id,
      room_code: room.roomCode,
      host: {
        user_id: user._id,
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
      room_id: r._id,
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
      room_id: room._id,
      room_code: room.roomCode,
      current_players: room.currentPlayers,
      players: players.map(p => ({
        user_id: p.userId,
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
        user_id: p.userId,
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
    const room = await Room.findById(roomId);

    if (!room) {
      res.status(404);
      throw new Error('Không tìm thấy phòng');
    }

    const players = await RoomPlayer.find({ roomId });

    res.json({
      room_id: room._id,
      room_code: room.roomCode,
      host_id: room.hostId,
      current_players: room.currentPlayers,
      max_players: room.maxPlayers,
      status: room.status,
      is_private: room.isPrivate,
      players: players.map(p => ({
        user_id: p.userId,
        display_name: p.displayName,
        username: p.username
      }))
    });
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
      room_id: room._id,
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
    const { user_id } = req.body;
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
    const { user_id } = req.body;
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
    const { targetId } = req.body;
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

module.exports = {
  createRoom: createRoomController,
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
