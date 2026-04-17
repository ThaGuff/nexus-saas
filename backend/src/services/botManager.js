/**
 * NEXUS SAAS · Bot Manager v5 — Multi-Bot
 * Each user can run up to 3 bots simultaneously with different strategies
 * Each bot has isolated state, portfolio, and trade history
 */

import axios from 'axios';
import { fetchPrices, scoreForBuy, evaluateExit, calcTotalValue, buildMarketSummary, COINS, STRATEGY_LIST } from './algorithm.js';
import { Users, Bots, Trades, BotLogs, Exchanges } from '../models/db.js';
import { broadcastToUser } from '../routes/ws.js';

const MAX_BOTS_PER_USER = 3;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
const FEE = 0.006;

// In-memory: userId -> Map<botId -> state>
const botTimers = new Map(); // botId -> { cycleTimer, priceTimer }
const botMem    = new Map(); // botId -> { balance, portfolio, peakValue, ... }
const userPrices= new Map(); // userId -> prices

// botStates exported as botMem

function getMem(botId, bot) {
  if (!botMem.has(botId)) {
    botMem.set(botId, {
      balance:      bot.balance,
      startingBalance: bot.startingBalance,
      portfolio:    bot.portfolio || {},
      peakValue:    bot.peakValue,
      cycleCount:   bot.cycleCount || 0,
      totalFees:    bot.totalFees  || 0,
      status:       'running',
      startedAt:    bot.startedAt  || new Date().toISOString(),
      lastCycleAt:  null,
    });
  }
  return botMem.get(botId);
}

function setMem(botId, updates) {
  const s = botMem.get(botId) || {};
  botMem.set(botId, { ...s, ...updates });
  return botMem.get(botId);
}

async function syncBot(botId) {
  const s = botMem.get(botId);
  if (!s) return;
  await Bots.update(botId, { balance:s.balance, portfolio:s.portfolio, peakValue:s.peakValue, cycleCount:s.cycleCount, totalFees:s.totalFees, status:s.status, lastCycleAt:s.lastCycleAt }).catch(()=>{});
}

async function ulog(botId, userId, msg, level='INFO') {
  const entry = { ts:new Date().toISOString(), level, msg };
  await BotLogs.append(botId, entry);
  broadcastToUser(userId, { type:'BOT_LOG', botId, entry });
  if (['TRADE','ERROR','CYCLE','PROFIT','LOSS'].includes(level)) console.log(`[${botId.slice(0,6)}][${level}] ${msg}`);
}

async function callGemini(prompt) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await axios.post(GEMINI_URL, { contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.1,maxOutputTokens:200} }, {timeout:8000});
    return JSON.parse((res.data?.candidates?.[0]?.content?.parts?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
  } catch { return null; }
}

