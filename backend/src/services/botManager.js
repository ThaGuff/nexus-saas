/**
 * NEXUS SAAS · Per-User Bot Engine
 * Each user gets their own isolated bot instance
 * Powered by Gemini Flash AI + research-backed algorithm
 */

import axios from 'axios';
import { fetchPrices, computeIndicators, scoreForBuy, evaluateExit, kellySize, buildMarketSummary, COINS } from './algorithm.js';
import { Users } from '../models/db.js';
import { broadcastToUser } from '../routes/ws.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

// Active bot instances: userId -> { timer, priceTimer, prices, lastAICall }
const botInstances = new Map();

function userLog(userId, msg, level = 'INFO') {
  const entry = { ts: new Date().toISOString(), level, msg };
  Users.appendBotLog(userId, entry);
  try { broadcastToUser(userId, { type: 'LOG', entry }); } catch {}
  if (['TRADE','ERROR','CYCLE'].includes(level)) console.log(`[${userId.slice(0,8)}][${level}] ${msg}`);
}

async function callGemini(prompt) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 500, topP: 0.8 },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }, { timeout: 12000 });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('[Gemini] Error:', e.message);
    return null;
  }
}

async function runUserCycle(userId) {
  const user = Users.findById(userId);
  if (!user || !user.botEnabled) return;
  if (user.botState?.status === 'cycling') return;

  const settings = {
    maxTradeUSD:     user.maxTradeUSD     || 20,
    stopLossPct:     user.stopLossPct     || 0.05,
    takeProfitPct:   user.takeProfitPct   || 0.08,
    maxDrawdownPct:  user.maxDrawdownPct  || 0.20,
    leverageEnabled: user.leverageEnabled || false,
    maxLeverage:     user.maxLeverage     || 3,
    maxPositionPct:  0.35,
  };

  const bs        = user.botState || {};
  const balance   = bs.balance   || user.startingBalance || 100;
  const portfolio = bs.portfolio || {};
  const cycleNum  = (bs.cycleCount || 0) + 1;

  Users.updateBotState(userId, { status: 'cycling', cycleCount: cycleNum, lastCycleAt: new Date().toISOString() });
  userLog(userId, `━━━ Cycle #${cycleNum} | Cash: $${balance.toFixed(2)} ━━━`, 'CYCLE');

  let prices = {};
  try {
    prices = await fetchPrices(userId);
    const inst = botInstances.get(userId);
    if (inst) inst.prices = prices;
  } catch (e) {
    userLog(userId, `Price fetch failed: ${e.message}`, 'ERROR');
    Users.updateBotState(userId, { status: 'running' });
    return;
  }

  // Compute total value
  let totalValue = balance;
  for (const [sym, pos] of Object.entries(portfolio)) totalValue += (pos.qty || 0) * (prices[sym]?.price || 0);

  // Update peak
  const peakValue = Math.max(bs.peakValue || totalValue, totalValue);
  const drawdown  = peakValue > 0 ? (peakValue - totalValue) / peakValue : 0;

  userLog(userId, `Portfolio: $${totalValue.toFixed(2)} | Drawdown: ${(drawdown*100).toFixed(1)}%`, 'INFO');

  // ── Emergency: max drawdown hit — liquidate all ─────────────────────────
  if (drawdown >= settings.maxDrawdownPct && Object.keys(portfolio).length > 0) {
    userLog(userId, `⚠️ MAX DRAWDOWN HIT (${(drawdown*100).toFixed(1)}%) — liquidating all positions`, 'WARN');
    for (const [sym, pos] of Object.entries(portfolio)) {
      const px = prices[sym]?.price;
      if (!px) continue;
      const proceeds = pos.qty * px * (1 - 0.006);
      const newBal   = balance + proceeds;
      delete portfolio[sym];
      Users.updateBotState(userId, { balance: +newBal.toFixed(8), portfolio });
      userLog(userId, `EMERGENCY SELL: ${sym} @ $${px.toFixed(4)} | +$${proceeds.toFixed(2)}`, 'TRADE');
    }
    Users.updateBotState(userId, { status: 'running', peakValue });
    broadcastToUser(userId, { type: 'STATE_UPDATE', state: Users.findById(userId)?.botState, prices });
    return;
  }

  // ── Log open positions ──────────────────────────────────────────────────
  for (const [sym, pos] of Object.entries(portfolio)) {
    const cur    = prices[sym]?.price || 0;
    const pnlPct = pos.avgCost > 0 ? ((cur - pos.avgCost) / pos.avgCost * 100) : 0;
    userLog(userId, `Position ${sym}: ${pos.qty.toFixed(5)} @ avg $${pos.avgCost.toFixed(4)} | now $${cur.toFixed(4)} | PnL ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, 'POSITION');
  }

  // ── Check exits first ───────────────────────────────────────────────────
  for (const [sym, pos] of Object.entries(portfolio)) {
    const exitDecision = evaluateExit(userId, sym, pos, prices, settings);
    if (!exitDecision) {
      userLog(userId, `${sym}: No exit signal — trend intact, holding position`, 'HOLD');
      continue;
    }

    // Execute exit
    const px          = prices[sym]?.price;
    const sellQty     = pos.qty * exitDecision.sellPct;
    const gross       = sellQty * px;
    const fee         = gross * 0.006;
    const netProceeds = gross - fee;
    const costBasis   = sellQty * pos.avgCost;
    const pnl         = (netProceeds - costBasis) * (pos.leverage || 1);

    const newBalance  = +(balance + netProceeds).toFixed(8);
    const remaining   = pos.qty - sellQty;

    const newPortfolio = { ...portfolio };
    if (remaining < 0.000001) delete newPortfolio[sym];
    else newPortfolio[sym] = { ...pos, qty: remaining };

    const trade = {
      id: Date.now(), type: 'SELL', coin: sym,
      qty: sellQty, price: px, gross, fee, netProceeds, pnl,
      leverage: pos.leverage || 1, strategy: exitDecision.strategy,
      confidence: exitDecision.confidence, signals: exitDecision.signals,
      reasoning: exitDecision.reasoning, ts: new Date().toISOString(),
    };

    Users.updateBotState(userId, { balance: newBalance, portfolio: newPortfolio, peakValue, totalFeesUSD: (bs.totalFeesUSD || 0) + fee });
    Users.appendTrade(userId, trade);
    userLog(userId, `✅ SELL ${sellQty.toFixed(5)} ${sym} @ $${px.toFixed(4)} | Net $${netProceeds.toFixed(2)} | PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(3)} | ${exitDecision.strategy}`, pnl >= 0 ? 'PROFIT' : 'LOSS');
  }

  // ── Find best buy opportunity ───────────────────────────────────────────
  if (balance >= 5) {
    const freshUser = Users.findById(userId);
    const freshBal  = freshUser?.botState?.balance || balance;
    const freshPort = freshUser?.botState?.portfolio || portfolio;

    const candidates = [];
    for (const { symbol } of COINS) {
      const { score, signals, strategy, ind } = scoreForBuy(userId, symbol, prices, freshPort, totalValue, settings);
      if (score >= 7) candidates.push({ symbol, score, signals, strategy, ind });
    }

    candidates.sort((a, b) => b.score - a.score);
    userLog(userId, `Scan complete: ${candidates.length} high-conviction setups found (min score 7)`, 'SIGNAL');

    if (candidates.length > 0) {
      const best = candidates[0];
      userLog(userId, `Best setup: ${best.symbol} score=${best.score.toFixed(1)} | ${best.signals.join(', ')}`, 'SIGNAL');

      // Ask Gemini for final confirmation on top candidates
      let aiConfirmed = true;
      let aiReasoning = `Rules engine: ${best.strategy} on ${best.symbol}. Score ${best.score.toFixed(1)}/16. Signals: ${best.signals.join(', ')}.`;

      if (GEMINI_KEY && best.score >= 9) {
        userLog(userId, `Requesting Gemini confirmation for ${best.symbol}...`, 'AI');
        const summary = buildMarketSummary(userId, prices, freshPort);
        const prompt  = `You are a professional crypto trading AI. Review this market data and confirm if NOW is a good entry for ${best.symbol}.

MARKET DATA:
${summary}

PROPOSED TRADE:
- Action: BUY ${best.symbol}
- Strategy: ${best.strategy}
- Score: ${best.score.toFixed(1)}/16
- Signals: ${best.signals.join(', ')}

Cash available: $${freshBal.toFixed(2)}

Answer ONLY with JSON:
{"confirm":true|false,"confidence":<1-10>,"reasoning":"<2-3 sentences>","risk":"<one sentence on main risk>"}`;

        const aiResp = await callGemini(prompt);
        if (aiResp) {
          aiConfirmed = aiResp.confirm !== false;
          aiReasoning = `${aiResp.reasoning} Risk: ${aiResp.risk}`;
          userLog(userId, `Gemini ${aiConfirmed ? 'CONFIRMED' : 'REJECTED'}: ${aiReasoning}`, 'AI');
        }
      }

      if (aiConfirmed) {
        const spend  = +kellySize(best.score, 0.55, settings.takeProfitPct, settings.stopLossPct, settings.maxTradeUSD, freshBal).toFixed(2);
        const px     = prices[best.symbol]?.price;
        const fee    = spend * 0.006;
        const net    = spend - fee;
        const qty    = net / px;
        const newBal = +(freshBal - spend).toFixed(8);

        const ex = freshPort[best.symbol];
        const newPort = { ...freshPort };
        if (ex) {
          const nq = ex.qty + qty;
          newPort[best.symbol] = { qty: nq, avgCost: (ex.qty * ex.avgCost + net) / nq, entryTime: ex.entryTime, leverage: 1, isPerp: false };
        } else {
          newPort[best.symbol] = { qty, avgCost: px, entryTime: new Date().toISOString(), leverage: 1, isPerp: false };
        }

        const trade = {
          id: Date.now(), type: 'BUY', coin: best.symbol,
          qty, price: px, gross: spend, fee, net, leverage: 1, isPerp: false,
          strategy: best.strategy, confidence: Math.min(10, Math.round(best.score * 0.7)),
          signals: best.signals, reasoning: aiReasoning, ts: new Date().toISOString(),
        };

        Users.updateBotState(userId, { balance: newBal, portfolio: newPort, peakValue, totalFeesUSD: (freshUser?.botState?.totalFeesUSD || 0) + fee });
        Users.appendTrade(userId, trade);
        userLog(userId, `✅ BUY ${qty.toFixed(5)} ${best.symbol} @ $${px.toFixed(4)} | $${spend.toFixed(2)} | fee $${fee.toFixed(3)} | ${best.strategy}`, 'TRADE');
      } else {
        userLog(userId, `AI rejected ${best.symbol} entry — waiting for better setup`, 'HOLD');
      }
    } else {
      userLog(userId, `No setups met minimum score (7). Market unclear — preserving capital.`, 'HOLD');
    }
  }

  Users.updateBotState(userId, { status: 'running', peakValue });
  const finalUser = Users.findById(userId);
  const finalState = finalUser?.botState;
  let fv = finalState?.balance || 0;
  for (const [s, p] of Object.entries(finalState?.portfolio || {})) fv += (p.qty || 0) * (prices[s]?.price || 0);
  userLog(userId, `Cycle #${cycleNum} complete | Value: $${fv.toFixed(2)} | PnL: ${((fv / (user.startingBalance || 100) - 1) * 100).toFixed(2)}%`, 'INFO');

  broadcastToUser(userId, { type: 'STATE_UPDATE', state: finalState, prices });
}

// ── Bot lifecycle management ────────────────────────────────────────────────
export function startUserBot(userId) {
  if (botInstances.has(userId)) return;

  const user = Users.findById(userId);
  if (!user) return;

  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS || '60') * 1000;
  const prices   = {};

  const priceTimer = setInterval(async () => {
    try {
      const p = await fetchPrices(userId);
      const inst = botInstances.get(userId);
      if (inst) { inst.prices = p; broadcastToUser(userId, { type: 'PRICES', prices: p }); }
    } catch {}
  }, 15000);

  // Initial price fetch then start cycle
  fetchPrices(userId).then(p => {
    const inst = botInstances.get(userId);
    if (inst) inst.prices = p;
  }).catch(() => {});

  const cycleTimer = setInterval(() => runUserCycle(userId), CYCLE_MS);

  botInstances.set(userId, { cycleTimer, priceTimer, prices, lastAICall: 0 });
  Users.updateBotState(userId, { status: 'running', startedAt: new Date().toISOString() });
  Users.update(userId, { botEnabled: true });
  userLog(userId, '▶ Bot started — scanning markets every 60s', 'SYSTEM');

  // Run first cycle after 10s
  setTimeout(() => runUserCycle(userId), 10000);
}

