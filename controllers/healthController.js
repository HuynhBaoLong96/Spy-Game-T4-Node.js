// Hàm này sẽ xử lý logic khi có yêu cầu đến
const healthCheck = (req, res) => {
  // Tạo một đối tượng JavaScript
  const response = {
    status: 'UP',
  };
  // Dùng res.json() để gửi đối tượng đó về cho client dưới dạng JSON
  res.json(response);
};

// "Xuất" hàm này ra để các tệp khác có thể "nhập" và sử dụng
module.exports = {
  healthCheck,
};