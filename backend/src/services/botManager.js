/**
 * NEXUS SAAS · Bot Manager v4 — Supabase backed
 * Settings read fresh from DB every cycle — no stale state
 * Logs non-blocking, trades written to separate table
 */

import axios from 'axios';
import { fetchPrices, computeIndicators, scoreForBuy, evaluateExit, calcTotalValue, buildMarketSummary, COINS, STRATEGY_LIST } from './algorithm.js';
import { Users, Trades, BotLogs } from '../models/db.js';
import { broadcastToUser } from '../routes/ws.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
const FEE = 0.006;

const botInstances = new Map();
// In-memory bot state (fast reads, periodic DB sync)
const botStates = new Map();

function getSettings(user) {
  return {
    maxTradeUSD:     user.maxTradeUSD     || 20,
    stopLossPct:     user.stopLossPct     || 0.05,
    takeProfitPct:   user.takeProfitPct   || 0.08,
    maxDrawdownPct:  user.maxDrawdownPct  || 0.20,
    leverageEnabled: user.leverageEnabled || false,
    maxLeverage:     user.maxLeverage     || 3,
    maxPositionPct:  user.maxPositionPct  || 0.35,
    tradingStrategy: user.tradingStrategy || 'PRECISION',
    botMode:         user.botMode         || 'PAPER',
  };
}

function getMemState(userId, user) {
  if (!botStates.has(userId)) {
    botStates.set(userId, {
      balance:      user.botState?.balance ?? user.startingBalance ?? 100,
      startingBalance: user.startingBalance ?? 100,
      portfolio:    user.botState?.portfolio || {},
      peakValue:    user.botState?.peakValue ?? user.startingBalance ?? 100,
      cycleCount:   user.botState?.cycleCount || 0,
      totalFeesUSD: user.botState?.totalFeesUSD || 0,
      status:       'running',
      startedAt:    user.botState?.startedAt || new Date().toISOString(),
      lastCycleAt:  null,
    });
  }
  return botStates.get(userId);
}

function updateMemState(userId, updates) {
  const s = botStates.get(userId) || {};
  botStates.set(userId, { ...s, ...updates });
  return botStates.get(userId);
}

// Sync memory state to DB (called after each trade/cycle)
async function syncState(userId) {
  const s = botStates.get(userId);
  if (!s) return;
  await Users.updateBotState(userId, s).catch(e => console.error('[BotMgr] DB sync error:', e.message));
}

async function ulog(userId, msg, level = 'INFO') {
  const entry = { ts: new Date().toISOString(), level, msg };
  await BotLogs.append(userId, entry); // non-blocking inside
  broadcastToUser(userId, { type: 'LOG', entry });
  if (['TRADE','ERROR','CYCLE','PROFIT','LOSS'].includes(level)) {
    console.log(`[${userId.slice(0,8)}][${level}] ${msg}`);
  }
}

async function callGemini(prompt) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 250 },
    }, { timeout: 8000 });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch { return null; }
}

async function broadcastState(userId, prices) {
  const user = await Users.findById(userId).catch(() => null);
  if (!user) return;
  const ms = botStates.get(userId) || user.botState;
  const trades = await Trades.forUser(userId, 100).catch(() => []);
  const botLog = await BotLogs.getRecent(userId, 100);
  const tv = calcTotalValue(prices, ms.portfolio || {}, ms.balance || 0);
  broadcastToUser(userId, {
    type: 'STATE_UPDATE',
    state: {
      ...ms,
      totalValue: tv,
      pnl:        tv - (ms.startingBalance || 100),
      pnlPct:     ((tv / (ms.startingBalance || 100)) - 1) * 100,
      drawdown:   ms.peakValue > 0 ? ((ms.peakValue - tv) / ms.peakValue * 100) : 0,
      trades,
      mode:       user.botMode || 'PAPER',
    },
    prices,
    botLog,
    strategies: STRATEGY_LIST,
  });
}

