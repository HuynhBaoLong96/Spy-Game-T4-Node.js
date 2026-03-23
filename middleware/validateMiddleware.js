const { validationResult, body } = require('express-validator');

/**
 * Middleware kiểm tra dữ liệu đầu vào (Validation)
 */

// Hàm xử lý kết quả validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Định nghĩa các bộ quy tắc validation (đây chỉ là ví dụ mẫu)
const registerValidation = [
  body('username').trim().isLength({ min: 3 }).withMessage('Tên đăng nhập phải có ít nhất 3 ký tự'),
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
];

const loginValidation = [
  body('username').optional().trim().notEmpty().withMessage('Tên đăng nhập không được để trống'),
  body('email').optional().isEmail().withMessage('Email không hợp lệ'),
  body('password').notEmpty().withMessage('Mật khẩu không được để trống'),
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
};
