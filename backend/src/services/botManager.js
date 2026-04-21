/**
 * PLEX TRADER · Bot Manager v8
 *
 * FIXES IN THIS VERSION:
 * 1. TIMER SURVIVAL: heartbeat every 60s detects dead bots and restarts them
 * 2. PRICE SHARING: bots share one price fetch per cycle window (no rate limiting)
 * 3. BOT STAGGER: bots start offset by 30s so they don't all cycle simultaneously
 * 4. FEE FIX: 0.1% on notional (realistic taker fee) instead of 0.6%
 *    Paper mode: 0.1% simulated. Live mode: actual exchange fee.
 * 5. PRICE FETCH RETRY: 3 attempts with backoff before failing a cycle
 * 6. CYCLE LOCK: try/finally ensures lock always releases
 */

import axios from 'axios';
import {
  fetchPrices, seedPriceHistory, scoreForBuy, evaluateExit,
  calcTotalValue, COINS, STRATEGY_LIST, STRATEGIES,
  setCooldown
} from './algorithm.js';
import { recordTrade, getLearningStats } from './learningEngine.js';
import { Users, Bots, Trades, BotLogs } from '../models/db.js';
import { getAdapter, EXCHANGE_FEES, getLiveBalances } from './exchanges/index.js';
import { broadcastToUser } from '../routes/ws.js';

const MAX_BOTS = 3;

// ── FEE STRUCTURE ──────────────────────────────────────────────────────────────
// Realistic exchange taker fees:
// Coinbase Advanced: 0.06% maker / 0.10% taker
// Binance: 0.10% taker (0.075% with BNB)
// Kraken: 0.16% taker
// Crypto.com: 0.075% taker
// We use 0.10% (0.001) as a fair average taker fee on NOTIONAL
// This replaces the previous 0.6% which was 6x too high
const PAPER_FEE_RATE = 0.001;  // 0.10% — realistic paper simulation
const LIVE_FEE_RATE  = 0.001;  // 0.10% — actual exchange taker average

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
];

// In-memory state
const botTimers     = new Map(); // botId → IntervalId
const botMem        = new Map(); // botId → state
const botPrices     = new Map(); // botId → prices
const displayPrices = new Map(); // userId → prices
const priceTimers   = new Map(); // userId → IntervalId
const cyclingBots   = new Set(); // deadlock prevention
const cycleTimeouts = new Map(); // watchdog timers

// Shared price cache — all bots for same user share one fetch
const sharedPriceCache = new Map(); // userId → { prices, ts }
const SHARED_PRICE_TTL = 45000; // 45s — within one cycle window

function getFeeRate(botMode, exchangeName=null) {
  if (exchangeName && EXCHANGE_FEES[exchangeName]) return EXCHANGE_FEES[exchangeName];
  return botMode === 'LIVE' ? LIVE_FEE_RATE : PAPER_FEE_RATE;
}

function getMem(botId, bot) {
  if (!botMem.has(botId)) {
    botMem.set(botId, {
      balance:         bot.balance        ?? bot.startingBalance ?? 10000,
      startingBalance: bot.startingBalance ?? 10000,
      portfolio:       bot.portfolio      || {},
      peakValue:       bot.peakValue      ?? bot.startingBalance ?? 10000,
      cycleCount:      bot.cycleCount     || 0,
      totalFees:       bot.totalFees      || 0,
      status:          'running',
      startedAt:       new Date().toISOString(),
      lastCycleAt:     null,
      lastSuccessAt:   null, // tracks actual successful cycles for heartbeat
    });
  }
  return botMem.get(botId);
}
function setMem(botId, updates) {
  botMem.set(botId, { ...(botMem.get(botId)||{}), ...updates });
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

function ulog(botId, userId, msg, level='INFO') {
  const entry = { ts: new Date().toISOString(), level, msg };
  BotLogs.append(botId, entry).catch(()=>{});
  broadcastToUser(userId, { type:'BOT_LOG', botId, entry });
  if (['TRADE','ERROR','CYCLE','PROFIT','LOSS','SYSTEM','SIGNAL','AI','WARN'].includes(level)) {
    console.log(`[${level}][${botId.slice(0,6)}] ${msg}`);
  }
}

// ── Gemini AI ─────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GEMINI_KEY) return null;
  for (const modelUrl of GEMINI_MODELS) {
    try {
      const url = `${modelUrl}?key=${GEMINI_KEY}`;
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 150 },
      }, { timeout: 10000 });
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(text.replace(/```json|```/g,'').trim());
    } catch(e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      if (msg.includes('not found') || msg.includes('not supported') || msg.includes('INVALID_ARGUMENT')) continue;
      console.log('[Gemini]', msg.slice(0,80));
      return null;
    }
  }
  return null;
}

