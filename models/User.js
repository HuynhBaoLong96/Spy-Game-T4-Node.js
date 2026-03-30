const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Vui lòng nhập tên đăng nhập'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Vui lòng nhập email'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Vui lòng nhập email hợp lệ']
  },
  displayName: {
    type: String,
    trim: true
  },
  avatarUrl: {
    type: String,
    default: ''
  },
  passwordHash: {
    type: String,
    required: [true, 'Vui lòng nhập mật khẩu'],
    minlength: 6,
    select: false // Không tự động trả về password khi truy vấn
  },
  role: {
    type: String,
    enum: ['ROLE_USER', 'ROLE_ADMIN'],
    default: 'ROLE_USER'
  },
  active: {
    type: Boolean,
    default: true
  },
  // --- ECONOMY SYSTEM ---
  balance: {
    type: Number,
    default: 500
  },
  rankingPoints: {
    type: Number,
    default: 0
  },
  lastCheckinDate: {
    type: Date
  },
  checkinStreak: {
    type: Number,
    default: 0
  },
  // ----------------------
  // --- FORGOT PASSWORD ---
  resetToken: {
    type: String
  },
  resetTokenExpiry: {
    type: Date
  },
  // ----------------------
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Tự động thêm updatedAt
});

// Mã hóa mật khẩu trước khi lưu vào database
userSchema.pre('save', async function() {
  if (!this.isModified('passwordHash')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// Phương thức kiểm tra mật khẩu
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
