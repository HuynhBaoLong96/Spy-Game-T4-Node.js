const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const { validate, registerValidation, loginValidation } = require('../middleware/validateMiddleware');

// Đăng ký: POST /api/auth/register
router.post('/register', authLimiter, registerValidation, validate, register);

// Đăng nhập: POST /api/auth/login
router.post('/login', authLimiter, loginValidation, validate, login);

module.exports = router;