async function runBotCycle(botId, userId) {
  const bot = await Bots.findById(botId).catch(()=>null);
  if (!bot?.enabled) return;

  const ms = getMem(botId, bot);
  if (ms.status === 'cycling') return;

  const cycleNum = (ms.cycleCount||0) + 1;
  setMem(botId, { status:'cycling', cycleCount:cycleNum, lastCycleAt:new Date().toISOString() });

  ulog(botId, userId, `━━━ [${bot.name}] Cycle #${cycleNum} | ${bot.strategy} | Cash: $${ms.balance.toFixed(2)} ━━━`, 'CYCLE');

  // Get prices (shared across all user's bots for efficiency)
  let prices = userPrices.get(userId) || {};
  if (!Object.keys(prices).length) {
    try { prices = await fetchPrices(userId); userPrices.set(userId, prices); } catch(e) {
      ulog(botId, userId, `Price fetch failed: ${e.message}`, 'ERROR');
      setMem(botId, { status:'running' }); return;
    }
  }

  const settings = { tradingStrategy:bot.strategy, botMode:bot.botMode, maxTradeUSD:bot.maxTradeUSD, stopLossPct:bot.stopLossPct, takeProfitPct:bot.takeProfitPct, maxDrawdownPct:bot.maxDrawdownPct, maxPositionPct:bot.maxPositionPct, leverageEnabled:bot.leverageEnabled, maxLeverage:bot.maxLeverage };

  const portfolio = ms.portfolio || {};
  const balance   = ms.balance;
  const tv        = calcTotalValue(prices, portfolio, balance);
  const peakValue = Math.max(ms.peakValue||tv, tv);
  const drawdown  = peakValue>0?(peakValue-tv)/peakValue:0;

  // Emergency drawdown liquidation
  if (drawdown >= bot.maxDrawdownPct && Object.keys(portfolio).length > 0) {
    ulog(botId, userId, `⚠️ MAX DRAWDOWN (${(drawdown*100).toFixed(1)}%) — liquidating`, 'WARN');
    let nb=balance, np={...portfolio};
    for (const [sym,pos] of Object.entries(portfolio)) {
      const px=prices[sym]?.price; if(!px) continue;
      const net=pos.qty*px*(1-FEE); nb+=net; delete np[sym];
      const t={type:'SELL',coin:sym,qty:pos.qty,price:px,gross:pos.qty*px,fee:pos.qty*px*FEE,netProceeds:net,pnl:net-pos.qty*pos.avgCost,strategy:'STOP_LOSS',confidence:10,signals:['MAX_DRAWDOWN'],reasoning:'Emergency liquidation.',source:'RULES'};
      await Trades.insert(userId, t, botId).catch(()=>{});
    }
    setMem(botId, { balance:+nb.toFixed(8), portfolio:np, peakValue, status:'running' });
    await syncBot(botId);
    await broadcastBotState(userId);
    return;
  }

  // Exits
  for (const [sym,pos] of Object.entries(portfolio)) {
    const exit = evaluateExit(userId+botId, sym, pos, prices, settings);
    if (!exit) { ulog(botId, userId, `${sym}: holding`, 'HOLD'); continue; }
    const px=prices[sym]?.price; if(!px) continue;
    const sq=pos.qty*exit.sellPct, gr=sq*px, fe=gr*FEE, net=gr-fe;
    const pnl=(net-sq*pos.avgCost)*(pos.leverage||1);
    const nb=+(ms.balance+net).toFixed(8);
    const rem=pos.qty-sq;
    const np={...portfolio};
    if(rem<0.000001)delete np[sym];else np[sym]={...pos,qty:rem};
    const t={type:'SELL',coin:sym,qty:sq,price:px,gross:gr,fee:fe,netProceeds:net,pnl,leverage:pos.leverage||1,strategy:exit.strategy,confidence:exit.confidence,signals:exit.signals,reasoning:exit.reasoning,source:'RULES'};
    await Trades.insert(userId, t, botId).catch(()=>{});
    setMem(botId, { balance:nb, portfolio:np, peakValue, totalFees:(ms.totalFees||0)+fe });
    ulog(botId, userId, `✅ SELL ${sq.toFixed(4)} ${sym} @ $${px.toFixed(4)} | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(3)}`, pnl>=0?'PROFIT':'LOSS');
  }

  // Entry scan
  const freshMem = botMem.get(botId);
  const freshBal = freshMem?.balance ?? balance;
  const freshPort = freshMem?.portfolio ?? portfolio;

  if (freshBal >= 5) {
    const candidates=[];
    for (const {symbol} of COINS) {
      const res = scoreForBuy(userId+botId, symbol, prices, freshPort, tv, settings);
      if (res.score >= (res.minScore||8)) candidates.push({symbol,...res});
    }
    candidates.sort((a,b)=>b.score-a.score);
    ulog(botId, userId, `[${bot.name}] ${candidates.length} setups found with ${bot.strategy}`, 'SIGNAL');

    if (candidates.length > 0) {
      const best=candidates[0];
      ulog(botId, userId, `Best: ${best.symbol} score=${best.score.toFixed(1)} | ${best.signals.join(', ')}`, 'SIGNAL');
      let confirmed=true, reasoning=`${best.strategy} on ${best.symbol}. Score ${best.score.toFixed(1)}. ${best.signals.join(', ')}.`;

      if (GEMINI_KEY && best.score>=(best.minScore||8)*1.4) {
        const ai=await callGemini(`Confirm ${bot.strategy} BUY ${best.symbol}. Score: ${best.score.toFixed(1)}. Signals: ${best.signals.join(', ')}. Reply JSON: {"confirm":true|false,"reasoning":"<1 sentence>"}`);
        if (ai){confirmed=ai.confirm!==false;if(ai.reasoning)reasoning=ai.reasoning;ulog(botId,userId,`AI: ${confirmed?'OK':'REJECTED'} — ${ai.reasoning}`,'AI');}
      }

      if (confirmed) {
        const k=bot.strategy==='AGGRESSIVE'?0.28:bot.strategy==='DCA_PLUS'?0.12:0.20;
        const spend=+Math.min(k*(best.score/(best.minScore||8))*freshBal,bot.maxTradeUSD,freshBal-2).toFixed(2);
        if (spend>=5) {
          const px=prices[best.symbol]?.price;
          if (px) {
            const fe=spend*FEE,net=spend-fe,qty=net/px;
            const nb=+(freshBal-spend).toFixed(8);
            const np={...freshPort};
            const ex=np[best.symbol];
            if(ex){const nq=ex.qty+qty;np[best.symbol]={qty:nq,avgCost:(ex.qty*ex.avgCost+net)/nq,entryTime:ex.entryTime,leverage:1};}
            else{np[best.symbol]={qty,avgCost:px,entryTime:new Date().toISOString(),leverage:1};}
            const t={type:'BUY',coin:best.symbol,qty,price:px,gross:spend,fee:fe,netProceeds:net,strategy:best.strategy,confidence:Math.min(10,Math.round(best.score*0.7)),signals:best.signals,reasoning,source:GEMINI_KEY?'AI':'RULES'};
            await Trades.insert(userId, t, botId).catch(()=>{});
            setMem(botId,{balance:nb,portfolio:np,peakValue,totalFees:(freshMem?.totalFees||0)+fe});
            ulog(botId,userId,`✅ BUY ${qty.toFixed(4)} ${best.symbol} @ $${px.toFixed(4)} | $${spend.toFixed(2)} | [${bot.name}]`,'TRADE');
          }
        }
      }
    } else {
      ulog(botId, userId, `[${bot.name}] No qualifying setups — ${bot.strategy} waiting`, 'HOLD');
    }
  }

  setMem(botId, { status:'running', peakValue });
  await syncBot(botId);
  await broadcastBotState(userId);
}

