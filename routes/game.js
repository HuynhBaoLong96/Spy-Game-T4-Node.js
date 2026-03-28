const express = require('express');
const router = express.Router();
const { getGameState, submitDescription, submitVote, submitChat, submitRoleGuess, confirmSpyAbility, useFakeMessage, infectPlayer, adjustRewards, setGameState } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.get('/:matchId/state', getGameState);
router.post('/:matchId/set-state', setGameState); // Thêm mới
router.post('/:matchId/describe', submitDescription);
router.post('/:matchId/vote', submitVote);
router.post('/:matchId/chat', submitChat);

// Đoán vai trò
router.post('/:matchId/rolecheck', submitRoleGuess);       // gameApi dùng
router.post('/:matchId/guess-role', submitRoleGuess);      // gameService dùng — alias

// Kỹ năng Gián điệp
router.post('/:matchId/rolecheck/confirm-ability', confirmSpyAbility);

router.post('/:matchId/ability/fake-message', useFakeMessage);  // gameApi
router.post('/:matchId/use-ability', useFakeMessage);           // gameService — alias

router.post('/:matchId/ability/infect', infectPlayer);     // gameApi
router.post('/:matchId/infect', infectPlayer);             // gameService — alias

// Route Admin
router.post('/:matchId/admin/adjust-rewards', isAdmin, adjustRewards);

module.exports = router;
