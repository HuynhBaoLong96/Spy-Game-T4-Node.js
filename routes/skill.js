const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { emitToRoom, emitToTopic } = require('../services/socketService');
const Room = require('../models/Room');

router.use(protect);

/**
 * POST /api/skill/special-round?roomId=xxx
 * Host kích hoạt vòng chơi đặc biệt cho phòng
 */
router.post('/special-round', async (req, res, next) => {
  try {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ message: 'Thiếu roomId' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Không tìm thấy phòng' });
    if (room.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Chỉ chủ phòng mới có thể kích hoạt' });
    }

    // Cập nhật trạng thái vòng đặc biệt trong Room
    room.isSpecialRound = true;
    await room.save();

    // Broadcast tới tất cả người trong phòng
    emitToRoom(room, 'SPECIAL_ROUND_ENABLED', {
      type: 'SPECIAL_ROUND_ENABLED',
      room_id: roomId,
      message: 'Vòng chơi đặc biệt đã được kích hoạt!'
    });

    res.json({ success: true, message: 'Đã kích hoạt vòng chơi đặc biệt' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/skill/anonymous-vote?matchId=xxx
 * Người chơi dùng skill vote ẩn danh
 */
router.post('/anonymous-vote', async (req, res, next) => {
  try {
    const { matchId } = req.query;
    if (!matchId) return res.status(400).json({ message: 'Thiếu matchId' });

    // Notify chính người đó
    res.json({ success: true, message: 'Vote ẩn danh đã được kích hoạt' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;