const express = require('express');
const router = express.Router();
const { createRoom, getRooms, joinRoom, leaveRoom, getPlayers, getRoomDetail, getRoomByCode, kickPlayer, transferHost } = require('../controllers/roomController');
const { startGame, adminSetSpy } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.post('/', createRoom);
router.get('/', getRooms);
router.get('/code/:roomCode', getRoomByCode); // Phải đặt trước /:roomId
router.get('/:roomId', getRoomDetail);
router.get('/:roomId/players', getPlayers);
router.post('/:roomCode/join', joinRoom);
router.post('/:roomId/leave', leaveRoom);
router.post('/:roomId/start', startGame);
router.post('/:roomId/kick/:userId', kickPlayer);
router.post('/:roomId/transfer-host/:userId', transferHost);

// Route Admin
router.post('/:roomId/admin/set-spy', isAdmin, adminSetSpy);

module.exports = router;
