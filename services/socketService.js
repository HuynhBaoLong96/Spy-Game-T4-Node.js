const { StompServer } = require('stomp-server');
const RoomPlayer = require('../models/RoomPlayer');

let stompServer;
const sessionToUser = new Map(); // sessionId -> { userId, roomId, username }
const userToSessions = new Map(); // userId -> Set(sessionId)
const sessionToClient = new Map(); // sessionId -> client object

const init = (server) => {
  stompServer = new StompServer({
    server: server,
    path: '/ws',
    debug: (str) => {
      // console.log(`[STOMP-DEBUG] ${str}`);
    },

    onConnected: (sessionId, headers, client) => {
      console.log(`[STOMP] Client connected: ${sessionId}`);
      sessionToClient.set(sessionId, client);
    },

    onDisconnected: (sessionId) => {
      console.log(`[STOMP] Client disconnected: ${sessionId}`);
      
      const sessionData = sessionToUser.get(sessionId);
      if (sessionData && sessionData.roomId) {
        // Import gameService và gọi handlePlayerQuit nếu game đang chạy
        const { handlePlayerQuit } = require('./gameService');
        handlePlayerQuit(sessionData.roomId, sessionData.userId);
      }

      if (sessionData) {
        const { userId } = sessionData;
        const sessions = userToSessions.get(userId);
        if (sessions) {
          sessions.delete(sessionId);
          if (sessions.size === 0) {
            userToSessions.delete(userId);
          }
        }
        sessionToUser.delete(sessionId);
      }
      sessionToClient.delete(sessionId);
    },

    onSend: async (frame, client) => {
      const topic = frame.headers.destination;
      const body = frame.body ? JSON.parse(frame.body) : {};
      const sessionId = client.sessionId;

      console.log(`[STOMP] Message received for topic ${topic} from ${sessionId}`);

      // Bước 2: Xử lý các topic /app/...
      if (topic.startsWith('/app/game.addUser/')) {
        const roomId = topic.split('/').pop();
        const { sender, userId } = body; // Giả sử FE gửi sender (username) và userId

        if (userId) {
          // Lưu mapping
          sessionToUser.set(sessionId, { userId, roomId, username: sender });
          if (!userToSessions.has(userId)) {
            userToSessions.set(userId, new Set());
          }
          userToSessions.get(userId).add(sessionId);

          // Broadcast "joined" tới /topic/room/{roomId}
          emitToRoom(roomId, 'JOIN', {
            type: 'JOIN',
            sender: sender,
            content: `${sender} đã tham gia phòng!`,
            userId: userId,
            timestamp: new Date().toISOString()
          });
        }
      } 
      else if (topic.startsWith('/app/game.sendMessage/')) {
        const roomId = topic.split('/').pop();
        const { content, sender } = body;
        const sessionData = sessionToUser.get(sessionId);

        if (sessionData && sessionData.roomId === roomId) {
          // Kiểm tra DB để bảo mật (tùy chọn nhưng user yêu cầu)
          const isMember = await RoomPlayer.findOne({ roomId, userId: sessionData.userId });
          if (isMember) {
            emitToRoom(roomId, 'CHAT', {
              type: 'CHAT',
              sender: sender || sessionData.username,
              content: content,
              userId: sessionData.userId,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      else {
        // Mặc định: Gửi lại tin nhắn cho tất cả client đang subscribe topic đó
        stompServer.send(topic, frame.headers, frame.body);
      }
    }
  });
};

const getStompServer = () => {
  if (!stompServer) {
    throw new Error('STOMP Server chưa được khởi tạo!');
  }
  return stompServer;
};

/**
 * Gửi tin nhắn tới một topic cụ thể (STOMP format)
 */
const emitToTopic = (topic, data) => {
  if (stompServer) {
    stompServer.send(topic, {}, JSON.stringify(data));
  }
};

/**
 * Gửi tin nhắn riêng cho một user (giả lập /user/queue)
 */
const emitToUser = (userId, topic, data) => {
  if (!stompServer) return;
  
  const sessions = userToSessions.get(userId.toString());
  if (sessions) {
    sessions.forEach(sessionId => {
      const client = sessionToClient.get(sessionId);
      if (client) {
        // Gửi trực tiếp cho client đó, không dùng stompServer.send()
        client.send(`/user/queue/${topic}`, {}, JSON.stringify(data));
      }
    });
  }
};

/**
 * Gửi tin nhắn tới một phòng cụ thể
 */
const emitToRoom = (roomId, event, data) => {
  // Spring STOMP thường dùng /topic/room/{roomId}
  emitToTopic(`/topic/room/${roomId}`, data);
  // Đồng thời gửi tới /topic/match/{matchId} nếu cần (sẽ xử lý ở Step 3)
};

/**
 * Gửi tin nhắn tới sảnh chờ (Lobby)
 */
const emitToLobby = (event, data) => {
  // Java dùng /topic/rooms/lobby
  emitToTopic('/topic/rooms/lobby', data);
};

module.exports = {
  init,
  getStompServer,
  emitToRoom,
  emitToLobby,
  emitToTopic,
  emitToUser,
};
