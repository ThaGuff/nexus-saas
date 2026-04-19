/**
 * NEXUS · Custom Strategy Builder (Premium)
 * Users define their own entry/exit conditions
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// In-memory store (persist to DB in production)
const userStrategies = new Map();

const CONDITION_OPS = ['>', '<', '>=', '<=', '=='];
const CONDITION_FIELDS = ['rsi', 'macd.histogram', 'bb.pct', 'bb.width', 'volumeRatio', 'mom5', 'mom10', 'change24h', 'ema9', 'ema21', 'ema50'];

function requirePremium(req, res, next) {
  if (!['premium', 'pro'].includes(req.user?.plan)) {
    return res.status(403).json({ error: 'Custom strategies require Premium.' });
  }
  next();
}

router.get('/', requireAuth, requirePremium, (req, res) => {
  res.json({ strategies: userStrategies.get(req.user.id) || [] });
});

router.post('/', requireAuth, requirePremium, (req, res) => {
  const { name, description, conditions, minConditions, minScore } = req.body;
  if (!name || !conditions?.length) return res.status(400).json({ error: 'name and conditions required' });

  const strat = {
    id:            Date.now().toString(),
    name,
    description:   description || '',
    conditions:    conditions.slice(0, 10),
    minConditions: minConditions || Math.ceil(conditions.length * 0.6),
    minScore:      minScore || 6,
    createdAt:     new Date().toISOString(),
    stats:         { trades: 0, wins: 0, losses: 0 },
  };

  const list = userStrategies.get(req.user.id) || [];
  list.push(strat);
  userStrategies.set(req.user.id, list);
  res.json({ ok: true, strategy: strat });
});

router.delete('/:id', requireAuth, requirePremium, (req, res) => {
  const list = (userStrategies.get(req.user.id) || []).filter(s => s.id !== req.params.id);
  userStrategies.set(req.user.id, list);
  res.json({ ok: true });
});

router.get('/schema', (_, res) => {
  res.json({ fields: CONDITION_FIELDS, ops: CONDITION_OPS });
});

export default router;
