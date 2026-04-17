import express from 'express';
import { Users } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';
import { startUserBot, stopUserBot, resetUserBot, getUserPrices, getBotState, getStrategyList, STRATEGY_LIST } from '../services/botManager.js';
import { broadcastToUser } from './ws.js';

const router = express.Router();

router.get('/state', requireAuth, async (req, res) => {
  try {
    const data = await getBotState(req.user.id);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/strategies', (_, res) => res.json({ strategies: STRATEGY_LIST }));

router.post('/start',  requireAuth, (req, res) => { startUserBot(req.user.id);                  res.json({ ok:true }); });
router.post('/stop',   requireAuth, (req, res) => { stopUserBot(req.user.id);                   res.json({ ok:true }); });
router.post('/reset',  requireAuth, async (req, res) => { await resetUserBot(req.user.id);      res.json({ ok:true }); });

router.put('/settings', requireAuth, async (req, res) => {
  try {
    const { maxTradeUSD, stopLossPct, takeProfitPct, maxDrawdownPct,
            leverageEnabled, maxLeverage, startingBalance, botMode,
            tradingStrategy, maxPositionPct } = req.body;

    const updates = {};
    if (maxTradeUSD     != null) updates.maxTradeUSD    = Math.max(5,    Math.min(100000, +maxTradeUSD));
    if (stopLossPct     != null) updates.stopLossPct    = Math.max(0.005,Math.min(0.9,   +stopLossPct));
    if (takeProfitPct   != null) updates.takeProfitPct  = Math.max(0.01, Math.min(5.0,   +takeProfitPct));
    if (maxDrawdownPct  != null) updates.maxDrawdownPct = Math.max(0.05, Math.min(0.95,  +maxDrawdownPct));
    if (leverageEnabled != null) updates.leverageEnabled= !!leverageEnabled;
    if (maxLeverage     != null) updates.maxLeverage    = Math.max(2, Math.min(20, +maxLeverage));
    if (startingBalance != null) updates.startingBalance= Math.max(1, +startingBalance);
    if (maxPositionPct  != null) updates.maxPositionPct = Math.max(0.05, Math.min(1.0, +maxPositionPct));
    if (botMode && ['PAPER','LIVE'].includes(botMode)) updates.botMode = botMode;
    if (tradingStrategy && STRATEGY_LIST.find(s=>s.key===tradingStrategy)) updates.tradingStrategy = tradingStrategy;

    if (!Object.keys(updates).length) return res.status(400).json({ error:'No valid settings provided' });

    const updated = await Users.update(req.user.id, updates);
    // Broadcast immediately — dashboard updates without refresh
    broadcastToUser(req.user.id, { type:'USER_UPDATE', user: Users.safePublic(updated) });
    res.json({ ok:true, user: Users.safePublic(updated) });
  } catch(e) {
    console.error('[Bot] Settings error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
