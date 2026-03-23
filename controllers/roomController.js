const { createRoom, joinRoom, leaveRoom } = require('../services/roomService');
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

module.exports = {
  createRoom: createRoomController,
  getRooms: getRoomsController,
  joinRoom: joinRoomController,
};
