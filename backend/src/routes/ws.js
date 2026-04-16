/**
 * NEXUS SAAS · WebSocket Server
 * Per-user real-time updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Users } from '../models/db.js';
import { getUserPrices } from '../services/botManager.js';

// userId -> Set of WebSocket connections
const userSockets = new Map();

export function broadcastToUser(userId, data) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(data);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch {}
    }
  }
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Extract token from query string
    const url    = new URL(req.url, 'http://localhost');
    const token  = url.searchParams.get('token');

    let userId = null;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      userId = payload.userId;
    } catch {
      ws.close(1008, 'Unauthorized');
      return;
    }

    const user = Users.findById(userId);
    if (!user) { ws.close(1008, 'User not found'); return; }

    // Register socket
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(ws);

    // Send initial state
    const prices = getUserPrices(userId);
    ws.send(JSON.stringify({
      type:   'INIT',
      state:  user.botState,
      prices,
      botLog: user.botLog || [],
      user:   Users.safePublic(user),
    }));

    ws.on('close', () => {
      const sockets = userSockets.get(userId);
      if (sockets) { sockets.delete(ws); if (sockets.size === 0) userSockets.delete(userId); }
    });

    ws.on('error', () => {
      const sockets = userSockets.get(userId);
      if (sockets) sockets.delete(ws);
    });
  });

  return wss;
}