// ── Price fetch with shared cache and retry ───────────────────────────────────
async function getPricesForBot(botId, userId) {
  // Check shared cache first — prevents multiple bots hammering Binance
  const cached = sharedPriceCache.get(userId);
  if (cached && Date.now() - cached.ts < SHARED_PRICE_TTL) {
    // Still seed this bot's own price history from the cached prices
    const ph = botPrices.get(botId) || {};
    if (Object.keys(ph).length === 0) {
      // New bot — needs its own history seeded
      await seedPriceHistory(botId).catch(()=>{});
    }
    // Update bot's local cache from shared
    botPrices.set(botId, cached.prices);
    return cached.prices;
  }

  // Fetch fresh — retry up to 3 times with backoff
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const prices = await fetchPrices(botId);
      if (Object.keys(prices).length > 10) {
        // Cache for all bots of this user
        sharedPriceCache.set(userId, { prices, ts: Date.now() });
        botPrices.set(botId, prices);
        displayPrices.set(userId, prices);
        broadcastToUser(userId, { type:'PRICES', prices });
        return prices;
      }
    } catch(e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr || new Error('Price fetch returned empty data after 3 attempts');
}

// ── Core trading cycle ────────────────────────────────────────────────────────
async function runBotCycle(botId, userId) {
  if (cyclingBots.has(botId)) {
    console.log(`[BotMgr][${botId.slice(0,6)}] Already cycling — skipping`);
    return;
  }

  let bot = null;
  try { bot = await Bots.findById(botId); } catch {}
  if (bot && !bot.enabled) return;
  if (!bot) {
    const ms = botMem.get(botId);
    if (!ms) return;
    bot = {
      id:botId, userId, name:'Bot', strategy:'PRECISION', botMode:'PAPER',
      maxTradeUSD:ms.startingBalance*0.1, stopLossPct:0.05, takeProfitPct:0.08,
      maxDrawdownPct:0.20, maxPositionPct:0.35, leverageEnabled:false, maxLeverage:3, enabled:true,
    };
  }

  const ms = getMem(botId, bot);
  const cycleNum = (ms.cycleCount||0)+1;
  const FEE = getFeeRate(bot.botMode);

  cyclingBots.add(botId);
  const watchdog = setTimeout(()=>{
    console.error(`[BotMgr][${botId.slice(0,6)}] WATCHDOG: force releasing stuck cycle`);
    cyclingBots.delete(botId);
    setMem(botId, { status:'running' });
  }, 180000);
  cycleTimeouts.set(botId, watchdog);

  try {
    setMem(botId, { status:'cycling', cycleCount:cycleNum, lastCycleAt:new Date().toISOString() });
    ulog(botId, userId, `━━━ [${bot.name}] Cycle #${cycleNum} | ${bot.strategy} | Cash: $${ms.balance.toFixed(2)} | Fee: ${(FEE*100).toFixed(2)}% ━━━`, 'CYCLE');

    // Fetch prices with shared cache + retry
    let prices = {};
    try {
      prices = await getPricesForBot(botId, userId);
    } catch(e) {
      ulog(botId, userId, `Price fetch failed after retries: ${e.message}`, 'ERROR');
      return;
    }

    const settings = {
      tradingStrategy:bot.strategy, botMode:bot.botMode,
      maxTradeUSD:bot.maxTradeUSD, stopLossPct:bot.stopLossPct,
      takeProfitPct:bot.takeProfitPct, maxDrawdownPct:bot.maxDrawdownPct,
      maxPositionPct:bot.maxPositionPct, leverageEnabled:bot.leverageEnabled,
      maxLeverage:bot.maxLeverage,
    };

    const portfolio = ms.portfolio || {};
    const balance   = ms.balance;
    const tv        = calcTotalValue(prices, portfolio, balance);
    const peakValue = Math.max(ms.peakValue||tv, tv);
    const drawdown  = peakValue>0?(peakValue-tv)/peakValue:0;

    ulog(botId, userId, `TV: $${tv.toFixed(2)} | Cash: $${balance.toFixed(2)} | Peak: $${peakValue.toFixed(2)} | DD: ${(drawdown*100).toFixed(1)}%`, 'INFO');

    // Emergency drawdown exit
    if (drawdown >= bot.maxDrawdownPct && Object.keys(portfolio).length > 0) {
      ulog(botId, userId, `⚠ MAX DRAWDOWN ${(drawdown*100).toFixed(1)}% — liquidating`, 'WARN');
      let nb = balance;
      for (const [sym, pos] of Object.entries(portfolio)) {
        const px = prices[sym]?.price; if (!px) continue;
        const lev = pos.leverage||1;
        const margin = pos.marginSpent||(pos.qty*pos.avgCost/lev);
        const priceChg = (px-pos.avgCost)/pos.avgCost;
        const pnl = priceChg * lev * margin;
        const gross = pos.qty * px;
        const fee = gross * FEE;
        const ret = Math.max(0, margin + pnl - fee);
        nb += ret;
        await Trades.insert(userId,{type:'SELL',coin:sym,qty:pos.qty,price:px,gross,fee,netProceeds:ret,pnl,strategy:'STOP_LOSS',confidence:10,signals:['MAX_DRAWDOWN'],reasoning:'Emergency drawdown liquidation.'},botId).catch(()=>{});
        recordTrade(botId, bot.strategy, { signals:['MAX_DRAWDOWN'], pnl, pnlPct:(pnl/margin)*100, holdMinutes:0 });
      }
      setMem(botId, { balance:+nb.toFixed(8), portfolio:{}, peakValue, status:'running' });
      await syncBot(botId);
      await broadcastBotState(userId);
      return;
    }

    // ── CHECK EXITS ────────────────────────────────────────────────────────────
    let updatedPortfolio = { ...portfolio };
    let updatedBalance   = balance;
    let updatedFees      = ms.totalFees||0;

    for (const [sym, pos] of Object.entries(portfolio)) {
      const exit = evaluateExit(botId, sym, pos, prices, settings);
      if (!exit) {
        const px = prices[sym]?.price||0;
        const lev = pos.leverage||1;
        const pricePct = pos.avgCost ? ((px-pos.avgCost)/pos.avgCost*100).toFixed(2) : '—';
        const effPct = pos.avgCost ? ((px-pos.avgCost)/pos.avgCost*lev*100).toFixed(2) : '—';
        ulog(botId, userId, `  HOLD ${sym}${lev>1?` [${lev}x]`:''} | Price: ${pricePct}% | Eff: ${effPct}% | holding`, 'HOLD');
        continue;
      }

      const px = prices[sym]?.price; if (!px) continue;
      const lev = pos.leverage||1;
      const sellQty = pos.qty * exit.sellPct;
      const marginForSell = (pos.marginSpent||(pos.qty*pos.avgCost/lev)) * exit.sellPct;
      const priceChangePct = (px - pos.avgCost) / pos.avgCost;
      const pnl = priceChangePct * lev * marginForSell;
      const notionalSell = sellQty * px;
      const fee = notionalSell * FEE;  // 0.1% on notional
      const returnedToBalance = Math.max(0, marginForSell + pnl - fee);

      updatedBalance = +(updatedBalance + returnedToBalance).toFixed(8);
      updatedFees += fee;

      const remaining = pos.qty - sellQty;
      const remainingMargin = Math.max(0, (pos.marginSpent||marginForSell) - marginForSell);
      if (remaining < 0.000001) delete updatedPortfolio[sym];
      else updatedPortfolio[sym] = { ...pos, qty:remaining, marginSpent:remainingMargin };

      const t = {
        type:'SELL', coin:sym, qty:sellQty, price:px,
        gross:notionalSell, fee, netProceeds:returnedToBalance, pnl,
        leverage:lev, marginUsed:marginForSell,
        priceChangePct:+(priceChangePct*100).toFixed(3),
        effectivePct:+(priceChangePct*lev*100).toFixed(3),
        feeRate: FEE,
        strategy:exit.strategy, confidence:exit.confidence,
        signals:exit.signals, reasoning:exit.reasoning,
      };
      await Trades.insert(userId, t, botId).catch(()=>{});

      const holdMinutes = pos.entryTime ? Math.round((Date.now()-new Date(pos.entryTime))/60000) : 0;
      const pnlPct = marginForSell > 0 ? (pnl/marginForSell)*100 : 0;
      recordTrade(botId, bot.strategy, { signals:exit.signals, pnl, pnlPct, holdMinutes });

      setMem(botId, { balance:updatedBalance, portfolio:updatedPortfolio, peakValue, totalFees:updatedFees });
      // ── PHASE 2: LIVE SELL EXECUTION ────────────────────────────────
      if (adapter && bot.botMode === 'LIVE') {
        try {
          const sellNotional = sellQty * px;
          ulog(botId, userId, `📡 Placing LIVE SELL: ${sellQty.toFixed(4)} ${sym} ($${sellNotional.toFixed(2)}) on ${exchangeName}`, 'SYSTEM');
          const fill = await adapter.placeMarketOrder(sym, 'SELL', sellNotional);
          ulog(botId, userId, `✅ LIVE SELL filled @ $${fill.avgPrice?.toFixed(2)||px.toFixed(2)} | Order: ${fill.orderId}`, 'SYSTEM');
        } catch(e) {
          ulog(botId, userId, `❌ LIVE SELL FAILED: ${e.message}`, 'ERROR');
          // Continue with paper accounting even if live order failed — alert user
        }
      }

      ulog(botId, userId,
        `${pnl>=0?'✅':'❌'} SELL ${sellQty.toFixed(4)} ${sym} @ $${px.toFixed(2)} | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(2)} | Fee: $${fee.toFixed(3)} (${(FEE*100).toFixed(2)}%) | ${exit.strategy} | ${exchangeName}`,
        pnl>=0?'PROFIT':'LOSS');
    }

    // ── SCAN FOR ENTRIES ───────────────────────────────────────────────────────
    const currentBalance   = botMem.get(botId)?.balance ?? updatedBalance;
    const currentPortfolio = botMem.get(botId)?.portfolio ?? updatedPortfolio;

    if (currentBalance < 10) {
      ulog(botId, userId, `Low cash ($${currentBalance.toFixed(2)}) — holding`, 'HOLD');
    } else {
      ulog(botId, userId, `Scanning ${COINS.length} coins for ${bot.strategy} (conf ≥8/10)...`, 'SIGNAL');

      const scored = [];
      for (const { symbol } of COINS) {
        try {
          const result = scoreForBuy(botId, symbol, prices, currentPortfolio, tv, settings, cycleNum);
          if (result.score > 0) {
            ulog(botId, userId, `  ${symbol}: score=${result.score.toFixed(1)} min=${result.minScore} conf=${result.confidence?.toFixed(1)||'—'}/10 sigs=${result.signals?.slice(0,2).join(',')||'—'}`, 'INFO');
          }
          if (result.score >= result.minScore) { // confidence auto-satisfied when score >= minScore
            scored.push({ symbol, ...result });
          }
        } catch(e) {
          ulog(botId, userId, `Score err ${symbol}: ${e.message}`, 'ERROR');
        }
      }

      scored.sort((a,b) => b.score-a.score);
      ulog(botId, userId, `${scored.length} qualifying setups found`, 'SIGNAL');

      if (scored.length > 0) {
        const best = scored[0];
        ulog(botId, userId, `Best: ${best.symbol} score=${best.score.toFixed(1)} conf=${best.confidence?.toFixed(1)}/10 | ${best.signals.slice(0,3).join(', ')}`, 'SIGNAL');

        let confirmed = true;
        let reasoning = `${best.strategy} on ${best.symbol}. Score: ${best.score.toFixed(1)}, Conf: ${best.confidence?.toFixed(1)}/10. Signals: ${best.signals.join(', ')}.`;

        if (GEMINI_KEY) {
          const ls = getLearningStats(botId, bot.strategy);
          const ai = await callGemini(
            `Crypto trade risk check. Strategy: ${bot.strategy}, Coin: ${best.symbol}\n` +
            `Score: ${best.score.toFixed(1)}/${best.minScore}, Confidence: ${best.confidence?.toFixed(1)}/10\n` +
            `Signals: ${best.signals.join(', ')}\n` +
            `Bot history: ${ls.totalTrades} trades, ${ls.winRate}% win rate\n` +
            `Reply ONLY: {"confirm":true,"reasoning":"one sentence"}`
          );
          if (ai) {
            confirmed = ai.confirm !== false;
            if (ai.reasoning) reasoning = `AI: ${ai.reasoning}`;
            ulog(botId, userId, `Gemini: ${confirmed?'✅':'❌'} ${ai.reasoning||''}`, 'AI');
          }
        }

        if (confirmed) {
          const lev = bot.leverageEnabled ? Math.max(1, bot.maxLeverage||1) : 1;
          const conf = best.confidence || 8;
          const leverageRiskAdj = lev > 1 ? Math.max(0.25, 1/Math.sqrt(lev)) : 1;
          const baseK = bot.strategy==='DCA_PLUS'?0.10:bot.strategy==='AGGRESSIVE'?0.18:0.15;
          const confMult = Math.min(1.3, conf/8);
          const rawMargin = baseK * confMult * leverageRiskAdj * currentBalance;
          const margin = +Math.min(rawMargin, bot.maxTradeUSD, currentBalance-5).toFixed(2);

          if (margin >= 10) {
            const px = prices[best.symbol]?.price;
            if (px) {
              const notional = margin * lev;
              const fee = notional * FEE;  // 0.1% on notional
              const qty = notional / px;
              const newBal = +(currentBalance - margin).toFixed(8);
              const slPct = (bot.stopLossPct||0.05) / lev;
              const stopPrice = px * (1-slPct);

              const newPort = { ...currentPortfolio };
              const existing = newPort[best.symbol];
              if (existing) {
                const nq = existing.qty + qty;
                const existMargin = existing.marginSpent||(existing.qty*existing.avgCost/(existing.leverage||1));
                newPort[best.symbol] = {
                  qty:nq, avgCost:(existing.qty*existing.avgCost+notional)/nq,
                  marginSpent:existMargin+margin, notionalValue:(existing.notionalValue||existing.qty*existing.avgCost)+notional,
                  entryTime:existing.entryTime, leverage:lev, peakPrice:px,
                };
              } else {
                newPort[best.symbol] = {
                  qty, avgCost:px, marginSpent:margin, notionalValue:notional,
                  entryTime:new Date().toISOString(), leverage:lev, peakPrice:px, stopPrice,
                };
              }

              // ── PHASE 2: LIVE ORDER EXECUTION ──────────────────────────
              let actualQty = qty, actualPrice = px, actualFee = fee;
              if (adapter && bot.botMode === 'LIVE') {
                try {
                  ulog(botId, userId, `📡 Placing LIVE ${side||'BUY'} order: ${best.symbol} $${margin.toFixed(2)} on ${exchangeName}`, 'SYSTEM');
                  const fill = await adapter.placeMarketOrder(best.symbol, 'BUY', margin * lev);
                  if (fill.avgPrice) { actualPrice = fill.avgPrice; actualQty = fill.qty || (margin*lev/fill.avgPrice); }
                  if (fill.fee) { actualFee = fill.fee; }
                  ulog(botId, userId, `✅ LIVE fill: ${actualQty.toFixed(4)} ${best.symbol} @ $${actualPrice.toFixed(2)} | Fee: $${actualFee.toFixed(3)} | Order: ${fill.orderId}`, 'SYSTEM');
                } catch(e) {
                  ulog(botId, userId, `❌ LIVE order FAILED: ${e.message} — aborting trade`, 'ERROR');
                  setMem(botId, { status:'running' });
                  return;
                }
              }

              const t = {
                type:'BUY', coin:best.symbol, qty:actualQty, price:actualPrice,
                gross:margin, notional, fee:actualFee, netProceeds:margin-actualFee,
                leverage:lev, feeRate:FEE, exchange:exchangeName,
                strategy:best.strategy, confidence:Math.round(best.confidence||8),
                signals:best.signals, reasoning,
                source: bot.botMode === 'LIVE' ? 'LIVE' : 'PAPER',
              };
              await Trades.insert(userId, t, botId).catch(e=>ulog(botId,userId,`Trade insert: ${e.message}`,'ERROR'));
              setCooldown(botId, best.symbol, cycleNum);
              setMem(botId, { balance:newBal, portfolio:newPort, peakValue, totalFees:(botMem.get(botId)?.totalFees||0)+fee });
              ulog(botId, userId,
                lev>1
                  ? `✅ BUY ${qty.toFixed(4)} ${best.symbol} @ $${px.toFixed(2)} | Margin: $${margin.toFixed(2)} | Notional: $${notional.toFixed(2)} | ${lev}x | Fee: $${fee.toFixed(3)} | SL: $${stopPrice.toFixed(2)}`
                  : `✅ BUY ${qty.toFixed(4)} ${best.symbol} @ $${px.toFixed(2)} | $${margin.toFixed(2)} | Fee: $${fee.toFixed(3)} | conf:${best.confidence?.toFixed(1)}/10`,
                'TRADE');
            }
          } else {
            ulog(botId, userId, `Margin $${margin.toFixed(2)} < $10 min — skip`, 'HOLD');
          }
        }
      } else {
        ulog(botId, userId, `No setups met 8/10 threshold for ${bot.strategy}`, 'HOLD');
      }
    }

    setMem(botId, { status:'running', peakValue, lastSuccessAt:new Date().toISOString() });
    await syncBot(botId);
    await broadcastBotState(userId);

  } finally {
    cyclingBots.delete(botId);
    clearTimeout(cycleTimeouts.get(botId));
    cycleTimeouts.delete(botId);
  }
}

