// Tải các biến môi trường từ tệp .env vào process.env
require('dotenv').config();

// Đảm bảo mỗi lần restart server sẽ có một JWT_SECRET mới nếu không được cấu hình cố định
// Điều này giúp ngăn chặn việc tự động đăng nhập từ các session cũ khi restart bài test
if (!process.env.JWT_SECRET_FIXED) {
  process.env.JWT_SECRET = process.env.JWT_SECRET + Math.random().toString(36).substring(7);
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');
const logger = require('./middleware/loggerMiddleware');
const { apiLimiter } = require('./middleware/rateLimitMiddleware');
const socketService = require('./services/socketService');
const { seedKeywords } = require('./services/keywordService');

// Kết nối đến cơ sở dữ liệu MongoDB
connectDB().then(() => {
  seedKeywords(); // Nạp từ điển từ khóa nếu DB trống
});

const app = express();
const server = http.createServer(app);

// Khởi tạo socketService với STOMP broker
socketService.init(server);

const port = process.env.PORT || 8080;

// Middlewares tiêu chuẩn
app.use(logger); // Ghi log mọi request
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:8080',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true,
}));
app.use(apiLimiter); // Giới hạn tần suất chung
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Nhập các routes
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/room');
const gameRoutes = require('./routes/game');
const economyRoutes = require('./routes/economy');
const userRoutes = require('./routes/user');
const keywordRoutes = require('./routes/keyword');
const matchRoutes = require('./routes/match');
const shopRoutes = require('./routes/shop');
const skillRoutes = require('./routes/skill');

// Gắn các routes vào ứng dụng
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/skill', skillRoutes);

// Endpoint mặc định
app.get('/', (req, res) => {
  res.send('Máy chủ Node.js Spy Game đang chạy (STOMP enabled)...');
});

// Middleware xử lý lỗi
app.use(errorHandler);

server.listen(port, () => {
  console.log(`Máy chủ đang chạy tại http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
});