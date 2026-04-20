/**
 * PLEX TRADER · AI Assistant (Gemini free tier)
 * FIX: GEMINI_URL built per-request so env var is always read fresh
 */
import express from 'express';
import axios   from 'axios';
import { requireAuth } from '../middleware/auth.js';
import { getBotsSummary, getUserPrices } from '../services/botManager.js';

const router = express.Router();
const convHistory = new Map();

// Build URL per-request — never stale even if env var set after boot
function geminiUrl() {
  const key = process.env.GEMINI_API_KEY || '';
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
}

router.post('/chat', requireAuth, async (req, res) => {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    return res.status(503).json({
      error: 'ARIA needs a Gemini API key. Get one free at aistudio.google.com → Get API Key, then add GEMINI_API_KEY to Railway environment variables.',
    });
  }

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    const bots   = await getBotsSummary(req.user.id).catch(()=>[]);
    const prices = getUserPrices(req.user.id);

    const portfolioCtx = bots.map(b => {
      const positions = Object.entries(b.portfolio||{}).map(([sym, pos]) => {
        const px = prices[sym]?.price || 0;
        const lev = pos.leverage || 1;
        const pricePct = pos.avgCost > 0 ? ((px - pos.avgCost) / pos.avgCost * 100).toFixed(2) : 0;
        const effPct   = (pricePct * lev).toFixed(2);
        return `${sym}${lev > 1 ? ` [${lev}x]` : ''}: ${pos.qty.toFixed(4)} @ $${pos.avgCost.toFixed(2)} → $${px.toFixed(2)} (${pricePct}% price, ${effPct}% margin)`;
      }).join('; ');
      const sells = (b.trades||[]).filter(t => t.type==='SELL');
      const wr = sells.length ? `${((sells.filter(t=>t.pnl>0).length/sells.length)*100).toFixed(0)}%` : 'no data yet';
      const learning = b.learning || {};
      return [
        `Bot "${b.name}" [${b.strategy}${b.leverageEnabled ? ` ${b.maxLeverage}x` : ''}]:`,
        `  Cash: $${b.balance?.toFixed(2)}, Total: $${b.totalValue?.toFixed(2)}, P&L: $${b.pnl?.toFixed(2)}`,
        `  Win Rate: ${wr} (${sells.length} closed trades), Win streak: ${learning.winStreak||0}`,
        `  Positions: ${positions || 'none'}`,
      ].join('\n');
    }).join('\n\n');

    const uid = req.user.id;
    if (!convHistory.has(uid)) convHistory.set(uid, []);
    const history = convHistory.get(uid);

    // Build conversation for Gemini (system prompt + history + current message)
    const historyText = history.slice(-8).map(h => `${h.role === 'user' ? 'User' : 'ARIA'}: ${h.text}`).join('\n');

    const fullPrompt = `You are ARIA, the AI trading assistant for PLEX Trader by PLEX Automation.

You are direct, sharp, and expert-level in crypto trading and technical analysis. You speak like a seasoned quant who respects the user's intelligence. You are aware of the user's live portfolio and give contextual advice.

LIVE PORTFOLIO CONTEXT:
${portfolioCtx || 'No bots running yet.'}

PLATFORM STRATEGIES:
- PRECISION (Basic): RSI<48 rising + MACD bull + BB lower half. Requires 8/10 confidence. Best win rate.
- DCA+ (Basic): BTC/ETH/SOL/XRP/BNB only. Dip buying with RSI recovering. Systematic accumulation.
- MOMENTUM (Premium): Full EMA 9>21>50 cascade + RSI 42-68 + volume. Trend-following only.
- SWING (Premium): EMA21>EMA50 uptrend + RSI pullback 30-52 + RSI recovering. Multi-day holds.
- REVERSAL (Premium): RSI<32 + BB lower + StochRSI panic zone + RSI must be rising. High R:R.
- BREAKOUT (Premium): BB squeeze <5% width + volume >1.8x + price above midband. Captures explosive moves.
- AGGRESSIVE (Premium): Volume >3x OR extreme dip recovery. Multiple catalyst signals required.

LEVERAGE RULES (when enabled):
- At Nx leverage: position controls N× more coins on same margin
- Stop loss triggers at (SL% / N) price movement — much tighter
- PnL = price_change% × leverage × margin_committed
- Example: 20x on $500 margin, 1% SOL move = $100 gain

RULES FOR YOU:
- Never give specific buy/sell advice for real money
- Add risk disclaimers when discussing live trading
- Keep responses under 200 words unless complexity demands more
- Use markdown formatting

${historyText ? `CONVERSATION HISTORY:\n${historyText}\n` : ''}
User: ${message}
ARIA:`;

    const response = await axios.post(geminiUrl(), {
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 700, topP: 0.85 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      ],
    }, { timeout: 25000 });

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      || 'No response generated. Please try again.';

    history.push({ role: 'user',  text: message });
    history.push({ role: 'model', text: reply });
    if (history.length > 20) history.splice(0, history.length - 20);

    res.json({ reply });
  } catch(e) {
    const errMsg = e.response?.data?.error?.message || e.message;
    console.error('[AI] Gemini error:', errMsg);

    // Give user helpful error
    if (errMsg?.includes('API_KEY_INVALID') || errMsg?.includes('API key')) {
      return res.status(401).json({ error: 'Invalid Gemini API key. Get a free key at aistudio.google.com and add it as GEMINI_API_KEY in Railway.' });
    }
    if (errMsg?.includes('quota') || errMsg?.includes('429')) {
      return res.status(429).json({ error: 'Gemini rate limit hit. Free tier allows 15 requests/minute. Try again in a moment.' });
    }
    res.status(500).json({ error: `AI error: ${errMsg}` });
  }
});

router.delete('/chat', requireAuth, (req, res) => {
  convHistory.delete(req.user.id);
  res.json({ ok: true });
});

// Health check — tells frontend if AI is configured
router.get('/status', requireAuth, (req, res) => {
  const configured = !!(process.env.GEMINI_API_KEY);
  res.json({ configured, model: 'gemini-1.5-flash', provider: 'Google AI (free tier)' });
});

export default router;
