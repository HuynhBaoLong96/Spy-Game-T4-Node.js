const GameSettings = require('../models/GameSettings');
const User = require('../models/User');
const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');
const KeywordPair = require('../models/KeywordPair');
const Match = require('../models/Match');
const { refreshAllDurations, skipPhase } = require('../services/gameService');
const { addReward } = require('../services/economyService');
const socketService = require('../services/socketService');

/**
 * @desc    Tặng xu cho người dùng (Admin)
 * @route   POST /api/admin/users/add-coins
 */
const addCoinsToUser = async (req, res, next) => {
  try {
    const body = req.body || {};
    console.log('[ADMIN] Received manage-coins request:', body);
    
    // FE có thể gửi userId (ID) hoặc userIdentifier (Username/Email)
    const identifier = body.userId || body.user_id || body.identifier || body.username;
    
    // Đảm bảo identifier là chuỗi để tránh lỗi .match()
    const identifierStr = String(identifier || '').trim();
    
    // Kiểm tra coinsAmount kỹ hơn, cho phép 0 nhưng phải là số
    let coinsAmount = body.amount;
    if (coinsAmount === undefined) coinsAmount = body.coins;
    if (coinsAmount === undefined) coinsAmount = body.amount_to_add;
    
    // Mặc định cộng vào cả điểm xếp hạng nếu không được chỉ định
    const addToRanking = body.addToRanking !== undefined ? body.addToRanking : true;
    
    if (!identifierStr || coinsAmount === undefined) {
      return res.status(400).json({ 
        message: 'Thiếu thông tin người dùng (ID/Username/Email) hoặc số lượng xu',
        received: body 
      });
    }

    const numAmount = Number(coinsAmount);
    if (isNaN(numAmount)) {
      return res.status(400).json({ message: 'Số lượng xu không hợp lệ' });
    }

    const actionType = numAmount >= 0 ? 'tặng' : 'trừ';
    const reason = body.reason || `Admin ${actionType} xu`;

    // Tìm kiếm người dùng linh hoạt bằng ID, Username hoặc Email
    let user;
    // Kiểm tra xem identifier có phải là MongoDB ID hợp lệ không (24 ký tự hex)
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(identifierStr);
    
    if (isMongoId) {
      user = await User.findById(identifierStr);
    }
    
    if (!user) {
      // Tìm theo Username hoặc Email (không phân biệt hoa thường)
      // Sử dụng escape regex để tránh lỗi 500 khi identifier chứa ký tự đặc biệt như . * + ?
      const escapedIdentifier = identifierStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      user = await User.findOne({
        $or: [
          { username: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
          { email: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }
        ]
      });
    }

    if (!user) {
      return res.status(404).json({ message: `Không tìm thấy người dùng với thông tin: ${identifierStr}` });
    }

    // Thực hiện cộng/trừ xu thông qua economyService
    const updatedUser = await addReward(user._id, numAmount, 'ADMIN_ADD', reason, addToRanking);

    // Gửi thông báo real-time cho người dùng qua các topic phổ biến
    const balanceUpdateData = {
      type: 'BALANCE_UPDATE',
      balance: updatedUser.balance,
      rankingPoints: updatedUser.rankingPoints,
      amount: numAmount,
      reason: reason
    };

    // 1. Gửi qua topic economy riêng tư (yêu cầu của FE: /user/queue/balance)
    socketService.emitToUser(user._id, 'balance', {
      balance: updatedUser.balance,
      rankingPoints: updatedUser.rankingPoints,
      amount: numAmount,
      reason: reason
    });
    
    // Giữ thêm các topic cũ để đảm bảo tính tương thích
    socketService.emitToUser(user._id, 'economy', balanceUpdateData);
    socketService.emitToUser(user._id, 'room-events', balanceUpdateData);

    // 3. Nếu user đang trong phòng, gửi cập nhật vào phòng đó
    try {
      const currentPlayer = await RoomPlayer.findOne({ userId: user._id });
      if (currentPlayer) {
        socketService.emitToRoom(currentPlayer.roomId, 'PLAYER_BALANCE_UPDATE', {
          user_id: user._id,
          balance: updatedUser.balance,
          ranking_points: updatedUser.rankingPoints
        });
      }
    } catch (roomErr) {
      console.error('[ADMIN] Error emitting to room:', roomErr);
    }

    // 4. Thông báo cho Lobby và topic Leaderboard để cập nhật lại bảng xếp hạng
    socketService.emitToTopic('/topic/economy/leaderboard', { type: 'LEADERBOARD_UPDATE' });
    socketService.emitToLobby('LOBBY_EVENT', { type: 'LEADERBOARD_UPDATE' });

    res.json({
      success: true,
      message: `Đã ${actionType} ${Math.abs(numAmount)} xu cho người dùng ${user.username} thành công`,
      newBalance: updatedUser.balance,
      newRankingPoints: updatedUser.rankingPoints,
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        displayName: updatedUser.displayName
      }
    });
  } catch (error) {
    console.error('[ADMIN] Error managing user coins:', error);
    next(error);
  }
};

