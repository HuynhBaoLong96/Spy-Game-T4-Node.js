const mongoose = require('mongoose');

const roomPlayerSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  displayName: {
    type: String
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const RoomPlayer = mongoose.model('RoomPlayer', roomPlayerSchema);

module.exports = RoomPlayer;
