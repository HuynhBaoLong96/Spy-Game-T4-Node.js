/**
 * socketService.js
 * 
 * STOMP 1.2 over WebSocket - tự implement bằng ws library.
 * Tương thích với Spring STOMP client (@stomp/stompjs / SockJS).
 * 
 * Lý do: package 'stomp-server' tạo HTTP server riêng thay vì 
 * attach vào Express server => frontend không connect được (404).
 */

const WebSocket = require('ws');

let wss = null;

// sessionId -> { ws, userId, roomId, username, subscriptions: Map(subId -> destination) }
const sessions = new Map();
// userId -> Set(sessionId)
const userToSessions = new Map();
// destination -> Set(sessionId)
const topicSubscribers = new Map();

// (ip, topic) -> Queue([ {userId, username} ])
// Dùng để định danh người chơi khi họ subscribe topic mà không có token (trên localhost)
const pendingSubscriptions = new Map();

// matchId -> { civilianKeyword, spyKeyword, spyUserId, infectedUserId }
const matchDataRegistry = new Map();

// ─── STOMP Frame Parser/Serializer ────────────────────────────────────────────

/**
 * Parse một STOMP frame từ string raw.
 * STOMP frame format: COMMAND\n[headers]\n\nbody\0
 */
function parseFrame(data) {
  const str = data.toString();
  // Tách command
  const nullIdx = str.indexOf('\0');
  const content = nullIdx >= 0 ? str.substring(0, nullIdx) : str;
  const lines = content.split('\n');

  let i = 0;
  // Bỏ qua heartbeat frames
  while (i < lines.length && (lines[i] === '' || lines[i] === '\r')) i++;
  if (i >= lines.length) return null;

  const command = lines[i].replace('\r', '').trim();
  if (!command) return null;
  i++;

  const headers = {};
  while (i < lines.length && lines[i].replace('\r', '').trim() !== '') {
    const line = lines[i].replace('\r', '');
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      headers[key] = value;
    }
    i++;
  }

  i++; // skip blank line between headers and body
  const body = lines.slice(i).join('\n').replace(/\0/g, '');

  return { command, headers, body };
}

/**
 * Serialize một STOMP frame thành string để gửi.
 */
function buildFrame(command, headers = {}, body = '') {
  let frame = command + '\n';
  for (const [k, v] of Object.entries(headers)) {
    frame += `${k}:${v}\n`;
  }
  frame += '\n' + body + '\0';
  return frame;
}

// ─── Session Management ───────────────────────────────────────────────────────

function generateSessionId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function registerUserSession(sessionId, userId, roomId, username) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.userId = userId;
  session.roomId = roomId;
  session.username = username;

  if (!userToSessions.has(userId)) userToSessions.set(userId, new Set());
  userToSessions.get(userId).add(sessionId);
  console.log(`[STOMP] Session ${sessionId} registered for user ${username} (${userId}) in room ${roomId}`);
}

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Remove from topic subscribers
  for (const dest of session.subscriptions.values()) {
    const subs = topicSubscribers.get(dest);
    if (subs) {
      subs.delete(sessionId);
      if (subs.size === 0) topicSubscribers.delete(dest);
    }
  }

  // Remove from user sessions
  if (session.userId) {
    const userSessions = userToSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) userToSessions.delete(session.userId);
    }
  }

  sessions.delete(sessionId);
}

// ─── STOMP Frame Handlers ─────────────────────────────────────────────────────

/**
 * Xác định userId từ headers của STOMP frame.
 */
async function identifyUserFromHeaders(headers) {
  if (!headers) return null;
  
  const rawToken =
    headers['login'] ||
    headers['passcode'] ||
    (headers['Authorization'] || '').replace(/^Bearer\s+/i, '') ||
    (headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
    headers['token'] ||
    headers['access_token'];

  if (!rawToken || !rawToken.trim()) return null;

  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    const decoded = jwt.verify(rawToken.trim(), process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      console.log('[STOMP] Token decoded but no ID found.');
      return null;
    }
    const user = await User.findById(decoded.id).select('_id username displayName active');
    if (!user) {
      console.log(`[STOMP] Token valid for ID ${decoded.id} but user not found in DB.`);
      return null;
    }
    if (!user.active) {
      console.log(`[STOMP] User ${user.username} is banned.`);
      return null;
    }
    return user;
  } catch (e) {
    console.log(`[STOMP] Identify user from token failed: ${e.message}`);
    return null;
  }
}

