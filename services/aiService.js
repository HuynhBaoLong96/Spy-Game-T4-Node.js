const axios = require('axios');

/**
 * Gọi Gemini API để lấy mô tả cho từ khóa.
 */
const getAiDescription = async (keyword, round) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `Bạn là một người chơi trong trò chơi 'Keyword Spy'. Từ khóa của bạn là '${keyword}'. ` +
    `Đây là vòng chơi thứ ${round}. Hãy đưa ra một câu mô tả ngắn gọn (từ 1 đến 5 từ) về từ khóa này ` +
    `sao cho những người cùng phe có thể hiểu nhưng gián điệp khó nhận ra. ` +
    `Chỉ trả về nội dung mô tả, không thêm bất kỳ từ nào khác.`;

  try {
    if (!apiKey) {
      return generateSimulatedDescription(keyword);
    }

    const response = await axios.post(apiUrl, {
      contents: [{
        parts: [{ text: prompt }]
      }]
    });

    if (response.data && response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text.trim();
    }
  } catch (error) {
    console.error('[AI-SERVICE-ERROR]', error.message);
    return generateSimulatedDescription(keyword);
  }
  return keyword;
};

const generateSimulatedDescription = (key) => {
  const templates = [
    `Liên tưởng đến ${key} nhưng không trực tiếp`,
    `Gợi nhớ một thứ gần với ${key}`,
    `Hơi hướng ${key}, khá trừu tượng`,
    `Nghĩ về chủ đề như ${key} nhưng khác chữ`,
    `Cảm giác tương tự ${key} ở bối cảnh khác`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
};

module.exports = {
  getAiDescription,
};
