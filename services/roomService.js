const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const User = require('../models/User');
const { emitToRoom, emitToLobby } = require('./socketService');

/**
 * Tạo mã phòng ngẫu nhiên 6 ký tự
 */
const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

/**
 * Tạo phòng mới
 */
const createRoom = async (hostUserId, isPrivate, customRoomCode) => {
  const host = await User.findById(hostUserId);
  if (!host) throw new Error('Không tìm thấy người dùng');

  let roomCode = customRoomCode ? customRoomCode.trim().toUpperCase() : generateRoomCode();
  
  if (customRoomCode) {
    const existing = await Room.findOne({ roomCode });
    if (existing) throw new Error('Mã phòng đã tồn tại');
  }

  const room = await Room.create({
    roomCode,
    hostId: hostUserId,
    isPrivate,
    status: 'waiting',
    currentPlayers: 0,
    maxPlayers: 6
  });

  return await joinRoom(roomCode, hostUserId);
};

/**
 * Tham gia phòng
 */
const joinRoom = async (roomCode, userId) => {
  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) throw new Error('Không tìm thấy phòng');

  if (room.status !== 'waiting') throw new Error('Phòng hiện không khả dụng');
  if (room.currentPlayers >= room.maxPlayers) throw new Error('Phòng đã đầy');

  const user = await User.findById(userId);
  if (!user) throw new Error('Không tìm thấy người dùng');

  let roomPlayer = await RoomPlayer.findOne({ roomId: room._id, userId });
  
  if (!roomPlayer) {
    roomPlayer = await RoomPlayer.create({
      roomId: room._id,
      userId,
      username: user.username,
      displayName: user.displayName || user.username
    });

    room.currentPlayers += 1;
    await room.save();
  }

  // Broadcast cập nhật
  broadcastRoomUpdate(room);
  broadcastLobbyRoomEvent(room, 'UPDATED');

  return room;
};

/**
 * Rời phòng
 */
const leaveRoom = async (roomId, userId) => {
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Không tìm thấy phòng');

  await RoomPlayer.deleteOne({ roomId, userId });
  room.currentPlayers = Math.max(0, room.currentPlayers - 1);

  if (room.currentPlayers <= 0) {
    await Room.findByIdAndDelete(roomId);
    broadcastLobbyRoomEvent(room, 'DELETED');
    return;
  }

  if (room.hostId.toString() === userId) {
    const remaining = await RoomPlayer.find({ roomId }).sort({ joinedAt: 1 });
    if (remaining.length > 0) {
      room.hostId = remaining[0].userId;
    }
  }

  await room.save();
  broadcastRoomUpdate(room);
  broadcastLobbyRoomEvent(room, 'UPDATED');
};

const broadcastRoomUpdate = async (room) => {
  const players = await RoomPlayer.find({ roomId: room._id });
  emitToRoom(room._id, 'ROOM_UPDATED', {
    room,
    players
  });
};

const broadcastLobbyRoomEvent = (room, eventType) => {
  emitToLobby('LOBBY_ROOM_EVENT', {
    type: eventType,
    room: {
      id: room._id,
      roomCode: room.roomCode,
      currentPlayers: room.currentPlayers,
      maxPlayers: room.maxPlayers,
      status: room.status,
      isPrivate: room.isPrivate
    }
  });
};

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  broadcastRoomUpdate,
  broadcastLobbyRoomEvent,
};
