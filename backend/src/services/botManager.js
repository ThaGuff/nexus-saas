/**
 * NEXUS SAAS · Bot Manager v6 — FIXED
 * 
 * KEY FIX: Single consistent botKey used everywhere.
 * fetchPrices, seedPriceHistory, scoreForBuy, evaluateExit all use botId.
 * userPrices stores the DISPLAY prices (from userId key for sharing UI).
 * Algorithm history uses botId for isolation between bots.
 */

import axios from 'axios';
import {
  fetchPrices, seedPriceHistory, scoreForBuy, evaluateExit,
  calcTotalValue, buildMarketSummary, COINS, STRATEGY_LIST,
  setCooldown, isOnCooldown
} from './algorithm.js';
import { Users, Bots, Trades, BotLogs, Exchanges } from '../models/db.js';
import { broadcastToUser } from '../routes/ws.js';

const MAX_BOTS_PER_USER = 3;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
const FEE = 0.006;

// In-memory state
const botTimers  = new Map(); // botId -> cycleTimer
const botMem     = new Map(); // botId -> { balance, portfolio, ... }
const botPrices  = new Map(); // botId -> prices (each bot has its own price cache)
const priceTimers= new Map(); // userId -> priceTimer (shared display refresh)
const displayPrices = new Map(); // userId -> prices (for dashboard display)

// ── Memory helpers ────────────────────────────────────────────────────────────
function getMem(botId, bot) {
  if (!botMem.has(botId)) {
    botMem.set(botId, {
      balance:      bot.balance        ?? bot.startingBalance ?? 100,
      startingBalance: bot.startingBalance ?? 100,
      portfolio:    bot.portfolio      || {},
      peakValue:    bot.peakValue      ?? bot.startingBalance ?? 100,
      cycleCount:   bot.cycleCount     || 0,
      totalFees:    bot.totalFees      || 0,
      status:       'running',
      startedAt:    new Date().toISOString(),
      lastCycleAt:  null,
    });
  }
  return botMem.get(botId);
}

function setMem(botId, updates) {
  const s = botMem.get(botId) || {};
  botMem.set(botId, { ...s, ...updates });
}

async function syncBot(botId) {
  const s = botMem.get(botId);
  if (!s) return;
  await Bots.update(botId, {
    balance:s.balance, portfolio:s.portfolio, peakValue:s.peakValue,
    cycleCount:s.cycleCount, totalFees:s.totalFees,
    status:s.status, lastCycleAt:s.lastCycleAt,
  }).catch(e => console.error('[BotMgr] syncBot error:', e.message));
}

// ── Logging ───────────────────────────────────────────────────────────────────
function ulog(botId, userId, msg, level = 'INFO') {
  const entry = { ts: new Date().toISOString(), level, msg };
  BotLogs.append(botId, entry).catch(() => {});
  broadcastToUser(userId, { type: 'BOT_LOG', botId, entry });
  if (['TRADE','ERROR','CYCLE','PROFIT','LOSS','SYSTEM','SIGNAL'].includes(level)) {
    console.log(`[${level}][${botId.slice(0,6)}] ${msg}`);
  }
}

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
    }, { timeout: 8000 });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch { return null; }
}