async function handleConnect(sessionId, headers) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const user = await identifyUserFromHeaders(headers);
  if (user) {
    session.userId = user._id.toString();
    session.username = user.displayName || user.username;
    if (!userToSessions.has(session.userId)) userToSessions.set(session.userId, new Set());
    userToSessions.get(session.userId).add(sessionId);
    console.log(`[STOMP] Auth OK for session ${sessionId}: user=${session.username} (${session.userId})`);
  } else {
    console.log(`[STOMP] No valid token in headers for session ${sessionId}.`);
  }

  const connectedFrame = buildFrame('CONNECTED', {
    version: '1.2',
    session: sessionId,
    server: 'SpyGame-Node/1.0',
    'heart-beat': '0,0',
  });

  session.ws.send(connectedFrame);
  session.connected = true;
  console.log(`[STOMP] Client connected: ${sessionId} (user=${session.username || 'anonymous'})`);
}


/**
 * Chuẩn hóa topic để hỗ trợ linh hoạt giữa các định dạng khác nhau:
 * - Thay thế dấu chấm (.) bằng gạch chéo (/)
 * - Chuyển plural /rooms/ về singular /room/
 * - Đưa tất cả về chữ thường
 */
function normalizeTopic(topic) {
  if (!topic) return topic;
  return topic.toLowerCase()
    .replace(/\./g, '/')
    .replace(/\/rooms\//, '/room/')
    .replace(/\/topic\/room\//, '/topic/room/')
    .replace(/\/topic\/match\//, '/topic/match/')
    .replace(/\/chat$/, '/chat'); // giữ nguyên đuôi chat
}

async function handleSubscribe(sessionId, headers) {
  const destination = headers['destination'];
  const subscriptionId = headers['id'];
  if (!destination || !subscriptionId) return;

  const session = sessions.get(sessionId);
  if (!session) return;

  // ── Chống duplicate subscribe ──────────────────────────────────────────────
  // Frontend đôi khi gọi subscribe nhiều lần cùng destination (reconnect).
  // Kiểm tra xem đã có subscription cho destination này chưa.
  const alreadySubscribed = [...session.subscriptions.values()].includes(destination);
  if (alreadySubscribed) {
    console.log(`[STOMP] DUPLICATE subscribe ignored: ${sessionId} -> ${destination}`);
    // Vẫn response bình thường nhưng không thêm vào map nữa
    return;
  }

  session.subscriptions.set(subscriptionId, destination);

  const normalized = normalizeTopic(destination);
  if (!topicSubscribers.has(normalized)) topicSubscribers.set(normalized, new Set());
  topicSubscribers.get(normalized).add(sessionId);

  console.log(`[STOMP] Subscribed: ${sessionId} -> ${destination} (id=${subscriptionId})`);

  // ── AUTO-IDENTIFY BY PENDING SUBSCRIPTION (For Localhost / No-Token) ──────
  if (!session.userId && session.ip) {
    const normalizedIp = normalizeIp(session.ip);
    const key = `${normalizedIp}|${normalized}`;
    const queue = pendingSubscriptions.get(key);
    if (queue && queue.length > 0) {
      const { userId, username } = queue.shift();
      session.userId = userId;
      session.username = username;
      if (!userToSessions.has(userId)) userToSessions.set(userId, new Set());
      userToSessions.get(userId).add(sessionId);
      console.log(`[STOMP] Identified session ${sessionId} as ${username} (${userId}) via pending queue for ${normalized}`);
      
      if (queue.length === 0) pendingSubscriptions.delete(key);
    }
  }

  // ── Initial State Push for Match topics ──
  if (normalized.startsWith('/topic/match/')) {
    const parts = normalized.split('/');
    if (parts.length >= 4) {
      const matchId = parts[3];
      let mData = matchDataRegistry.get(matchId);
      
      // ── FALLBACK: Fetch from DB if registry is empty (e.g. server restarted) ──
      if (!mData) {
        console.log(`[STOMP] Match ${matchId} NOT in registry. Fetching from DB...`);
        const Match = require('../models/Match');
        const match = await Match.findById(matchId);
        if (match) {
          mData = {
            civilianKeyword: match.civilianKeyword,
            spyKeyword: match.spyKeyword,
            spyUserId: match.spyUserId ? match.spyUserId.toString() : null,
            infectedUserId: match.infectedUserId ? match.infectedUserId.toString() : null,
            isSpecialRound: match.isSpecialRound || false
          };
          matchDataRegistry.set(matchId, mData);
          console.log(`[STOMP] Recovered match data for ${matchId} from DB.`);
        }
      }

      // Push current game state for this match
      setImmediate(async () => {
        try {
          const { getSession } = require('./gameService');
          const gameSession = getSession(matchId);
          if (gameSession) {
            const phaseName = gameSession.state.toUpperCase();
            
            let currentUserId = session.userId;
            let keyword = '???';
            let role = 'CIVILIAN';
            
            if (mData && currentUserId) {
              const userIdStr = String(currentUserId);
              const isSpy = userIdStr === String(mData.spyUserId) || 
                            (mData.infectedUserId && userIdStr === String(mData.infectedUserId));
              keyword = isSpy ? mData.spyKeyword : mData.civilianKeyword;
              role = isSpy ? (mData.infectedUserId && userIdStr === String(mData.infectedUserId) ? 'INFECTED' : 'SPY') : 'CIVILIAN';
            }

            sendToSession(sessionId, destination, {
              type: 'MATCH_UPDATE',
              phase: phaseName,
              state: phaseName,
              remaining_seconds: Math.max(0, Math.floor((gameSession.phaseEndTime - Date.now()) / 1000)),
              your_keyword: keyword,
              yourKeyword: keyword,
              keyword: keyword,
              your_role: role,
              role: role,
              match_id: matchId,
              room_id: gameSession.roomId
            });
            console.log(`[STOMP] Initial push MATCH_UPDATE for session ${sessionId} (User=${currentUserId || '?'}, Keyword=${keyword})`);
          }
        } catch (err) {
          console.error('[STOMP] Initial match push error:', err.message);
        }
      });
    }
  }


  // ── Initial State Push + Auto-link roomId ─────────────────────────────────
  const roomTopicMatch = destination.match(/\/topic\/rooms?\/([^/]+)$/);
  if (roomTopicMatch) {
    const roomIdOrCode = roomTopicMatch[1];
    if (roomIdOrCode && roomIdOrCode.toLowerCase() !== 'lobby') {
      setImmediate(async () => {
        try {
          const Room = require('../models/Room');
          const RoomPlayer = require('../models/RoomPlayer');
          const room = await Room.findOne({
            $or: [
              { roomCode: roomIdOrCode.toUpperCase() },
              { _id: roomIdOrCode.length === 24 ? roomIdOrCode : null }
            ].filter(q => q._id !== null || q.roomCode)
          });
          if (room) {
            // Tự gán roomId vào session nếu chưa có
            const currentSession = sessions.get(sessionId);
            if (currentSession && !currentSession.roomId) {
              currentSession.roomId = room._id.toString();
              currentSession.roomCode = room.roomCode;
              console.log(`[STOMP] Auto-linked session ${sessionId} -> room ${room.roomCode}`);
            }

            const players = await RoomPlayer.find({ roomId: room._id });
            sendToSession(sessionId, destination, {
              type: 'ROOM_UPDATE',
              room_id: room._id.toString(),
              room_code: room.roomCode,
              host_id: room.hostId.toString(),
              current_players: room.currentPlayers,
              max_players: room.maxPlayers,
              status: room.status,
              is_private: room.isPrivate,
              players: players.map(p => ({
                user_id: p.userId.toString(),
                display_name: p.displayName,
                username: p.username
              }))
            });
            console.log(`[STOMP] Initial push ROOM_UPDATE -> ${sessionId} for room ${room.roomCode} (${players.length} players)`);
          } else {
            console.log(`[STOMP] Initial push: room not found for ${roomIdOrCode}`);
          }
        } catch (err) {
          console.error('[STOMP] Initial push error:', err.message);
        }
      });
    }
  }
}


function handleUnsubscribe(sessionId, headers) {
  const subscriptionId = headers['id'];
  if (!subscriptionId) return;

  const session = sessions.get(sessionId);
  if (!session) return;

  const destination = session.subscriptions.get(subscriptionId);
  if (destination) {
    const normalized = normalizeTopic(destination);
    const subs = topicSubscribers.get(normalized);
    if (subs) {
      subs.delete(sessionId);
      if (subs.size === 0) topicSubscribers.delete(normalized);
    }
    session.subscriptions.delete(subscriptionId);
  }
}

async function handleSend(sessionId, headers, body) {
  const destination = headers['destination'];
  const session = sessions.get(sessionId);

  console.log(`[STOMP] Message for ${destination} from ${sessionId}`);

  let parsed = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch (e) { }

  if (destination && destination.startsWith('/app/')) {
    await handleAppMessage(sessionId, destination, parsed, session, headers);
  } else {
    // Broadcast to all subscribers of this topic
    broadcastToTopic(destination, parsed);
  }
}

async function handleAppMessage(sessionId, destination, body, session, headers = {}) {
  // Nếu session chưa có userId, thử xác thực lại từ headers của tin nhắn này
  if (!session.userId) {
    const user = await identifyUserFromHeaders(headers);
    if (user) {
      session.userId = user._id.toString();
      session.username = user.displayName || user.username;
      if (!userToSessions.has(session.userId)) userToSessions.set(session.userId, new Set());
      userToSessions.get(session.userId).add(sessionId);
      console.log(`[STOMP] Late identification for ${sessionId}: ${session.username}`);
    }
  }

  // ── /app/game.addUser/{roomCode|roomId} ─────────────────────
  if (destination.startsWith('/app/game.addUser/')) {
    const parts = destination.split('/');
    const roomIdOrCode = parts[parts.length - 1];
    
    if (!roomIdOrCode) {
      console.log(`[STOMP] addUser ERROR: No roomIdOrCode in destination ${destination}`);
      return;
    }
    
    let { sender, userId, user_id, display_name } = body;
    
    // Fallback cho nhiều kiểu đặt tên
    const effectiveUserId = userId || user_id || session.userId;
    const effectiveSender = sender || display_name || session.username;

    console.log(`[STOMP] addUser request: room=${roomIdOrCode}, userId=${effectiveUserId}, sender=${effectiveSender}`);

    if (effectiveUserId) {
      const Room = require('../models/Room');
      const Match = require('../models/Match');
      const RoomPlayer = require('../models/RoomPlayer');

      let room = await Room.findOne({
        $or: [
          { roomCode: roomIdOrCode.toUpperCase() },
          { _id: roomIdOrCode.length === 24 ? roomIdOrCode : null }
        ].filter(q => q && (q._id !== null || q.roomCode))
      });

      // Nếu không tìm thấy Room, thử tìm Match (để support /app/game.addUser/{matchId})
      if (!room && roomIdOrCode.length === 24) {
        const match = await Match.findById(roomIdOrCode);
        if (match) {
          room = await Room.findById(match.roomId);
        }
      }

      const actualRoomId = room ? room._id.toString() : roomIdOrCode;
      const actualRoomCode = room ? room.roomCode : roomIdOrCode;

      registerUserSession(sessionId, effectiveUserId.toString(), actualRoomId, effectiveSender);
      const sess = sessions.get(sessionId);
      if (sess) {
        sess.roomCode = actualRoomCode;
        sess.roomId = actualRoomId;
      }

      // Thông báo PLAYER_JOIN
      emitToRoom(room || actualRoomCode, 'PLAYER_JOIN', {
        type: 'PLAYER_JOIN',
        sender: effectiveSender,
        display_name: effectiveSender,
        content: `${effectiveSender} đã tham gia phòng!`,
        userId: effectiveUserId,
        user_id: effectiveUserId,
        timestamp: new Date().toISOString()
      });

      if (room) {
        const players = await RoomPlayer.find({ roomId: room._id });
        sendToSession(sessionId, `/topic/room/${actualRoomId}`, {
          type: 'ROOM_UPDATE',
          room_id: actualRoomId,
          room_code: actualRoomCode,
          host_id: room.hostId.toString(),
          current_players: room.currentPlayers,
          max_players: room.maxPlayers,
          status: room.status,
          is_private: room.isPrivate,
          players: players.map(p => ({
            user_id: p.userId.toString(),
            display_name: p.displayName,
            username: p.username
          }))
        });
      }
    } else {
      console.log(`[STOMP] addUser FAILED: No userId found in body or session. Body: ${JSON.stringify(body)}`);
    }
    // ── /app/room.subscribe/{roomCode|roomId} ────────────────────
  } else if (destination.startsWith('/app/room.subscribe/')) {
    const roomIdOrCode = destination.split('/').pop();
    const Room = require('../models/Room');
    const RoomPlayer = require('../models/RoomPlayer');
    const room = await Room.findOne({
      $or: [
        { roomCode: roomIdOrCode.toUpperCase() },
        { _id: roomIdOrCode.length === 24 ? roomIdOrCode : null }
      ].filter(q => q._id !== null || q.roomCode)
    });
    if (room) {
      const players = await RoomPlayer.find({ roomId: room._id });
      sendToSession(sessionId, `/topic/room/${room._id.toString()}`, {
        type: 'ROOM_UPDATE',
        room_id: room._id.toString(),
        room_code: room.roomCode,
        host_id: room.hostId.toString(),
        current_players: room.currentPlayers,
        max_players: room.maxPlayers,
        status: room.status,
        is_private: room.isPrivate,
        players: players.map(p => ({
          user_id: p.userId.toString(),
          display_name: p.displayName,
          username: p.username
        }))
      });
    }
  } else if (destination.startsWith('/app/game.sendMessage/') || destination.startsWith('/app/room.sendMessage/')) {
    const roomIdOrCode = destination.split('/').pop();
    const { content, message, sender, userId: bodyUserId, user_id: bodyUserId2, token } = body;

    // Thử xác thực từ token trong body nếu session chưa có userId
    if (!session.userId && token) {
      const user = await identifyUserFromHeaders({ Authorization: `Bearer ${token}` });
      if (user) {
        session.userId = user._id.toString();
        session.username = user.displayName || user.username;
        if (!userToSessions.has(session.userId)) userToSessions.set(session.userId, new Set());
        userToSessions.get(session.userId).add(sessionId);
        console.log(`[STOMP] Identified from body token for ${sessionId}: ${session.username}`);
      }
    }

    let effectiveUserId = session.userId || bodyUserId || bodyUserId2;
    const effectiveSender = session.username || sender || display_name || 'Người chơi';
    const effectiveContent = content || message;

    // Fallback: Nếu vẫn thiếu userId nhưng có roomId và username, thử tìm trong RoomPlayer
    if (!effectiveUserId && session.roomId && effectiveSender) {
      try {
        const RoomPlayer = require('../models/RoomPlayer');
        const rp = await RoomPlayer.findOne({ roomId: session.roomId, displayName: effectiveSender });
        if (rp) {
          effectiveUserId = rp.userId.toString();
          session.userId = effectiveUserId;
          console.log(`[STOMP] sendMessage: Fallback identify user ${effectiveSender} -> ${effectiveUserId}`);
        }
      } catch (e) { }
    }

    if (effectiveUserId && effectiveContent) {
      const Room = require('../models/Room');
      const room = await Room.findOne({
        $or: [
          { roomCode: roomIdOrCode.toUpperCase() },
          { _id: roomIdOrCode.length === 24 ? roomIdOrCode : null }
        ].filter(q => q._id !== null || q.roomCode)
      });

      if (room) {
        const messageData = {
          type: 'CHAT',
          sender: effectiveSender,
          sender_name: effectiveSender,
          display_name: effectiveSender,
          content: effectiveContent,
          userId: effectiveUserId,
          user_id: effectiveUserId,
          timestamp: new Date().toISOString()
        };

        emitToRoom(room, 'CHAT', messageData);
        console.log(`[STOMP] CHAT from ${effectiveSender} in room ${room.roomCode}: ${effectiveContent}`);
      }
    } else {
      console.log(`[STOMP] sendMessage ERROR: Missing data. 
        session.userId=${session.userId}, 
        body.userId=${bodyUserId}, 
        body.user_id=${bodyUserId2}, 
        body.content=${content}, 
        body.message=${message}. 
        Full body: ${JSON.stringify(body)}`);
    }
  }
}

function handleDisconnect(sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.roomId) {
    // 1. Xử lý thoát game (Match)
    const { handlePlayerQuit } = require('./gameService');
    handlePlayerQuit(session.roomId, session.userId).catch(console.error);

    // 2. Xử lý rời phòng (Room)
    // Rời phòng sẽ tự động broadcast ROOM_UPDATED qua roomService.leaveRoom
    const { leaveRoom } = require('./roomService');
    leaveRoom(session.roomId, session.userId).catch(console.error);
  }
  console.log(`[STOMP] Client disconnected: ${sessionId} (User: ${session ? session.username : 'unknown'})`);
  cleanupSession(sessionId);
}

// ─── Message Dispatcher ───────────────────────────────────────────────────────

/**
 * Gửi MESSAGE frame tới một sessionId cụ thể.
 */
function sendToSession(sessionId, destination, data) {
  const session = sessions.get(sessionId);
  if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
    console.log(`[STOMP][sendToSession] SKIP ${sessionId}: ws not open`);
    return;
  }

  // Tìm subscriptionId cho destination này
  let subscriptionId = null;
  let clientDestination = destination;
  
  // Chuẩn hóa destination để so sánh
  const normalizedTarget = normalizeTopic(destination);

  for (const [subId, dest] of session.subscriptions.entries()) {
    const normalizedSub = normalizeTopic(dest);
    // So sánh linh hoạt: chính xác, startsWith, hoặc /user/queue/ match
    if (normalizedSub === normalizedTarget || 
        normalizedTarget.startsWith(normalizedSub) || 
        (normalizedTarget.includes('/queue/') && normalizedSub.includes('/queue/') && normalizedTarget.split('/').pop() === normalizedSub.split('/').pop())) {
      subscriptionId = subId;
      clientDestination = dest; // dùng đúng string client đã subscribe
      break;
    }
  }

  if (!subscriptionId) {
    console.log(`[STOMP][sendToSession] WARNING: no subscriptionId for ${destination} in session ${sessionId}. Subscriptions: ${JSON.stringify([...session.subscriptions.values()])}`);
  }

  const frame = buildFrame('MESSAGE', {
    destination: clientDestination,
    'message-id': Math.random().toString(36).substring(2),
    ...(subscriptionId ? { subscription: subscriptionId } : {}),
    'content-type': 'application/json',
  }, typeof data === 'string' ? data : JSON.stringify(data));

  session.ws.send(frame);
  console.log(`[STOMP][sendToSession] SENT to ${sessionId} -> ${clientDestination} (sub=${subscriptionId})`);
}

/**
 * Broadcast tới tất cả subscriber của một topic.
 */
async function broadcastToTopic(destination, data) {
  if (!destination) return;

  const normalizedDestination = normalizeTopic(destination);
  const subscribers = topicSubscribers.get(normalizedDestination);

  // ── DEBUG: luôn log để biết có subscriber không ──────────────
  const subsCount = subscribers ? subscribers.size : 0;
  if (subsCount === 0) {
    console.log(`[STOMP][broadcast] NO SUBSCRIBERS for ${destination} (normalized: ${normalizedDestination}). All topics: [${[...topicSubscribers.keys()].join(', ')}]`);
  } else {
    console.log(`[STOMP][broadcast] -> ${destination} (${subsCount} subscribers)`);
  }

  if (!subscribers || subscribers.size === 0) return;

  // ── FALLBACK: Fetch mData once if this is a match topic ─────────
  let mData = null;
  let matchId = null;
  if (normalizedDestination.startsWith('/topic/match/')) {
    const parts = normalizedDestination.split('/');
    if (parts.length >= 4) {
      matchId = parts[3];
      mData = matchDataRegistry.get(matchId);
      if (!mData) {
        console.log(`[STOMP][broadcast] Match ${matchId} NOT in registry. Fetching from DB...`);
        try {
          const Match = require('../models/Match');
          const matchDoc = await Match.findById(matchId);
          if (matchDoc) {
            mData = {
              civilianKeyword: matchDoc.civilianKeyword,
              spyKeyword: matchDoc.spyKeyword,
              spyUserId: matchDoc.spyUserId ? matchDoc.spyUserId.toString() : null,
              infectedUserId: matchDoc.infectedUserId ? matchDoc.infectedUserId.toString() : null
            };
            matchDataRegistry.set(matchId, mData);
          }
        } catch (e) {
          console.error(`[STOMP][broadcast] DB error for ${matchId}:`, e.message);
        }
      }
    }
  }

  for (const sessionId of subscribers) {
    const session = sessions.get(sessionId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      console.log(`[STOMP][broadcast] SKIP dead session ${sessionId}`);
      continue;
    }

    let subscriptionId = null;
    let clientDestination = destination;

    for (const [subId, dest] of session.subscriptions.entries()) {
      if (normalizeTopic(dest) === normalizedDestination) {
        subscriptionId = subId;
        clientDestination = dest;
        break;
      }
    }

    // ── SMART INJECT KEYWORD FOR MATCH TOPICS ──
    let finalData = data;
    // Nếu data là string (đã JSON.stringify), parse ra để xử lý
    let dataObj = typeof data === 'string' ? null : data;
    if (typeof data === 'string') {
      try { dataObj = JSON.parse(data); } catch(e) {}
    }

    if (dataObj && typeof dataObj === 'object' && mData) {
      // Đảm bảo session có userId (thử nhận diện qua queue nếu mất)
      let effectiveUserId = session.userId;
      if (!effectiveUserId && session.ip) {
        const normalizedIp = normalizeIp(session.ip);
        const key = `${normalizedIp}|${normalizedDestination}`;
        const queue = pendingSubscriptions.get(key);
        if (queue && queue.length > 0) {
          const { userId, username } = queue.shift();
          session.userId = userId;
          session.username = username;
          if (!userToSessions.has(userId)) userToSessions.set(userId, new Set());
          userToSessions.get(userId).add(sessionId);
          effectiveUserId = userId;
          console.log(`[STOMP][broadcast] Late-identified session ${sessionId} as ${username} via queue`);
          if (queue.length === 0) pendingSubscriptions.delete(key);
        }
      }

      if (effectiveUserId) {
        const userIdStr = String(effectiveUserId);
        const spyIdStr = mData.spyUserId ? String(mData.spyUserId) : null;
        const infectedIdStr = mData.infectedUserId ? String(mData.infectedUserId) : null;
        
        const isSpy = userIdStr === spyIdStr || userIdStr === infectedIdStr;
        const keyword = isSpy ? mData.spyKeyword : mData.civilianKeyword;
        const role = isSpy ? (userIdStr === infectedIdStr ? 'INFECTED' : 'SPY') : 'CIVILIAN';
        
        console.log(`[STOMP][SmartInject] User=${session.username || effectiveUserId} isSpy=${isSpy} keyword=${keyword} role=${role}`);
        
        finalData = {
          ...dataObj,
          your_keyword: keyword,
          yourKeyword: keyword,
          keyword: keyword,
          your_role: role,
          role: role,
          is_special_round: mData.isSpecialRound || false,
          isSpecialRound: mData.isSpecialRound || false
        };
      }
    }

    const frame = buildFrame('MESSAGE', {
      destination: clientDestination,
      'message-id': Math.random().toString(36).substring(2),
      ...(subscriptionId ? { subscription: subscriptionId } : {}),
      'content-type': 'application/json',
    }, typeof finalData === 'string' ? finalData : JSON.stringify(finalData));

    session.ws.send(frame);
    console.log(`[STOMP][broadcast] SENT to session ${sessionId} (user=${session.username || '?'}) -> ${clientDestination}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Khởi tạo STOMP WebSocket server, attach vào HTTP server của Express.
 */
const init = (server) => {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const sessionId = generateSessionId();
    const ip = req.socket.remoteAddress;

    // Thử lấy token từ query string (e.g. /ws?token=xxx)
    const url = require('url');
    const query = url.parse(req.url, true).query;
    const token = query.token || query.access_token;

    sessions.set(sessionId, {
      ws,
      sessionId,
      ip,
      connected: false,
      userId: null,
      roomId: null,
      username: null,
      subscriptions: new Map(), // subId -> destination
    });

    if (token) {
      const user = await identifyUserFromHeaders({ Authorization: `Bearer ${token}` });
      if (user) {
        const session = sessions.get(sessionId);
        session.userId = user._id.toString();
        session.username = user.displayName || user.username;
        if (!userToSessions.has(session.userId)) userToSessions.set(session.userId, new Set());
        userToSessions.get(session.userId).add(sessionId);
        console.log(`[STOMP] Identified from URL token: ${session.username} (${sessionId})`);
      }
    }

    console.log(`[WS] New connection: ${sessionId} from ${req.socket.remoteAddress}`);

    ws.on('message', async (data) => {
      // Handle heartbeat (empty frames / newlines)
      const str = data.toString();
      if (str.trim() === '' || str === '\n' || str === '\r\n') {
        // Send back heartbeat
        if (ws.readyState === WebSocket.OPEN) ws.send('\n');
        return;
      }

      const frame = parseFrame(data);
      if (!frame || !frame.command) return;

      try {
        switch (frame.command) {
          case 'CONNECT':
          case 'STOMP':
            await handleConnect(sessionId, frame.headers);
            break;
          case 'SUBSCRIBE':
            await handleSubscribe(sessionId, frame.headers);
            break;
          case 'UNSUBSCRIBE':
            handleUnsubscribe(sessionId, frame.headers);
            break;
          case 'SEND':
            await handleSend(sessionId, frame.headers, frame.body);
            break;
          case 'DISCONNECT':
            handleDisconnect(sessionId);
            ws.close();
            break;
          default:
            console.log(`[STOMP] Unknown command: ${frame.command}`);
        }
      } catch (err) {
        console.error(`[STOMP] Error handling frame ${frame.command}:`, err);
      }
    });

    ws.on('close', () => {
      const session = sessions.get(sessionId);
      if (session && session.connected) {
        handleDisconnect(sessionId);
      } else {
        cleanupSession(sessionId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error on session ${sessionId}:`, err.message);
      cleanupSession(sessionId);
    });
  });

  console.log('[STOMP] WebSocket STOMP server initialized on path /ws');
};

