const KeywordPair = require('../models/KeywordPair');

/**
 * Seed dữ liệu từ điển từ khóa nếu database trống
 */
const seedKeywords = async () => {
  const count = await KeywordPair.countDocuments();
  if (count > 0) return;

  const pairs = [
    // Địa điểm
    { civilianKeyword: "Bãi biển", spyKeyword: "Hồ bơi", civilianDescription: "Nơi có nhiều cát, nước mặn và sóng vỗ rì rào.", spyDescription: "Nơi có làn nước trong xanh, thường nằm trong các khu nghỉ dưỡng hoặc nhà riêng.", category: "địa điểm" },
    { civilianKeyword: "Siêu thị", spyKeyword: "Chợ", civilianDescription: "Nơi mua sắm hiện đại, có máy lạnh và xe đẩy hàng.", spyDescription: "Nơi mua bán truyền thống, thường họp vào buổi sáng sớm.", category: "địa điểm" },
    { civilianKeyword: "Bệnh viện", spyKeyword: "Phòng khám", civilianDescription: "Cơ sở y tế quy mô lớn với nhiều khoa và giường bệnh.", spyDescription: "Cơ sở y tế quy mô nhỏ, thường do bác sĩ tư nhân vận hành.", category: "địa điểm" },
    { civilianKeyword: "Trường học", spyKeyword: "Trung tâm học", civilianDescription: "Nơi học tập chính quy dành cho học sinh, sinh viên.", spyDescription: "Nơi bồi dưỡng kiến thức ngoài giờ học chính khóa.", category: "địa điểm" },
    { civilianKeyword: "Sân bay", spyKeyword: "Bến tàu", civilianDescription: "Nơi những con chim sắt khổng lồ cất cánh và hạ cánh.", spyDescription: "Nơi các phương tiện giao thông đường thủy neo đậu.", category: "địa điểm" },
    { civilianKeyword: "Rạp chiếu phim", spyKeyword: "Nhà hát", civilianDescription: "Nơi thưởng thức các tác phẩm điện ảnh trên màn ảnh rộng.", spyDescription: "Nơi biểu diễn các loại hình nghệ thuật sân khấu trực tiếp.", category: "địa điểm" },
    { civilianKeyword: "Công viên", spyKeyword: "Vườn thực vật", civilianDescription: "Không gian xanh công cộng cho mọi người vui chơi, tập thể dục.", spyDescription: "Nơi bảo tồn và trưng bày nhiều loài cây quý hiếm.", category: "địa điểm" },
    { civilianKeyword: "Khách sạn", spyKeyword: "Nhà nghỉ", civilianDescription: "Cơ sở lưu trú cao cấp với nhiều dịch vụ tiện ích.", spyDescription: "Cơ sở lưu trú bình dân, phục vụ nhu cầu nghỉ ngơi cơ bản.", category: "địa điểm" },
    { civilianKeyword: "Nhà hàng", spyKeyword: "Quán ăn", civilianDescription: "Nơi phục vụ ăn uống sang trọng với thực đơn đa dạng.", spyDescription: "Địa điểm ăn uống bình dân, gần gũi với đời sống hàng ngày.", category: "địa điểm" },
    { civilianKeyword: "Thư viện", spyKeyword: "Nhà sách", civilianDescription: "Nơi lưu trữ và cho mượn sách miễn phí phục vụ nghiên cứu.", spyDescription: "Nơi trưng bày và bán các loại ấn phẩm văn hóa.", category: "địa điểm" },

    // Đồ vật
    { civilianKeyword: "Điện thoại", spyKeyword: "Máy tính bảng", civilianDescription: "Vật bất ly thân dùng để liên lạc và giải trí hàng ngày.", spyDescription: "Thiết bị màn hình lớn, nằm giữa điện thoại và máy tính xách tay.", category: "đồ vật" },
    { civilianKeyword: "Xe đạp", spyKeyword: "Xe máy", civilianDescription: "Phương tiện hai bánh chạy bằng sức người, thân thiện môi trường.", spyDescription: "Phương tiện hai bánh chạy bằng động cơ, phổ biến ở Việt Nam.", category: "đồ vật" },
    { civilianKeyword: "Bàn phím", spyKeyword: "Chuột máy tính", civilianDescription: "Thiết bị dùng để nhập liệu văn bản vào máy tính.", spyDescription: "Thiết bị dùng để điều khiển con trỏ trên màn hình.", category: "đồ vật" },
    { civilianKeyword: "Tivi", spyKeyword: "Màn hình máy tính", civilianDescription: "Thiết bị truyền hình dùng để xem tin tức và phim ảnh tại gia.", spyDescription: "Thiết bị hiển thị hình ảnh trực tiếp từ bộ xử lý trung tâm.", category: "đồ vật" },
    { civilianKeyword: "Máy giặt", spyKeyword: "Máy sấy", civilianDescription: "Thiết bị gia dụng dùng để làm sạch quần áo tự động.", spyDescription: "Thiết bị dùng để làm khô quần áo nhanh chóng sau khi giặt.", category: "đồ vật" },
    { civilianKeyword: "Nồi cơm điện", spyKeyword: "Lò vi sóng", civilianDescription: "Vật dụng không thể thiếu để nấu chín loại ngũ cốc chính của người Việt.", spyDescription: "Thiết bị dùng sóng điện từ để hâm nóng thức ăn nhanh chóng.", category: "đồ vật" },
    { civilianKeyword: "Bàn chải đánh răng", spyKeyword: "Bàn chải tóc", civilianDescription: "Vật dụng vệ sinh cá nhân dùng cho răng miệng mỗi sáng.", spyDescription: "Dụng cụ dùng để làm mượt và tạo kiểu cho mái tóc.", category: "đồ vật" },
    { civilianKeyword: "Ví tiền", spyKeyword: "Túi xách", civilianDescription: "Vật nhỏ gọn dùng để đựng tiền mặt và các loại thẻ.", spyDescription: "Phụ kiện thời trang dùng để mang theo nhiều vật dụng cá nhân.", category: "đồ vật" },
    { civilianKeyword: "Kính mắt", spyKeyword: "Kính áp tròng", civilianDescription: "Phụ kiện hỗ trợ thị lực hoặc thời trang đeo trên sống mũi.", spyDescription: "Thấu kính mỏng đặt trực tiếp lên bề mặt con ngươi.", category: "đồ vật" },
    { civilianKeyword: "Máy ảnh", spyKeyword: "Điện thoại chụp ảnh", civilianDescription: "Thiết bị chuyên dụng để ghi lại những khoảnh khắc đẹp.", spyDescription: "Công cụ đa năng tích hợp khả năng ghi hình kỹ thuật số.", category: "đồ vật" },

    // Động vật
    { civilianKeyword: "Chó", spyKeyword: "Mèo", civilianDescription: "Loài vật trung thành, được coi là người bạn tốt nhất của con người.", spyDescription: "Loài vật nhanh nhẹn, thích bắt chuột và ngủ nướng.", category: "động vật" },
    { civilianKeyword: "Sư tử", spyKeyword: "Hổ", civilianDescription: "Được mệnh danh là chúa tể rừng xanh với tiếng gầm vang dội.", spyDescription: "Loài thú săn mồi dũng mãnh với những đường vằn đặc trưng.", category: "động vật" },
    { civilianKeyword: "Cá heo", spyKeyword: "Cá mập", civilianDescription: "Loài động vật biển thông minh, thân thiện và hay cứu người.", spyDescription: "Hung thần đại dương với hàm răng sắc nhọn và khứu giác nhạy bén.", category: "động vật" },
    { civilianKeyword: "Đại bàng", spyKeyword: "Diều hâu", civilianDescription: "Chúa tể bầu trời với tầm nhìn xa và đôi cánh sải rộng.", spyDescription: "Loài chim săn mồi có tốc độ lao xuống cực nhanh.", category: "động vật" },
    { civilianKeyword: "Voi", spyKeyword: "Tê giác", civilianDescription: "Động vật trên cạn lớn nhất với chiếc vòi dài và đôi tai to.", spyDescription: "Loài thú to lớn với lớp da dày và chiếc sừng trên mũi.", category: "động vật" },
    { civilianKeyword: "Thỏ", spyKeyword: "Sóc", civilianDescription: "Loài vật gặm nhấm có đôi tai dài và rất thích ăn cà rốt.", spyDescription: "Động vật nhỏ bé, nhanh nhẹn, có chiếc đuôi xù và thích ăn hạt dẻ.", category: "động vật" },
    { civilianKeyword: "Gà", spyKeyword: "Vịt", civilianDescription: "Loài gia cầm gáy báo thức mỗi buổi sáng sớm.", spyDescription: "Loài chim nước có màng ở chân và tiếng kêu cạp cạp.", category: "động vật" },
    { civilianKeyword: "Rắn", spyKeyword: "Thằn lằn", civilianDescription: "Loài bò sát không chân, di chuyển bằng cách trườn bò.", spyDescription: "Loài bò sát nhỏ có bốn chân, thường bám trên tường nhà.", category: "động vật" },
    { civilianKeyword: "Cua", spyKeyword: "Tôm", civilianDescription: "Loài thủy sinh có lớp vỏ cứng và hai chiếc càng lớn.", spyDescription: "Loài thủy sinh có thân dài, nhiều chân và bơi lùi.", category: "động vật" },
    { civilianKeyword: "Bướm", spyKeyword: "Ong", civilianDescription: "Côn trùng có đôi cánh rực rỡ sắc màu, thường đậu trên hoa.", spyDescription: "Côn trùng chăm chỉ hút mật và có thể đốt người để tự vệ.", category: "động vật" },

    // Đồ ăn
    { civilianKeyword: "Phở", spyKeyword: "Bún bò", civilianDescription: "Món ăn quốc hồn quốc túy của Việt Nam với nước dùng thanh ngọt.", spyDescription: "Món ăn đậm đà hương vị miền Trung với sợi bún to và mắm ruốc.", category: "đồ ăn" },
    { civilianKeyword: "Cơm tấm", spyKeyword: "Cơm chiên", civilianDescription: "Món ăn sáng đặc trưng của Sài Gòn với sườn nướng và bì chả.", spyDescription: "Món cơm được đảo trên chảo nóng cùng với trứng và rau củ.", category: "đồ ăn" },
    { civilianKeyword: "Bánh mì", spyKeyword: "Bánh bao", civilianDescription: "Món ăn đường phố nổi tiếng thế giới với lớp vỏ giòn rụm.", spyDescription: "Món bánh hấp mềm mại với nhân thịt và trứng cút bên trong.", category: "đồ ăn" },
    { civilianKeyword: "Pizza", spyKeyword: "Hamburger", civilianDescription: "Món bánh hình tròn của Ý với lớp phô mai tan chảy bên trên.", spyDescription: "Món bánh mì kẹp thịt bò băm có nguồn gốc từ phương Tây.", category: "đồ ăn" },
    { civilianKeyword: "Sushi", spyKeyword: "Ramen", civilianDescription: "Tinh hoa ẩm thực Nhật Bản với cơm trộn giấm và cá tươi sống.", spyDescription: "Món mì nước trứ danh của xứ sở hoa anh đào.", category: "đồ ăn" },
    { civilianKeyword: "Kem", spyKeyword: "Chè", civilianDescription: "Món giải nhiệt mát lạnh với nhiều hương vị trái cây.", spyDescription: "Món tráng miệng truyền thống nấu từ các loại đậu và đường.", category: "đồ ăn" },
    { civilianKeyword: "Cà phê", spyKeyword: "Trà sữa", civilianDescription: "Thức uống giúp tỉnh táo, đậm đà bản sắc văn hóa Việt.", spyDescription: "Thức uống kết hợp giữa trà, sữa và các loại trân châu.", category: "đồ ăn" },
    { civilianKeyword: "Nước cam", spyKeyword: "Nước chanh", civilianDescription: "Thức uống giàu vitamin C, vắt từ loại quả có vỏ màu cam.", spyDescription: "Thức uống giải khát chua ngọt, vắt từ loại quả nhỏ màu xanh.", category: "đồ ăn" },
    { civilianKeyword: "Xoài", spyKeyword: "Dứa", civilianDescription: "Loài quả nhiệt đới khi chín có màu vàng, vị ngọt lịm.", spyDescription: "Loài quả có nhiều mắt và hương thơm rất đặc trưng.", category: "đồ ăn" },
    { civilianKeyword: "Chocolate", spyKeyword: "Kẹo cao su", civilianDescription: "Món quà ngọt ngào làm từ hạt ca cao, biểu tượng của tình yêu.", spyDescription: "Món ăn vặt dùng để nhai nhưng không được nuốt.", category: "đồ ăn" },

    // Nghề nghiệp
    { civilianKeyword: "Bác sĩ", spyKeyword: "Y tá", civilianDescription: "Người có chuyên môn cao trong việc khám và chữa bệnh.", spyDescription: "Người hỗ trợ đắc lực cho bác sĩ trong việc chăm sóc bệnh nhân.", category: "nghề nghiệp" },
    { civilianKeyword: "Giáo viên", spyKeyword: "Giảng viên", civilianDescription: "Người truyền đạt kiến thức cho học sinh tại các trường phổ thông.", spyDescription: "Người giảng dạy và nghiên cứu tại các trường đại học, cao đẳng.", category: "nghề nghiệp" },
    { civilianKeyword: "Cảnh sát", spyKeyword: "Bảo vệ", civilianDescription: "Người thực thi pháp luật và giữ gìn trật tự an ninh xã hội.", spyDescription: "Người chịu trách nhiệm trông coi và đảm bảo an toàn cho một khu vực cụ thể.", category: "nghề nghiệp" },
    { civilianKeyword: "Đầu bếp", spyKeyword: "Phụ bếp", civilianDescription: "Người chịu trách nhiệm chính trong việc chế biến các món ăn ngon.", spyDescription: "Người hỗ trợ chuẩn bị nguyên liệu và dọn dẹp trong nhà bếp.", category: "nghề nghiệp" },
    { civilianKeyword: "Lập trình viên", spyKeyword: "Kỹ sư phần mềm", civilianDescription: "Người viết ra các dòng code để tạo nên những ứng dụng hữu ích.", spyDescription: "Người thiết kế và xây dựng các hệ thống phần mềm phức tạp.", category: "nghề nghiệp" },
    { civilianKeyword: "Kiến trúc sư", spyKeyword: "Kỹ sư xây dựng", civilianDescription: "Người thiết kế nên hình dáng và cấu trúc của các tòa nhà.", spyDescription: "Người trực tiếp giám sát và thi công các công trình hạ tầng.", category: "nghề nghiệp" },
    { civilianKeyword: "Ca sĩ", spyKeyword: "Nhạc sĩ", civilianDescription: "Người dùng giọng hát của mình để truyền tải cảm xúc đến khán giả.", spyDescription: "Người sáng tác nên những giai điệu và ca từ của bài hát.", category: "nghề nghiệp" },
    { civilianKeyword: "Diễn viên", spyKeyword: "Đạo diễn", civilianDescription: "Người hóa thân vào các nhân vật trong phim hoặc trên sân khấu.", spyDescription: "Người chỉ đạo nghệ thuật và dàn dựng toàn bộ tác phẩm điện ảnh.", category: "nghề nghiệp" },
    { civilianKeyword: "Phi công", spyKeyword: "Tiếp viên hàng không", civilianDescription: "Người trực tiếp điều khiển các chuyến bay trên bầu trời.", spyDescription: "Người chăm sóc và đảm bảo an toàn cho hành khách trên máy bay.", category: "nghề nghiệp" },
    { civilianKeyword: "Nông dân", spyKeyword: "Ngư dân", civilianDescription: "Người làm việc trên đồng ruộng để tạo ra lương thực, thực phẩm.", spyDescription: "Người lênh đênh trên biển cả để đánh bắt thủy hải sản.", category: "nghề nghiệp" },

    // Cảm xúc
    { civilianKeyword: "Vui vẻ", spyKeyword: "Phấn khích", civilianDescription: "Trạng thái tinh thần lạc quan, yêu đời khi gặp chuyện tốt.", spyDescription: "Cảm giác hào hứng tột độ trước một sự kiện sắp diễn ra.", category: "cảm xúc" },
    { civilianKeyword: "Buồn", spyKeyword: "Thất vọng", civilianDescription: "Cảm giác hụt hẫng, không vui khi gặp chuyện chẳng lành.", spyDescription: "Tâm trạng chán nản khi kết quả không như mong đợi.", category: "cảm xúc" },
    { civilianKeyword: "Tức giận", spyKeyword: "Bực bội", civilianDescription: "Phản ứng mạnh mẽ khi cảm thấy bị xúc phạm hoặc không hài lòng.", spyDescription: "Sự khó chịu âm ỉ khi gặp phải những phiền toái nhỏ.", category: "cảm xúc" },
    { civilianKeyword: "Sợ hãi", spyKeyword: "Lo lắng", civilianDescription: "Cảm giác bất an khi đối diện với mối nguy hiểm trước mắt.", spyDescription: "Tâm trạng bồn chồn về những chuyện chưa xảy ra.", category: "cảm xúc" },
    { civilianKeyword: "Ngạc nhiên", spyKeyword: "Bất ngờ", civilianDescription: "Cảm xúc khi thấy một điều gì đó hoàn toàn nằm ngoài dự tính.", spyDescription: "Trạng thái sửng sốt trước một hành động đột ngột của ai đó.", category: "cảm xúc" }
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
