/**
 * NEXUS SAAS · Bot Manager v3
 * Settings applied from DB every cycle — no stale env vars
 * Strategy-aware scoring and exits
 */

import axios from 'axios';
import { fetchPrices, computeIndicators, scoreForBuy, evaluateExit, calcTotalValue, buildMarketSummary, COINS, STRATEGY_LIST } from './algorithm.js';
import { Users } from '../models/db.js';
import { broadcastToUser } from '../routes/ws.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
const FEE = 0.006;

const botInstances = new Map(); // userId -> { cycleTimer, priceTimer, prices }

function getSettings(user) {
  return {
    maxTradeUSD:      user.maxTradeUSD      || 20,
    stopLossPct:      user.stopLossPct      || 0.05,
    takeProfitPct:    user.takeProfitPct    || 0.08,
    maxDrawdownPct:   user.maxDrawdownPct   || 0.20,
    leverageEnabled:  user.leverageEnabled  || false,
    maxLeverage:      user.maxLeverage      || 3,
    maxPositionPct:   user.maxPositionPct   || 0.35,
    tradingStrategy:  user.tradingStrategy  || 'PRECISION',
    botMode:          user.botMode          || 'PAPER',
  };
}

function ulog(userId, msg, level='INFO') {
  const entry = { ts: new Date().toISOString(), level, msg };
  Users.appendBotLog(userId, entry);
  try { broadcastToUser(userId, { type:'LOG', entry }); } catch {}
  if (['TRADE','ERROR','CYCLE','PROFIT','LOSS'].includes(level)) console.log(`[${userId.slice(0,8)}][${level}] ${msg}`);
}

async function callGemini(prompt) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 300, topP: 0.8 },
    }, { timeout: 10000 });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g,'').trim());
  } catch { return null; }
}

