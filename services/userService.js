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
 * Tìm người dùng bằng email
 */
const findByEmail = async (email) => {
  return await User.findOne({ email });
};

/**
 * Tạo token reset mật khẩu ngẫu nhiên 6 chữ số
 */
const generateResetToken = async (user) => {
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetToken = token;
  user.resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 phút
  await user.save();
  return token;
};

/**
 * Xác minh token reset mật khẩu
 */
const verifyResetToken = async (email, token) => {
  const user = await User.findOne({ email });
  if (user) {
    return (
      token === user.resetToken &&
      user.resetTokenExpiry &&
      user.resetTokenExpiry > Date.now()
    );
  }
  return false;
};

/**
 * Xử lý đặt lại mật khẩu
 */
const processPasswordReset = async (email, token, newPassword) => {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) return false;

  // Kiểm tra token có hợp lệ không
  if (
    token !== user.resetToken ||
    !user.resetTokenExpiry ||
    user.resetTokenExpiry < Date.now()
  ) {
    return false;
  }

  // Cập nhật mật khẩu mới (bcrypt hash được xử lý trong User model pre-save)
  user.passwordHash = newPassword;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();
  return true;
};

/**
 * Đổi mật khẩu cho người dùng đang đăng nhập
 */
const changePassword = async (username, oldPassword, newPassword) => {
  const user = await User.findOne({ username }).select('+passwordHash');
  if (!user) throw new Error('Không tìm thấy người dùng');

  // Kiểm tra mật khẩu cũ
  const isMatch = await user.matchPassword(oldPassword);
  if (!isMatch) return false;

  // Cập nhật mật khẩu mới
  user.passwordHash = newPassword;
  // Xóa các token reset nếu có
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();
  return true;
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
  findByEmail,
  generateResetToken,
  verifyResetToken,
  processPasswordReset,
  changePassword,
  registerUser,
};
