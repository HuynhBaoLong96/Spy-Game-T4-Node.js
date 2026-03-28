const { registerUser, findByUsernameOrEmail, findByEmail, generateResetToken, verifyResetToken, processPasswordReset, changePassword } = require('../services/userService');
const { generateAccessToken, generateRefreshToken, getAccessTokenExpirationInSeconds } = require('../services/authService');
const { sendResetPasswordEmail } = require('../services/emailService');

/**
 * @desc    Đăng ký người dùng
 * @route   POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password, confirm_password, display_name, role } = req.body;

    // Kiểm tra xác nhận mật khẩu
    if (password !== confirm_password) {
      res.status(400);
      throw new Error('Mật khẩu xác nhận không khớp');
    }

    const user = await registerUser({
      username,
      email,
      password,
      displayName: display_name,
      role
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Trả về cấu trúc JSON y hệt backend Java
    res.status(201).json({
      user_id: user._id,
      username: user.username,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      role: user.role,
      balance: user.balance,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: getAccessTokenExpirationInSeconds()
    });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

/**
 * @desc    Đăng nhập
 * @route   POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const identifier = username || email;

    if (!identifier || !password) {
      res.status(400);
      throw new Error('Vui lòng cung cấp tên đăng nhập/email và mật khẩu');
    }

    const user = await findByUsernameOrEmail(identifier);

    if (user && (await user.matchPassword(password))) {
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.json({
        user_id: user._id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        role: user.role,
        balance: user.balance,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: getAccessTokenExpirationInSeconds()
      });
    } else {
      res.status(401);
      throw new Error('Tên đăng nhập hoặc mật khẩu không đúng');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Quên mật khẩu
 * @route   POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { username, email } = req.body;
    const user = await findByEmail(email);

    // Kiểm tra xem email có tồn tại và khớp với username không
    if (!user || user.username !== username) {
      // Bảo mật: Không thông báo là thông tin không khớp để tránh rò rỉ dữ liệu
      return res.json({ message: 'Nếu thông tin khớp với hệ thống, mã xác nhận sẽ được gửi đi.' });
    }

    const token = await generateResetToken(user);
    await sendResetPasswordEmail(user.email, token);

    res.json({ message: 'Mã xác nhận đã được gửi đến email của bạn.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Xác minh mã reset mật khẩu
 * @route   POST /api/auth/verify-reset-token
 */
const verifyResetTokenController = async (req, res, next) => {
  try {
    const { username, email, token } = req.body;
    const user = await findByEmail(email);

    if (!user || user.username !== username) {
      res.status(400);
      throw new Error('Thông tin tài khoản không khớp.');
    }

    const isValid = await verifyResetToken(email, token);
    if (isValid) {
      res.json({ message: 'Mã xác nhận hợp lệ.' });
    } else {
      res.status(400);
      throw new Error('Mã xác nhận không hợp lệ hoặc đã hết hạn.');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Đặt lại mật khẩu
 * @route   POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, token, new_password } = req.body;
    const success = await processPasswordReset(email, token, new_password);

    if (success) {
      res.json({ message: 'Mật khẩu đã được đặt lại thành công.' });
    } else {
      res.status(400);
      throw new Error('Yêu cầu không hợp lệ. Vui lòng thử lại từ đầu.');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Đổi mật khẩu (khi đang đăng nhập)
 * @route   POST /api/auth/change-password
 */
const changePasswordController = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    const username = req.user.username;

    const success = await changePassword(username, old_password, new_password);

    if (success) {
      res.json({ message: 'Đổi mật khẩu thành công.' });
    } else {
      res.status(400);
      throw new Error('Mật khẩu cũ không chính xác.');
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  verifyResetToken: verifyResetTokenController,
  resetPassword,
  changePassword: changePasswordController,
};
