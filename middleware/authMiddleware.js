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
        return res.status(401).json({ message: 'Người dùng không tồn tại' });
      }

      // Kiểm tra xem tài khoản có bị khóa (Ban) hay không
      // Chỉ chặn nếu active được set rõ ràng là false
      if (req.user.active === false) {
        return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa bởi Admin' });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Không được phép, token không hợp lệ' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Không được phép, không tìm thấy token' });
  }
};

/**
 * Middleware kiểm tra quyền Admin
 */
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'ROLE_ADMIN') {
    if (typeof next === 'function') {
      next();
    }
  } else {
    return res.status(403).json({ message: 'Không có quyền Admin' });
  }
};

module.exports = {
  protect,
  admin,
};
