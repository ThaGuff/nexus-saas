/**
 * PLEX TRADER · Bot Manager v7
 *
 * FIXES:
 * 1. Stuck bot fix — cycle lock with timeout (was deadlocking)
 * 2. Learning engine wired correctly — recordTrade on every SELL
 * 3. Gemini API for AI confirmation — free tier, no Anthropic charges
 * 4. Score scaled to 0-10 confidence, requires 8+ to execute buy
 * 5. Display price refresh decoupled from cycle — updates every 15s
 * 6. Cycle interval from env var (default 90s — calmer, higher quality)
 */

import axios from 'axios';
import {
  fetchPrices, seedPriceHistory, scoreForBuy, evaluateExit,
  calcTotalValue, buildMarketSummary, COINS, STRATEGY_LIST, STRATEGIES,
  setCooldown, isOnCooldown
} from './algorithm.js';
import { recordTrade, getLearningStats } from './learningEngine.js';
import { Users, Bots, Trades, BotLogs, Exchanges } from '../models/db.js';
import { broadcastToUser } from '../routes/ws.js';

const MAX_BOTS = 3;
const FEE      = 0.006;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
];

// In-memory state
const botTimers    = new Map(); // botId → IntervalId
const botMem       = new Map(); // botId → state
const botPrices    = new Map(); // botId → prices
const displayPrices= new Map(); // userId → prices
const priceTimers  = new Map(); // userId → IntervalId
const cyclingBots  = new Set(); // botIds currently in a cycle (deadlock prevention)
const cycleTimeouts= new Map(); // botId → timeout (stuck detection)

function getMem(botId, bot) {
  if (!botMem.has(botId)) {
    botMem.set(botId, {
      balance:        bot.balance        ?? bot.startingBalance ?? 100,
      startingBalance:bot.startingBalance ?? 100,
      portfolio:      bot.portfolio      || {},
      peakValue:      bot.peakValue      ?? bot.startingBalance ?? 100,
      cycleCount:     bot.cycleCount     || 0,
      totalFees:      bot.totalFees      || 0,
      status:         'running',
      startedAt:      new Date().toISOString(),
      lastCycleAt:    null,
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
  if (['TRADE','ERROR','CYCLE','PROFIT','LOSS','SYSTEM','SIGNAL','AI'].includes(level)) {
    console.log(`[${level}][${botId.slice(0,6)}] ${msg}`);
  }
}

// ── Gemini AI confirmation (free API) ─────────────────────────────────────────
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
      const clean = text.replace(/```json|```/g,'').trim();
      return JSON.parse(clean);
    } catch(e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      if (msg.includes('not found') || msg.includes('not supported') || msg.includes('INVALID_ARGUMENT')) {
        continue; // try next model
      }
      console.log('[Gemini] error:', msg);
      return null;
    }
  }
  return null;
}