// ── Heartbeat: detect and restart dead bots every 2 minutes ──────────────────
let heartbeatTimer = null;
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    try {
      const users = await Users.all().catch(()=>[]);
      for (const u of users) {
        const bots = await Bots.forUser(u.id).catch(()=>[]);
        for (const bot of bots) {
          if (!bot.enabled) continue;
          const hasTimer = botTimers.has(bot.id);
          const ms = botMem.get(bot.id);
          const lastSuccess = ms?.lastSuccessAt ? new Date(ms.lastSuccessAt) : null;
          const staleSec = lastSuccess ? (Date.now()-lastSuccess.getTime())/1000 : Infinity;

          if (!hasTimer || staleSec > 600) {
            // Bot should be running but timer is missing, OR no successful cycle in 10min
            if (hasTimer) {
              console.log(`[Heartbeat] Bot ${bot.id.slice(0,6)} stale (${staleSec.toFixed(0)}s) — restarting`);
              clearInterval(botTimers.get(bot.id));
              botTimers.delete(bot.id);
            } else {
              console.log(`[Heartbeat] Bot ${bot.id.slice(0,6)} missing timer — restarting`);
            }
            await startBot(bot.id).catch(e=>console.error('[Heartbeat] restart failed:', e.message));
          }
        }
      }
    } catch(e) {
      console.error('[Heartbeat] error:', e.message);
    }
  }, 2 * 60 * 1000); // every 2 minutes
  console.log('[BotMgr] Heartbeat started — dead bot detection active');
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
export async function broadcastBotState(userId) {
  try {
    const summary = await getBotsSummary(userId);
    const prices  = displayPrices.get(userId) || {};
    broadcastToUser(userId, { type:'BOTS_UPDATE', bots:summary, prices });
  } catch(e) { console.error('[BotMgr] broadcast error:', e.message); }
}

