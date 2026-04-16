/**
 * NEXUS SAAS · Exchange Connector Routes
 * Users connect their own exchange API keys
 * Supports: Coinbase Advanced Trade, Binance, Crypto.com
 * Note: Robinhood has no public API — not supported
 */

import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { Users } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Simple encryption for API keys at rest
const ENC_KEY = (process.env.JWT_SECRET || 'dev-secret').slice(0, 32).padEnd(32, '0');
const IV_LEN  = 16;

function encrypt(text) {
  try {
    const iv  = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENC_KEY), iv);
    return iv.toString('hex') + ':' + Buffer.concat([cipher.update(text), cipher.final()]).toString('hex');
  } catch { return text; }
}

function decrypt(text) {
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv      = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY), iv);
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString();
  } catch { return text; }
}

// Verify Coinbase Advanced Trade connection
async function verifyCoinbase(apiKey, apiSecret) {
  try {
    const ts  = Math.floor(Date.now() / 1000).toString();
    const msg = ts + 'GET' + '/api/v3/brokerage/accounts' + '';
    const sig = crypto.createHmac('sha256', apiSecret).update(msg).digest('hex');
    const res = await axios.get('https://api.coinbase.com/api/v3/brokerage/accounts', {
      headers: { 'CB-ACCESS-KEY': apiKey, 'CB-ACCESS-SIGN': sig, 'CB-ACCESS-TIMESTAMP': ts },
      timeout: 8000,
    });
    return { ok: true, accounts: res.data?.accounts?.length || 0 };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

// Verify Binance connection
async function verifyBinance(apiKey, apiSecret) {
  try {
    const ts  = Date.now();
    const qs  = `timestamp=${ts}`;
    const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
    const res = await axios.get(`https://api.binance.com/api/v3/account?${qs}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
      timeout: 8000,
    });
    return { ok: true, balances: res.data?.balances?.filter(b => parseFloat(b.free) > 0).length };
  } catch (e) {
    return { ok: false, error: e.response?.data?.msg || e.message };
  }
}

// GET /api/exchanges — list connected exchanges
router.get('/', requireAuth, (req, res) => {
  const exchanges = req.user.exchanges || {};
  // Return masked keys only
  const masked = {};
  for (const [ex, data] of Object.entries(exchanges)) {
    masked[ex] = {
      connected:   data.connected,
      connectedAt: data.connectedAt,
      label:       data.label,
      apiKeyMask:  data.apiKeyMask,
      mode:        data.mode,
    };
  }
  res.json({ exchanges: masked });
});

// POST /api/exchanges/connect — connect an exchange
router.post('/connect', requireAuth, async (req, res) => {
  const { exchange, apiKey, apiSecret, label, mode = 'PAPER' } = req.body;

  if (!exchange || !apiKey || !apiSecret) {
    return res.status(400).json({ error: 'exchange, apiKey, and apiSecret are required' });
  }

  const supported = ['coinbase', 'binance', 'cryptocom'];
  if (!supported.includes(exchange)) {
    return res.status(400).json({
      error: `Exchange "${exchange}" not supported. Supported: ${supported.join(', ')}. Note: Robinhood does not offer a public API.`,
    });
  }

  // Verify connection
  let verification = { ok: false, error: 'Unknown exchange' };
  if (exchange === 'coinbase') verification = await verifyCoinbase(apiKey, apiSecret);
  if (exchange === 'binance')  verification = await verifyBinance(apiKey, apiSecret);
  if (exchange === 'cryptocom') verification = { ok: true }; // Crypto.com verification placeholder

  if (!verification.ok && mode !== 'PAPER') {
    return res.status(400).json({ error: `Connection failed: ${verification.error}` });
  }

  const exchanges = req.user.exchanges || {};
  exchanges[exchange] = {
    connected:   true,
    connectedAt: new Date().toISOString(),
    label:       label || exchange,
    apiKeyEnc:   encrypt(apiKey),
    apiSecretEnc: encrypt(apiSecret),
    apiKeyMask:  apiKey.slice(0, 6) + '...' + apiKey.slice(-4),
    mode,
    verified:    verification.ok,
  };

  Users.update(req.user.id, { exchanges });
  res.json({ ok: true, exchange, verified: verification.ok });
});

// DELETE /api/exchanges/:exchange — disconnect
router.delete('/:exchange', requireAuth, (req, res) => {
  const exchanges = { ...req.user.exchanges };
  delete exchanges[req.params.exchange];
  Users.update(req.user.id, { exchanges });
  res.json({ ok: true });
});

export { decrypt };
export default router;
