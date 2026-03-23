const express = require('express');
const router = express.Router();

// Nhập hàm xử lý logic từ controller
const { healthCheck } = require('../controllers/healthController');

// Khi có một yêu cầu GET đến đường dẫn gốc ('/') của router này,
// hãy gọi hàm healthCheck
router.get('/', healthCheck);

// Xuất router này ra để index.js có thể dùng
module.exports = router;