// Middleware xử lý lỗi tập trung
const errorHandler = (err, req, res, next) => {
  // Ghi log lỗi ra console để debug
  console.error('[SERVER ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });

  // Nếu status code đã được đặt, hãy sử dụng nó, nếu không hãy sử dụng 500 (Internal Server Error)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  res.status(statusCode).json({
    message: err.message,
    error: err.message, // Thêm trường error để tương thích với FE
    // Chỉ hiển thị stack trace (nguyên nhân sâu xa của lỗi) khi đang ở chế độ phát triển (development)
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = {
  errorHandler,
};
