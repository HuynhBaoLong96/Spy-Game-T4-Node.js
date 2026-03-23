const User = require('../models/User');

/**
 * Tìm người dùng bằng username hoặc email
 */
const findByUsernameOrEmail = async (usernameOrEmail) => {
  return await User.findOne({
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }]
  }).select('+passwordHash'); // Bao gồm cả passwordHash để kiểm tra đăng nhập
};

/**
 * Đăng ký người dùng mới
 */
const registerUser = async (userData) => {
  const { username, email, password, displayName, role } = userData;

  // Kiểm tra trùng lặp
  const userExists = await User.findOne({ $or: [{ username }, { email }] });
  if (userExists) {
    throw new Error('Tên đăng nhập hoặc email đã tồn tại');
  }

  // Tạo người dùng mới (passwordHash sẽ được mã hóa tự động ở User model pre-save)
  const user = await User.create({
    username,
    email,
    passwordHash: password, // Sẽ được hash tự động
    displayName: displayName || username,
    role: role || 'ROLE_USER'
  });

  return user;
};

module.exports = {
  findByUsernameOrEmail,
  registerUser,
};
