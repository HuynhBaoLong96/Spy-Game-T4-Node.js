// Middleware xử lý lỗi tập trung
const errorHandler = (err, req, res, next) => {
  // Nếu status code đã được đặt, hãy sử dụng nó, nếu không hãy sử dụng 500 (Internal Server Error)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  res.status(statusCode).json({
    message: err.message,
    // Chỉ hiển thị stack trace (nguyên nhân sâu xa của lỗi) khi đang ở chế độ phát triển (development)
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = {
  errorHandler,
};
