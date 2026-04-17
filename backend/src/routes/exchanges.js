import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Exchanges } from '../models/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const exchanges = await Exchanges.forUser(req.user.id);
    // Strip private keys from response
    res.json({ exchanges: exchanges.map(({ _apiKey, _apiSecret, _apiPassphrase, ...safe }) => safe) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/connect', requireAuth, async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret, apiPassphrase, label, mode, walletAddress } = req.body;
    if (!exchange) return res.status(400).json({ error: 'Exchange required' });
    const conn = await Exchanges.connect(req.user.id, { exchange, apiKey, apiSecret, apiPassphrase, label, mode: mode||'PAPER', walletAddress });
    const { _apiKey, _apiSecret, _apiPassphrase, ...safe } = conn;
    res.json({ ok: true, exchange: safe });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/verify', requireAuth, async (req, res) => {
  try {
    const ex = await Exchanges.findById(req.params.id);
    if (!ex || ex.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });
    // TODO: ping exchange API with decrypted keys
    await Exchanges.update(req.params.id, { lastVerifiedAt: new Date().toISOString() });
    res.json({ ok: true, verified: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ex = await Exchanges.findById(req.params.id);
    if (!ex || ex.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });
    await Exchanges.disconnect(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