async function runCycle(userId) {
  const user = await Users.findById(userId).catch(() => null);
  if (!user?.botEnabled) return;

  const settings = getSettings(user);
  const ms = getMemState(userId, user);
  if (ms.status === 'cycling') return;

  const cycleNum = (ms.cycleCount || 0) + 1;
  updateMemState(userId, { status: 'cycling', cycleCount: cycleNum, lastCycleAt: new Date().toISOString() });

  ulog(userId, `━━━ Cycle #${cycleNum} | ${settings.tradingStrategy} | Cash: $${ms.balance.toFixed(2)} ━━━`, 'CYCLE');

  let prices = {};
  try {
    prices = await fetchPrices(userId);
    const inst = botInstances.get(userId);
    if (inst) inst.prices = prices;
    broadcastToUser(userId, { type: 'PRICES', prices });
  } catch (e) {
    ulog(userId, `Price fetch failed: ${e.message}`, 'ERROR');
    updateMemState(userId, { status: 'running' });
    return;
  }

  const portfolio = ms.portfolio || {};
  const balance   = ms.balance;
  const tv = calcTotalValue(prices, portfolio, balance);
  const peakValue = Math.max(ms.peakValue || tv, tv);
  const drawdown  = peakValue > 0 ? (peakValue - tv) / peakValue : 0;

  if (drawdown >= settings.maxDrawdownPct && Object.keys(portfolio).length > 0) {
    ulog(userId, `⚠️ MAX DRAWDOWN (${(drawdown*100).toFixed(1)}%) — emergency exit`, 'WARN');
    let newBal = balance, newPort = { ...portfolio };
    for (const [sym, pos] of Object.entries(portfolio)) {
      const px = prices[sym]?.price;
      if (!px) continue;
      const net = pos.qty * px * (1 - FEE);
      newBal += net;
      const t = { type:'SELL', coin:sym, qty:pos.qty, price:px, gross:pos.qty*px, fee:pos.qty*px*FEE, netProceeds:net, pnl:(net-pos.qty*pos.avgCost), strategy:'STOP_LOSS', confidence:10, signals:['MAX_DRAWDOWN'], reasoning:'Emergency liquidation.', source:'RULES', ts:new Date().toISOString() };
      await Trades.insert(userId, t).catch(() => {});
      delete newPort[sym];
      ulog(userId, `EMERGENCY SELL ${sym} @ $${px.toFixed(4)}`, 'TRADE');
    }
    updateMemState(userId, { balance:+newBal.toFixed(8), portfolio:newPort, peakValue, status:'running' });
    await syncState(userId);
    await broadcastState(userId, prices);
    return;
  }

  // Log positions
  for (const [sym, pos] of Object.entries(portfolio)) {
    const cur = prices[sym]?.price || 0;
    const pnlPct = pos.avgCost > 0 ? ((cur-pos.avgCost)/pos.avgCost*100) : 0;
    ulog(userId, `${sym}: ${pos.qty.toFixed(4)} @ $${pos.avgCost.toFixed(4)} | now $${cur.toFixed(4)} | ${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%`, 'POSITION');
  }

  // Check exits
  let newPort = { ...portfolio }, newBal = balance, newFees = ms.totalFeesUSD || 0;
  for (const [sym, pos] of Object.entries(portfolio)) {
    const exit = evaluateExit(userId, sym, pos, prices, settings);
    if (!exit) { ulog(userId, `${sym}: holding — trend intact`, 'HOLD'); continue; }
    const px = prices[sym]?.price;
    if (!px) continue;
    const sellQty = pos.qty * exit.sellPct;
    const gross = sellQty * px, fee = gross * FEE, net = gross - fee;
    const pnl = (net - sellQty * pos.avgCost) * (pos.leverage || 1);
    newBal = +(newBal + net).toFixed(8);
    newFees += fee;
    const rem = pos.qty - sellQty;
    if (rem < 0.000001) delete newPort[sym]; else newPort[sym] = { ...pos, qty: rem };
    const trade = { type:'SELL', coin:sym, qty:sellQty, price:px, gross, fee, netProceeds:net, pnl, leverage:pos.leverage||1, strategy:exit.strategy, confidence:exit.confidence, signals:exit.signals, reasoning:exit.reasoning, source:'RULES', ts:new Date().toISOString() };
    await Trades.insert(userId, trade).catch(() => {});
    ulog(userId, `✅ SELL ${sellQty.toFixed(4)} ${sym} @ $${px.toFixed(4)} | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(3)}`, pnl>=0?'PROFIT':'LOSS');
  }
  updateMemState(userId, { balance:newBal, portfolio:newPort, peakValue, totalFeesUSD:newFees });

  // Find best buy
  const freshBal = (botStates.get(userId)||{}).balance ?? newBal;
  const freshPort = (botStates.get(userId)||{}).portfolio || newPort;

  if (freshBal >= 5) {
    ulog(userId, `Scanning ${COINS.length} coins with ${settings.tradingStrategy}...`, 'SIGNAL');
    const candidates = [];
    for (const { symbol } of COINS) {
      const res = scoreForBuy(userId, symbol, prices, freshPort, tv, settings);
      if (res.score >= (res.minScore || 8)) candidates.push({ symbol, ...res });
    }
    candidates.sort((a, b) => b.score - a.score);
    ulog(userId, `${candidates.length} qualifying setups found`, 'SIGNAL');

    if (candidates.length > 0) {
      const best = candidates[0];
      ulog(userId, `Best: ${best.symbol} score=${best.score.toFixed(1)} | ${best.signals.join(', ')}`, 'SIGNAL');

      let confirmed = true;
      let reasoning = `${best.strategy} on ${best.symbol}. Score ${best.score.toFixed(1)}. ${best.signals.join(', ')}.`;

      if (GEMINI_KEY && best.score >= (best.minScore || 8) * 1.4) {
        const summary = buildMarketSummary(userId, prices, freshPort);
        const ai = await callGemini(`Confirm ${settings.tradingStrategy} trade: BUY ${best.symbol}\nScore: ${best.score.toFixed(1)}\nSignals: ${best.signals.join(', ')}\n\nTop market data:\n${summary.split('\n').slice(0,4).join('\n')}\n\nReply JSON only: {"confirm":true|false,"reasoning":"<2 sentences>"}`);
        if (ai) {
          confirmed = ai.confirm !== false;
          if (ai.reasoning) reasoning = ai.reasoning;
          ulog(userId, `AI: ${confirmed?'CONFIRMED':'REJECTED'} — ${ai.reasoning}`, 'AI');
        }
      }

      if (confirmed) {
        const k = settings.tradingStrategy === 'AGGRESSIVE' ? 0.28 : settings.tradingStrategy === 'DCA_PLUS' ? 0.12 : 0.20;
        const spend = +Math.min(k * (best.score/(best.minScore||8)) * freshBal, settings.maxTradeUSD, freshBal - 2).toFixed(2);
        if (spend >= 5) {
          const px = prices[best.symbol]?.price;
          if (px) {
            const fee = spend * FEE, net = spend - fee, qty = net / px;
            const newBal2 = +((botStates.get(userId)||{}).balance - spend).toFixed(8);
            const ex = freshPort[best.symbol];
            const newPort2 = { ...freshPort };
            if (ex) { const nq=ex.qty+qty; newPort2[best.symbol]={qty:nq,avgCost:(ex.qty*ex.avgCost+net)/nq,entryTime:ex.entryTime,leverage:1}; }
            else { newPort2[best.symbol]={qty,avgCost:px,entryTime:new Date().toISOString(),leverage:1}; }
            const trade = { type:'BUY', coin:best.symbol, qty, price:px, gross:spend, fee, netProceeds:net, strategy:best.strategy, confidence:Math.min(10,Math.round(best.score*0.7)), signals:best.signals, reasoning, source:GEMINI_KEY?'AI':'RULES', ts:new Date().toISOString() };
            await Trades.insert(userId, trade).catch(() => {});
            updateMemState(userId, { balance:newBal2, portfolio:newPort2, peakValue, totalFeesUSD:(botStates.get(userId)?.totalFeesUSD||0)+fee });
            ulog(userId, `✅ BUY ${qty.toFixed(4)} ${best.symbol} @ $${px.toFixed(4)} | $${spend.toFixed(2)} | ${best.strategy}`, 'TRADE');
          }
        }
      } else {
        ulog(userId, `AI rejected ${best.symbol} — waiting`, 'HOLD');
      }
    } else {
      ulog(userId, `No qualifying setups — ${settings.tradingStrategy} strategy waiting`, 'HOLD');
    }
  }

  updateMemState(userId, { status: 'running' });
  await syncState(userId);
  await broadcastState(userId, prices);
}

