const { registerUser, findByUsernameOrEmail } = require('../services/userService');
const { generateAccessToken, generateRefreshToken, getAccessTokenExpirationInSeconds } = require('../services/authService');

/**
 * @desc    Đăng ký người dùng
 * @route   POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password, display_name, role } = req.body;

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

module.exports = {
  register,
  login,
};