// ── Price refresh (shared across all user's bots) ─────────────────────────────
const priceTimers = new Map(); // userId -> timer
function startPriceRefresh(userId) {
  if (priceTimers.has(userId)) return;
  const t = setInterval(async () => {
    try {
      const p = await fetchPrices(userId);
      userPrices.set(userId, p);
      broadcastToUser(userId, { type:'PRICES', prices:p });
    } catch {}
  }, 15000);
  priceTimers.set(userId, t);
  fetchPrices(userId).then(p=>userPrices.set(userId,p)).catch(()=>{});
}
function stopPriceRefreshIfUnneeded(userId) {
  const anyRunning = [...botTimers.keys()].some(bid => {
    const mem = botMem.get(bid);
    return mem?.status === 'running' || mem?.status === 'cycling';
  });
  if (!anyRunning) { clearInterval(priceTimers.get(userId)); priceTimers.delete(userId); }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function startBot(botId) {
  if (botTimers.has(botId)) return { ok:false, error:'Already running' };
  const bot = await Bots.findById(botId);
  if (!bot) return { ok:false, error:'Bot not found' };
  const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_SECONDS||'60') * 1000;

  getMem(botId, bot);
  await Bots.update(botId, { enabled:true, status:'running', startedAt:new Date().toISOString() });
  startPriceRefresh(bot.userId);
  const cycleTimer = setInterval(() => runBotCycle(botId, bot.userId), CYCLE_MS);
  botTimers.set(botId, cycleTimer);
  ulog(botId, bot.userId, `▶ [${bot.name}] started | ${bot.strategy} | ${bot.botMode}`, 'SYSTEM');
  setTimeout(() => runBotCycle(botId, bot.userId), 5000);
  return { ok:true };
}

