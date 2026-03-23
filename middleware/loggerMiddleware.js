/**
 * Middleware ghi log các yêu cầu (requests) đến server
 */
const logger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  // Khi phản hồi được gửi xong (finish), chúng ta mới ghi log
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Màu sắc trong terminal (tùy chọn)
    const color = statusCode >= 400 ? '\x1b[31m' : statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(
      `[${new Date().toISOString()}] ${ip} ${method} ${originalUrl} ${color}${statusCode}${reset} - ${duration}ms`
    );
  });

  next();
};

module.exports = logger;
