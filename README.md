# Spy Game Backend (Node.js)

Chào mừng bạn đến với dự án Backend của trò chơi **Keyword Spy** phiên bản Node.js. Dự án này được xây dựng bằng Express, MongoDB và Socket.io.

## 🚀 Công nghệ sử dụng

- **Runtime:** [Node.js](https://nodejs.org/)
- **Framework:** [Express 5](https://expressjs.com/)
- **Cơ sở dữ liệu:** [MongoDB](https://www.mongodb.com/) (thông qua [Mongoose](https://mongoosejs.com/))
- **Xác thực:** [JSON Web Token (JWT)](https://jwt.io/) & [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
- **WebSocket:** [Socket.io](https://socket.io/) (hỗ trợ giao thức STOMP thông qua `socketService`)
- **Middleware:** [CORS](https://github.com/expressjs/cors), [Express Rate Limit](https://github.com/express-rate-limit/express-rate-limit), [Express Validator](https://express-validator.github.io/)

## 🛠 Hướng dẫn cài đặt

Sau khi clone dự án về máy, hãy thực hiện các bước sau:

### 1. Cài đặt các gói phụ thuộc (Dependencies)

Mở terminal tại thư mục `spy-game-backend-node` và chạy:

```bash
npm install
```

### 2. Cấu hình biến môi trường

Tạo một file `.env` tại thư mục gốc của dự án và cấu hình các giá trị sau:

```env
# Cổng chạy server
PORT=8081

# Chuỗi kết nối MongoDB
MONGODB_URI=mongodb://localhost:27017/spy-game

# Khóa bí mật JWT
JWT_SECRET=your_jwt_secret_key_here

# Cấu hình Email (để gửi mã reset password)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 3. Chạy dự án ở chế độ phát triển

```bash
# Chạy trực tiếp
node index.js

# Hoặc sử dụng nodemon nếu đã cài đặt
npx nodemon index.js
```

Máy chủ sẽ chạy tại địa chỉ: `http://localhost:8080/`

## 📁 Cấu trúc thư mục chính

- `config/`: Cấu hình kết nối cơ sở dữ liệu.
- `controllers/`: Xử lý logic cho các yêu cầu HTTP (Auth, Room, Game, ...).
- `models/`: Định nghĩa các Mongoose Schemas (User, Match, Room, ...).
- `routes/`: Định nghĩa các API endpoints và gắn middleware.
- `services/`: Chứa logic nghiệp vụ chính (Game engine, Socket handling, Email service).
- `middleware/`: Các bộ lọc xử lý trung gian (Xác thực, Phân quyền, Ghi log, Giới hạn tần suất).
- `index.js`: Điểm khởi đầu của ứng dụng, thiết lập server và kết nối.

## 🔑 Các luồng quan trọng

1. **Xác thực (Auth):**
   - Đăng ký & Đăng nhập: Trả về Access Token (JWT).
   - Middleware `authMiddleware` kiểm tra token hợp lệ trước khi cho phép truy cập các route bảo mật.

2. **WebSocket (Real-time):**
   - Sử dụng `socketService` để quản lý kết nối.
   - Hỗ trợ giao thức STOMP để tương thích với Frontend.
   - Endpoint: `ws://localhost:8080/ws`

3. **Game Logic:**
   - Quản lý trạng thái phòng (Room), trận đấu (Match) và các vòng chơi (Round) thông qua `gameService`.

## 📝 Lưu ý cho thành viên

- Đảm bảo **MongoDB** đang chạy trước khi khởi động server.
- Khi thêm Route mới, hãy nhớ đăng ký nó trong file `index.js`.
- Luôn kiểm tra tính hợp lệ của dữ liệu đầu vào bằng `validateMiddleware`.
test 
