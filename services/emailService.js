const nodemailer = require('nodemailer');

// Cấu hình transporter (sử dụng Gmail hoặc dịch vụ SMTP khác)
// Bạn cần cấu hình các biến môi trường này trong tệp .env
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Sử dụng App Password nếu dùng Gmail
  },
});

/**
 * Gửi email thông thường
 */
const sendEmail = async (to, subject, text) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Gửi email xác nhận đặt lại mật khẩu
 */
const sendResetPasswordEmail = async (email, token) => {
  const subject = 'Mã xác nhận đặt lại mật khẩu - Spy Game';
  const body = `Mã xác nhận của bạn là: ${token}\n\nMã này sẽ hết hạn sau 15 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.`;
  return await sendEmail(email, subject, body);
};

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
};