// ── Core cycle ────────────────────────────────────────────────────────────────
async function runBotCycle(botId, userId) {
  // Get bot config — handle missing bots table gracefully
  let bot = null;
  try { bot = await Bots.findById(botId); } catch {}

  if (bot && !bot.enabled) return; // explicitly stopped

  // Fallback if table missing or bot not found
  if (!bot) {
    const ms = botMem.get(botId);
    if (!ms) return;
    bot = {
      id: botId, userId,
      name: 'Bot', strategy: 'AGGRESSIVE', botMode: 'PAPER',
      maxTradeUSD: ms.startingBalance * 0.2,
      stopLossPct: 0.05, takeProfitPct: 0.08,
      maxDrawdownPct: 0.20, maxPositionPct: 0.35,
      leverageEnabled: false, maxLeverage: 3,
      enabled: true,
    };
  }

  const ms = getMem(botId, bot);
  if (ms.status === 'cycling') return;

  const cycleNum = (ms.cycleCount || 0) + 1;
  setMem(botId, { status: 'cycling', cycleCount: cycleNum, lastCycleAt: new Date().toISOString() });

  const logPrefix = `[${bot.name}] Cycle #${cycleNum}`;
  ulog(botId, userId, `━━━ ${logPrefix} | ${bot.strategy} | Cash: $${ms.balance.toFixed(2)} ━━━`, 'CYCLE');

  // ── Fetch prices using botId as key (matches algorithm history key) ──────────
  let prices = {};
  try {
    prices = await fetchPrices(botId); // botId = key for price history
    botPrices.set(botId, prices);
    // Also update display prices for this user
    displayPrices.set(userId, prices);
    broadcastToUser(userId, { type: 'PRICES', prices });
  } catch (e) {
    ulog(botId, userId, `Price fetch failed: ${e.message}`, 'ERROR');
    setMem(botId, { status: 'running' });
    return;
  }

  const priceCount = Object.keys(prices).length;
  ulog(botId, userId, `Prices loaded: ${priceCount} coins`, 'INFO');

  const settings = {
    tradingStrategy: bot.strategy,
    botMode:         bot.botMode,
    maxTradeUSD:     bot.maxTradeUSD,
    stopLossPct:     bot.stopLossPct,
    takeProfitPct:   bot.takeProfitPct,
    maxDrawdownPct:  bot.maxDrawdownPct,
    maxPositionPct:  bot.maxPositionPct,
    leverageEnabled: bot.leverageEnabled,
    maxLeverage:     bot.maxLeverage,
  };

  const portfolio = ms.portfolio || {};
  const balance   = ms.balance;
  const tv        = calcTotalValue(prices, portfolio, balance);
  const peakValue = Math.max(ms.peakValue || tv, tv);
  const drawdown  = peakValue > 0 ? (peakValue - tv) / peakValue : 0;

  ulog(botId, userId, `Portfolio: $${tv.toFixed(2)} | Cash: $${balance.toFixed(2)} | Drawdown: ${(drawdown*100).toFixed(1)}%`, 'INFO');

  // Emergency exit
  if (drawdown >= bot.maxDrawdownPct && Object.keys(portfolio).length > 0) {
    ulog(botId, userId, `⚠️ MAX DRAWDOWN ${(drawdown*100).toFixed(1)}% — liquidating all positions`, 'WARN');
    let nb = balance, np = {};
    for (const [sym, pos] of Object.entries(portfolio)) {
      const px = prices[sym]?.price;
      if (!px) continue;
      const gross = pos.qty * px, fee = gross * FEE, net = gross - fee;
      nb += net;
      const t = { type:'SELL', coin:sym, qty:pos.qty, price:px, gross, fee, netProceeds:net,
        pnl: net - pos.qty * pos.avgCost, strategy:'STOP_LOSS', confidence:10,
        signals:['MAX_DRAWDOWN'], reasoning:'Emergency drawdown liquidation.' };
      await Trades.insert(userId, t, botId).catch(() => {});
      ulog(botId, userId, `EMERGENCY SELL ${sym} @ $${px.toFixed(4)}`, 'TRADE');
    }
    setMem(botId, { balance: +nb.toFixed(8), portfolio: np, peakValue, status: 'running' });
    await syncBot(botId);
    await broadcastBotState(userId);
    return;
  }

  // ── Check exits on open positions ─────────────────────────────────────────────
  let updatedPortfolio = { ...portfolio };
  let updatedBalance   = balance;
  let updatedFees      = ms.totalFees || 0;

  for (const [sym, pos] of Object.entries(portfolio)) {
    const exit = evaluateExit(botId, sym, pos, prices, settings); // botId = key
    if (!exit) {
      ulog(botId, userId, `${sym}: trend intact — holding`, 'HOLD');
      continue;
    }
    const px = prices[sym]?.price;
    if (!px) continue;
    const sellQty = pos.qty * exit.sellPct;
    const gross   = sellQty * px;
    const fee     = gross * FEE;
    const net     = gross - fee;
    const pnl     = (net - sellQty * pos.avgCost) * (pos.leverage || 1);

    updatedBalance = +(updatedBalance + net).toFixed(8);
    updatedFees   += fee;

    const remaining = pos.qty - sellQty;
    if (remaining < 0.000001) delete updatedPortfolio[sym];
    else updatedPortfolio[sym] = { ...pos, qty: remaining };

    const t = {
      type: 'SELL', coin: sym, qty: sellQty, price: px,
      gross, fee, netProceeds: net, pnl,
      leverage:   pos.leverage || 1,
      strategy:   exit.strategy,
      confidence: exit.confidence,
      signals:    exit.signals,
      reasoning:  exit.reasoning,
    };
    await Trades.insert(userId, t, botId).catch(() => {});
    setMem(botId, { balance: updatedBalance, portfolio: updatedPortfolio, peakValue, totalFees: updatedFees });
    ulog(botId, userId, `✅ SELL ${sellQty.toFixed(5)} ${sym} @ $${px.toFixed(4)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(3)} | ${exit.strategy}`, pnl >= 0 ? 'PROFIT' : 'LOSS');
  }

  // ── Score all coins for entry ─────────────────────────────────────────────────
  const currentBalance  = botMem.get(botId)?.balance ?? updatedBalance;
  const currentPortfolio= botMem.get(botId)?.portfolio ?? updatedPortfolio;

  if (currentBalance < 5) {
    ulog(botId, userId, `Insufficient cash ($${currentBalance.toFixed(2)}) — holding`, 'HOLD');
  } else {
    ulog(botId, userId, `Scanning ${COINS.length} coins for ${bot.strategy} setups...`, 'SIGNAL');

    const scored = [];
    for (const { symbol } of COINS) {
      try {
        const result = scoreForBuy(botId, symbol, prices, currentPortfolio, tv, settings, cycleNum); // botId key
        ulog(botId, userId, `  ${symbol}: score=${result.score.toFixed(1)} min=${result.minScore} signals=${result.signals?.slice(0,2).join(',')||'none'}`, 'INFO');
        if (result.score >= result.minScore) {
          scored.push({ symbol, ...result });
        }
      } catch (e) {
        ulog(botId, userId, `Score error for ${symbol}: ${e.message}`, 'ERROR');
      }
    }

    scored.sort((a, b) => b.score - a.score);
    ulog(botId, userId, `${scored.length} qualifying setups (min score ${STRATEGIES?.[bot.strategy]?.minScore || 'n/a'})`, 'SIGNAL');

    if (scored.length > 0) {
      const best = scored[0];
      ulog(botId, userId, `Best setup: ${best.symbol} score=${best.score.toFixed(1)} | ${best.signals.join(', ')}`, 'SIGNAL');

      let confirmed = true;
      let reasoning = `${best.strategy} on ${best.symbol}. Score ${best.score.toFixed(1)}. Signals: ${best.signals.join(', ')}.`;

      // Gemini confirmation only for very high scores (optional)
      if (GEMINI_KEY && best.score >= (best.minScore || 6) * 1.5) {
        ulog(botId, userId, `Requesting Gemini confirmation for ${best.symbol}...`, 'AI');
        const ai = await callGemini(
          `Confirm ${bot.strategy} crypto trade: BUY ${best.symbol}.\nScore: ${best.score.toFixed(1)}\nSignals: ${best.signals.join(', ')}\nReply JSON only: {"confirm":true,"reasoning":"1 sentence"}`
        );
        if (ai) {
          confirmed = ai.confirm !== false;
          if (ai.reasoning) reasoning = ai.reasoning;
          ulog(botId, userId, `Gemini: ${confirmed ? 'CONFIRMED' : 'REJECTED'} — ${ai.reasoning}`, 'AI');
        }
      }

      if (confirmed) {
        // Kelly-style sizing
        const baseK = bot.strategy === 'AGGRESSIVE' ? 0.28 : bot.strategy === 'DCA_PLUS' ? 0.12 : 0.20;
        const confMult = Math.min(1.5, best.score / (best.minScore || 6));
        const rawSpend = baseK * confMult * currentBalance;
        const spend = +Math.min(rawSpend, bot.maxTradeUSD, currentBalance - 2).toFixed(2);

        ulog(botId, userId, `Sizing: baseK=${baseK} confMult=${confMult.toFixed(2)} rawSpend=$${rawSpend.toFixed(2)} finalSpend=$${spend.toFixed(2)}`, 'INFO');

        if (spend >= 5) {
          const px = prices[best.symbol]?.price;
          if (px) {
            const fee = spend * FEE;
            const net = spend - fee;
            const qty = net / px;
            const newBal = +(currentBalance - spend).toFixed(8);

            const newPort = { ...currentPortfolio };
            const existing = newPort[best.symbol];
            if (existing) {
              const nq = existing.qty + qty;
              newPort[best.symbol] = { qty: nq, avgCost: (existing.qty * existing.avgCost + net) / nq, entryTime: existing.entryTime, leverage: 1 };
            } else {
              newPort[best.symbol] = { qty, avgCost: px, entryTime: new Date().toISOString(), leverage: 1 };
            }

            const t = {
              type: 'BUY', coin: best.symbol, qty, price: px,
              gross: spend, fee, netProceeds: net,
              strategy:   best.strategy,
              confidence: Math.min(10, Math.round(best.score * 0.7)),
              signals:    best.signals,
              reasoning,
              source: GEMINI_KEY ? 'AI' : 'RULES',
            };
            await Trades.insert(userId, t, botId).catch(e => ulog(botId, userId, `Trade insert error: ${e.message}`, 'ERROR'));
            setCooldown(botId, best.symbol, cycleNum); // prevent re-buying same coin for 5 cycles
            setMem(botId, { balance: newBal, portfolio: newPort, peakValue, totalFees: (botMem.get(botId)?.totalFees || 0) + fee });
            ulog(botId, userId, `✅ BUY ${qty.toFixed(5)} ${best.symbol} @ $${px.toFixed(4)} | Spent $${spend.toFixed(2)} | Fee $${fee.toFixed(3)} | [${bot.name}]`, 'TRADE');
          } else {
            ulog(botId, userId, `No price for ${best.symbol} — skipping`, 'WARN');
          }
        } else {
          ulog(botId, userId, `Spend too small ($${spend.toFixed(2)}) — need $5 minimum`, 'HOLD');
        }
      }
    } else {
      ulog(botId, userId, `No qualifying setups found. Market conditions not meeting ${bot.strategy} criteria.`, 'HOLD');
    }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────────
  setMem(botId, { status: 'running', peakValue });
  await syncBot(botId);
  await broadcastBotState(userId);
}

// ── Broadcast full bot state to user ─────────────────────────────────────────
export async function broadcastBotState(userId) {
  try {
    const summary = await getBotsSummary(userId);
    const prices  = displayPrices.get(userId) || {};
    broadcastToUser(userId, { type: 'BOTS_UPDATE', bots: summary, prices });
  } catch (e) {
    console.error('[BotMgr] broadcastBotState error:', e.message);
  }
}

// ── Public bot control ────────────────────────────────────────────────────────
export async function startBot(botId) {
  if (botTimers.has(botId)) return { ok: false, error: 'Already running' };

  const bot = await Bots.findById(botId).catch(() => null);
  if (!bot) return { ok: false, error: 'Bot not found (run schema_v2.sql in Supabase)' };

  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS || '60') * 1000;

  // Init memory from DB state
  getMem(botId, bot);
  await Bots.update(botId, { enabled: true, status: 'running', startedAt: new Date().toISOString() }).catch(() => {});

  ulog(botId, bot.userId, `▶ [${bot.name}] starting | Strategy: ${bot.strategy} | Mode: ${bot.botMode} | Balance: $${bot.balance}`, 'SYSTEM');

  // CRITICAL: Seed price history FIRST with botId as key
  // This ensures algorithm functions have history before cycle 1
  ulog(botId, bot.userId, `⏳ Pre-seeding 80 candles for all ${COINS.length} coins...`, 'SYSTEM');
  try {
    const seeded = await seedPriceHistory(botId); // botId is the key
    ulog(botId, bot.userId, `✅ Seeded history for ${seeded} coins — ready to trade`, 'SYSTEM');
  } catch (e) {
    ulog(botId, bot.userId, `⚠️ Seed failed: ${e.message} — bot will build history naturally`, 'WARN');
  }

  // Start cycle timer
  const cycleTimer = setInterval(() => runBotCycle(botId, bot.userId), CYCLE_MS);
  botTimers.set(botId, cycleTimer);

  // Start display price refresh (for dashboard)
  if (!priceTimers.has(bot.userId)) {
    const pt = setInterval(async () => {
      try {
        // Fetch fresh 24hr ticker for display (separate from algorithm history)
        const prices = botPrices.get(botId) || {};
        if (Object.keys(prices).length) {
          displayPrices.set(bot.userId, prices);
          broadcastToUser(bot.userId, { type: 'PRICES', prices });
        }
      } catch {}
    }, 10000);
    priceTimers.set(bot.userId, pt);
  }

  // Run first cycle after 3 seconds (history is seeded, should trade immediately)
  setTimeout(() => runBotCycle(botId, bot.userId), 3000);

  ulog(botId, bot.userId, `✅ Bot started — first cycle in 3s, then every ${CYCLE_MS/1000}s`, 'SYSTEM');
  return { ok: true };
}

