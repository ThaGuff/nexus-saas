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
import marketRoutes   from './routes/market.js';
import aiRoutes       from './routes/ai.js';
import manualRoutes   from './routes/manual.js';
import customRoutes   from './routes/customStrategy.js';
import { setupWebSocket } from './routes/ws.js';
import referralRoutes from './routes/referrals.js';
import { restoreActiveBots } from './services/botManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3000;
const FRONTEND  = process.env.FRONTEND_URL || 'http://localhost:5173';

const app  = express();
const http = createServer(app);

app.use(cors({ origin: [FRONTEND, 'http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const limiter     = rateLimit({ windowMs: 15*60*1000, max: 200, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20,  message: { error: 'Too many auth attempts' } });
const aiLimiter   = rateLimit({ windowMs: 60*1000,    max: 10,  message: { error: 'AI rate limit' } });

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);
app.use('/api/ai/',   aiLimiter);

app.use('/api/auth',      authRoutes);
app.use('/api/billing',   billingRoutes);
app.use('/api/bot',       botRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/market',    marketRoutes);
app.use('/api/ai',        aiRoutes);
app.use('/api/manual',    manualRoutes);
app.use('/api/custom',    customRoutes);
app.use('/api/referrals', referralRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString(), version: '6.0.0' }));

// Subscription tier info
app.get('/api/plans', (_, res) => res.json({
  plans: [
    {
      id: 'basic', name: 'Basic', price: 29.99, stripePriceId: process.env.STRIPE_BASIC_PRICE_ID,
      bots: 1, features: ['1 trading bot', 'PRECISION strategy', 'DCA+ strategy', 'Paper trading', 'Live log', 'Email support'],
      strategies: ['PRECISION', 'DCA_PLUS'],
    },
    {
      id: 'premium', name: 'Premium', price: 69.99, stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID,
      bots: 3, popular: true,
      features: ['3 trading bots', 'All 7 strategies', 'Custom strategy builder', 'Manual trading', 'AI trading assistant', 'Priority support', 'Advanced analytics'],
      strategies: ['PRECISION', 'DCA_PLUS', 'MOMENTUM', 'SWING', 'REVERSAL', 'BREAKOUT', 'AGGRESSIVE'],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: 149.99, stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
      bots: 5, popular: false,
      features: ['5 trading bots', 'All 7 strategies', 'Dedicated Gemini API key', 'Strategy marketplace access', 'Webhook API access', 'Custom onboarding call', 'White-glove support', 'Priority bug fixes'],
      strategies: ['PRECISION', 'DCA_PLUS', 'MOMENTUM', 'SWING', 'REVERSAL', 'BREAKOUT', 'AGGRESSIVE'],
    },
  ],
}));

const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
app.get('*', (_, res) => {
  const idx = path.join(distPath, 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.json({ status: 'Frontend not built' });
});

setupWebSocket(http);
http.listen(PORT, () => {
  console.log(`\n🚀 PLEX Trader v1.0 · Port ${PORT}`);
  restoreActiveBots();
});
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received — flushing bot state...');
  try {
    const { restoreActiveBots } = await import('./services/botManager.js');
    // Give bots 3 seconds to sync state to DB
    await new Promise(r => setTimeout(r, 3000));
  } catch {}
  process.exit(0);
});
process.on('uncaughtException',  e => console.error('[ERROR]', e.message));
process.on('unhandledRejection', r => console.error('[REJECT]', r));
