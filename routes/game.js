const express = require('express');
const router = express.Router();
const { getGameState, submitDescription, submitVote } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

router.get('/:matchId/state', getGameState);
router.post('/:matchId/describe', submitDescription);
router.post('/:matchId/vote', submitVote);

module.exports = router;