export async function stopBot(botId) {
  clearInterval(botTimers.get(botId));
  botTimers.delete(botId);
  setMem(botId, { status: 'stopped' });
  await Bots.update(botId, { enabled: false, status: 'stopped' }).catch(() => {});
  const bot = await Bots.findById(botId).catch(() => null);
  if (bot) {
    ulog(botId, bot.userId, `◼ [${bot.name}] stopped`, 'SYSTEM');
    // Stop price timer if no bots running for this user
    const userBots = await Bots.forUser(bot.userId).catch(() => []);
    const anyRunning = userBots.some(b => botTimers.has(b.id));
    if (!anyRunning) { clearInterval(priceTimers.get(bot.userId)); priceTimers.delete(bot.userId); }
  }
  return { ok: true };
}

export async function resetBot(botId) {
  await stopBot(botId);
  const bot = await Bots.findById(botId).catch(() => null);
  if (!bot) return;
  const s = bot.startingBalance || 100;
  botMem.set(botId, { balance: s, startingBalance: s, portfolio: {}, peakValue: s, cycleCount: 0, totalFees: 0, status: 'idle', startedAt: null, lastCycleAt: null });
  await Bots.resetBot(botId).catch(() => {});
  ulog(botId, bot.userId, `↺ [${bot.name}] reset — $${s}`, 'SYSTEM');
  await broadcastBotState(bot.userId);
}

