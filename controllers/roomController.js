const { createRoom, joinRoom, leaveRoom, kickPlayer, transferHost } = require('../services/roomService');
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
 * @route   POST /api/rooms/:roomId/kick/:userId
 */
const kickPlayerController = async (req, res, next) => {
  try {
    const { roomId, userId } = req.params;
    const adminId = req.user._id;

    await kickPlayer(roomId, adminId, userId);

    res.json({ message: 'Đã đuổi người chơi thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Chuyển quyền chủ phòng (Host/Admin)
 * @route   POST /api/rooms/:roomId/transfer-host/:userId
 */
const transferHostController = async (req, res, next) => {
  try {
    const { roomId, userId } = req.params;
    const currentHostId = req.user._id;

    await transferHost(roomId, currentHostId, userId);

    res.json({ message: 'Đã chuyển quyền chủ phòng thành công' });
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
};