// ── Core trading cycle ────────────────────────────────────────────────────────
async function runBotCycle(botId, userId) {
  // STUCK BOT PREVENTION: if already cycling, skip this cycle
  if (cyclingBots.has(botId)) {
    console.log(`[BotMgr][${botId.slice(0,6)}] Skipping cycle — previous cycle still running`);
    return;
  }

  let bot = null;
  try { bot = await Bots.findById(botId); } catch {}
  if (bot && !bot.enabled) return;
  if (!bot) {
    const ms = botMem.get(botId);
    if (!ms) return;
    bot = { id:botId, userId, name:'Bot', strategy:'PRECISION', botMode:'PAPER',
      maxTradeUSD:ms.startingBalance*0.2, stopLossPct:0.05, takeProfitPct:0.08,
      maxDrawdownPct:0.20, maxPositionPct:0.35, leverageEnabled:false, maxLeverage:3, enabled:true };
  }

  const ms = getMem(botId, bot);
  const cycleNum = (ms.cycleCount||0)+1;

  // Mark as cycling — with 3-minute timeout watchdog
  cyclingBots.add(botId);
  const watchdog = setTimeout(()=>{
    console.error(`[BotMgr][${botId.slice(0,6)}] WATCHDOG: cycle took >3min — force releasing lock`);
    cyclingBots.delete(botId);
    setMem(botId, { status:'running' });
  }, 180000);
  cycleTimeouts.set(botId, watchdog);

  try {
    setMem(botId, { status:'cycling', cycleCount:cycleNum, lastCycleAt:new Date().toISOString() });
    ulog(botId, userId, `━━━ [${bot.name}] Cycle #${cycleNum} | ${bot.strategy} | Cash: $${ms.balance.toFixed(2)} ━━━`, 'CYCLE');

    // Fetch prices
    let prices = {};
    try {
      prices = await fetchPrices(botId);
      botPrices.set(botId, prices);
      displayPrices.set(userId, prices);
      broadcastToUser(userId, { type:'PRICES', prices });
    } catch(e) {
      ulog(botId, userId, `Price fetch failed: ${e.message}`, 'ERROR');
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

    ulog(botId, userId, `Portfolio: $${tv.toFixed(2)} | Cash: $${balance.toFixed(2)} | DD: ${(drawdown*100).toFixed(1)}%`, 'INFO');

    // Emergency drawdown exit
    if (drawdown>=bot.maxDrawdownPct && Object.keys(portfolio).length>0) {
      ulog(botId, userId, `⚠ MAX DRAWDOWN ${(drawdown*100).toFixed(1)}% — liquidating all`, 'WARN');
      let nb=balance;
      for (const [sym,pos] of Object.entries(portfolio)) {
        const px=prices[sym]?.price; if(!px) continue;
        const gross=pos.qty*px, fee=gross*FEE, net=gross-fee;
        nb+=net;
        const pnl=net-pos.qty*pos.avgCost;
        await Trades.insert(userId,{type:'SELL',coin:sym,qty:pos.qty,price:px,gross,fee,netProceeds:net,pnl,strategy:'STOP_LOSS',confidence:10,signals:['MAX_DRAWDOWN'],reasoning:'Emergency drawdown liquidation.'},botId).catch(()=>{});
        recordTrade(botId, bot.strategy, { signals:['MAX_DRAWDOWN'], pnl, pnlPct:(pnl/(pos.qty*pos.avgCost))*100, holdMinutes:0 });
      }
      setMem(botId, { balance:+nb.toFixed(8), portfolio:{}, peakValue, status:'running' });
      await syncBot(botId);
      await broadcastBotState(userId);
      return;
    }

    // ── CHECK EXITS ──────────────────────────────────────────────────────────
    let updatedPortfolio = { ...portfolio };
    let updatedBalance   = balance;
    let updatedFees      = ms.totalFees||0;

    for (const [sym,pos] of Object.entries(portfolio)) {
      const exit = evaluateExit(botId, sym, pos, prices, settings);
      if (!exit) {
        const px=prices[sym]?.price||0;
        const lev=pos.leverage||1;
        const pricePct=pos.avgCost?((px-pos.avgCost)/pos.avgCost*100).toFixed(2):'—';
        const effPct=(pos.avgCost?(px-pos.avgCost)/pos.avgCost*lev*100:0).toFixed(2);
        ulog(botId, userId, `  HOLD ${sym}${lev>1?` [${lev}x]`:''} | Price: ${pricePct}% | Effective: ${effPct}% | trend intact`, 'HOLD');
        continue;
      }

      const px=prices[sym]?.price; if(!px) continue;
      const lev = pos.leverage || 1;
      const sellQty = pos.qty * exit.sellPct;

      // PnL calculation with leverage:
      // - margin committed = pos.marginSpent * sellPct (or estimate from avgCost/leverage)
      // - price change % × leverage × margin = actual dollar PnL
      const marginForSell = (pos.marginSpent || (pos.qty * pos.avgCost / lev)) * exit.sellPct;
      const priceChangePct = (px - pos.avgCost) / pos.avgCost;
      const pnl = priceChangePct * lev * marginForSell;

      // What comes back to balance: margin + pnl (minus fees on notional)
      const notionalSell = sellQty * px;
      const fee = notionalSell * FEE;
      // Balance receives back: margin committed for this sell + profit/loss - fee
      const returnedToBalance = Math.max(0, marginForSell + pnl - fee);
      const gross = notionalSell;
      const net   = returnedToBalance;

      updatedBalance = +(updatedBalance + Math.max(0, returnedToBalance)).toFixed(8);
      updatedFees   += fee;

      const remaining = pos.qty - sellQty;
      const remainingMargin = (pos.marginSpent||marginForSell) - marginForSell;
      if (remaining < 0.000001) {
        delete updatedPortfolio[sym];
      } else {
        updatedPortfolio[sym] = { ...pos, qty:remaining, marginSpent:remainingMargin };
      }

      const t = {
        type:'SELL', coin:sym, qty:sellQty, price:px,
        gross, fee, netProceeds:net, pnl,
        leverage:lev,
        marginUsed: marginForSell,
        priceChangePct: +(priceChangePct*100).toFixed(3),
        effectivePct:   +(priceChangePct*lev*100).toFixed(3),
        strategy:exit.strategy, confidence:exit.confidence,
        signals:exit.signals, reasoning:exit.reasoning,
      };
      await Trades.insert(userId, t, botId).catch(()=>{});

      // ★ LEARNING ENGINE
      const holdMinutes = pos.entryTime ? Math.round((Date.now()-new Date(pos.entryTime))/60000) : 0;
      const pnlPct = marginForSell > 0 ? (pnl/marginForSell)*100 : 0;
      recordTrade(botId, bot.strategy, { signals:exit.signals, pnl, pnlPct, holdMinutes });

      setMem(botId, { balance:updatedBalance, portfolio:updatedPortfolio, peakValue, totalFees:updatedFees });

      if (lev > 1) {
        ulog(botId, userId,
          `${pnl>=0?'✅':'❌'} SELL ${sellQty.toFixed(5)} ${sym} @ $${px.toFixed(4)} | ${lev}x LEV | Price: ${(priceChangePct*100).toFixed(2)}% | Effective: ${(priceChangePct*lev*100).toFixed(2)}% | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(3)} | ${exit.strategy}`,
          pnl>=0?'PROFIT':'LOSS');
      } else {
        ulog(botId, userId,
          `${pnl>=0?'✅':'❌'} SELL ${sellQty.toFixed(5)} ${sym} @ $${px.toFixed(4)} | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(3)} | ${exit.strategy}`,
          pnl>=0?'PROFIT':'LOSS');
      }
    }

    // ── SCAN FOR ENTRIES ────────────────────────────────────────────────────
    const currentBalance  = botMem.get(botId)?.balance ?? updatedBalance;
    const currentPortfolio= botMem.get(botId)?.portfolio ?? updatedPortfolio;

    if (currentBalance<10) {
      ulog(botId, userId, `Insufficient cash ($${currentBalance.toFixed(2)}) — holding`, 'HOLD');
    } else {
      ulog(botId, userId, `Scanning ${COINS.length} coins for ${bot.strategy} entry (min confidence 8/10)...`, 'SIGNAL');

      const scored = [];
      for (const {symbol} of COINS) {
        try {
          const result = scoreForBuy(botId, symbol, prices, currentPortfolio, tv, settings, cycleNum);
          if (result.score > 0) {
            ulog(botId, userId, `  ${symbol}: score=${result.score.toFixed(1)} min=${result.minScore} conf=${result.confidence?.toFixed(1)||'—'}/10`, 'INFO');
          }
          // Require confidence ≥ 8/10
          const confMet = result.confidence >= 8;
          if (result.score>=result.minScore && confMet) {
            scored.push({symbol, ...result});
          } else if (result.score>=result.minScore) {
            ulog(botId, userId, `  ${symbol}: score qualifies but confidence ${result.confidence?.toFixed(1)}/10 < 8 — skipping`, 'INFO');
          }
        } catch(e) {
          ulog(botId, userId, `Score error ${symbol}: ${e.message}`, 'ERROR');
        }
      }

      scored.sort((a,b)=>b.score-a.score);
      ulog(botId, userId, `${scored.length} high-confidence setups found (8/10+ required)`, 'SIGNAL');

      if (scored.length>0) {
        const best = scored[0];
        ulog(botId, userId, `Best: ${best.symbol} score=${best.score.toFixed(1)} conf=${best.confidence?.toFixed(1)}/10 | ${best.signals.slice(0,3).join(', ')}`, 'SIGNAL');

        let confirmed = true;
        let reasoning = `${best.strategy} on ${best.symbol}. Score: ${best.score.toFixed(1)}, Confidence: ${best.confidence?.toFixed(1)}/10. Signals: ${best.signals.join(', ')}.`;

        // Gemini confirmation for any qualifying trade (free API)
        if (GEMINI_KEY) {
          ulog(botId, userId, `Requesting Gemini confirmation for ${best.symbol}...`, 'AI');
          const learningStats = getLearningStats(botId, bot.strategy);
          const ai = await callGemini(
            `You are a crypto trading risk manager. Confirm this ${bot.strategy} trade signal.\n` +
            `COIN: ${best.symbol}\nSCORE: ${best.score.toFixed(1)}/${best.minScore} (confidence: ${best.confidence?.toFixed(1)}/10)\n` +
            `SIGNALS: ${best.signals.join(', ')}\n` +
            `LEARNING: This bot has ${learningStats.totalTrades} past trades, ${learningStats.winRate}% win rate\n` +
            `Best signals historically: ${JSON.stringify(learningStats.bestSignals)}\n` +
            `Reply ONLY with JSON: {"confirm":true,"reasoning":"1 sentence max"}`
          );
          if (ai) {
            confirmed = ai.confirm !== false;
            if (ai.reasoning) reasoning = `AI: ${ai.reasoning}`;
            ulog(botId, userId, `Gemini: ${confirmed?'✅ CONFIRMED':'❌ REJECTED'} — ${ai.reasoning}`, 'AI');
          }
        }

        if (confirmed) {
          // ── POSITION SIZING WITH LEVERAGE ───────────────────────────────────
          // Leverage mechanics:
          // - `spend` = margin capital committed (comes out of balance)
          // - `notionalValue` = spend × leverage = total exposure controlled
          // - `qty` = notionalValue / price (we control MORE coins with leverage)
          // - Stop loss triggers at price move of (sl / leverage) — much tighter
          // - PnL = price_change_pct × leverage × margin_spent

          const lev = bot.leverageEnabled ? Math.max(1, bot.maxLeverage||1) : 1;
          const conf = best.confidence || 8;

          // Size the MARGIN (not notional) — leverage amplifies this
          // Reduce position size when using leverage (more risk per dollar)
          const leverageRiskAdj = lev > 1 ? Math.max(0.3, 1/Math.sqrt(lev)) : 1;
          const baseK = bot.strategy==='DCA_PLUS' ? 0.10
                      : bot.strategy==='AGGRESSIVE' ? 0.18
                      : 0.15;
          const confMult = Math.min(1.3, conf/8);
          const rawMargin = baseK * confMult * leverageRiskAdj * currentBalance;
          const margin = +Math.min(rawMargin, bot.maxTradeUSD, currentBalance - 5).toFixed(2);

          if (margin >= 10) {
            const px = prices[best.symbol]?.price;
            if (px) {
              const fee = margin * FEE * lev; // fee on notional exposure
              const notional = margin * lev;  // total exposure value
              const qty = notional / px;      // actual coins controlled
              const newBal = +(currentBalance - margin).toFixed(8); // only margin leaves balance

              // Effective stop loss price (triggers at margin SL / leverage)
              const slPct = (bot.stopLossPct || 0.05) / lev;
              const stopPrice = px * (1 - slPct);
              const tpPrice   = px * (1 + (bot.takeProfitPct || 0.08) / lev);

              const newPort = { ...currentPortfolio };
              const existing = newPort[best.symbol];
              if (existing) {
                const nq = existing.qty + qty;
                const existingMargin = existing.marginSpent || (existing.qty * existing.avgCost / (existing.leverage||1));
                newPort[best.symbol] = {
                  qty: nq,
                  avgCost: (existing.qty * existing.avgCost + notional) / nq, // weighted avg entry
                  marginSpent: (existingMargin) + margin,
                  notionalValue: (existing.notionalValue||(existing.qty*existing.avgCost)) + notional,
                  entryTime: existing.entryTime,
                  leverage: lev,
                  peakPrice: px,
                };
              } else {
                newPort[best.symbol] = {
                  qty,
                  avgCost: px,       // entry price
                  marginSpent: margin,
                  notionalValue: notional,
                  entryTime: new Date().toISOString(),
                  leverage: lev,
                  peakPrice: px,
                  stopPrice,
                  takeProfitPrice: tpPrice,
                };
              }

              const t = {
                type:'BUY', coin:best.symbol, qty, price:px,
                gross: margin,          // margin spent
                notional,               // total exposure
                fee, netProceeds: margin - fee,
                leverage: lev,
                strategy: best.strategy,
                confidence: Math.round(best.confidence||8),
                signals: best.signals,
                reasoning: lev > 1
                  ? `${reasoning} | ${lev}x LEVERAGE: $${margin.toFixed(2)} margin controls $${notional.toFixed(2)} notional. SL at $${stopPrice.toFixed(4)} (${(slPct*100).toFixed(2)}% move).`
                  : reasoning,
              };
              await Trades.insert(userId, t, botId).catch(e=>ulog(botId,userId,`Trade insert: ${e.message}`,'ERROR'));
              setCooldown(botId, best.symbol, cycleNum);
              setMem(botId, { balance:newBal, portfolio:newPort, peakValue, totalFees:(botMem.get(botId)?.totalFees||0)+fee });

              if (lev > 1) {
                ulog(botId, userId, `✅ BUY ${qty.toFixed(5)} ${best.symbol} @ $${px.toFixed(4)} | Margin: $${margin.toFixed(2)} | Notional: $${notional.toFixed(2)} | ${lev}x LEV | SL: $${stopPrice.toFixed(4)}`, 'TRADE');
              } else {
                ulog(botId, userId, `✅ BUY ${qty.toFixed(5)} ${best.symbol} @ $${px.toFixed(4)} | $${margin.toFixed(2)} | conf:${best.confidence?.toFixed(1)}/10`, 'TRADE');
              }
            }
          } else {
            ulog(botId, userId, `Margin too small ($${margin.toFixed(2)}) — need $10 min`, 'HOLD');
          }
        }
      } else {
        ulog(botId, userId, `No setups met 8/10 confidence threshold. Waiting for better conditions.`, 'HOLD');
      }
    }

    // Finalize
    setMem(botId, { status:'running', peakValue });
    await syncBot(botId);
    await broadcastBotState(userId);

  } finally {
    // ALWAYS release the cycle lock
    cyclingBots.delete(botId);
    clearTimeout(cycleTimeouts.get(botId));
    cycleTimeouts.delete(botId);
  }
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

  // Cycle every 90 seconds by default (higher quality entries)
  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS||'90')*1000;

  getMem(botId, bot);
  await Bots.update(botId, { enabled:true, status:'running', startedAt:new Date().toISOString() }).catch(()=>{});
  ulog(botId, bot.userId, `▶ [${bot.name}] starting | ${bot.strategy} | Mode: ${bot.botMode} | Balance: $${bot.balance} | Cycle: ${CYCLE_MS/1000}s`, 'SYSTEM');

  // Seed price history first
  ulog(botId, bot.userId, `⏳ Seeding 100 candles for ${COINS.length} coins...`, 'SYSTEM');
  try {
    const seeded = await seedPriceHistory(botId);
    ulog(botId, bot.userId, `✅ Seeded ${seeded} coins — ready to trade`, 'SYSTEM');
  } catch(e) {
    ulog(botId, bot.userId, `⚠ Seed partial: ${e.message}`, 'WARN');
  }

  // Start cycle timer
  const cycleTimer = setInterval(()=>runBotCycle(botId, bot.userId), CYCLE_MS);
  botTimers.set(botId, cycleTimer);

  // Display price refresh every 15s (independent of cycle)
  if (!priceTimers.has(bot.userId)) {
    const pt = setInterval(async()=>{
      const prices=botPrices.get(botId)||{};
      if (Object.keys(prices).length) {
        displayPrices.set(bot.userId, prices);
        broadcastToUser(bot.userId, { type:'PRICES', prices });
      }
    }, 15000);
    priceTimers.set(bot.userId, pt);
  }

  // First cycle after 5 seconds
  setTimeout(()=>runBotCycle(botId, bot.userId), 5000);
  ulog(botId, bot.userId, `✅ Ready — first cycle in 5s, then every ${CYCLE_MS/1000}s`, 'SYSTEM');
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
  const s=bot.startingBalance||100;
  botMem.set(botId,{balance:s,startingBalance:s,portfolio:{},peakValue:s,cycleCount:0,totalFees:0,status:'idle',startedAt:null,lastCycleAt:null});
  await Bots.resetBot(botId).catch(()=>{});
  ulog(botId, bot.userId, `↺ [${bot.name}] reset to $${s}`, 'SYSTEM');
  await broadcastBotState(bot.userId);
}

