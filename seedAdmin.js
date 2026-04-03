const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const seedAdmin = async () => {
  try {
    // Kết nối database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Đang kết nối tới Database...');

    // Kiểm tra admin1 đã tồn tại chưa
    const adminExists = await User.findOne({ username: 'admin1' });

    if (adminExists) {
      console.log('Tài khoản admin1 đã tồn tại. Đang cập nhật mật khẩu và role...');
      adminExists.passwordHash = '1234567'; // Hook pre-save sẽ tự hash
      adminExists.role = 'ROLE_ADMIN';
      adminExists.email = 'admin1@spygame.com';
      await adminExists.save();
      console.log('Cập nhật tài khoản Admin1 thành công!');
    } else {
      console.log('Đang tạo tài khoản admin1 mới...');
      await User.create({
        username: 'admin1',
        email: 'admin1@spygame.com',
        displayName: 'Administrator 1',
        passwordHash: '1234567',
        role: 'ROLE_ADMIN',
        balance: 999999
      });
      console.log('Tạo tài khoản Admin1 thành công!');
    }

    console.log('---------------------------');
    console.log('Username: admin1');
    console.log('Password: 1234567');
    console.log('Role: ROLE_ADMIN');
    console.log('---------------------------');

    process.exit();
  } catch (error) {
    console.error('Lỗi khi tạo admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