export async function createBot(userId, data) {
  const existing = await Bots.forUser(userId).catch(() => []);
  if (existing.length >= MAX_BOTS_PER_USER) throw new Error(`Max ${MAX_BOTS_PER_USER} bots per account`);
  return Bots.create(userId, data);
}

export async function getBotsSummary(userId) {
  const bots   = await Bots.forUser(userId).catch(() => []);
  const result = [];
  for (const bot of bots) {
    const ms     = botMem.get(bot.id);
    const bal    = ms?.balance    ?? bot.balance;
    const port   = ms?.portfolio  ?? bot.portfolio;
    const prices = botPrices.get(bot.id) || displayPrices.get(userId) || {};
    const tv     = calcTotalValue(prices, port, bal);
    const trades = await Trades.forBot(bot.id, 100).catch(() => []);
    const logs   = await BotLogs.getRecent(bot.id, 80).catch(() => []);
    result.push({
      ...bot,
      balance:    bal,
      portfolio:  port,
      totalValue: tv,
      peakValue:  ms?.peakValue  ?? bot.peakValue,
      cycleCount: ms?.cycleCount ?? bot.cycleCount,
      totalFees:  ms?.totalFees  ?? bot.totalFees,
      status:     ms?.status     ?? bot.status,
      pnl:        tv - bot.startingBalance,
      pnlPct:     ((tv / (bot.startingBalance || 100)) - 1) * 100,
      trades,
      logs,
    });
  }
  return result;
}