/**
 * @desc    Lấy cấu hình game hiện tại
 * @route   GET /api/admin/settings
 */
const getGameSettings = async (req, res, next) => {
  try {
    let settings = await GameSettings.findById('global');
    
    if (!settings) {
      settings = await GameSettings.create({ _id: 'global' });
    }

    res.json(settings);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cập nhật cấu hình game
 * @route   PATCH /api/admin/settings
 */
const updateGameSettings = async (req, res, next) => {
  try {
    console.log('[ADMIN] Received settings update:', req.body);

    // Hỗ trợ cả camelCase và snake_case từ FE
    const describeDuration = req.body.describeDuration || req.body.describe_duration;
    const discussDuration = req.body.discussDuration || req.body.discuss_duration;
    const voteDuration = req.body.voteDuration || req.body.vote_duration;
    const roleCheckDuration = req.body.roleCheckDuration || req.body.role_check_duration;
    const roleCheckResultDuration = req.body.roleCheckResultDuration || req.body.role_check_result_duration;

    let settings = await GameSettings.findById('global');
    
    if (!settings) {
      settings = new GameSettings({ _id: 'global' });
    }

    if (describeDuration !== undefined) settings.describeDuration = Number(describeDuration);
    if (discussDuration !== undefined) settings.discussDuration = Number(discussDuration);
    if (voteDuration !== undefined) settings.voteDuration = Number(voteDuration);
    if (roleCheckDuration !== undefined) settings.roleCheckDuration = Number(roleCheckDuration);
    if (roleCheckResultDuration !== undefined) settings.roleCheckResultDuration = Number(roleCheckResultDuration);

    await settings.save();
    console.log('[ADMIN] Settings saved to DB:', settings);

    // Cập nhật cấu hình ngay lập tức cho các trận đấu đang diễn ra
    await refreshAllDurations();

    res.json({
      message: 'Cập nhật cấu hình thành công',
      settings
    });
  } catch (error) {
    console.error('[ADMIN] Error updating settings:', error);
    next(error);
  }
};

/**
 * @desc    Lấy danh sách người dùng
 * @route   GET /api/admin/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { search, role, active } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (active !== undefined) query.active = active === 'true';

    const users = await User.find(query).sort({ createdAt: -1 });
    
    // Đảm bảo có cả 'id' và 'user_id' cho FE dễ đọc
    const usersWithId = users.map(u => ({
      ...u._doc,
      id: u._id.toString(),
      user_id: u._id.toString()
    }));

    res.json(usersWithId);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cập nhật thông tin người dùng
 * @route   PUT /api/admin/users/:userId
 */
const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Kiểm tra ID hợp lệ
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }

    const { role, active, balance, rankingPoints, displayName } = req.body;
    
    const updateData = {};
    if (role) updateData.role = role;
    if (active !== undefined) updateData.active = active;
    if (balance !== undefined) updateData.balance = Number(balance);
    if (rankingPoints !== undefined) updateData.rankingPoints = Number(rankingPoints);
    if (displayName) updateData.displayName = displayName;

    const user = await User.findByIdAndUpdate(
      userId, 
      updateData, 
      { new: true, runValidators: false }
    );

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    res.json({
      message: 'Cập nhật người dùng thành công',
      user: { ...user._doc, id: user._id }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Khóa hoặc Mở khóa người dùng (Toggle Ban/Unban)
 * @route   PATCH /api/admin/users/:userId/ban
 */
const banUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    // Đảo ngược trạng thái hoạt động (Toggle)
    const newActiveState = !user.active;
    
    // Sử dụng findByIdAndUpdate để tránh trigger validation/pre-save cho password
    const updatedUser = await User.findByIdAndUpdate(
      userId, 
      { active: newActiveState }, 
      { new: true, runValidators: false }
    );

    let actionMsg = '';
    if (!updatedUser.active) {
      // Nếu vừa mới bị khóa, ngắt kết nối socket ngay lập tức
      socketService.disconnectUser(updatedUser._id);
      actionMsg = 'Đã khóa người dùng thành công';
    } else {
      actionMsg = 'Đã mở khóa (Unban) người dùng thành công';
    }

    res.json({ 
      message: actionMsg, 
      id: updatedUser._id, 
      active: updatedUser.active 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Kích hoạt người dùng (Unban)
 * @route   PATCH /api/admin/users/:userId/unban
 * @route   PATCH /api/admin/users/:userId/active
 */
const activeUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }

    const user = await User.findByIdAndUpdate(
      userId, 
      { active: true }, 
      { new: true, runValidators: false }
    );
    
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    res.json({ message: 'Đã mở khóa (Unban) người dùng thành công', id: user._id, active: true });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Xóa người dùng
 * @route   DELETE /api/admin/users/:userId
 */
const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }
    
    // Không cho phép admin tự xóa chính mình
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Bạn không thể tự xóa tài khoản của mình' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    await User.findByIdAndDelete(userId);
    await RoomPlayer.deleteMany({ userId });

    res.json({ message: 'Xóa người dùng thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy danh sách phòng
 * @route   GET /api/admin/rooms
 */
const getAllRooms = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;

    const rooms = await Room.find(query)
      .populate('hostId', 'username displayName')
      .sort({ createdAt: -1 });
    
    // Đảm bảo có cả 'id' và 'room_id'
    const roomsWithId = rooms.map(r => ({
      ...r._doc,
      id: r._id.toString(),
      room_id: r._id.toString()
    }));

    res.json(roomsWithId);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Xóa/Đóng phòng
 * @route   DELETE /api/admin/rooms/:roomId
 */
const deleteRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(roomId)) {
      return res.status(400).json({ message: 'ID phòng không hợp lệ' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }

    await RoomPlayer.deleteMany({ roomId });
    await Room.findByIdAndDelete(roomId);

    socketService.emitToRoom(roomId, 'ROOM_CLOSED', { message: 'Phòng đã bị Admin đóng' });
    socketService.emitToLobby('ROOM_DELETED', { room_id: roomId });

    res.json({ message: 'Xóa phòng thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy toàn bộ keyword pairs
 * @route   GET /api/admin/keywords
 */
const getAllKeywords = async (req, res, next) => {
  try {
    const { search, category } = req.query;
    let query = {};
    
    if (search) {
      query.$or = [
        { civilianKeyword: { $regex: search, $options: 'i' } },
        { spyKeyword: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) query.category = category;

    const keywords = await KeywordPair.find(query).sort({ createdAt: -1 });
    
    // Đảm bảo có 'id' và map đúng tên trường cho FE
    const keywordsWithId = keywords.map(k => ({
      id: k._id.toString(),
      keyword1: k.civilianKeyword,
      keyword2: k.spyKeyword,
      category: k.category,
      createdAt: k.createdAt
    }));

    res.json(keywordsWithId);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tạo keyword pair mới
 * @route   POST /api/admin/keywords
 */
const createKeyword = async (req, res, next) => {
  try {
    const { keyword1, keyword2, civilianKeyword, spyKeyword, category } = req.body;
    
    const finalCivilian = keyword1 || civilianKeyword;
    const finalSpy = keyword2 || spyKeyword;

    if (!finalCivilian || !finalSpy) {
      return res.status(400).json({ message: 'Thiếu từ khóa dân thường hoặc gián điệp' });
    }

    const keyword = await KeywordPair.create({
      civilianKeyword: finalCivilian,
      spyKeyword: finalSpy,
      category: category || 'General'
    });

    res.status(201).json({
      message: 'Tạo từ khóa thành công',
      keyword
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cập nhật keyword pair
 * @route   PUT /api/admin/keywords/:id
 */
const updateKeyword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { keyword1, keyword2, civilianKeyword, spyKeyword, category } = req.body;

    const keyword = await KeywordPair.findById(id);
    if (!keyword) {
      return res.status(404).json({ message: 'Không tìm thấy bộ từ khóa' });
    }

    if (keyword1 || civilianKeyword) keyword.civilianKeyword = keyword1 || civilianKeyword;
    if (keyword2 || spyKeyword) keyword.spyKeyword = keyword2 || spyKeyword;
    if (category) keyword.category = category;

    await keyword.save();

    res.json({
      message: 'Cập nhật từ khóa thành công',
      keyword
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Xóa keyword pair
 * @route   DELETE /api/admin/keywords/:id
 */
const deleteKeyword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const keyword = await KeywordPair.findById(id);
    
    if (!keyword) {
      return res.status(404).json({ message: 'Không tìm thấy bộ từ khóa' });
    }

    await KeywordPair.findByIdAndDelete(id);
    res.json({ message: 'Xóa từ khóa thành công' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lấy thống kê hệ thống
 * @route   GET /api/admin/stats
 */
const getAdminStats = async (req, res, next) => {
  try {
    const total_users = await User.countDocuments();
    const total_rooms = await Room.countDocuments();
    const total_matches = await Match.countDocuments();
    const total_keywords = await KeywordPair.countDocuments();
    
    // Thống kê bổ sung
    const active_rooms = await Room.countDocuments({ status: { $ne: 'waiting' } });
    const total_balance = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);

    res.json({
      total_users,
      total_rooms,
      total_matches,
      total_keywords,
      active_rooms,
      total_system_balance: total_balance.length > 0 ? total_balance[0].total : 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Skip phase của trận đấu
 * @route   POST /api/admin/matches/:matchId/skip-phase
 */
const adminSkipPhase = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const result = await skipPhase(matchId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGameSettings,
  updateGameSettings,
  getAllUsers,
  updateUser,
  banUser,
  activeUser,
  deleteUser,
  getAllRooms,
  deleteRoom,
  getAllKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  getAdminStats,
  adminSkipPhase,
  addCoinsToUser
};
