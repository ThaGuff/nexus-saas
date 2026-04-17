import express from 'express';
import { Users, Bots, Trades, BotLogs } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';
import { startBot, stopBot, resetBot, createBot, getBotsSummary, getBotState, getUserPrices, getStrategyList, STRATEGY_LIST, applyStartingBalance, broadcastBotState } from '../services/botManager.js';
import { broadcastToUser } from './ws.js';

const router = express.Router();

// ── Multi-bot routes ──────────────────────────────────────────────────────────
router.get('/bots', requireAuth, async (req, res) => {
  try { res.json({ bots: await getBotsSummary(req.user.id) }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

router.post('/bots', requireAuth, async (req, res) => {
  try {
    const bot = await createBot(req.user.id, {
      name:            req.body.name            || 'New Bot',
      strategy:        req.body.strategy        || 'PRECISION',
      botMode:         req.body.botMode         || 'PAPER',
      color:           req.body.color           || '#00d68f',
      startingBalance: req.body.startingBalance || req.user.startingBalance || 100,
      maxTradeUSD:     req.body.maxTradeUSD     || req.user.maxTradeUSD || 20,
      stopLossPct:     req.body.stopLossPct     || req.user.stopLossPct || 0.05,
      takeProfitPct:   req.body.takeProfitPct   || req.user.takeProfitPct || 0.08,
      maxDrawdownPct:  req.body.maxDrawdownPct  || req.user.maxDrawdownPct || 0.20,
      maxPositionPct:  req.body.maxPositionPct  || req.user.maxPositionPct || 0.35,
      exchangeId:      req.body.exchangeId      || 'paper',
    });
    res.json({ ok:true, bot });
  } catch(e) { res.status(400).json({ error:e.message }); }
});

router.patch('/bots/:botId', requireAuth, async (req, res) => {
  try {
    const bot = await Bots.findById(req.params.botId);
    if (!bot || bot.userId !== req.user.id) return res.status(404).json({ error:'Bot not found' });
    const updated = await Bots.update(req.params.botId, req.body);
    await broadcastBotState(req.user.id);
    res.json({ ok:true, bot:updated });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

router.delete('/bots/:botId', requireAuth, async (req, res) => {
  try {
    const bot = await Bots.findById(req.params.botId);
    if (!bot || bot.userId !== req.user.id) return res.status(404).json({ error:'Bot not found' });
    await stopBot(req.params.botId).catch(()=>{});
    await Bots.delete(req.params.botId);
    await broadcastBotState(req.user.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

router.post('/bots/:botId/start',  requireAuth, async (req, res) => {
  try {
    const bot = await Bots.findById(req.params.botId);
    if (!bot || bot.userId !== req.user.id) return res.status(404).json({ error:'Not found' });
    res.json(await startBot(req.params.botId));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

router.post('/bots/:botId/stop',   requireAuth, async (req, res) => {
  try { res.json(await stopBot(req.params.botId)); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

router.post('/bots/:botId/reset',  requireAuth, async (req, res) => {
  try { await resetBot(req.params.botId); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Legacy single-bot + settings ─────────────────────────────────────────────
router.get('/state',      requireAuth, async (req, res) => {
  try { res.json(await getBotState(req.user.id)); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

router.get('/strategies', (_, res) => res.json({ strategies: STRATEGY_LIST }));

// Global settings (creates/updates default bot if none exists)
router.put('/settings', requireAuth, async (req, res) => {
  try {
    const { maxTradeUSD, stopLossPct, takeProfitPct, maxDrawdownPct,
            leverageEnabled, maxLeverage, startingBalance, botMode,
            tradingStrategy, maxPositionPct } = req.body;

    const updates = {};
    if (maxTradeUSD     != null) updates.maxTradeUSD    = Math.max(5,    Math.min(100000,+maxTradeUSD));
    if (stopLossPct     != null) updates.stopLossPct    = Math.max(0.005,Math.min(0.9,  +stopLossPct));
    if (takeProfitPct   != null) updates.takeProfitPct  = Math.max(0.01, Math.min(5.0,  +takeProfitPct));
    if (maxDrawdownPct  != null) updates.maxDrawdownPct = Math.max(0.05, Math.min(0.95, +maxDrawdownPct));
    if (leverageEnabled != null) updates.leverageEnabled = !!leverageEnabled;
    if (maxLeverage     != null) updates.maxLeverage    = Math.max(2,Math.min(20,+maxLeverage));
    if (startingBalance != null) updates.startingBalance = Math.max(1,+startingBalance);
    if (maxPositionPct  != null) updates.maxPositionPct = Math.max(0.05,Math.min(1.0,+maxPositionPct));
    if (botMode && ['PAPER','LIVE'].includes(botMode)) updates.botMode = botMode;
    if (tradingStrategy && STRATEGY_LIST.find(s=>s.key===tradingStrategy)) updates.tradingStrategy = tradingStrategy;
    if (!Object.keys(updates).length) return res.status(400).json({ error:'No valid settings' });

    const updated = await Users.update(req.user.id, updates);

    // Ensure at least one bot exists
    const existingBots = await Bots.forUser(req.user.id);
    if (existingBots.length === 0) {
      await Bots.create(req.user.id, {
        name: 'Bot 1', strategy: updates.tradingStrategy || req.user.tradingStrategy || 'PRECISION',
        botMode: updates.botMode || req.user.botMode || 'PAPER',
        startingBalance: updates.startingBalance || req.user.startingBalance || 100,
        maxTradeUSD: updates.maxTradeUSD || req.user.maxTradeUSD || 20,
        stopLossPct: updates.stopLossPct || req.user.stopLossPct || 0.05,
        takeProfitPct: updates.takeProfitPct || req.user.takeProfitPct || 0.08,
        maxDrawdownPct: updates.maxDrawdownPct || req.user.maxDrawdownPct || 0.20,
      });
    } else if (updates.startingBalance) {
      await applyStartingBalance(req.user.id, updates.startingBalance);
    }

    broadcastToUser(req.user.id, { type:'USER_UPDATE', user:Users.safePublic(updated) });
    const fresh = await getBotState(req.user.id);
    broadcastToUser(req.user.id, { type:'BOTS_UPDATE', ...fresh });
    res.json({ ok:true, user:Users.safePublic(updated) });
  } catch(e) { console.error('[Bot] Settings error:',e); res.status(500).json({ error:e.message }); }
});

export default router;
