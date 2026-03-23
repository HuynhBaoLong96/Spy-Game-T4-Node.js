const { StompServer } = require('stomp-server');

let stompServer;

const init = (server) => {
  stompServer = new StompServer({
    server: server,
    path: '/ws',
    debug: (str) => {
      // console.log(`[STOMP-DEBUG] ${str}`); // Bật lên nếu cần debug sâu
    },

    // Định nghĩa các hàm xử lý sự kiện ngay tại đây
    onConnected: (sessionId, headers) => {
      console.log(`[STOMP] Client connected: ${sessionId}`);
    },

    onDisconnected: (sessionId) => {
      console.log(`[STOMP] Client disconnected: ${sessionId}`);
    },

    // Xử lý khi client gửi tin nhắn đến một topic
    onSend: (frame, client) => {
      const topic = frame.headers.destination;
      const body = frame.body;
      console.log(`[STOMP] Message received for topic ${topic}`);
      
      // Gửi lại tin nhắn cho tất cả client đang subscribe topic đó
      stompServer.send(topic, frame.headers, body);
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
 * Gửi tin nhắn tới một phòng cụ thể
 */
const emitToRoom = (roomId, event, data) => {
  // Spring STOMP thường dùng /topic/room/{roomId}
  emitToTopic(`/topic/room/${roomId}`, data);
};

/**
 * Gửi tin nhắn tới sảnh chờ (Lobby)
 */
const emitToLobby = (event, data) => {
  emitToTopic('/topic/lobby', data);
};

module.exports = {
  init,
  getStompServer,
  emitToRoom,
  emitToLobby,
  emitToTopic,
};