export function startUserBot(userId) {
  if (botInstances.has(userId)) return;
  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS || '60') * 1000;

  Users.findById(userId).then(user => {
    if (!user) return;
    getMemState(userId, user);
    ulog(userId, `▶ Bot started | ${user.tradingStrategy||'PRECISION'} | ${user.botMode||'PAPER'}`, 'SYSTEM');
  });

  const priceTimer = setInterval(async () => {
    try { const p = await fetchPrices(userId); const inst=botInstances.get(userId); if(inst)inst.prices=p; broadcastToUser(userId,{type:'PRICES',prices:p}); } catch {}
  }, 15000);

  const cycleTimer = setInterval(() => runCycle(userId), CYCLE_MS);
  botInstances.set(userId, { cycleTimer, priceTimer, prices: {} });
  Users.update(userId, { botEnabled: true }).catch(() => {});
  Users.updateBotState(userId, { status: 'running', startedAt: new Date().toISOString() }).catch(() => {});
  setTimeout(() => runCycle(userId), 5000);
}

export function stopUserBot(userId) {
  const inst = botInstances.get(userId);
  if (!inst) return;
  clearInterval(inst.cycleTimer);
  clearInterval(inst.priceTimer);
  botInstances.delete(userId);
  updateMemState(userId, { status: 'stopped' });
  Users.update(userId, { botEnabled: false }).catch(() => {});
  Users.updateBotState(userId, { status: 'stopped' }).catch(() => {});
  ulog(userId, '◼ Bot stopped', 'SYSTEM');
}

