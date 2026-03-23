const mongoose = require('mongoose');

// Hàm kết nối đến cơ sở dữ liệu MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Đã kết nối MongoDB: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Lỗi kết nối MongoDB: ${error.message}`);
    process.exit(1); // Thoát chương trình nếu không thể kết nối DB
  }
};

module.exports = connectDB;