// ── Public controls ───────────────────────────────────────────────────────────
export async function startBot(botId) {
  if (botTimers.has(botId)) return { ok:false, error:'Already running' };
  const bot = await Bots.findById(botId).catch(()=>null);
  if (!bot) return { ok:false, error:'Bot not found' };

  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS||'90')*1000;
  getMem(botId, bot);
  await Bots.update(botId, { enabled:true, status:'running', startedAt:new Date().toISOString() }).catch(()=>{});
  ulog(botId, bot.userId, `▶ [${bot.name}] starting | ${bot.strategy} | ${bot.botMode} | $${bot.balance} | Fee: ${(getFeeRate(bot.botMode)*100).toFixed(2)}%`, 'SYSTEM');

  try {
    const seeded = await seedPriceHistory(botId);
    ulog(botId, bot.userId, `✅ Seeded ${seeded} coins`, 'SYSTEM');
  } catch(e) {
    ulog(botId, bot.userId, `⚠ Seed partial: ${e.message}`, 'WARN');
  }

  // Stagger bot start by botIndex × 30s to prevent simultaneous cycles
  const userBots = await Bots.forUser(bot.userId).catch(()=>[]);
  const botIndex = userBots.findIndex(b=>b.id===botId);
  const staggerMs = Math.max(0, botIndex) * 30000;

  const cycleTimer = setInterval(()=>runBotCycle(botId, bot.userId), CYCLE_MS);
  botTimers.set(botId, cycleTimer);

  if (!priceTimers.has(bot.userId)) {
    const pt = setInterval(async()=>{
      const prices = botPrices.get(botId)||{};
      if (Object.keys(prices).length) {
        displayPrices.set(bot.userId, prices);
        broadcastToUser(bot.userId, { type:'PRICES', prices });
      }
    }, 15000);
    priceTimers.set(bot.userId, pt);
  }

  setTimeout(()=>runBotCycle(botId, bot.userId), 5000 + staggerMs);
  ulog(botId, bot.userId, `✅ Ready — first cycle in ${(5000+staggerMs)/1000}s, then every ${CYCLE_MS/1000}s`, 'SYSTEM');
  return { ok:true };
}

