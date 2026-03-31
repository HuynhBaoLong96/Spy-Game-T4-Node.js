const express = require('express');
const router = express.Router();
const { getGameState, submitDescription, submitVote, submitChat, submitRoleGuess, confirmSpyAbility, useFakeMessage, infectPlayer, useAiManipulation, adjustRewards, setGameState } = require('../controllers/gameController');
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

// Kỹ năng Giả mạo AI
router.post('/:matchId/ability/manipulate-ai', useAiManipulation);
router.post('/:matchId/use-ability', (req, res, next) => {
  // Đồng bộ với FE call: axiosInstance.post(`/game/${matchId}/use-ability`, { content });
  // Nếu content được gửi trực tiếp, chúng ta coi đó là DISCUSS (thảo luận thay AI)
  if (req.body.content && !req.body.type) {
    req.body.type = 'DISCUSS';
    return useAiManipulation(req, res, next);
  }
  next();
});

// Route Admin
router.post('/:matchId/admin/adjust-rewards', isAdmin, adjustRewards);

module.exports = router;