async function runCycle(userId) {
  const user = Users.findById(userId);
  if (!user?.botEnabled) return;

  const settings = getSettings(user);
  const bs = user.botState || {};
  if (bs.status === 'cycling') return;

  const balance   = bs.balance ?? (user.startingBalance || 100);
  const portfolio = bs.portfolio || {};
  const cycleNum  = (bs.cycleCount || 0) + 1;

  Users.updateBotState(userId, { status:'cycling', cycleCount:cycleNum, lastCycleAt:new Date().toISOString() });
  ulog(userId, `━━━ Cycle #${cycleNum} | Strategy: ${settings.tradingStrategy} | Cash: $${balance.toFixed(2)} ━━━`, 'CYCLE');

  let prices = {};
  try {
    prices = await fetchPrices(userId);
    const inst = botInstances.get(userId);
    if (inst) inst.prices = prices;
  } catch(e) {
    ulog(userId, `Price fetch failed: ${e.message}`, 'ERROR');
    Users.updateBotState(userId, { status:'running' });
    return;
  }

  const totalValue = calcTotalValue(prices, portfolio, balance);
  const peakValue  = Math.max(bs.peakValue || totalValue, totalValue);
  const drawdown   = peakValue > 0 ? (peakValue - totalValue) / peakValue : 0;

  ulog(userId, `Portfolio: $${totalValue.toFixed(2)} | Peak: $${peakValue.toFixed(2)} | Drawdown: ${(drawdown*100).toFixed(1)}%`, 'INFO');

  // Emergency drawdown liquidation
  if (drawdown >= settings.maxDrawdownPct && Object.keys(portfolio).length > 0) {
    ulog(userId, `⚠️ MAX DRAWDOWN HIT (${(drawdown*100).toFixed(1)}%) — liquidating all`, 'WARN');
    let newBal = balance, newPort = { ...portfolio };
    for (const [sym, pos] of Object.entries(portfolio)) {
      const px = prices[sym]?.price;
      if (!px) continue;
      const net = pos.qty * px * (1 - FEE);
      newBal += net;
      delete newPort[sym];
      ulog(userId, `EMERGENCY SELL ${sym} @ $${px.toFixed(4)} | +$${net.toFixed(2)}`, 'TRADE');
    }
    Users.updateBotState(userId, { balance:+newBal.toFixed(8), portfolio:newPort, peakValue, status:'running' });
    broadcastToUser(userId, { type:'STATE_UPDATE', state:Users.findById(userId)?.botState, prices });
    return;
  }

  // Log positions
  for (const [sym, pos] of Object.entries(portfolio)) {
    const cur = prices[sym]?.price || 0;
    const pnlPct = pos.avgCost > 0 ? ((cur-pos.avgCost)/pos.avgCost*100) : 0;
    ulog(userId, `Position ${sym}: ${pos.qty.toFixed(5)} @ $${pos.avgCost.toFixed(4)} | now $${cur.toFixed(4)} | ${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%`, 'POSITION');
  }

  // Check exits first
  for (const [sym, pos] of Object.entries(portfolio)) {
    const exit = evaluateExit(userId, sym, pos, prices, settings);
    if (!exit) { ulog(userId, `${sym}: trend intact — holding`, 'HOLD'); continue; }

    const px = prices[sym]?.price;
    if (!px) continue;
    const sellQty = pos.qty * exit.sellPct;
    const gross = sellQty * px;
    const fee = gross * FEE;
    const net = gross - fee;
    const pnl = (net - sellQty * pos.avgCost) * (pos.leverage || 1);
    const newBal = +(balance + net).toFixed(8);
    const remaining = pos.qty - sellQty;
    const newPort = { ...portfolio };
    if (remaining < 0.000001) delete newPort[sym]; else newPort[sym] = { ...pos, qty: remaining };

    const trade = { id:Date.now(), type:'SELL', coin:sym, qty:sellQty, price:px, gross, fee, netProceeds:net, pnl, leverage:pos.leverage||1, strategy:exit.strategy, confidence:exit.confidence, signals:exit.signals, reasoning:exit.reasoning, ts:new Date().toISOString() };
    Users.updateBotState(userId, { balance:newBal, portfolio:newPort, peakValue, totalFeesUSD:(bs.totalFeesUSD||0)+fee });
    Users.appendTrade(userId, trade);
    ulog(userId, `✅ SELL ${sellQty.toFixed(5)} ${sym} @ $${px.toFixed(4)} | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(3)} | ${exit.strategy}`, pnl>=0?'PROFIT':'LOSS');
  }

  // Find best buy
  const freshUser = Users.findById(userId);
  const freshBs   = freshUser?.botState || {};
  const freshBal  = freshBs.balance ?? balance;
  const freshPort = freshBs.portfolio || {};

  if (freshBal < 5) {
    ulog(userId, 'Cash below $5 minimum — holding', 'HOLD');
  } else {
    ulog(userId, `Scanning ${COINS.length} coins with ${settings.tradingStrategy} strategy...`, 'SIGNAL');
    const candidates = [];
    for (const { symbol } of COINS) {
      const { score, signals, strategy, minScore, ind } = scoreForBuy(userId, symbol, prices, freshPort, totalValue, settings);
      if (score >= minScore) candidates.push({ symbol, score, signals, strategy, minScore, ind });
    }
    candidates.sort((a,b) => b.score - a.score);
    ulog(userId, `Found ${candidates.length} qualifying setups (min score: ${STRATEGIES?.[settings.tradingStrategy]?.minScore || 8})`, 'SIGNAL');

    if (candidates.length > 0) {
      const best = candidates[0];
      ulog(userId, `Best: ${best.symbol} score=${best.score.toFixed(1)} | ${best.signals.join(', ')}`, 'SIGNAL');

      // Gemini confirmation for very high conviction setups
      let confirmed = true;
      let reasoning = `${best.strategy} on ${best.symbol}. Score ${best.score.toFixed(1)}. ${best.signals.join(', ')}.`;

      if (GEMINI_KEY && best.score >= best.minScore * 1.3) {
        ulog(userId, `Requesting Gemini confirmation for ${best.symbol}...`, 'AI');
        const summary = buildMarketSummary(userId, prices, freshPort);
        const ai = await callGemini(`You are a crypto trading AI. Confirm this ${settings.tradingStrategy} trade setup.

PROPOSED: BUY ${best.symbol} | Score: ${best.score.toFixed(1)} | Signals: ${best.signals.join(', ')}

MARKET:
${summary.split('\n').slice(0,5).join('\n')}

Reply ONLY with JSON: {"confirm":true|false,"confidence":<1-10>,"reasoning":"<2 sentences>"}`);

        if (ai) {
          confirmed = ai.confirm !== false;
          if (ai.reasoning) reasoning = ai.reasoning;
          ulog(userId, `Gemini: ${confirmed?'CONFIRMED':'REJECTED'} — ${ai.reasoning}`, 'AI');
        }
      }

      if (confirmed) {
        // Size using strategy-adjusted Kelly
        const baseKelly = settings.tradingStrategy === 'AGGRESSIVE' ? 0.3 : settings.tradingStrategy === 'DCA_PLUS' ? 0.15 : 0.22;
        const confMult = Math.min(1, best.score / (best.minScore * 1.5));
        const spend = +Math.min(baseKelly * confMult * freshBal, settings.maxTradeUSD, freshBal - 2).toFixed(2);

        if (spend >= 5) {
          const px = prices[best.symbol]?.price;
          if (px) {
            const fee = spend * FEE;
            const net = spend - fee;
            const qty = net / px;
            const newBal2 = +(freshBal - spend).toFixed(8);
            const ex = freshPort[best.symbol];
            const newPort2 = { ...freshPort };
            if (ex) {
              const nq = ex.qty + qty;
              newPort2[best.symbol] = { qty:nq, avgCost:(ex.qty*ex.avgCost+net)/nq, entryTime:ex.entryTime, leverage:1 };
            } else {
              newPort2[best.symbol] = { qty, avgCost:px, entryTime:new Date().toISOString(), leverage:1 };
            }
            const trade = { id:Date.now(), type:'BUY', coin:best.symbol, qty, price:px, gross:spend, fee, net, leverage:1, strategy:best.strategy, confidence:Math.min(10,Math.round(best.score*0.7)), signals:best.signals, reasoning, ts:new Date().toISOString() };
            Users.updateBotState(userId, { balance:newBal2, portfolio:newPort2, peakValue, totalFeesUSD:(freshBs.totalFeesUSD||0)+fee });
            Users.appendTrade(userId, trade);
            ulog(userId, `✅ BUY ${qty.toFixed(5)} ${best.symbol} @ $${px.toFixed(4)} | $${spend.toFixed(2)} | fee $${fee.toFixed(3)} | ${best.strategy}`, 'TRADE');
          }
        }
      } else {
        ulog(userId, `AI rejected entry — waiting for better setup`, 'HOLD');
      }
    } else {
      ulog(userId, `No qualifying setups found. ${settings.tradingStrategy} strategy: market not ready.`, 'HOLD');
    }
  }

  Users.updateBotState(userId, { status:'running', peakValue });
  const final = Users.findById(userId);
  broadcastToUser(userId, { type:'STATE_UPDATE', state:final?.botState, prices });
}

