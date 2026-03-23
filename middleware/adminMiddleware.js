/**
 * Middleware kiểm tra quyền Admin
 * Yêu cầu: Đã đi qua middleware 'protect' để có req.user
 */
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ROLE_ADMIN') {
    next();
  } else {
    res.status(403);
    throw new Error('Bạn không có quyền truy cập vào chức năng dành cho Admin');
  }
};

module.exports = isAdmin;