export async function stopBot(botId) {
  clearInterval(botTimers.get(botId));
  botTimers.delete(botId);
  const bot = await Bots.findById(botId).catch(()=>null);
  setMem(botId, { status:'stopped' });
  await Bots.update(botId, { enabled:false, status:'stopped' }).catch(()=>{});
  if (bot) { ulog(botId, bot.userId, `◼ [${bot.name}] stopped`, 'SYSTEM'); stopPriceRefreshIfUnneeded(bot.userId); }
  return { ok:true };
}

export async function resetBot(botId) {
  await stopBot(botId);
  const bot = await Bots.findById(botId).catch(()=>null);
  if (!bot) return;
  botMem.set(botId, { balance:bot.startingBalance, startingBalance:bot.startingBalance, portfolio:{}, peakValue:bot.startingBalance, cycleCount:0, totalFees:0, status:'idle', startedAt:null, lastCycleAt:null });
  await Bots.resetBot(botId);
  ulog(botId, bot.userId, `↺ [${bot.name}] reset — $${bot.startingBalance}`, 'SYSTEM');
  await broadcastBotState(bot.userId);
}

export async function createBot(userId, data) {
  const existing = await Bots.forUser(userId);
  if (existing.length >= MAX_BOTS_PER_USER) throw new Error(`Max ${MAX_BOTS_PER_USER} bots per account`);
  return Bots.create(userId, data);
}

export async function getBotsSummary(userId) {
  const bots = await Bots.forUser(userId);
  const prices = userPrices.get(userId) || {};
  const result = [];
  for (const bot of bots) {
    const ms = botMem.get(bot.id);
    const bal = ms?.balance ?? bot.balance;
    const port = ms?.portfolio ?? bot.portfolio;
    const tv = calcTotalValue(prices, port, bal);
    const trades = await Trades.forBot(bot.id, 100).catch(()=>[]);
    const logs = await BotLogs.getRecent(bot.id, 50).catch(()=>[]);
    result.push({
      ...bot,
      balance: bal, portfolio: port,
      totalValue: tv, peakValue: ms?.peakValue ?? bot.peakValue,
      cycleCount: ms?.cycleCount ?? bot.cycleCount,
      totalFees: ms?.totalFees ?? bot.totalFees,
      status: ms?.status ?? bot.status,
      pnl: tv - bot.startingBalance,
      pnlPct: ((tv/bot.startingBalance)-1)*100,
      trades, logs,
    });
  }
  return result;
}

export async function broadcastBotState(userId) {
  const summary = await getBotsSummary(userId).catch(()=>[]);
  const prices  = userPrices.get(userId) || {};
  broadcastToUser(userId, { type:'BOTS_UPDATE', bots:summary, prices });
}

export async function restoreActiveBots() {
  const users = await Users.all().catch(()=>[]);
  let c=0;
  for (const u of users) {
    const bots = await Bots.forUser(u.id).catch(()=>[]);
    for (const bot of bots) {
      if (bot.enabled) { setTimeout(()=>startBot(bot.id), c++*1500); }
    }
  }
  if (c) console.log(`[BotMgr] Restored ${c} bots`);
}

// Legacy single-bot compat for ws.js INIT
export async function getBotState(userId) {
  const bots = await getBotsSummary(userId).catch(()=>[]);
  const prices = userPrices.get(userId)||{};
  const logs = bots[0] ? await BotLogs.getRecent(bots[0].id,100).catch(()=>[]) : [];
  return { bots, prices, botLog:logs, strategies:STRATEGY_LIST };
}

export function getUserPrices(userId) { return userPrices.get(userId)||{}; }
export function getStrategyList() { return STRATEGY_LIST; }
export { STRATEGY_LIST };

export async function applyStartingBalance(userId, amount) {
  const bots = await Bots.forUser(userId).catch(()=>[]);
  for (const bot of bots) {
    if (!bot.enabled) {
      await Bots.update(bot.id, { balance:amount, startingBalance:amount, peakValue:amount, portfolio:{}, cycleCount:0, totalFees:0 });
      if (botMem.has(bot.id)) botMem.set(bot.id, { ...botMem.get(bot.id), balance:amount, startingBalance:amount, peakValue:amount });
      await Trades.deleteForBot(bot.id).catch(()=>{});
      BotLogs.clearForBot(bot.id);
    }
  }
}
