const express = require('express');
const router = express.Router();
const { getBalance, dailyCheckin, getRelief, getLeaderboard, getTransactions, getCheckinStatus, getUserBalance } = require('../controllers/economyController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// Route này không cần đăng nhập (xem BXH)
router.get('/leaderboard', getLeaderboard);

// Các route này yêu cầu đăng nhập
router.use(protect);

router.get('/balance', getBalance);
router.get('/balance/:userId', isAdmin, getUserBalance);
router.get('/daily-checkin/status', getCheckinStatus);
router.post('/daily-checkin', dailyCheckin);
router.post('/relief', getRelief);
router.get('/transactions', getTransactions);

module.exports = router;
