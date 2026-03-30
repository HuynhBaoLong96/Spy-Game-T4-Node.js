/**
 * Middleware kiểm tra quyền Admin
 * Yêu cầu: Đã đi qua middleware 'protect' để có req.user
 */
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ROLE_ADMIN') {
    if (typeof next === 'function') {
      next();
    }
  } else {
    return res.status(403).json({ 
      message: 'Bạn không có quyền truy cập vào chức năng dành cho Admin' 
    });
  }
};

module.exports = isAdmin;