export function startUserBot(userId) {
  if (botInstances.has(userId)) return;
  const user = Users.findById(userId);
  if (!user) return;
  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS||'60') * 1000;

  const priceTimer = setInterval(async () => {
    try { const p=await fetchPrices(userId); const inst=botInstances.get(userId); if(inst){inst.prices=p;broadcastToUser(userId,{type:'PRICES',prices:p});} } catch {}
  }, 15000);

  fetchPrices(userId).then(p=>{ const inst=botInstances.get(userId); if(inst)inst.prices=p; }).catch(()=>{});

  const cycleTimer = setInterval(() => runCycle(userId), CYCLE_MS);
  botInstances.set(userId, { cycleTimer, priceTimer, prices:{} });
  Users.updateBotState(userId, { status:'running', startedAt:new Date().toISOString() });
  Users.update(userId, { botEnabled:true });
  ulog(userId, `▶ Bot started | Strategy: ${user.tradingStrategy||'PRECISION'} | ${user.botMode||'PAPER'} mode`, 'SYSTEM');
  setTimeout(() => runCycle(userId), 8000);
}

export function stopUserBot(userId) {
  const inst = botInstances.get(userId);
  if (!inst) return;
  clearInterval(inst.cycleTimer);
  clearInterval(inst.priceTimer);
  botInstances.delete(userId);
  Users.updateBotState(userId, { status:'stopped' });
  Users.update(userId, { botEnabled:false });
  ulog(userId, '◼ Bot stopped', 'SYSTEM');
}

export function getUserPrices(userId) { return botInstances.get(userId)?.prices || {}; }
export function resetUserBot(userId) {
  stopUserBot(userId);
  const user = Users.findById(userId);
  const s = user?.startingBalance || 100;
  Users.updateBotState(userId, { balance:s, startingBalance:s, portfolio:{}, trades:[], cycleCount:0, totalFeesUSD:0, peakValue:s, status:'idle', lastCycleAt:null, startedAt:null });
  Users.update(userId, { botLog:[] });
  ulog(userId, `↺ Reset — $${s} balance restored`, 'SYSTEM');
}
export function restoreActiveBots() {
  const users = Users.all();
  let c=0;
  for (const u of users) {
    if(u.botEnabled&&u.botState?.status!=='stopped'){setTimeout(()=>startUserBot(u.id),c*2000);c++;}
  }
  if(c>0) console.log(`[BotManager] Restored ${c} bots`);
}
export { STRATEGY_LIST };

export function getStrategyList() { return STRATEGY_LIST; }
