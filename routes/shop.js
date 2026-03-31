const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

/**
 * GET /api/shop/inventory
 * Trả về inventory của user (hiện tại trả về rỗng, mở rộng sau)
 */
router.get('/inventory', async (req, res, next) => {
  try {
    // TODO: implement inventory model nếu cần
    res.json({ items: [], skills: [] });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/buy?skillId=xxx
 * Mua skill
 */
router.post('/buy', async (req, res, next) => {
  try {
    const { skillId } = req.query;
    if (!skillId) return res.status(400).json({ message: 'Thiếu skillId' });
    // TODO: implement shop logic
    res.json({ success: true, message: `Đã mua skill: ${skillId}` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;