export function stopUserBot(userId) {
  const inst = botInstances.get(userId);
  if (!inst) return;
  clearInterval(inst.cycleTimer);
  clearInterval(inst.priceTimer);
  botInstances.delete(userId);
  Users.updateBotState(userId, { status: 'stopped' });
  Users.update(userId, { botEnabled: false });
  userLog(userId, '◼ Bot stopped', 'SYSTEM');
}

export function getUserPrices(userId) {
  return botInstances.get(userId)?.prices || {};
}

export function resetUserBot(userId) {
  stopUserBot(userId);
  const user = Users.findById(userId);
  const starting = user?.startingBalance || 100;
  Users.updateBotState(userId, {
    balance: starting, startingBalance: starting, portfolio: {},
    trades: [], cycleCount: 0, totalFeesUSD: 0, peakValue: starting,
    status: 'idle', lastCycleAt: null, startedAt: null,
  });
  Users.update(userId, { botLog: [] });
  userLog(userId, `↺ Bot reset — $${starting} paper balance restored`, 'SYSTEM');
}

// Re-start bots for all enabled users on server restart
export function restoreActiveBots() {
  const users = Users.all();
  let count = 0;
  for (const user of users) {
    if (user.botEnabled && user.botState?.status !== 'stopped') {
      setTimeout(() => startUserBot(user.id), count * 2000);
      count++;
    }
  }
  if (count > 0) console.log(`[BotManager] Restored ${count} active bots`);
}
