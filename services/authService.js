const jwt = require('jsonwebtoken');

/**
 * Tạo Access Token
 * @param {Object} user - Đối tượng user từ database
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION || '1h' }
  );
};

/**
 * Tạo Refresh Token
 * @param {Object} user - Đối tượng user từ database
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' }
  );
};

/**
 * Lấy thời gian hết hạn của Access Token tính bằng giây
 */
const getAccessTokenExpirationInSeconds = () => {
  const expiration = process.env.JWT_EXPIRATION || '3600s';
  if (expiration.endsWith('s')) return parseInt(expiration);
  if (expiration.endsWith('m')) return parseInt(expiration) * 60;
  if (expiration.endsWith('h')) return parseInt(expiration) * 3600;
  if (expiration.endsWith('d')) return parseInt(expiration) * 86400;
  return 3600;
};

/**
 * Xác thực Refresh Token
 * @param {string} token - Refresh Token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Refresh token không hợp lệ hoặc đã hết hạn');
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getAccessTokenExpirationInSeconds,
};
