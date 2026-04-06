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

const generateHint = (keyword, category) => {
  const hints = {
    "địa điểm": [
      `Một địa điểm công cộng nơi mọi người thường xuyên lui tới.`,
      `Không gian này được thiết kế để phục vụ nhu cầu sinh hoạt hoặc cộng đồng.`,
      `Đây là một vị trí cố định trên bản đồ với chức năng cụ thể.`,
      `Nơi này có cấu trúc hạ tầng dành cho nhiều người cùng sử dụng.`,
      `Một không gian mà bạn có thể ghé thăm để thực hiện các hoạt động xã hội.`,
      `Vị trí này rất quen thuộc trong môi trường đô thị hoặc khu dân cư.`,
      `Một cơ sở hạ tầng phục vụ nhu cầu vật chất hoặc tinh thần của bạn.`,
      `Nơi này được tổ chức để tiếp đón khách hàng hoặc người dân.`
    ],
    "đồ vật": [
      `Một vật dụng hữu ích giúp hỗ trợ con người trong đời sống.`,
      `Đồ vật này có kích thước và hình dáng phục vụ một mục đích rõ ràng.`,
      `Bạn có thể tìm thấy vật dụng này trong nhà hoặc tại nơi làm việc.`,
      `Nó được chế tạo để giúp thực hiện một công việc cụ thể dễ dàng hơn.`,
      `Một công cụ quen thuộc mà con người thường xuyên tiếp xúc.`,
      `Đồ vật này có các tính năng đặc thù phục vụ nhu cầu cá nhân.`,
      `Vật thể này có cấu tạo từ các vật liệu bền vững hoặc nhân tạo.`,
      `Nó là một phần của bộ trang thiết bị sinh hoạt hàng ngày.`
    ],
    "động vật": [
      `Một loài sinh vật sống với những đặc tính sinh học riêng biệt.`,
      `Loài vật này đóng một vai trò quan trọng trong hệ sinh thái tự nhiên.`,
      `Bạn có thể tìm thấy sinh vật này trong tự nhiên hoặc môi trường nuôi dưỡng.`,
      `Nó có hình dáng và tập tính đặc trưng của nhóm loài này.`,
      `Một đại diện tiêu biểu của thế giới động vật xung quanh chúng ta.`,
      `Sinh vật này có những nhu cầu cơ bản để sinh tồn và phát triển.`,
      `Nó có khả năng tương tác với môi trường theo cách thức riêng.`,
      `Một loài vật có mặt trong các câu chuyện hoặc đời sống thường nhật.`
    ],
    "đồ ăn": [
      `Một loại thực phẩm cung cấp năng lượng và dưỡng chất cho cơ thể.`,
      `Món đồ này có hương vị và cách thưởng thức rất đặc trưng.`,
      `Đây là thứ bạn có thể tìm thấy trong các thực đơn hàng ngày.`,
      `Một sản phẩm của ẩm thực được chế biến theo quy trình nhất định.`,
      `Bạn có thể thưởng thức nó để cảm nhận sự đa dạng của ẩm thực.`,
      `Món này mang lại cảm giác ngon miệng và thỏa mãn vị giác.`,
      `Nó thuộc nhóm các sản phẩm ăn uống phổ biến.`,
      `Một thứ thực phẩm có thể tìm thấy tại các cửa hàng hoặc nhà bếp.`
    ],
    "nghề nghiệp": [
      `Một vai trò chuyên môn giúp con người đóng góp cho xã hội.`,
      `Công việc này đòi hỏi kiến thức và kỹ năng trong một lĩnh vực cụ thể.`,
      `Người làm nghề này thường có trách nhiệm hỗ trợ cộng đồng.`,
      `Đây là một vị trí nghề nghiệp ổn định trong cơ cấu xã hội.`,
      `Một công việc mang lại giá trị kinh tế hoặc tinh thần cho mọi người.`,
      `Nghề nghiệp này có những tiêu chuẩn đạo đức và kỹ năng riêng.`,
      `Vị trí này giúp giải quyết các vấn đề phát sinh trong cuộc sống.`,
      `Một công việc mà bạn cần phải trải qua quá trình đào tạo nhất định.`
    ],
    "cảm xúc": [
      `Một trạng thái tâm lý nảy sinh từ các trải nghiệm cá nhân.`,
      `Cảm giác này phản ánh thái độ của con người đối với các sự kiện.`,
      `Đây là một cung bậc cảm xúc phổ biến mà ai cũng từng trải qua.`,
      `Trạng thái tâm trạng này có thể ảnh hưởng đến cách bạn hành động.`,
      `Một biểu hiện nội tâm giúp nhận diện cảm nhận của bản thân.`,
      `Cảm xúc này có thể kéo dài hoặc thay đổi tùy theo hoàn cảnh.`,
      `Nó đóng vai trò quan trọng trong việc thấu hiểu tâm lý con người.`,
      `Một trạng thái tinh thần mang sắc thái đặc trưng riêng.`
    ]
  };

  const categoryHints = hints[category] || [`Một khái niệm thuộc lĩnh vực ${category}.` ];
  
  // Hash keyword để lấy hint khác nhau cho từ khóa khác nhau
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) {
    hash = ((hash << 5) - hash) + keyword.charCodeAt(i);
    hash |= 0;
  }
  
  const index = Math.abs(hash) % categoryHints.length;
  return categoryHints[index];
};

module.exports = {
  seedKeywords,
  getRandomKeywordPair,
  generateHint
};