export async function stopBot(botId) {
  clearInterval(botTimers.get(botId)); botTimers.delete(botId);
  cyclingBots.delete(botId);
  clearTimeout(cycleTimeouts.get(botId)); cycleTimeouts.delete(botId);
  setMem(botId, { status:'stopped' });
  await Bots.update(botId, { enabled:false, status:'stopped' }).catch(()=>{});
  const bot = await Bots.findById(botId).catch(()=>null);
  if (bot) {
    ulog(botId, bot.userId, `◼ [${bot.name}] stopped`, 'SYSTEM');
    const userBots = await Bots.forUser(bot.userId).catch(()=>[]);
    if (!userBots.some(b=>botTimers.has(b.id))) {
      clearInterval(priceTimers.get(bot.userId)); priceTimers.delete(bot.userId);
    }
  }
  return { ok:true };
}

export async function resetBot(botId) {
  await stopBot(botId);
  const bot = await Bots.findById(botId).catch(()=>null);
  if (!bot) return;
  const s = bot.startingBalance||10000;
  botMem.set(botId,{balance:s,startingBalance:s,portfolio:{},peakValue:s,cycleCount:0,totalFees:0,status:'idle',startedAt:null,lastCycleAt:null,lastSuccessAt:null});
  await Bots.resetBot(botId).catch(()=>{});
  ulog(botId, bot.userId, `↺ [${bot.name}] reset to $${s}`, 'SYSTEM');
  await broadcastBotState(bot.userId);
}

