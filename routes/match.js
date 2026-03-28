const express = require('express');
const router = express.Router();
const { getMyHistory } = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/history', getMyHistory);

module.exports = router;