/**
 * Gửi tới một topic (broadcast tới tất cả subscriber).
 */
const emitToTopic = async (topic, data) => {
  await broadcastToTopic(topic, data);
};

/**
 * Gửi riêng tư cho một user (giả lập /user/queue/).
 */
const emitToUser = (userId, topic, data) => {
  const destination = `/user/queue/${topic}`;
  const userSessionIds = userToSessions.get(userId.toString());
  if (!userSessionIds) return;

  userSessionIds.forEach(sessionId => {
    sendToSession(sessionId, destination, data);
  });
};

/**
 * Gửi tới tất cả người trong phòng qua roomCode và roomId.
 * Hỗ trợ linh hoạt: có thể truyền roomCode (string), roomId (string) hoặc room object (mongoose).
 */
const emitToRoom = (roomOrIdOrCode, event, data) => {
  if (!roomOrIdOrCode) return;

  const targets = new Set();

  if (typeof roomOrIdOrCode === 'string') {
    targets.add(roomOrIdOrCode);
  } else if (roomOrIdOrCode._id) {
    // Ưu tiên dùng roomId (ID 24 ký tự) vì FE thường sub theo ID
    targets.add(roomOrIdOrCode._id.toString());
  } else if (roomOrIdOrCode.toString) {
    targets.add(roomOrIdOrCode.toString());
  }

  targets.forEach(target => {
    // Chỉ gửi cho topic chính mà FE đang subscribe: /topic/room/{roomId}
    // Không gửi cho cả roomCode và roomId cùng lúc để tránh lặp tin nhắn
    emitToTopic(`/topic/room/${target}`, data);

    // Tương thích ngược nếu FE cũ đang dùng số nhiều
    // emitToTopic(`/topic/rooms/${target}`, data);
  });
};