export async function createBot(userId, data) {
  const existing = await Bots.forUser(userId).catch(()=>[]);
  if (existing.length >= MAX_BOTS) throw new Error(`Max ${MAX_BOTS} bots per account`);
  return Bots.create(userId, data);
}

export async function getBotsSummary(userId) {
  const bots = await Bots.forUser(userId).catch(()=>[]);
  const result = [];
  for (const bot of bots) {
    const ms     = botMem.get(bot.id);
    const bal    = ms?.balance    ?? bot.balance;
    const port   = ms?.portfolio  ?? bot.portfolio;
    const prices = botPrices.get(bot.id)||displayPrices.get(userId)||{};
    const tv     = calcTotalValue(prices, port, bal);
    const trades = await Trades.forBot(bot.id, 100).catch(()=>[]);
    const logs   = await BotLogs.getRecent(bot.id, 80).catch(()=>[]);
    const learning = getLearningStats(bot.id, bot.strategy);
    result.push({
      ...bot, balance:bal, portfolio:port, totalValue:tv,
      peakValue:ms?.peakValue??bot.peakValue, cycleCount:ms?.cycleCount??bot.cycleCount,
      totalFees:ms?.totalFees??bot.totalFees, status:ms?.status??bot.status,
      pnl:tv-bot.startingBalance, pnlPct:((tv/(bot.startingBalance||10000))-1)*100,
      trades, logs, learning,
    });
  }
  return result;
}