export async function createBot(userId, data) {
  const existing = await Bots.forUser(userId).catch(()=>[]);
  if (existing.length>=MAX_BOTS) throw new Error(`Max ${MAX_BOTS} bots per account`);
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
      pnl:tv-bot.startingBalance, pnlPct:((tv/(bot.startingBalance||100))-1)*100,
      trades, logs, learning,
    });
  }
  return result;
}

export async function getBotState(userId) {
  const bots   = await getBotsSummary(userId).catch(()=>[]);
  const prices = displayPrices.get(userId)||botPrices.get([...botTimers.keys()][0])||{};
  const logs   = bots[0]?await BotLogs.getRecent(bots[0].id,100).catch(()=>[]):[];
  return { bots, prices, botLog:logs, strategies:STRATEGY_LIST };
}

export async function applyStartingBalance(userId, amount) {
  const bots = await Bots.forUser(userId).catch(()=>[]);
  for (const bot of bots) {
    if (!botTimers.has(bot.id)) {
      await Bots.update(bot.id,{balance:amount,startingBalance:amount,peakValue:amount,portfolio:{},cycleCount:0,totalFees:0}).catch(()=>{});
      if (botMem.has(bot.id)) {
        const ms=botMem.get(bot.id);
        botMem.set(bot.id,{...ms,balance:amount,startingBalance:amount,peakValue:amount,portfolio:{}});
      }
      await Trades.deleteForBot(bot.id).catch(()=>{});
      BotLogs.clearForBot(bot.id);
    }
  }
}

export async function restoreActiveBots() {
  const users = await Users.all().catch(()=>[]);
  let count=0;
  for (const u of users) {
    const bots = await Bots.forUser(u.id).catch(()=>[]);
    for (const bot of bots) {
      if (bot.enabled) setTimeout(()=>startBot(bot.id), count++*2000);
    }
  }
  if (count) console.log(`[BotMgr] Restoring ${count} bots...`);
}

export function getUserPrices(userId) { return displayPrices.get(userId)||{}; }
export function getStrategyList() { return STRATEGY_LIST; }
export { STRATEGY_LIST };
