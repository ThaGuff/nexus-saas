/**
 * NEXUS SAAS · Bot Control Routes
 */

import express from 'express';
import { Users } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';
import { startUserBot, stopUserBot, resetUserBot, getUserPrices } from '../services/botManager.js';

const router = express.Router();

// GET /api/bot/state
router.get('/state', requireAuth, (req, res) => {
  const prices = getUserPrices(req.user.id);
  res.json({ state: req.user.botState, prices, botLog: req.user.botLog || [] });
});

// POST /api/bot/start
router.post('/start', requireAuth, (req, res) => {
  startUserBot(req.user.id);
  res.json({ ok: true, status: 'running' });
});

// POST /api/bot/stop
router.post('/stop', requireAuth, (req, res) => {
  stopUserBot(req.user.id);
  res.json({ ok: true, status: 'stopped' });
});

// POST /api/bot/reset
router.post('/reset', requireAuth, (req, res) => {
  resetUserBot(req.user.id);
  res.json({ ok: true, status: 'idle' });
});

// PUT /api/bot/settings
router.put('/settings', requireAuth, (req, res) => {
  const { maxTradeUSD, stopLossPct, takeProfitPct, maxDrawdownPct, leverageEnabled, maxLeverage, startingBalance, botMode } = req.body;
  const updates = {};
  if (maxTradeUSD    != null) updates.maxTradeUSD    = Math.max(5,   Math.min(10000, maxTradeUSD));
  if (stopLossPct    != null) updates.stopLossPct    = Math.max(0.01, Math.min(0.5,  stopLossPct));
  if (takeProfitPct  != null) updates.takeProfitPct  = Math.max(0.01, Math.min(1.0,  takeProfitPct));
  if (maxDrawdownPct != null) updates.maxDrawdownPct = Math.max(0.05, Math.min(0.5,  maxDrawdownPct));
  if (leverageEnabled != null) updates.leverageEnabled = !!leverageEnabled;
  if (maxLeverage    != null) updates.maxLeverage    = Math.max(2,    Math.min(20,   maxLeverage));
  if (startingBalance != null) updates.startingBalance = Math.max(10, startingBalance);
  if (botMode)                updates.botMode         = botMode;

  const updated = Users.update(req.user.id, updates);
  res.json({ ok: true, user: Users.safePublic(updated) });
});

export default router;