export function getUserPrices(userId) { return botInstances.get(userId)?.prices || {}; }

export async function resetUserBot(userId) {
  stopUserBot(userId);
  const user = await Users.findById(userId).catch(() => null);
  const s = user?.startingBalance || 100;
  botStates.set(userId, { balance:s, startingBalance:s, portfolio:{}, peakValue:s, cycleCount:0, totalFeesUSD:0, status:'idle', startedAt:null, lastCycleAt:null });
  await Users.update(userId, { botEnabled:false }).catch(() => {});
  await Users.updateBotState(userId, { balance:s, portfolio:{}, peakValue:s, cycleCount:0, totalFeesUSD:0, status:'idle', startedAt:null, lastCycleAt:null }).catch(() => {});
  await Trades.deleteForUser(userId).catch(() => {});
  BotLogs.clearForUser(userId);
  ulog(userId, `↺ Reset — $${s} balance restored`, 'SYSTEM');
}

export async function getBotState(userId) {
  const ms = botStates.get(userId);
  const user = await Users.findById(userId).catch(() => null);
  const prices = getUserPrices(userId);
  const trades = await Trades.forUser(userId, 200).catch(() => []);
  const botLog = await BotLogs.getRecent(userId, 150);
  const balance = ms?.balance ?? user?.botState?.balance ?? user?.startingBalance ?? 100;
  const portfolio = ms?.portfolio ?? user?.botState?.portfolio ?? {};
  const tv = calcTotalValue(prices, portfolio, balance);
  return {
    state: {
      ...(ms || user?.botState || {}),
      balance, portfolio,
      totalValue: tv,
      pnl: tv - (user?.startingBalance || 100),
      pnlPct: ((tv / (user?.startingBalance || 100)) - 1) * 100,
      drawdown: (ms?.peakValue||0) > 0 ? (((ms?.peakValue||0) - tv) / (ms?.peakValue||0) * 100) : 0,
      trades, mode: user?.botMode || 'PAPER',
    },
    prices, botLog, strategies: STRATEGY_LIST,
  };
}

export async function restoreActiveBots() {
  const users = await Users.all().catch(() => []);
  let c = 0;
  for (const u of users) {
    if (u.botEnabled) { setTimeout(() => startUserBot(u.id), c++ * 2000); }
  }
  if (c) console.log(`[BotMgr] Restored ${c} bots`);
}

export { STRATEGY_LIST };
export function getStrategyList() { return STRATEGY_LIST; }
