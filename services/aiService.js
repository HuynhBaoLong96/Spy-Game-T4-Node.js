const axios = require('axios');

/**
 * Gọi Gemini API - hỗ trợ cả free prompt và keyword game
 */
const getAiDescription = async (keyword, round, customPrompt = null) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Nếu có customPrompt (từ admin test) thì dùng luôn, không wrap vào game context
  const prompt = customPrompt || (
    `Bạn là một người chơi trong trò chơi 'Keyword Spy'. Từ khóa của bạn là '${keyword}'. ` +
    `Đây là vòng chơi thứ ${round}. Hãy đưa ra một câu mô tả ngắn gọn (từ 1 đến 5 từ) về từ khóa này ` +
    `sao cho những người cùng phe có thể hiểu nhưng gián điệp khó nhận ra. ` +
    `Chỉ trả về nội dung mô tả, không thêm bất kỳ từ nào khác.`
  );

  try {
    if (!apiKey) {
      return generateSimulatedDescription(keyword);
    }

    const response = await axios.post(apiUrl, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    if (response.data?.candidates?.[0]?.content) {
      return response.data.candidates[0].content.parts[0].text.trim();
    }
  } catch (error) {
    console.error('[AI-SERVICE-ERROR]', error.message);
    return generateSimulatedDescription(keyword);
  }

  return keyword;
};

const generateSimulatedDescription = (keyword) => {
  return 'Hết token rồi bạn nhé';
};

module.exports = { getAiDescription };