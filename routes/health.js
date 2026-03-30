const express = require('express');
const router = express.Router();

const { healthCheck } = require('../controllers/healthController');
const socketService = require('../services/socketService');

router.get('/', healthCheck);

// Debug: xem tất cả WS sessions + subscriptions đang active
// GET /api/health/sockets
router.get('/sockets', (req, res) => {
  res.json(socketService.getDebugInfo());
});

module.exports = router;