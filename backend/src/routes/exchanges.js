/**
 * PLEX TRADER · Exchange Routes — Phase 3
 * 
 * Includes:
 * - Connect / disconnect exchanges
 * - Verify credentials against real exchange
 * - Live balance sync every 5 minutes
 * - Setup instructions per exchange
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Exchanges } from '../models/db.js';
import { verifyExchange, getLiveBalances, clearAdapter } from '../services/exchanges/index.js';

const router = express.Router();

// Per-user balance cache
const balanceCache = new Map(); // userId → { balances, ts }
const BAL_TTL = 5 * 60 * 1000; // 5 minutes

// Setup instructions per exchange
const SETUP_INSTRUCTIONS = {
  coinbase: {
    name: 'Coinbase Advanced',
    fee: '0.10% taker',
    steps: [
      'Go to coinbase.com → Settings → API',
      'Click "New API Key" → Select "Advanced Trade"',
      'Enable permissions: View + Trade (NOT Withdraw)',
      'Copy your API Key Name and Private Key',
      'Paste both above — Private Key goes in Secret field',
    ],
    fields: ['apiKey', 'apiSecret'],
    warning: 'Never enable Withdrawal permissions on trading API keys.',
  },
  binance: {
    name: 'Binance',
    fee: '0.10% taker (0.075% with BNB)',
    steps: [
      'Go to binance.com → Profile → API Management',
      'Click "Create API" → Label it "PLEX Trader"',
      'Enable: "Enable Spot & Margin Trading" ONLY',
      'Optionally restrict to your server IP for security',
      'Copy API Key and Secret Key',
    ],
    fields: ['apiKey', 'apiSecret'],
    warning: 'Do NOT enable Futures or Withdrawals.',
  },
  kraken: {
    name: 'Kraken',
    fee: '0.16% taker',
    steps: [
      'Go to kraken.com → Security → API',
      'Click "Generate New Key"',
      'Enable: "Query Funds" + "Create & Modify Orders"',
      'Do NOT enable "Withdraw Funds"',
      'Copy API Key and Private Key',
    ],
    fields: ['apiKey', 'apiSecret'],
    warning: 'Note: Kraken uses XBT for Bitcoin, not BTC.',
  },
  cryptocom: {
    name: 'Crypto.com',
    fee: '0.075% taker',
    steps: [
      'Go to crypto.com/exchange → API Management',
      'Click "Create New API Key"',
      'Select Scope: "Spot Trading" + "Read"',
      'Do NOT enable Withdrawal scope',
      'Copy API Key and Secret Key',
    ],
    fields: ['apiKey', 'apiSecret'],
    warning: 'Use Exchange API, not App API. Two different systems.',
  },
};

// GET /api/exchanges — list user's connections
router.get('/', requireAuth, async (req, res) => {
  try {
    const exchanges = await Exchanges.forUser(req.user.id);
    // Strip decrypted keys from response, keep masked version
    res.json({
      exchanges: exchanges.map(({ _apiKey, _apiSecret, _apiPassphrase, ...safe }) => safe),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/exchanges/setup/:exchange — get setup instructions
router.get('/setup/:exchange', (req, res) => {
  const inst = SETUP_INSTRUCTIONS[req.params.exchange];
  if (!inst) return res.status(404).json({ error: 'Unknown exchange' });
  res.json(inst);
});

// POST /api/exchanges/connect — add new exchange connection
router.post('/connect', requireAuth, async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret, apiPassphrase, label, mode } = req.body;
    if (!exchange) return res.status(400).json({ error: 'Exchange required' });
    if (!SETUP_INSTRUCTIONS[exchange]) {
      return res.status(400).json({ error: `Unsupported exchange: ${exchange}. Supported: ${Object.keys(SETUP_INSTRUCTIONS).join(', ')}` });
    }
    if (!apiKey || !apiSecret) return res.status(400).json({ error: 'API key and secret required' });

    const conn = await Exchanges.connect(req.user.id, {
      exchange, apiKey, apiSecret, apiPassphrase: apiPassphrase||null,
      label: label||SETUP_INSTRUCTIONS[exchange].name,
      mode: mode||'PAPER', // default to paper until verified
    });

    const { _apiKey, _apiSecret, _apiPassphrase, ...safe } = conn;
    res.json({ ok:true, exchange:safe, message:'Connected. Click Verify to test your credentials.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/exchanges/:id/verify — test credentials against real exchange
router.post('/:id/verify', requireAuth, async (req, res) => {
  try {
    const ex = await Exchanges.findById(req.params.id);
    if (!ex || ex.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });

    const result = await verifyExchange(req.params.id);

    if (result.ok) {
      await Exchanges.update(req.params.id, { lastVerifiedAt: new Date().toISOString() });
    }

    res.json({
      ok: result.ok,
      details: result,
      message: result.ok
        ? `✅ ${ex.exchange} credentials verified. Found ${result.accounts||result.assets||'—'} accounts.`
        : `❌ Verification failed: ${result.error}`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/exchanges/:id/balances — live balance sync (Phase 3)
router.get('/:id/balances', requireAuth, async (req, res) => {
  try {
    const ex = await Exchanges.findById(req.params.id);
    if (!ex || ex.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });

    // Check cache
    const cacheKey = `${req.user.id}:${req.params.id}`;
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < BAL_TTL && req.query.refresh !== '1') {
      return res.json({ balances: cached.balances, cached: true, ts: cached.ts });
    }

    const balances = await getLiveBalances(req.params.id);
    balanceCache.set(cacheKey, { balances, ts: Date.now() });

    res.json({ balances, cached: false, ts: Date.now() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/exchanges/:id/mode — switch PAPER ↔ LIVE
router.patch('/:id/mode', requireAuth, async (req, res) => {
  try {
    const ex = await Exchanges.findById(req.params.id);
    if (!ex || ex.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });

    const { mode } = req.body;
    if (!['PAPER', 'LIVE'].includes(mode)) return res.status(400).json({ error: 'mode must be PAPER or LIVE' });

    if (mode === 'LIVE') {
      // Require verification before going live
      if (!ex.lastVerifiedAt) {
        return res.status(400).json({ error: 'Verify your credentials before switching to LIVE mode.' });
      }
      const verifiedAt = new Date(ex.lastVerifiedAt);
      const hoursSince = (Date.now() - verifiedAt.getTime()) / 3600000;
      if (hoursSince > 24) {
        return res.status(400).json({ error: 'Credentials not recently verified. Please verify again before going LIVE.' });
      }
    }

    await Exchanges.update(req.params.id, { mode });
    clearAdapter(req.params.id); // clear cached adapter so new mode takes effect
    res.json({ ok:true, mode, message: mode === 'LIVE' ? '🔴 LIVE mode enabled. Real money will be traded.' : '📄 Switched to Paper mode.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/exchanges/:id — disconnect
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ex = await Exchanges.findById(req.params.id);
    if (!ex || ex.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });
    clearAdapter(req.params.id);
    await Exchanges.disconnect(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
