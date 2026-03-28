const express = require('express');
const router = express.Router();
const { getMe, updateMe, getMyStats, getMyHistory } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/me', getMe);
router.get('/me/stats', getMyStats);
router.get('/me/history', getMyHistory);
router.put('/me', updateMe);

module.exports = router;
