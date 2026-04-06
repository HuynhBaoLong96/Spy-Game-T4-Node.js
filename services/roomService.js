const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const User = require('../models/User');

// Lazy load socketService to avoid circular dependencies
const getSocketService = () => require('./socketService');

/**
 * Tạo mã phòng ngẫu nhiên 6 ký tự
 */
const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

/**
 * Tạo phòng mới
 */
const createRoom = async (hostUserId, isPrivate, customRoomCode, isSpecialRound = false) => {
  const host = await User.findById(hostUserId);
  if (!host) throw new Error('Không tìm thấy người dùng');

  // Kiểm tra xu nếu là phòng đặc biệt
  if (isSpecialRound) {
    if (host.balance < 500) {
      throw new Error('Bạn không đủ xu để tạo phòng đặc biệt (cần 500 xu)');
    }
    
    // Trừ xu người tạo
    try {
      const economyService = require('./economyService');
      await economyService.deductEntryFee(hostUserId, 500, 'Tạo phòng đặc biệt', 'CREATE_ROOM');
    } catch (err) {
      console.error('[ROOM-SERVICE] Error deducting fee:', err.message);
      throw new Error(`Trừ xu thất bại: ${err.message}`);
    }
  }

  let roomCode = customRoomCode ? customRoomCode.trim().toUpperCase() : generateRoomCode();
  
  if (customRoomCode) {
    const existing = await Room.findOne({ roomCode });
    if (existing) throw new Error('Mã phòng đã tồn tại');
  }

  const room = await Room.create({
    roomCode,
    hostId: hostUserId,
    isPrivate,
    isSpecialRound,
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
  const isNewPlayer = !roomPlayer;

  if (isNewPlayer) {
    roomPlayer = await RoomPlayer.create({
      roomId: room._id,
      userId,
      username: user.username,
      displayName: user.displayName || user.username
    });

    // Cập nhật số lượng người chơi thực tế
    room.currentPlayers = await RoomPlayer.countDocuments({ roomId: room._id });
    await room.save();

    // Thông báo ngay lập tức cho mọi người trong phòng: có người mới vào
    const players = await RoomPlayer.find({ roomId: room._id });
    await getSocketService().emitToRoom(room, 'PLAYER_JOIN', {
      type: 'PLAYER_JOIN',
      user_id: userId.toString(),
      display_name: user.displayName || user.username,
      username: user.username,
      current_players: room.currentPlayers,
      max_players: room.maxPlayers,
      players: players.map(p => ({
        user_id: p.userId ? p.userId.toString() : '',
        id: p.userId ? p.userId.toString() : '',
        display_name: p.displayName || p.username || 'Người chơi',
        username: p.username || 'Người chơi',
        isHost: p.userId && room.hostId ? String(p.userId) === String(room.hostId) : false
      }))
    });
  } else {
    // Nếu người chơi đã có trong RoomPlayer (do lỗi out không sạch trước đó), 
    // vẫn gửi thông báo JOIN để FE cập nhật lại UI
    const players = await RoomPlayer.find({ roomId: room._id });
    await getSocketService().emitToRoom(room, 'PLAYER_JOIN', {
      type: 'PLAYER_JOIN',
      user_id: userId.toString(),
      display_name: user.displayName || user.username,
      username: user.username,
      current_players: room.currentPlayers,
      max_players: room.maxPlayers,
      players: players.map(p => ({
        user_id: p.userId ? p.userId.toString() : '',
        id: p.userId ? p.userId.toString() : '',
        display_name: p.displayName || p.username || 'Người chơi',
        username: p.username || 'Người chơi',
        isHost: p.userId && room.hostId ? String(p.userId) === String(room.hostId) : false
      }))
    });
  }

  // Broadcast cập nhật đầy đủ danh sách
  await broadcastRoomUpdate(room);
  broadcastLobbyRoomEvent(room, 'UPDATED');

  return room;
};

/**
 * Rời phòng
 */
const leaveRoom = async (roomId, userId) => {
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Không tìm thấy phòng');

  const leavingPlayer = await RoomPlayer.findOne({ roomId, userId });
  if (!leavingPlayer) return; // Đã rời rồi hoặc không có trong phòng

  await RoomPlayer.deleteOne({ roomId, userId });
  
  // Đếm lại số lượng người chơi thực tế để tránh lệch dữ liệu
  const playerCount = await RoomPlayer.countDocuments({ roomId });
  room.currentPlayers = playerCount;

  if (playerCount <= 0) {
    // Phòng trống — thông báo trước khi xóa
    await getSocketService().emitToRoom(room, 'ROOM_CLOSED', {
      type: 'ROOM_CLOSED',
      room_id: roomId.toString()
    });
    await Room.findByIdAndDelete(roomId);
    broadcastLobbyRoomEvent(room, 'DELETED');
    return;
  }

  if (room.hostId.toString() === userId.toString()) {
    const remaining = await RoomPlayer.find({ roomId }).sort({ joinedAt: 1 });
    if (remaining.length > 0) {
      room.hostId = remaining[0].userId;
    }
  }

  await room.save();

  // Thông báo ngay: có người rời phòng
  const players = await RoomPlayer.find({ roomId: room._id });
  await getSocketService().emitToRoom(room, 'PLAYER_LEAVE', {
    type: 'PLAYER_LEAVE',
    user_id: userId.toString(),
    display_name: leavingPlayer ? leavingPlayer.displayName : 'Unknown',
    new_host_id: room.hostId.toString(),
    current_players: room.currentPlayers,
    max_players: room.maxPlayers,
    players: players.map(p => ({
      user_id: p.userId ? p.userId.toString() : '',
      id: p.userId ? p.userId.toString() : '',
      display_name: p.displayName || p.username || 'Người chơi',
      username: p.username || 'Người chơi',
      isHost: p.userId && room.hostId ? String(p.userId) === String(room.hostId) : false
    }))
  });

  await broadcastRoomUpdate(room);
  broadcastLobbyRoomEvent(room, 'UPDATED');
};

/**
 * Đuổi người chơi khỏi phòng
 */
const kickPlayer = async (roomId, adminId, targetUserId) => {
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Không tìm thấy phòng');

  // Kiểm tra quyền (phải là chủ phòng hoặc admin hệ thống)
  const adminUser = await User.findById(adminId);
  if (room.hostId.toString() !== adminId && adminUser.role !== 'ROLE_ADMIN') {
    throw new Error('Bạn không có quyền đuổi người chơi');
  }

  if (targetUserId === room.hostId.toString()) {
    throw new Error('Không thể đuổi chủ phòng');
  }

  const kickedPlayer = await RoomPlayer.findOne({ roomId, userId: targetUserId });
  if (!kickedPlayer) return;

  await RoomPlayer.deleteOne({ roomId, userId: targetUserId });
  
  // Cập nhật số lượng người chơi thực tế
  room.currentPlayers = await RoomPlayer.countDocuments({ roomId });
  await room.save();

  // Thông báo ngay cho tất cả trong phòng (bao gồm cả người bị kick để FE họ nhận được)
  const players = await RoomPlayer.find({ roomId: room._id });
  await getSocketService().emitToRoom(room, 'PLAYER_KICKED', {
    type: 'PLAYER_KICKED',
    user_id: targetUserId.toString(),
    target_user_id: targetUserId.toString(), // Thêm target_user_id để khớp với FE logic
    display_name: kickedPlayer ? kickedPlayer.displayName : 'Unknown',
    current_players: room.currentPlayers,
    max_players: room.maxPlayers,
    players: players.map(p => ({
      user_id: p.userId ? p.userId.toString() : '',
      id: p.userId ? p.userId.toString() : '',
      display_name: p.displayName || p.username || 'Người chơi',
      username: p.username || 'Người chơi',
      isHost: p.userId && room.hostId ? String(p.userId) === String(room.hostId) : false
    }))
  });

  // Gửi thông báo riêng tư cho người bị đuổi (nếu FE đang lắng nghe /user/queue/room-events)
  await getSocketService().emitToUser(targetUserId, 'room-events', {
    type: 'KICKED',
    message: 'Bạn đã bị đuổi ra khỏi phòng chơi'
  });

  await broadcastRoomUpdate(room);
  broadcastLobbyRoomEvent(room, 'UPDATED');
};

/**
 * Chuyển quyền chủ phòng
 */
const transferHost = async (roomId, currentHostId, newHostId) => {
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Không tìm thấy phòng');

  const adminUser = await User.findById(currentHostId);
  if (room.hostId.toString() !== currentHostId && adminUser.role !== 'ROLE_ADMIN') {
    throw new Error('Bạn không có quyền chuyển chủ phòng');
  }

  const newHostExists = await RoomPlayer.findOne({ roomId, userId: newHostId });
  if (!newHostExists) {
    throw new Error('Người chơi này không có trong phòng');
  }

  room.hostId = newHostId;
  await room.save();

  broadcastRoomUpdate(room);
  return room;
};

const broadcastRoomUpdate = async (room) => {
  const players = await RoomPlayer.find({ roomId: room._id });
  const responseData = {
    type: 'ROOM_UPDATE',
    room_id: room._id.toString(),
    room_code: room.roomCode,
    host_id: room.hostId.toString(),
    current_players: room.currentPlayers,
    max_players: room.maxPlayers,
    status: room.status,
    is_private: room.isPrivate,
    is_special_round: room.isSpecialRound || false,
    isSpecialRound: room.isSpecialRound || false,
    players: players.map(p => ({
      user_id: p.userId ? p.userId.toString() : '',
      id: p.userId ? p.userId.toString() : '',
      display_name: p.displayName || p.username || 'Người chơi',
      username: p.username || 'Người chơi',
      isHost: p.userId && room.hostId ? String(p.userId) === String(room.hostId) : false
    }))
  };

  await getSocketService().emitToRoom(room, 'ROOM_UPDATE', responseData);
};

const broadcastLobbyRoomEvent = (room, eventType) => {
  if (!room) return;
  
  // Java FE mong đợi cấu trúc: { type, room_id, room_code, current_players, max_players, status, is_private }
  getSocketService().emitToLobby('LOBBY_ROOM_EVENT', {
    type: eventType === 'DELETED' ? 'ROOM_DELETED' : 'ROOM_UPDATED',
    room_id: room._id ? room._id.toString() : null,
    room_code: room.roomCode,
    current_players: room.currentPlayers,
    max_players: room.maxPlayers,
    status: room.status,
    is_private: room.isPrivate
  });
};

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  kickPlayer,
  transferHost,
  broadcastRoomUpdate,
  broadcastLobbyRoomEvent,
  voteByRoom: async (roomId, voterId, targetId) => {
    const room = await Room.findById(roomId);
    if (!room) return { success: false };
    
    // Tạm thời emit socket cho đơn giản
    await getSocketService().emitToRoom(room, 'ROOM_VOTE', {
      voter_id: voterId,
      target_id: targetId
    });
    return { success: true };
  },
  getMostVotedResult: async (roomId) => {
    // Mock result
    return { 
      room_id: roomId,
      most_voted_user_id: null,
      votes_count: 0
    };
  },
  getRoomMessages: async (roomId) => {
    // Mock messages
    return [];
  },
  sendRoomMessage: async (roomId, userId, content) => {
    const room = await Room.findById(roomId);
    if (!room) throw new Error('Không tìm thấy phòng');

    const user = await User.findById(userId);
    const message = {
      type: 'CHAT',
      user_id: userId,
      userId: userId,
      sender: user ? (user.displayName || user.username) : 'Unknown',
      sender_name: user ? (user.displayName || user.username) : 'Unknown',
      display_name: user ? (user.displayName || user.username) : 'Unknown',
      content,
      timestamp: new Date().toISOString()
    };
    
    await getSocketService().emitToRoom(room, 'CHAT', message);
    return message;
  }
};
