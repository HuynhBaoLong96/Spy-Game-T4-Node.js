const express = require('express');
const router = express.Router();
const { register, login, refresh, getMe, logout, forgotPassword, verifyResetToken, resetPassword, changePassword } = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const { validate, registerValidation, loginValidation } = require('../middleware/validateMiddleware');
const { protect } = require('../middleware/authMiddleware');

// Đăng ký: POST /api/auth/register
router.post('/register', authLimiter, registerValidation, validate, register);

// Đăng nhập: POST /api/auth/login
router.post('/login', authLimiter, loginValidation, validate, login);

// Làm mới token
router.post('/refresh', refresh);

// Lấy thông tin cá nhân
router.get('/me', protect, getMe);

// Đăng xuất
router.post('/logout', protect, logout);

// Quên mật khẩu
router.post('/forgot-password', authLimiter, forgotPassword);

// Xác minh token reset
router.post('/verify-reset-token', authLimiter, verifyResetToken);

// Đặt lại mật khẩu
router.post('/reset-password', authLimiter, resetPassword);

// Đổi mật khẩu (yêu cầu đăng nhập)
router.post('/change-password', protect, changePassword);

module.exports = router;
