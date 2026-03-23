const express = require('express');
const router = express.Router();
const { getBalance, dailyCheckin, getRelief, getLeaderboard, getTransactions } = require('../controllers/economyController');
const { protect } = require('../middleware/authMiddleware');

// Route này không cần đăng nhập (xem BXH)
router.get('/leaderboard', getLeaderboard);

// Các route này yêu cầu đăng nhập
router.use(protect);

router.get('/balance', getBalance);
router.post('/daily-checkin', dailyCheckin);
router.post('/relief', getRelief);
router.get('/transactions', getTransactions);

module.exports = router;
