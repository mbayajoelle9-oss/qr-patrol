const { Server } = require('socket.io');
const config = require('../config');
const { userFromToken } = require('../middleware/auth');
const { STAFF_ROLES, ROLES } = require('../utils/constants');

let io = null;

/*
 * Salles Socket.IO :
 *   org:<orgId>:centrale  -> superviseurs/admins de la société (dashboard)
 *   org:<orgId>:agents    -> agents & intervenants de la société
 *   user:<userId>         -> un utilisateur précis
 *   platform              -> super admins
 */
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const user = token ? await userFromToken(String(token)).catch(() => null) : null;
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (e) {
      next(e);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user._id}`);
    if (user.role === ROLES.SUPER_ADMIN) {
      socket.join('platform');
      // Le super admin choisit la société qu'il supervise
      socket.on('centrale:join', (orgId) => {
        for (const room of socket.rooms) if (room.startsWith('org:')) socket.leave(room);
        if (orgId) socket.join(`org:${orgId}:centrale`);
      });
    } else if (STAFF_ROLES.includes(user.role)) {
      socket.join(`org:${user.organization}:centrale`);
    } else {
      socket.join(`org:${user.organization}:agents`);
    }
  });

  return io;
}

function toCentrale(orgId, event, payload) {
  if (!io || !orgId) return;
  io.to(`org:${orgId}:centrale`).emit(event, payload);
}
function toUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}
function toAgents(orgId, event, payload) {
  if (!io || !orgId) return;
  io.to(`org:${orgId}:agents`).emit(event, payload);
}
function onlineUserIds() {
  if (!io) return new Set();
  const ids = new Set();
  for (const [, s] of io.of('/').sockets) if (s.data.user) ids.add(s.data.user._id.toString());
  return ids;
}

module.exports = { initRealtime, toCentrale, toUser, toAgents, onlineUserIds };
