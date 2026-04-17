/**
 * NEXUS · Bot Control Routes — settings fix included
 */
import express from 'express';
import { Users } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';
import { startUserBot, stopUserBot, resetUserBot, getUserPrices } from '../services/botManager.js';
import { broadcastToUser } from './ws.js';

const router = express.Router();

router.get('/state', requireAuth, (req, res) => {
  const fresh  = Users.findById(req.user.id);
  const prices = getUserPrices(req.user.id);
  res.json({ state: fresh?.botState, prices, botLog: fresh?.botLog || [] });
});

router.post('/start', requireAuth, (req, res) => {
  startUserBot(req.user.id);
  res.json({ ok: true, status: 'running' });
});

router.post('/stop', requireAuth, (req, res) => {
  stopUserBot(req.user.id);
  res.json({ ok: true, status: 'stopped' });
});

router.post('/reset', requireAuth, (req, res) => {
  resetUserBot(req.user.id);
  res.json({ ok: true, status: 'idle' });
});

// ── Settings — fixed: reads from body, validates, saves, broadcasts ──────────
router.put('/settings', requireAuth, (req, res) => {
  try {
    const { maxTradeUSD, stopLossPct, takeProfitPct, maxDrawdownPct,
            leverageEnabled, maxLeverage, startingBalance, botMode } = req.body;

    const updates = {};
    if (maxTradeUSD    != null) updates.maxTradeUSD    = Math.max(5,    Math.min(10000, Number(maxTradeUSD)));
    if (stopLossPct    != null) updates.stopLossPct    = Math.max(0.005, Math.min(0.5,  Number(stopLossPct)));
    if (takeProfitPct  != null) updates.takeProfitPct  = Math.max(0.01,  Math.min(1.0,  Number(takeProfitPct)));
    if (maxDrawdownPct != null) updates.maxDrawdownPct = Math.max(0.05,  Math.min(0.5,  Number(maxDrawdownPct)));
    if (leverageEnabled != null) updates.leverageEnabled = leverageEnabled === true || leverageEnabled === 'true';
    if (maxLeverage    != null) updates.maxLeverage    = Math.max(2,     Math.min(20,   Number(maxLeverage)));
    if (startingBalance!= null) updates.startingBalance= Math.max(1,     Number(startingBalance));
    if (botMode)                updates.botMode        = ['PAPER','LIVE'].includes(botMode) ? botMode : 'PAPER';

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    const updated = Users.update(req.user.id, updates);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    // Broadcast updated user to WS clients so dashboard refreshes immediately
    broadcastToUser(req.user.id, { type: 'USER_UPDATE', user: Users.safePublic(updated) });

    res.json({ ok: true, user: Users.safePublic(updated) });
  } catch (e) {
    console.error('[Bot] Settings error:', e);
    res.status(500).json({ error: e.message });
  }
});
export default router;
