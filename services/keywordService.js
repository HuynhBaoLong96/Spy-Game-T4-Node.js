const KeywordPair = require('../models/KeywordPair');

/**
 * Seed dữ liệu từ điển từ khóa nếu database trống
 */
const seedKeywords = async () => {
  const count = await KeywordPair.countDocuments();
  if (count > 0) return;

  const pairs = [
    // Địa điểm
    { civilianKeyword: "Bãi biển", spyKeyword: "Hồ bơi", category: "địa điểm" },
    { civilianKeyword: "Siêu thị", spyKeyword: "Chợ", category: "địa điểm" },
    { civilianKeyword: "Bệnh viện", spyKeyword: "Phòng khám", category: "địa điểm" },
    { civilianKeyword: "Trường học", spyKeyword: "Trung tâm học", category: "địa điểm" },
    { civilianKeyword: "Sân bay", spyKeyword: "Bến tàu", category: "địa điểm" },
    { civilianKeyword: "Rạp chiếu phim", spyKeyword: "Nhà hát", category: "địa điểm" },
    { civilianKeyword: "Công viên", spyKeyword: "Vườn thực vật", category: "địa điểm" },
    { civilianKeyword: "Khách sạn", spyKeyword: "Nhà nghỉ", category: "địa điểm" },
    { civilianKeyword: "Nhà hàng", spyKeyword: "Quán ăn", category: "địa điểm" },
    { civilianKeyword: "Thư viện", spyKeyword: "Nhà sách", category: "địa điểm" },

    // Đồ vật
    { civilianKeyword: "Điện thoại", spyKeyword: "Máy tính bảng", category: "đồ vật" },
    { civilianKeyword: "Xe đạp", spyKeyword: "Xe máy", category: "đồ vật" },
    { civilianKeyword: "Bàn phím", spyKeyword: "Chuột máy tính", category: "đồ vật" },
    { civilianKeyword: "Tivi", spyKeyword: "Màn hình máy tính", category: "đồ vật" },
    { civilianKeyword: "Máy giặt", spyKeyword: "Máy sấy", category: "đồ vật" },
    { civilianKeyword: "Nồi cơm điện", spyKeyword: "Lò vi sóng", category: "đồ vật" },
    { civilianKeyword: "Bàn chải đánh răng", spyKeyword: "Bàn chải tóc", category: "đồ vật" },
    { civilianKeyword: "Ví tiền", spyKeyword: "Túi xách", category: "đồ vật" },
    { civilianKeyword: "Kính mắt", spyKeyword: "Kính áp tròng", category: "đồ vật" },
    { civilianKeyword: "Máy ảnh", spyKeyword: "Điện thoại chụp ảnh", category: "đồ vật" },

    // Động vật
    { civilianKeyword: "Chó", spyKeyword: "Mèo", category: "động vật" },
    { civilianKeyword: "Sư tử", spyKeyword: "Hổ", category: "động vật" },
    { civilianKeyword: "Cá heo", spyKeyword: "Cá mập", category: "động vật" },
    { civilianKeyword: "Đại bàng", spyKeyword: "Diều hâu", category: "động vật" },
    { civilianKeyword: "Voi", spyKeyword: "Tê giác", category: "động vật" },
    { civilianKeyword: "Thỏ", spyKeyword: "Sóc", category: "động vật" },
    { civilianKeyword: "Gà", spyKeyword: "Vịt", category: "động vật" },
    { civilianKeyword: "Rắn", spyKeyword: "Thằn lằn", category: "động vật" },
    { civilianKeyword: "Cua", spyKeyword: "Tôm", category: "động vật" },
    { civilianKeyword: "Bướm", spyKeyword: "Ong", category: "động vật" },

    // Đồ ăn
    { civilianKeyword: "Phở", spyKeyword: "Bún bò", category: "đồ ăn" },
    { civilianKeyword: "Cơm tấm", spyKeyword: "Cơm chiên", category: "đồ ăn" },
    { civilianKeyword: "Bánh mì", spyKeyword: "Bánh bao", category: "đồ ăn" },
    { civilianKeyword: "Pizza", spyKeyword: "Hamburger", category: "đồ ăn" },
    { civilianKeyword: "Sushi", spyKeyword: "Ramen", category: "đồ ăn" },
    { civilianKeyword: "Kem", spyKeyword: "Chè", category: "đồ ăn" },
    { civilianKeyword: "Cà phê", spyKeyword: "Trà sữa", category: "đồ ăn" },
    { civilianKeyword: "Nước cam", spyKeyword: "Nước chanh", category: "đồ ăn" },
    { civilianKeyword: "Xoài", spyKeyword: "Dứa", category: "đồ ăn" },
    { civilianKeyword: "Chocolate", spyKeyword: "Kẹo cao su", category: "đồ ăn" },

    // Nghề nghiệp
    { civilianKeyword: "Bác sĩ", spyKeyword: "Y tá", category: "nghề nghiệp" },
    { civilianKeyword: "Giáo viên", spyKeyword: "Giảng viên", category: "nghề nghiệp" },
    { civilianKeyword: "Cảnh sát", spyKeyword: "Bảo vệ", category: "nghề nghiệp" },
    { civilianKeyword: "Đầu bếp", spyKeyword: "Phụ bếp", category: "nghề nghiệp" },
    { civilianKeyword: "Lập trình viên", spyKeyword: "Kỹ sư phần mềm", category: "nghề nghiệp" },
    { civilianKeyword: "Kiến trúc sư", spyKeyword: "Kỹ sư xây dựng", category: "nghề nghiệp" },
    { civilianKeyword: "Ca sĩ", spyKeyword: "Nhạc sĩ", category: "nghề nghiệp" },
    { civilianKeyword: "Diễn viên", spyKeyword: "Đạo diễn", category: "nghề nghiệp" },
    { civilianKeyword: "Phi công", spyKeyword: "Tiếp viên hàng không", category: "nghề nghiệp" },
    { civilianKeyword: "Nông dân", spyKeyword: "Ngư dân", category: "nghề nghiệp" },

    // Cảm xúc
    { civilianKeyword: "Vui vẻ", spyKeyword: "Phấn khích", category: "cảm xúc" },
    { civilianKeyword: "Buồn", spyKeyword: "Thất vọng", category: "cảm xúc" },
    { civilianKeyword: "Tức giận", spyKeyword: "Bực bội", category: "cảm xúc" },
    { civilianKeyword: "Sợ hãi", spyKeyword: "Lo lắng", category: "cảm xúc" },
    { civilianKeyword: "Ngạc nhiên", spyKeyword: "Bất ngờ", category: "cảm xúc" }
  ];

  await KeywordPair.insertMany(pairs);
  console.log('Đã nạp từ điển từ khóa thành công!');
};

/**
 * Lấy ngẫu nhiên một cặp từ khóa
 */
const getRandomKeywordPair = async () => {
  const count = await KeywordPair.countDocuments();
  const random = Math.floor(Math.random() * count);
  return await KeywordPair.findOne().skip(random);
};

module.exports = {
  seedKeywords,
  getRandomKeywordPair,
};
