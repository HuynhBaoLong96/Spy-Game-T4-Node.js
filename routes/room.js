const express = require('express');
const router = express.Router();
const { 
  createRoom, getRooms, joinRoom, leaveRoom, getPlayers, getRoomDetail, 
  getRoomByCode, kickPlayer, transferHost, voteByRoom, 
  getMostVotedResult, getRoomMessages, sendRoomMessage 
} = require('../controllers/roomController');
const { startGame, adminSetSpy } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.post('/', createRoom);
router.get('/', getRooms);

// Lấy thông tin phòng
router.get('/code/:roomCode', getRoomByCode); // Phải đặt trước /:roomId
router.get('/:roomId', getRoomDetail);
router.get('/:roomId/players', getPlayers);

// Thao tác phòng
router.post('/:roomCode/join', joinRoom);
router.post('/:roomId/leave', leaveRoom);
router.post('/:roomId/start', startGame);
router.post('/:roomId/kick', kickPlayer);           // body: { user_id }
router.post('/:roomId/transfer-host', transferHost);// body: { user_id }
router.post('/:roomId/vote', voteByRoom);           // body: { targetId }

// Tin nhắn và Kết quả
router.get('/:roomId/result/most-voted', getMostVotedResult);
router.get('/:roomId/messages', getRoomMessages);
router.post('/:roomId/messages', sendRoomMessage);

// Route Admin
router.post('/:roomId/admin/set-spy', isAdmin, adminSetSpy); // body: { user_id }

module.exports = router;
