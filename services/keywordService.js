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

/**
 * Tạo đoạn mô tả ngắn (hint) cho từ khóa
 */
const generateHint = (keyword, category) => {
  const hints = {
    "địa điểm": [
      `Một nơi bạn có thể ghé thăm để giải trí hoặc làm việc.`,
      `Đây là một địa điểm quen thuộc trong cuộc sống hàng ngày.`,
      `Bạn thường đến đây khi có nhu cầu cụ thể liên quan đến ${category}.`
    ],
    "đồ vật": [
      `Một vật dụng hữu ích mà con người thường sử dụng.`,
      `Đồ vật này có thể cầm nắm hoặc điều khiển được.`,
      `Nó phục vụ cho mục đích sinh hoạt hoặc công việc.`
    ],
    "động vật": [
      `Một loài sinh vật sống trong tự nhiên hoặc được nuôi dưỡng.`,
      `Loài vật này có những đặc điểm nhận dạng riêng biệt.`,
      `Nó thuộc nhóm các loài ${category}.`
    ],
    "đồ ăn": [
      `Một món ăn hoặc thức uống phổ biến.`,
      `Bạn có thể thưởng thức nó để nạp năng lượng.`,
      `Hương vị của nó rất đặc trưng cho nhóm ${category}.`
    ],
    "nghề nghiệp": [
      `Một công việc mà con người thực hiện để đóng góp cho xã hội.`,
      `Người làm nghề này cần có kỹ năng và kiến thức chuyên môn.`,
      `Vị trí này rất quan trọng trong lĩnh vực ${category}.`
    ],
    "cảm xúc": [
      `Trạng thái tâm lý của con người trước một sự việc.`,
      `Cảm giác này có thể ảnh hưởng đến hành động của bạn.`,
      `Đây là một cung bậc cảm xúc trong nhóm ${category}.`
    ]
  };

  const categoryHints = hints[category] || [`Một khái niệm thuộc lĩnh vực ${category}.`];
  return categoryHints[Math.floor(Math.random() * categoryHints.length)];
};

module.exports = {
  seedKeywords,
  getRandomKeywordPair,
  generateHint
};
