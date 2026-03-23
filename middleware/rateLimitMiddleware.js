const rateLimit = require('express-rate-limit');

/**
 * Middleware giới hạn tần suất yêu cầu (Rate Limiting)
 * Chống spam, brute force attacks, và tấn công DoS
 */

// Giới hạn chung cho tất cả các API (Đã tăng lên để test thoải mái)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 1000, // Tối đa 1000 yêu cầu mỗi phút (gần như không giới hạn khi test)
  message: {
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 1 phút'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Giới hạn cho các API đăng nhập/đăng ký (Đã tăng lên để test)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 100, // Tối đa 100 lần đăng ký/đăng nhập mỗi phút
  message: {
    message: 'Bạn đã thử quá nhiều lần, vui lòng quay lại sau 1 phút'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
};
