const express = require('express');
const router = express.Router();
const { getAllKeywords, getRandomKeyword } = require('../controllers/keywordController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

router.get('/', protect, isAdmin, getAllKeywords); // Chỉ Admin mới xem được tất cả từ khóa
router.get('/random', getRandomKeyword);

module.exports = router;
