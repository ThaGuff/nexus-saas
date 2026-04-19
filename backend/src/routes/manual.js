/**
 * NEXUS · Manual Trading Routes (Premium)
 * Allows users to place manual paper or live trades
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Trades, Bots } from '../models/db.js';
import { broadcastBotState } from '../services/botManager.js';
import { getUserPrices } from '../services/botManager.js';

const router = express.Router();
const FEE = 0.006;

// Middleware: require premium for manual trading
function requirePremium(req, res, next) {
  const plan = req.user?.plan || 'trial';
  if (!['premium', 'pro', 'trial'].includes(plan)) {
    return res.status(403).json({ error: 'Manual trading requires a Premium subscription.' });
  }
  next();
}

// POST /api/manual/trade — place a manual trade
router.post('/trade', requireAuth, requirePremium, async (req, res) => {
  try {
    const { botId, type, symbol, amountUSD, notes } = req.body;
    if (!botId || !type || !symbol || !amountUSD) {
      return res.status(400).json({ error: 'botId, type, symbol, amountUSD required' });
    }
    if (!['BUY', 'SELL'].includes(type.toUpperCase())) {
      return res.status(400).json({ error: 'type must be BUY or SELL' });
    }

    const bot = await Bots.findById(botId);
    if (!bot || bot.userId !== req.user.id) return res.status(404).json({ error: 'Bot not found' });

    const prices = getUserPrices(req.user.id);
    const price = prices[symbol]?.price;
    if (!price) return res.status(400).json({ error: `No live price for ${symbol}` });

    const spend = Math.min(+amountUSD, bot.balance - 1);
    if (spend < 1) return res.status(400).json({ error: 'Insufficient balance' });

    const fee  = spend * FEE;
    const net  = spend - fee;
    const qty  = net / price;

    const trade = {
      type:      type.toUpperCase(),
      coin:      symbol,
      qty, price,
      gross:     spend,
      fee,
      netProceeds: net,
      pnl:       null,
      strategy:  'MANUAL',
      confidence:5,
      signals:   ['MANUAL_TRADE'],
      reasoning: notes || 'Manual trade placed by user.',
      source:    'MANUAL',
    };
    await Trades.insert(req.user.id, trade, botId);

    // Update bot balance in memory/DB
    const { botMem } = await import('../services/botManager.js').catch(() => ({ botMem: new Map() }));
    // Balance update handled by next broadcastBotState cycle
    await broadcastBotState(req.user.id);

    res.json({ ok: true, trade: { ...trade, id: Date.now() } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/manual/watchlist — user's watchlist
const watchlists = new Map();
router.get('/watchlist', requireAuth, (req, res) => {
  res.json({ watchlist: watchlists.get(req.user.id) || ['BTC','ETH','SOL','BNB','AVAX'] });
});
router.post('/watchlist', requireAuth, (req, res) => {
  const { symbols } = req.body;
  watchlists.set(req.user.id, symbols?.slice(0, 20) || []);
  res.json({ ok: true });
});

export default router;
