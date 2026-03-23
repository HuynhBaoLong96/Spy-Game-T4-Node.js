const express = require('express');
const router = express.Router();
const { createRoom, getRooms, joinRoom } = require('../controllers/roomController');
const { startGame } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.post('/', createRoom);
router.get('/', getRooms);
router.post('/:roomCode/join', joinRoom);
router.post('/:roomId/start', startGame);

module.exports = router;
