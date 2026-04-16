/**
 * NEXUS SAAS · Main Server
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import authRoutes     from './routes/auth.js';
import billingRoutes  from './routes/billing.js';
import botRoutes      from './routes/bot.js';
import exchangeRoutes from './routes/exchanges.js';
import { setupWebSocket } from './routes/ws.js';
import { restoreActiveBots } from './services/botManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3000;
const FRONTEND  = process.env.FRONTEND_URL || 'http://localhost:5173';

const app  = express();
const http = createServer(app);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: [FRONTEND, 'http://localhost:5173', 'http://localhost:3000'], credentials: true }));

// Stripe webhook needs raw body — must be before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/billing',   billingRoutes);
app.use('/api/bot',       botRoutes);
app.use('/api/exchanges', exchangeRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Serve built frontend ─────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
app.get('*', (_, res) => {
  const idx = path.join(distPath, 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.json({ status: 'Frontend not built. Run: cd frontend && npm run build' });
});

// ── WebSocket ────────────────────────────────────────────────────────────────
setupWebSocket(http);

// ── Start ────────────────────────────────────────────────────────────────────
http.listen(PORT, () => {
  console.log(`\n🚀 NEXUS SAAS running on port ${PORT}`);
  console.log(`   Frontend: ${FRONTEND}`);
  console.log(`   API: http://localhost:${PORT}/api\n`);
  restoreActiveBots();
});

process.on('SIGTERM', () => { console.log('Shutting down...'); process.exit(0); });
process.on('uncaughtException',  e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', r => console.error('Rejection:', r));
