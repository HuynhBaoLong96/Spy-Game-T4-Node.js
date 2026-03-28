const express = require('express');
const router = express.Router();
const { getGameState, submitDescription, submitVote, submitChat, submitRoleGuess } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.get('/:matchId/state', getGameState);
router.post('/:matchId/describe', submitDescription);
router.post('/:matchId/vote', submitVote);
router.post('/:matchId/chat', submitChat);
router.post('/:matchId/guess-role', submitRoleGuess);

module.exports = router;