export async function getBotState(userId) {
  const bots   = await getBotsSummary(userId).catch(() => []);
  const prices = displayPrices.get(userId) || botPrices.get([...botTimers.keys()][0]) || {};
  const logs   = bots[0] ? await BotLogs.getRecent(bots[0].id, 100).catch(() => []) : [];
  return { bots, prices, botLog: logs, strategies: STRATEGY_LIST };
}

export async function applyStartingBalance(userId, amount) {
  const bots = await Bots.forUser(userId).catch(() => []);
  for (const bot of bots) {
    if (!botTimers.has(bot.id)) {
      await Bots.update(bot.id, { balance: amount, startingBalance: amount, peakValue: amount, portfolio: {}, cycleCount: 0, totalFees: 0 }).catch(() => {});
      if (botMem.has(bot.id)) {
        const ms = botMem.get(bot.id);
        botMem.set(bot.id, { ...ms, balance: amount, startingBalance: amount, peakValue: amount, portfolio: {} });
      }
      await Trades.deleteForBot(bot.id).catch(() => {});
      BotLogs.clearForBot(bot.id);
    }
  }
}

export async function restoreActiveBots() {
  const users = await Users.all().catch(() => []);
  let count = 0;
  for (const u of users) {
    const bots = await Bots.forUser(u.id).catch(() => []);
    for (const bot of bots) {
      if (bot.enabled) {
        setTimeout(() => startBot(bot.id), count++ * 2000);
      }
    }
  }
  if (count) console.log(`[BotMgr] Restoring ${count} bots...`);
}

export function getUserPrices(userId) { return displayPrices.get(userId) || {}; }
export function getStrategyList() { return STRATEGY_LIST; }
export { STRATEGY_LIST };

// Import STRATEGIES for minScore reference in logging
import { STRATEGIES } from './algorithm.js';
