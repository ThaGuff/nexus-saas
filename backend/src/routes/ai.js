/**
 * NEXUS · AI Trading Assistant
 * Uses Claude API to answer trading questions in context of user's portfolio
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getBotsSummary, getUserPrices } from '../services/botManager.js';
import axios from 'axios';

const router = express.Router();
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';

// Simple in-memory conversation history per user (last 10 messages)
const convHistory = new Map();

router.post('/chat', requireAuth, async (req, res) => {
  if (!CLAUDE_KEY) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    // Build context from user's live portfolio
    const bots   = await getBotsSummary(req.user.id).catch(() => []);
    const prices = getUserPrices(req.user.id);

    const portfolioCtx = bots.map(b => {
      const positions = Object.entries(b.portfolio || {}).map(([sym, pos]) => {
        const px = prices[sym]?.price || 0;
        const pnlPct = pos.avgCost > 0 ? ((px - pos.avgCost) / pos.avgCost * 100).toFixed(2) : 0;
        return `${sym}: ${pos.qty.toFixed(4)} @ $${pos.avgCost.toFixed(2)} (now $${px.toFixed(2)}, ${pnlPct}%)`;
      }).join(', ');

      const sells = (b.trades || []).filter(t => t.type === 'SELL');
      const wr = sells.length ? `${((sells.filter(t => t.pnl > 0).length / sells.length) * 100).toFixed(0)}%` : 'no sells yet';

      return `Bot "${b.name}" [${b.strategy}]: Balance $${b.balance?.toFixed(2)}, P&L $${b.pnl?.toFixed(2)} (${b.pnlPct?.toFixed(2)}%), WR: ${wr}, Positions: ${positions || 'none'}`;
    }).join('\n');

    const systemPrompt = `You are ARIA, the AI trading assistant built into NEXUS Trader — an autonomous crypto trading platform.

You are direct, concise, and expert-level in crypto trading. You speak like a seasoned quant trader who respects the user's intelligence.

User's current portfolio context:
${portfolioCtx || 'No bots running yet.'}

Available strategies:
- PRECISION (Basic): RSI+MACD+BB triple confirmation. Best win rate, patient entries.
- DCA+ (Basic): Systematic blue-chip accumulation on dips. Most consistent.
- MOMENTUM (Premium): EMA cascade trend following. Best in bull markets.
- SWING (Premium): Multi-day pullback trading in uptrends.
- REVERSAL (Premium): Extreme oversold mean reversion. High R:R.
- BREAKOUT (Premium): BB squeeze + volume explosion. Captures big moves.
- AGGRESSIVE (Premium): Catalyst-driven entries. High risk/reward.

Rules:
- Never give specific financial advice or tell users to buy/sell specific assets with real money
- Always add appropriate risk disclaimers for real-money discussions
- Be helpful about strategy setup, indicator explanations, and platform features
- Keep responses under 200 words unless the question requires depth
- Use markdown formatting for readability`;

    // Get or init conversation
    const userId = req.user.id;
    if (!convHistory.has(userId)) convHistory.set(userId, []);
    const history = convHistory.get(userId);

    history.push({ role: 'user', content: message });

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model:      'claude-opus-4-5',
      max_tokens: 600,
      system:     systemPrompt,
      messages:   history.slice(-10), // last 10 messages for context
    }, {
      headers: {
        'x-api-key':         CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      timeout: 20000,
    });

    const reply = response.data.content[0]?.text || 'No response generated.';
    history.push({ role: 'assistant', content: reply });

    // Cap history at 20 messages
    if (history.length > 20) history.splice(0, history.length - 20);

    res.json({ reply, tokens: response.data.usage });
  } catch (e) {
    console.error('[AI] Chat error:', e.response?.data || e.message);
    res.status(500).json({ error: 'AI request failed. Try again.' });
  }
});

router.delete('/chat', requireAuth, (req, res) => {
  convHistory.delete(req.user.id);
  res.json({ ok: true });
});

export default router;
