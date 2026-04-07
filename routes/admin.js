const express = require('express');
const router = express.Router();
const { 
  getGameSettings, 
  updateGameSettings, 
  getAllUsers, 
  updateUser,
  banUser,
  activeUser,
  deleteUser,
  getAllRooms, 
  deleteRoom,
  getAllKeywords, 
  createKeyword,
  updateKeyword,
  deleteKeyword,
  getAdminStats,
  adminSkipPhase,
  addCoinsToUser,
  getAiDescription
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');
// Tất cả các route admin đều yêu cầu đăng nhập và quyền Admin
router.use(protect);
router.use(isAdmin);

// Phase settings
router.get('/settings', getGameSettings);
router.post('/settings', updateGameSettings); // Support POST
router.patch('/settings', updateGameSettings); // Support PATCH

// User management
router.get('/users', getAllUsers);
router.put('/users/:userId', updateUser);
router.patch('/users/:userId/ban', banUser);
router.patch('/users/:userId/unban', activeUser);
router.patch('/users/:userId/active', activeUser);
router.delete('/users/:userId', deleteUser);
router.post('/users/add-coins', addCoinsToUser);

// Room management
router.get('/rooms', getAllRooms);
router.delete('/rooms/:roomId', deleteRoom);

// Keyword management
router.get('/keywords', getAllKeywords);
router.post('/keywords', createKeyword);
router.put('/keywords/:id', updateKeyword);
router.delete('/keywords/:id', deleteKeyword);

// System stats
router.get('/stats', getAdminStats);
router.post('/ai-description', getAiDescription);

// Match management (Skip phase)
router.post('/matches/:matchId/skip-phase', adminSkipPhase);

module.exports = router;