/**
 * Gửi cập nhật lobby qua /topic/room/lobby và /topic/rooms/lobby.
 */
const emitToLobby = (event, data) => {
  emitToTopic('/topic/room/lobby', data);
  emitToTopic('/topic/rooms/lobby', data);
};

/**
 * Ngắt kết nối tất cả session của một user.
 */
const disconnectUser = (userId) => {
  const userSessionIds = userToSessions.get(userId.toString());
  if (!userSessionIds) return;

  userSessionIds.forEach(sessionId => {
    const session = sessions.get(sessionId);
    if (session && session.ws) {
      console.log(`[STOMP] Disconnecting banned user session: ${sessionId}`);
      session.ws.close(1008, 'Account banned'); // 1008 = Policy Violation
      cleanupSession(sessionId);
    }
  });
};

const normalizeIp = (ip) => {
  if (!ip) return ip;
  return ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
};

/**
 * Đăng ký định danh cho một lượt subscribe sắp tới (dùng cho localhost)
 */
const primeSubscription = (ip, topic, userId, username) => {
  if (!ip || !topic || !userId) return;
  const normalizedIp = normalizeIp(ip);
  const normalizedTopicName = normalizeTopic(topic);
  const key = `${normalizedIp}|${normalizedTopicName}`;
  
  if (!pendingSubscriptions.has(key)) pendingSubscriptions.set(key, []);
  
  const queue = pendingSubscriptions.get(key);
  if (!queue.find(item => item.userId === userId.toString())) {
    queue.push({ userId: userId.toString(), username: username || 'Người chơi' });
    console.log(`[STOMP] Primed subscription queue: ${key} -> ${username || userId}`);
    
    setTimeout(() => {
      const q = pendingSubscriptions.get(key);
      if (q) {
        const index = q.findIndex(item => item.userId === userId.toString());
        if (index !== -1) {
          q.splice(index, 1);
          if (q.length === 0) pendingSubscriptions.delete(key);
          console.log(`[STOMP] Expired primed subscription: ${key} for user ${userId}`);
        }
      }
    }, 30000);
  }
};

const setMatchData = (matchId, data) => {
  matchDataRegistry.set(matchId.toString(), data);
  console.log(`[STOMP] Registered match data for ${matchId}`);
};

const removeMatchData = (matchId) => {
  matchDataRegistry.delete(matchId.toString());
  console.log(`[STOMP] Removed match data for ${matchId}`);
};

module.exports = {
  init,
  emitToRoom,
  emitToLobby,
  emitToTopic,
  emitToUser,
  disconnectUser,
  primeSubscription,
  setMatchData,
  removeMatchData,
  // Debug helper
  getDebugInfo: () => ({
    totalSessions: sessions.size,
    totalTopics: topicSubscribers.size,
    sessions: [...sessions.entries()].map(([id, s]) => ({
      sessionId: id,
      userId: s.userId,
      username: s.username,
      roomId: s.roomId,
      roomCode: s.roomCode,
      connected: s.connected,
      wsState: s.ws ? s.ws.readyState : -1,
      subscriptions: [...s.subscriptions.values()]
    })),
    topics: [...topicSubscribers.entries()].map(([topic, subs]) => ({
      topic,
      subscriberCount: subs.size,
      subscribers: [...subs]
    }))
  })
};
