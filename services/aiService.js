const axios = require('axios');

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;

/**
 * Gọi Gemini API với một prompt bất kỳ
 */
const callGemini = async (prompt, throwOnError = false) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.post(`${GEMINI_URL}?key=${apiKey}`, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.data.candidates[0].content.parts[0].text.trim();
    }
    return null;
  } catch (error) {
    // Lấy thông báo lỗi chi tiết từ Gemini API response
    const detail = error?.response?.data?.error?.message || error.message;
    console.error('[AI-SERVICE-ERROR]', detail);
    if (throwOnError) throw new Error(detail);
    return null;
  }
};

/**
 * AI mô tả từ khóa ở phase DESCRIBING.
 * Trả về câu mô tả ngắn (1-5 từ), không tiết lộ từ khóa trực tiếp.
 */
const getAiDescription = async (keyword, round) => {
  const prompt =
    `Bạn là người chơi trong trò chơi 'Keyword Spy'. Từ khóa của bạn là '${keyword}'. ` +
    `Đây là vòng chơi thứ ${round}. ` +
    `Hãy đưa ra một câu mô tả ngắn gọn (từ 1 đến 5 từ) về từ khóa này ` +
    `sao cho người cùng phe hiểu, nhưng gián điệp khó nhận ra. ` +
    `Chỉ trả về nội dung mô tả, không thêm bất kỳ từ nào khác.`;

  const result = await callGemini(prompt);
  return result || generateSimulatedDescription(keyword);
};

/**
 * AI thảo luận ở phase DISCUSSING.
 * Trả về 1-2 câu thảo luận ngắn dựa trên context.
 */
const getAiDiscussion = async (keyword, round, chatHistory = []) => {
  const historyText = chatHistory.length > 0
    ? chatHistory.map(m => `${m.sender_name}: "${m.content}"`).join('\n')
    : '(Chưa có ai nói gì)';

  const prompt =
    `Bạn là một người chơi ẩn danh trong trò chơi 'Keyword Spy'. Từ khóa của bạn là '${keyword}'. ` +
    `Đây là vòng ${round}. ` +
    `Mọi người đang thảo luận để tìm ra gián điệp. ` +
    `Lịch sử chat gần đây:\n${historyText}\n\n` +
    `Hãy đưa ra 1 câu thảo luận ngắn (dưới 20 từ) để góp phần tìm ra gián điệp mà không tiết lộ từ khóa trực tiếp. ` +
    `Chỉ trả về nội dung câu nói, không thêm gì khác.`;

  const result = await callGemini(prompt);
  return result || generateSimulatedDiscussion();
};

/**
 * AI chọn mục tiêu để vote ở phase VOTING.
 * Trả về userId của người bị nghi ngờ nhất.
 */
const getAiVoteTarget = async (alivePlayers, descriptions = {}) => {
  const humanPlayers = alivePlayers.filter(p => !p.isAi);
  if (humanPlayers.length === 0) return null;

  const descList = humanPlayers.map(p => {
    const desc = descriptions[p.userId] || '(không mô tả)';
    return `- ${p.displayName}: "${desc}"`;
  }).join('\n');

  const prompt =
    `Bạn đang chơi trò 'Keyword Spy' và cần vote loại người bị nghi ngờ là gián điệp. ` +
    `Dưới đây là mô tả từ khóa của từng người chơi:\n${descList}\n\n` +
    `Dựa trên các mô tả trên, hãy chọn TÊN (display_name) của người bạn nghĩ là gián điệp nhất. ` +
    `Chỉ trả về đúng tên người đó, không giải thích thêm.`;

  const result = await callGemini(prompt);

  if (result) {
    // Tìm player có tên khớp với kết quả Gemini
    const matched = humanPlayers.find(p =>
      result.toLowerCase().includes(p.displayName.toLowerCase())
    );
    if (matched) return matched.userId;
  }

  // Fallback: chọn ngẫu nhiên
  const randomPlayer = humanPlayers[Math.floor(Math.random() * humanPlayers.length)];
  return randomPlayer.userId;
};

/**
 * Test kết nối Gemini – dùng cho Admin UI.
 */
const testAiConnection = async (keyword = 'mèo') => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY chưa được cấu hình trong .env' };
  }

  const prompt =
    `Bạn là người chơi trong trò chơi 'Keyword Spy'. Từ khóa của bạn là '${keyword}'. ` +
    `Hãy đưa ra một câu mô tả ngắn gọn (từ 1 đến 5 từ) về từ khóa này. ` +
    `Chỉ trả về nội dung mô tả.`;

  try {
    // throwOnError=true để lấy lỗi chi tiết từ Gemini (invalid key, quota, v.v.)
    const response = await callGemini(prompt, true);
    if (response) {
      return { success: true, response, apiKey: `...${apiKey.slice(-6)}` };
    }
    return { success: false, error: 'Gemini không trả về kết quả hợp lệ (response rỗng)' };
  } catch (error) {
    // Rút gọn lỗi quota dài dòng thành thông báo ngắn gọn
    const msg = error.message;
    if (msg.includes('Quota exceeded') || msg.includes('quota')) {
      return { success: false, error: '⚠️ API key hết quota free tier. Vui lòng kiểm tra billing tại https://ai.dev/rate-limit hoặc đổi API key mới.' };
    }
    if (msg.includes('API_KEY_INVALID') || msg.includes('invalid')) {
      return { success: false, error: '❌ API key không hợp lệ. Hãy kiểm tra GEMINI_API_KEY trong .env' };
    }
    return { success: false, error: msg.split('\n')[0] }; // Chỉ lấy dòng đầu tiên nếu lỗi khác
  }
};

// ─── Fallback khi không có API key hoặc lỗi ───────────────────────────────────

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

const generateSimulatedDiscussion = () => {
  const lines = [
    'Tôi thấy có người mô tả hơi lạ...',
    'Ai đó có vẻ không cùng chủ đề với tôi.',
    'Tôi nghĩ gián điệp đang trong nhóm chúng ta.',
    'Mô tả đó khá mơ hồ, đáng ngờ đó.',
    'Tôi không chắc, nhưng cảm giác có gì đó sai sai.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
};

module.exports = {
  getAiDescription,
  getAiDiscussion,
  getAiVoteTarget,
  testAiConnection,
};
