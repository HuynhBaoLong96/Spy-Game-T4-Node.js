const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware bảo vệ các routes yêu cầu xác thực JWT
 */
const protect = async (req, res, next) => {
  let token;

  // Kiểm tra xem token có trong header Authorization không
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Lấy token từ header "Bearer <token>"
      token = req.headers.authorization.split(' ')[1];

      // Giải mã token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Tìm user theo id trong token và gắn vào request object
      // (Không lấy mật khẩu)
      req.user = await User.findById(decoded.id).select('-passwordHash');

      if (!req.user) {
        res.status(401);
        throw new Error('Người dùng không tồn tại');
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Không được phép, token không hợp lệ');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Không được phép, không tìm thấy token');
  }
};

/**
 * Middleware kiểm tra quyền Admin
 */
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'ROLE_ADMIN') {
    next();
  } else {
    res.status(403);
    throw new Error('Không có quyền Admin');
  }
};

module.exports = {
  protect,
  admin,
};
