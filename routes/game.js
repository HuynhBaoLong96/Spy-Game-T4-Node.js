const express = require('express');
const router = express.Router();
const { getGameState, submitDescription, submitVote, submitChat, submitRoleGuess, confirmSpyAbility, useFakeMessage, infectPlayer, adjustRewards } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.get('/:matchId/state', getGameState);
router.post('/:matchId/describe', submitDescription);
router.post('/:matchId/vote', submitVote);
router.post('/:matchId/chat', submitChat);
router.post('/:matchId/rolecheck', submitRoleGuess);
router.post('/:matchId/rolecheck/confirm-ability', confirmSpyAbility);
router.post('/:matchId/ability/fake-message', useFakeMessage);
router.post('/:matchId/ability/infect', infectPlayer);

// Route Admin
router.post('/:matchId/admin/adjust-rewards', isAdmin, adjustRewards);

module.exports = router;