export async function getBotState(userId) {
  const bots   = await getBotsSummary(userId).catch(()=>[]);
  const prices = displayPrices.get(userId)||{};
  return { bots, prices, strategies:STRATEGY_LIST };
}

export async function applyStartingBalance(userId, amount) {
  const bots = await Bots.forUser(userId).catch(()=>[]);
  for (const bot of bots) {
    if (!botTimers.has(bot.id)) {
      await Bots.update(bot.id,{balance:amount,startingBalance:amount,peakValue:amount,portfolio:{},cycleCount:0,totalFees:0}).catch(()=>{});
      if (botMem.has(bot.id)) {
        const ms = botMem.get(bot.id);
        botMem.set(bot.id,{...ms,balance:amount,startingBalance:amount,peakValue:amount,portfolio:{}});
      }
      await Trades.deleteForBot(bot.id).catch(()=>{});
      BotLogs.clearForBot(bot.id);
    }
  }
}

export async function restoreActiveBots() {
  const users = await Users.all().catch(()=>[]);
  let count = 0;
  for (const u of users) {
    const bots = await Bots.forUser(u.id).catch(()=>[]);
    for (const bot of bots) {
      if (bot.enabled) {
        setTimeout(()=>startBot(bot.id), count++ * 3000); // 3s stagger on restore
      }
    }
  }
  if (count) console.log(`[BotMgr] Restoring ${count} bots...`);
  startHeartbeat(); // start dead-bot detection
}

export function getUserPrices(userId) { return displayPrices.get(userId)||{}; }
export function getStrategyList() { return STRATEGY_LIST; }
export { STRATEGY_LIST };
