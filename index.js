// Tải các biến môi trường từ tệp .env vào process.env
require('dotenv').config();

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

const port = process.env.PORT || 8081;

// Middlewares tiêu chuẩn
app.use(logger); // Ghi log mọi request
app.use(cors());
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

// Gắn các routes vào ứng dụng
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/keywords', keywordRoutes);

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
