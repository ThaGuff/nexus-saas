import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { getBotState, getStrategyList } from '../services/botManager.js';

const userSockets = new Map();

export function broadcastToUser(userId, data) {
  const sockets = userSockets.get(userId);
  if (!sockets?.size) return;
  const msg = JSON.stringify(data);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) try { ws.send(msg); } catch {}
  }
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    let userId = null;
    try { const p = jwt.verify(token, process.env.JWT_SECRET||'dev-secret'); userId = p.userId; }
    catch { ws.close(1008, 'Unauthorized'); return; }

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(ws);

    try {
      const { bots, prices, botLog } = await getBotState(userId);
      ws.send(JSON.stringify({ type:'INIT', bots, prices, botLog, strategies: getStrategyList() }));
    } catch {}

    ws.on('close', () => { const s=userSockets.get(userId); if(s){s.delete(ws);if(!s.size)userSockets.delete(userId);} });
    ws.on('error', () => { const s=userSockets.get(userId); if(s)s.delete(ws); });
  });
}
