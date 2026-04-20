/**
 * PLEX TRADER · AI Assistant (Gemini free tier)
 * Uses Google Gemini 1.5 Flash — no Anthropic API charges
 */
import express from 'express';
import axios   from 'axios';
import { requireAuth } from '../middleware/auth.js';
import { getBotsSummary, getUserPrices } from '../services/botManager.js';

const router = express.Router();
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

// Per-user conversation history (last 10 exchanges)
const convHistory = new Map();

router.post('/chat', requireAuth, async (req, res) => {
  if (!GEMINI_KEY) {
    return res.status(503).json({ error: 'AI not configured. Set GEMINI_API_KEY in Railway env vars (free at aistudio.google.com).' });
  }

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    // Build portfolio context
    const bots   = await getBotsSummary(req.user.id).catch(()=>[]);
    const prices = getUserPrices(req.user.id);

    const portfolioCtx = bots.map(b=>{
      const positions=Object.entries(b.portfolio||{}).map(([sym,pos])=>{
        const px=prices[sym]?.price||0;
        const pnlPct=pos.avgCost>0?((px-pos.avgCost)/pos.avgCost*100).toFixed(2):0;
        return `${sym}: ${pos.qty.toFixed(4)} @ $${pos.avgCost.toFixed(2)} (now $${px.toFixed(2)}, ${pnlPct}%)`;
      }).join(', ');
      const sells=(b.trades||[]).filter(t=>t.type==='SELL');
      const wr=sells.length?`${((sells.filter(t=>t.pnl>0).length/sells.length)*100).toFixed(0)}%`:'no data';
      const learning=b.learning||{};
      return `Bot "${b.name}" [${b.strategy}]: Balance $${b.balance?.toFixed(2)}, P&L $${b.pnl?.toFixed(2)}, WR: ${wr}, Win streak: ${learning.winStreak||0}, Positions: ${positions||'none'}`;
    }).join('\n');

    const systemPrompt = `You are ARIA, the AI trading assistant for PLEX Trader — an autonomous crypto trading platform by PLEX Automation.

You are direct, concise, and expert-level in crypto trading strategies and technical analysis. You speak like a seasoned quant who respects the user's intelligence.

User's live portfolio:
${portfolioCtx||'No bots running yet.'}

Platform strategies available:
- PRECISION (Basic): RSI<48 + MACD bull + BB lower. Triple confirmation. Requires 8/10 confidence.
- DCA+ (Basic): Tier-1 blue chips only (BTC/ETH/SOL/XRP/BNB). Dip buying with RSI recovery.
- MOMENTUM (Premium): Full EMA cascade 9>21>50 + RSI 42-68. Trend-following.
- SWING (Premium): EMA21>EMA50 uptrend + RSI pullback to 30-52. Multi-day holds.
- REVERSAL (Premium): RSI<32 + BB lower + StochRSI panic + RSI rising. High R:R bounces.
- BREAKOUT (Premium): BB squeeze <5% + volume >1.8x + price above midband. Explosive moves.
- AGGRESSIVE (Premium): Volume >3x OR extreme dip+recovery. Catalyst-driven only.

Rules:
- All strategies require 8/10 confidence before executing
- Exits require confirmed downtrend (multiple signals), not just one indicator
- Never provide financial advice or tell users to buy/sell with real money
- Keep responses under 200 words unless depth is required
- Format with markdown for readability`;

    // Get or init history for this user
    const uid = req.user.id;
    if (!convHistory.has(uid)) convHistory.set(uid, []);
    const history = convHistory.get(uid);

    // Build Gemini contents array (alternating user/model)
    const contents = [
      { role:'user', parts:[{text:`${systemPrompt}\n\nUser: ${message}`}] }
    ];

    // Append recent history (last 5 pairs)
    const recentHistory = history.slice(-10);
    if (recentHistory.length>0) {
      // Interleave history before current message
      contents.unshift(...recentHistory);
    }

    const response = await axios.post(GEMINI_URL, {
      contents: [{ role:'user', parts:[{text:`${systemPrompt}\n\nPrevious context:\n${history.slice(-6).map(h=>`${h.role}: ${h.parts[0].text}`).join('\n')}\n\nUser: ${message}`}] }],
      generationConfig: { temperature:0.2, maxOutputTokens:600, topP:0.8 },
    }, { timeout:20000 });

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

    // Save to history
    history.push({ role:'user', parts:[{text:message}] });
    history.push({ role:'model', parts:[{text:reply}] });
    if (history.length>20) history.splice(0, history.length-20);

    res.json({ reply });
  } catch(e) {
    console.error('[AI] Chat error:', e.response?.data||e.message);
    res.status(500).json({ error: 'AI request failed. Check GEMINI_API_KEY in Railway env vars.' });
  }
});

router.delete('/chat', requireAuth, (req, res) => {
  convHistory.delete(req.user.id);
  res.json({ ok:true });
});

export default router;
