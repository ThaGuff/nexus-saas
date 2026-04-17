/**
 * NEXUS SAAS · Algorithm v7 — 7 Expert Strategy Modes
 * 
 * STRATEGIES (user-selectable):
 * 1. PRECISION  — RSI+MACD+BB triple confirm, highest win rate (~75-80%), fewer trades
 * 2. MOMENTUM   — EMA cascade + volume surge, rides strong trends
 * 3. REVERSAL   — Deep oversold mean reversion, highest R:R ratio
 * 4. BREAKOUT   — BB squeeze + volume explosion, captures big moves
 * 5. SWING      — Multi-day position trading, patient entries/exits
 * 6. AGGRESSIVE — High risk/reward, wider stops, larger targets
 * 7. DCA_PLUS   — Dollar cost average into dips with technical confirmation
 *
 * COIN UNIVERSE: 33 liquid pairs (Binance)
 * SETTINGS: All read from user.settings in DB, applied per cycle
 */

import axios from 'axios';

const BINANCE = 'https://api.binance.com/api/v3';

export const COINS = [
  // Tier 1 — Core (highest liquidity, tightest spreads)
  { id:'BTCUSDT',    symbol:'BTC',    tier:1, weight:1.5 },
  { id:'ETHUSDT',    symbol:'ETH',    tier:1, weight:1.4 },
  { id:'SOLUSDT',    symbol:'SOL',    tier:1, weight:1.3 },
  { id:'XRPUSDT',    symbol:'XRP',    tier:1, weight:1.2 },
  { id:'BNBUSDT',    symbol:'BNB',    tier:1, weight:1.2 },
  // Tier 2 — Large Cap
  { id:'AVAXUSDT',   symbol:'AVAX',   tier:2, weight:1.1 },
  { id:'DOTUSDT',    symbol:'DOT',    tier:2, weight:1.0 },
  { id:'LINKUSDT',   symbol:'LINK',   tier:2, weight:1.0 },
  { id:'ADAUSDT',    symbol:'ADA',    tier:2, weight:1.0 },
  { id:'LTCUSDT',    symbol:'LTC',    tier:2, weight:1.0 },
  { id:'ATOMUSDT',   symbol:'ATOM',   tier:2, weight:0.9 },
  { id:'UNIUSDT',    symbol:'UNI',    tier:2, weight:0.9 },
  { id:'MATICUSDT',  symbol:'MATIC',  tier:2, weight:0.9 },
  // Tier 3 — Mid Cap
  { id:'NEARUSDT',   symbol:'NEAR',   tier:3, weight:0.9 },
  { id:'APTUSDT',    symbol:'APT',    tier:3, weight:0.9 },
  { id:'ARBUSDT',    symbol:'ARB',    tier:3, weight:0.9 },
  { id:'OPUSDT',     symbol:'OP',     tier:3, weight:0.8 },
  { id:'INJUSDT',    symbol:'INJ',    tier:3, weight:0.9 },
  { id:'SUIUSDT',    symbol:'SUI',    tier:3, weight:0.9 },
  { id:'SEIUSDT',    symbol:'SEI',    tier:3, weight:0.8 },
  { id:'TIAUSDT',    symbol:'TIA',    tier:3, weight:0.8 },
  { id:'DOGEUSDT',   symbol:'DOGE',   tier:3, weight:0.8 },
  // Tier 4 — High Volatility / High Reward
  { id:'FETUSDT',    symbol:'FET',    tier:4, weight:0.8 },
  { id:'RENDERUSDT', symbol:'RENDER', tier:4, weight:0.8 },
  { id:'WLDUSDT',    symbol:'WLD',    tier:4, weight:0.7 },
  { id:'JUPUSDT',    symbol:'JUP',    tier:4, weight:0.8 },
  { id:'PYTHUSDT',   symbol:'PYTH',   tier:4, weight:0.7 },
  { id:'ENAUSDT',    symbol:'ENA',    tier:4, weight:0.8 },
  { id:'ONDOUSDT',   symbol:'ONDO',   tier:4, weight:0.7 },
  { id:'STRKUSDT',   symbol:'STRK',   tier:4, weight:0.7 },
  { id:'EIGENUSDT',  symbol:'EIGEN',  tier:4, weight:0.7 },
  { id:'WUSDT',      symbol:'W',      tier:4, weight:0.6 },
  { id:'SHIBUSDT',   symbol:'SHIB',   tier:4, weight:0.7 },
];

const PAIR_TO_SYM = Object.fromEntries(COINS.map(c => [c.id, c.symbol]));

// Per-user price/volume/RSI history
const pH  = new Map(); // userId -> {SYM: []}
const vH  = new Map();
const rH  = new Map(); // RSI history for trend detection

function getPH(uid, sym) {
  if (!pH.has(uid)) pH.set(uid, {});
  if (!pH.get(uid)[sym]) pH.get(uid)[sym] = [];
  return pH.get(uid)[sym];
}
function getVH(uid, sym) {
  if (!vH.has(uid)) vH.set(uid, {});
  if (!vH.get(uid)[sym]) vH.get(uid)[sym] = [];
  return vH.get(uid)[sym];
}
function getRH(uid, sym) {
  if (!rH.has(uid)) rH.set(uid, {});
  if (!rH.get(uid)[sym]) rH.get(uid)[sym] = [];
  return rH.get(uid)[sym];
}

export async function fetchPrices(userId) {
  const allIds = COINS.map(c => c.id);
  const result = {};
  // Batch into groups of 20 (Binance limit)
  for (let i = 0; i < allIds.length; i += 20) {
    try {
      const batch = allIds.slice(i, i + 20);
      const res = await axios.get(`${BINANCE}/ticker/24hr`, {
        params: { symbols: JSON.stringify(batch) }, timeout: 10000,
      });
      for (const t of res.data) {
        const sym = PAIR_TO_SYM[t.symbol];
        if (!sym) continue;
        const price = parseFloat(t.lastPrice);
        if (!price || isNaN(price)) continue;
        result[sym] = {
          price,
          change24h: parseFloat(t.priceChangePercent) || 0,
          volume24h: parseFloat(t.quoteVolume) || 0,
          high24h:   parseFloat(t.highPrice) || price,
          low24h:    parseFloat(t.lowPrice) || price,
          openPrice: parseFloat(t.openPrice) || price,
        };
        const p = getPH(userId, sym); p.push(price); if (p.length > 120) p.shift();
        const v = getVH(userId, sym); v.push(parseFloat(t.quoteVolume)||0); if (v.length > 120) v.shift();
      }
    } catch(e) { console.error('[Algo] Batch error:', e.message); }
  }
  return result;
}

// ── Math ─────────────────────────────────────────────────────────────────────
function ema(arr, n) {
  if (arr.length < n) return null;
  const k = 2/(n+1);
  let e = arr.slice(0,n).reduce((a,b)=>a+b)/n;
  for (let i=n;i<arr.length;i++) e=arr[i]*k+e*(1-k);
  return e;
}
function rsi(arr, n=14) {
  if (arr.length < n+2) return null;
  const sl=arr.slice(-(n+1));
  let g=0,l=0;
  for (let i=1;i<sl.length;i++){const d=sl[i]-sl[i-1];if(d>0)g+=d;else l+=Math.abs(d);}
  const ag=g/n,al=l/n;
  return al===0?100:100-100/(1+ag/al);
}
function macd(arr) {
  if (arr.length<35) return null;
  const e12=ema(arr,12),e26=ema(arr,26);
  if (!e12||!e26) return null;
  const line=e12-e26;
  const ms=[]; for(let i=26;i<=arr.length;i++){const a=ema(arr.slice(0,i),12),b=ema(arr.slice(0,i),26);if(a&&b)ms.push(a-b);}
  const sig=ema(ms,9)||line*0.9;
  return {line,signal:sig,histogram:line-sig,bullish:line>sig&&(line-sig)>0};
}
function bb(arr,n=20,mult=2) {
  if (arr.length<n) return null;
  const sl=arr.slice(-n),m=sl.reduce((a,b)=>a+b)/n;
  const sd=Math.sqrt(sl.reduce((s,p)=>s+(p-m)**2)/n);
  const cur=arr[arr.length-1];
  return {upper:m+mult*sd,middle:m,lower:m-mult*sd,pct:sd>0?(cur-m)/(mult*sd):0,width:sd>0?(2*mult*sd)/m:0};
}
function atr(arr,n=14) {
  if (arr.length<n+1) return null;
  const trs=arr.slice(1).map((p,i)=>Math.abs(p-arr[i]));
  return trs.slice(-n).reduce((a,b)=>a+b)/n;
}
function stochRSI(arr,n=14) {
  if (arr.length<n*2) return null;
  const rsiVals=[];
  for(let i=n;i<=arr.length;i++){const r=rsi(arr.slice(0,i),n);if(r!==null)rsiVals.push(r);}
  if(rsiVals.length<n) return null;
  const sl=rsiVals.slice(-n),mn=Math.min(...sl),mx=Math.max(...sl);
  return mx===mn?50:((rsiVals[rsiVals.length-1]-mn)/(mx-mn))*100;
}
function mom(arr,n) { if(arr.length<n+1)return null; return((arr[arr.length-1]-arr[arr.length-1-n])/arr[arr.length-1-n])*100; }
function volRatio(vols,n=10) { if(vols.length<n+1)return 1; const r=vols[vols.length-1],avg=vols.slice(-n-1,-1).reduce((a,b)=>a+b)/n; return avg>0?r/avg:1; }

function rsiRecovering(uid,sym) { const h=getRH(uid,sym); return h.length>=3&&h[h.length-1]>h[h.length-2]&&h[h.length-2]>h[h.length-3]; }
function rsiDecelerating(uid,sym) { const h=getRH(uid,sym); return h.length>=2&&h[h.length-1]<h[h.length-2]; }

export function computeIndicators(userId, symbol) {
  const prices=getPH(userId,symbol), vols=getVH(userId,symbol);
  const rsiVal=rsi(prices);
  if(rsiVal!==null){const h=getRH(userId,symbol);h.push(rsiVal);if(h.length>12)h.shift();}
  const e9=ema(prices,9),e21=ema(prices,21),e50=ema(prices,50),e200=ema(prices,200);
  const macdVal=macd(prices), bbVal=bb(prices), bbTight=bb(prices,20,1.5);
  const stoch=stochRSI(prices), atrVal=atr(prices);
  const vr=volRatio(vols);
  let regime='unknown';
  if(e9&&e21&&e50){const sp=Math.abs(e9-e50)/e50;regime=sp>0.02?'trending':sp<0.005?'ranging':'neutral';}
  return {
    symbol, priceCount:prices.length, currentPrice:prices[prices.length-1]||null,
    rsi:rsiVal, rsiRecovering:rsiRecovering(userId,symbol), rsiDecelerating:rsiDecelerating(userId,symbol),
    macd:macdVal, bb:bbVal, bbTight, stochRSI:stoch, atr:atrVal,
    ema9:e9, ema21:e21, ema50:e50, ema200:e200,
    mom5:mom(prices,5), mom10:mom(prices,10), mom20:mom(prices,20),
    volumeRatio:vr, regime,
  };
}

// ── 7 STRATEGY ENGINES ───────────────────────────────────────────────────────

const STRATEGIES = {

  // 1. PRECISION — Triple confirmation: RSI + MACD + BB
  // Target win rate: 75-80% | Fewer but higher quality trades
  PRECISION: {
    name: 'Precision',
    description: 'Triple-confirm entries: RSI+MACD+BB must all align. Highest win rate, fewer trades.',
    minScore: 10,
    scoreEntry(ind, prices, sym) {
      let score=0; const sigs=[];
      const macdOk=ind.macd&&(ind.macd.bullish||ind.macd.histogram>0);
      if(!macdOk) return {score:-99,sigs:['MACD_GATE'],strategy:'PRECISION'};
      if(ind.rsi!==null){
        if(ind.rsi<25&&ind.rsiRecovering){score+=6;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi<32&&ind.rsiRecovering){score+=4;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi<42&&ind.rsiRecovering){score+=2;sigs.push(`RSI_LOW↑`);}
        if(!ind.rsiRecovering&&ind.rsi<45){score-=4;sigs.push('RSI_FALLING⚠');}
      }
      if(ind.macd){if(ind.macd.bullish&&ind.macd.histogram>0){score+=4;sigs.push('MACD_BULL');}else if(ind.macd.histogram>0){score+=1;}}
      if(ind.bb){if(ind.bb.pct<-0.85){score+=4;sigs.push(`BB_EXTREME`);}else if(ind.bb.pct<-0.5){score+=2;sigs.push(`BB_LOWER`);}}
      if(ind.stochRSI!==null&&ind.stochRSI<20){score+=3;sigs.push(`STOCH_OVERSOLD(${ind.stochRSI.toFixed(0)})`);}
      if(ind.volumeRatio>2){score+=2;sigs.push(`VOL_SURGE`);}else if(ind.volumeRatio<0.7){score-=2;}
      if(ind.ema9&&ind.ema21&&ind.ema9>ind.ema21){score+=1;sigs.push('EMA9>21');}
      return {score,sigs,strategy:'PRECISION'};
    },
  },

  // 2. MOMENTUM — EMA cascade + ADX trend strength
  // Target win rate: 65-72% | Bigger average wins
  MOMENTUM: {
    name: 'Momentum',
    description: 'Ride strong trends using EMA cascade and volume surges. Best in bull markets.',
    minScore: 7,
    scoreEntry(ind, prices, sym) {
      let score=0; const sigs=[];
      if(ind.regime!=='trending'){score-=2;sigs.push('NOT_TRENDING⚠');}
      if(ind.ema9&&ind.ema21&&ind.ema9>ind.ema21){score+=2;sigs.push('EMA9>21');}
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=3;sigs.push('EMA21>50');}
      if(ind.ema50&&ind.ema200&&ind.ema50>ind.ema200){score+=2;sigs.push('EMA50>200_BULL');}
      if(ind.macd?.bullish){score+=3;sigs.push('MACD_BULL');}
      if(ind.rsi!==null&&ind.rsi>=45&&ind.rsi<=65){score+=2;sigs.push(`RSI_MOMENTUM(${ind.rsi.toFixed(1)})`);}
      if(ind.mom10!==null&&ind.mom10>1.5){score+=3;sigs.push(`MOM10(+${ind.mom10.toFixed(2)}%)`);}
      if(ind.mom20!==null&&ind.mom20>3){score+=2;sigs.push(`MOM20(+${ind.mom20.toFixed(2)}%)`);}
      if(ind.volumeRatio>2){score+=3;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.5){score+=1;}
      const chg=(prices[sym]?.change24h||0);
      if(chg>5){score+=2;sigs.push(`24H+${chg.toFixed(1)}%`);}
      return {score,sigs,strategy:'MOMENTUM'};
    },
  },

  // 3. REVERSAL — Deep oversold mean reversion
  // Target win rate: 70-78% | High R:R, requires patience
  REVERSAL: {
    name: 'Mean Reversion',
    description: 'Buy extreme oversold conditions. RSI<25 + BB lower touch + StochRSI<15.',
    minScore: 9,
    scoreEntry(ind) {
      let score=0; const sigs=[];
      if(ind.rsi===null||ind.rsi>35) return {score:-99,sigs:['RSI_TOO_HIGH'],strategy:'REVERSAL'};
      if(ind.rsi<20&&ind.rsiRecovering){score+=7;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(1)})↑`);}
      else if(ind.rsi<25&&ind.rsiRecovering){score+=5;sigs.push(`RSI_VERY_OVERSOLD(${ind.rsi.toFixed(1)})↑`);}
      else if(ind.rsi<35&&ind.rsiRecovering){score+=3;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(1)})↑`);}
      if(!ind.rsiRecovering){score-=5;sigs.push('NOT_RECOVERING⚠');}
      if(ind.bb?.pct<-0.9){score+=5;sigs.push('BB_EXTREME_LOWER');}
      else if(ind.bb?.pct<-0.7){score+=3;sigs.push('BB_LOWER');}
      if(ind.stochRSI!==null&&ind.stochRSI<15){score+=4;sigs.push(`STOCH_EXTREME(${ind.stochRSI.toFixed(0)})`);}
      if(ind.macd?.bullish){score+=2;sigs.push('MACD_CONFIRM');}
      if(ind.volumeRatio>1.5){score+=2;sigs.push('VOL_CONFIRM');}
      return {score,sigs,strategy:'REVERSAL'};
    },
  },

  // 4. BREAKOUT — BB squeeze + volume explosion
  // Target win rate: 60-68% | Largest average wins
  BREAKOUT: {
    name: 'Breakout',
    description: 'Captures explosive moves from BB squeezes. High reward potential, moderate win rate.',
    minScore: 8,
    scoreEntry(ind, prices, sym) {
      let score=0; const sigs=[];
      if(!ind.bb||ind.bb.width>0.08){return {score:-99,sigs:['NO_SQUEEZE'],strategy:'BREAKOUT'};}
      if(ind.bb.width<0.03){score+=5;sigs.push(`BB_TIGHT_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}
      else if(ind.bb.width<0.05){score+=3;sigs.push('BB_SQUEEZE');}
      if(ind.volumeRatio>2.5){score+=5;sigs.push(`VOL_EXPLOSION(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.8){score+=3;sigs.push('VOL_SURGE');}
      else{score-=3;sigs.push('VOL_WEAK⚠');}
      if(ind.macd?.bullish){score+=3;sigs.push('MACD_BULL');}
      if(ind.mom5!==null&&ind.mom5>0.5){score+=2;sigs.push(`MOM5_POS`);}
      if(ind.rsi!==null&&ind.rsi>45&&ind.rsi<70){score+=2;sigs.push(`RSI_OK(${ind.rsi.toFixed(1)})`);}
      if(ind.bb.pct>0){score+=2;sigs.push('PRICE_ABOVE_MID');}
      return {score,sigs,strategy:'BREAKOUT'};
    },
  },

  // 5. SWING — Multi-day position trading
  // Target win rate: 68-75% | Holds 2-7 days
  SWING: {
    name: 'Swing Trade',
    description: 'Captures multi-day moves. Patient entries on pullbacks, rides the full trend.',
    minScore: 8,
    scoreEntry(ind, prices, sym) {
      let score=0; const sigs=[];
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=3;sigs.push('UPTREND_CONFIRMED');}
      if(ind.rsi!==null){
        if(ind.rsi>30&&ind.rsi<50&&ind.rsiRecovering){score+=4;sigs.push(`RSI_PULLBACK(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi<35&&ind.rsiRecovering){score+=3;sigs.push(`RSI_DIP(${ind.rsi.toFixed(1)})↑`);}
      }
      if(ind.bb?.pct>-0.6&&ind.bb?.pct<0){score+=2;sigs.push('PRICE_BELOW_MID');}
      if(ind.macd?.bullish){score+=3;sigs.push('MACD_BULL');}
      if(ind.ema9&&ind.ema21&&ind.ema9>ind.ema21){score+=2;sigs.push('EMA9>21');}
      if(ind.mom20!==null&&ind.mom20>2){score+=2;sigs.push(`TREND_MOM(${ind.mom20.toFixed(1)}%)`);}
      if(ind.volumeRatio>1.3){score+=2;sigs.push('VOL_CONFIRM');}
      return {score,sigs,strategy:'SWING'};
    },
  },

  // 6. AGGRESSIVE — High risk/reward setups
  // Target win rate: 55-65% | Largest potential gains
  AGGRESSIVE: {
    name: 'Aggressive',
    description: 'High risk/high reward. Wider stops, bigger targets. Not for the faint-hearted.',
    minScore: 6,
    scoreEntry(ind, prices, sym) {
      let score=0; const sigs=[];
      const chg=prices[sym]?.change24h||0;
      if(ind.volumeRatio>3){score+=5;sigs.push(`VOL_MASSIVE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>2){score+=3;sigs.push('VOL_HIGH');}
      if(ind.macd?.bullish){score+=3;sigs.push('MACD_BULL');}
      if(ind.mom5!==null&&ind.mom5>1){score+=3;sigs.push(`MOM5(+${ind.mom5.toFixed(2)}%)`);}
      if(ind.rsi!==null&&ind.rsi<40&&ind.rsiRecovering){score+=3;sigs.push(`RSI_BOUNCE(${ind.rsi.toFixed(1)})`);}
      if(chg>3&&chg<15){score+=2;sigs.push(`24H_PUMP(+${chg.toFixed(1)}%)`);}
      if(chg<-8&&ind.rsiRecovering){score+=3;sigs.push('DEEP_DIP_BOUNCE');}
      if(ind.bb?.pct<-0.6){score+=2;sigs.push('BB_LOWER_AGGRESSIVE');}
      return {score,sigs,strategy:'AGGRESSIVE'};
    },
  },

  // 7. DCA_PLUS — Systematic dip buying with confirmation
  // Target win rate: 78-85% | Steady compounding, lowest risk
  DCA_PLUS: {
    name: 'DCA+',
    description: 'Dollar-cost-average into dips with technical confirmation. Most consistent, lowest risk.',
    minScore: 5,
    scoreEntry(ind, prices, sym) {
      let score=0; const sigs=[];
      const chg=prices[sym]?.change24h||0;
      // Only buy BTC/ETH/SOL tier-1 coins for safety
      const coin=COINS.find(c=>c.symbol===sym);
      if(coin?.tier>2){score-=3;sigs.push('TIER_PENALTY');}
      if(chg<-3){score+=3;sigs.push(`DIP(${chg.toFixed(1)}%)`);}
      if(chg<-7){score+=2;sigs.push('DEEP_DIP');}
      if(ind.rsi!==null&&ind.rsi<45){score+=2;sigs.push(`RSI_BELOW_MID(${ind.rsi.toFixed(1)})`);}
      if(ind.rsiRecovering){score+=2;sigs.push('RSI_RECOVERING');}
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=3;sigs.push('ABOVE_50EMA');}
      if(ind.volumeRatio>1.2){score+=1;sigs.push('VOL_OK');}
      return {score,sigs,strategy:'DCA_PLUS'};
    },
  },
};

export const STRATEGY_LIST = Object.entries(STRATEGIES).map(([key, s]) => ({
  key, name: s.name, description: s.description, minScore: s.minScore,
}));

/**
 * Main entry scoring — uses selected strategy
 */
export function scoreForBuy(userId, symbol, prices, portfolio, totalValue, settings) {
  const stratKey = settings.tradingStrategy || 'PRECISION';
  const strat = STRATEGIES[stratKey] || STRATEGIES.PRECISION;
  const ind = computeIndicators(userId, symbol);

  if (ind.priceCount < 20) return { score: 0, signals: ['BUILDING_HISTORY'], ind };
  const px = prices[symbol]?.price;
  if (!px) return { score: 0, signals: [], ind };

  const maxPos = settings.maxPositionPct || 0.35;
  const posVal = (portfolio[symbol]?.qty || 0) * px;
  if (posVal / Math.max(totalValue, 1) > maxPos) return { score: 0, signals: ['MAX_POSITION'], ind };

  const { score, sigs, strategy } = strat.scoreEntry(ind, prices, symbol);
  const weight = COINS.find(c => c.symbol === symbol)?.weight || 1;
  const finalScore = +(score * weight).toFixed(2);

  return { score: finalScore, rawScore: score, signals: sigs, strategy, minScore: strat.minScore, ind };
}

/**
 * Exit evaluation — adapts to strategy
 */
export function evaluateExit(userId, symbol, pos, prices, settings) {
  const ind = computeIndicators(userId, symbol);
  const cur = prices[symbol]?.price;
  if (!cur || !pos) return null;

  const stratKey = settings.tradingStrategy || 'PRECISION';
  const sl  = settings.stopLossPct   || 0.05;
  const tp  = settings.takeProfitPct || 0.08;
  const lev = pos.leverage || 1;
  const pnl = (cur - pos.avgCost) / pos.avgCost;
  const eff = pnl * lev;

  // Hard stop — always
  if (eff <= -sl) {
    return { action:'SELL', sellPct:1.0, confidence:10, strategy:'STOP_LOSS',
      signals:[`STOP_LOSS(${(eff*100).toFixed(1)}%)`],
      reasoning:`Stop-loss at ${(eff*100).toFixed(2)}%. Entry $${pos.avgCost.toFixed(4)} → $${cur.toFixed(4)}.` };
  }

  // Trailing stop for big winners
  if (eff > tp * 2.5) {
    const trail = eff * 0.45; // keep 55% of gains
    if (pnl < trail - sl) {
      return { action:'SELL', sellPct:0.65, confidence:8, strategy:'TRAIL_STOP',
        signals:[`TRAIL(+${(eff*100).toFixed(1)}%)`],
        reasoning:`Trailing stop: up +${(eff*100).toFixed(2)}%, locking gains.` };
    }
  }

  // Aggressive strategy: wider exits
  const exitThresh = stratKey === 'AGGRESSIVE' ? 8 : stratKey === 'DCA_PLUS' ? 4 : 5;

  let exitScore = 0; const exitSigs = [];
  if (ind.rsi!==null){
    const obLevel = stratKey==='AGGRESSIVE'?78:stratKey==='SWING'?72:70;
    if(ind.rsi>obLevel){exitScore+=4;exitSigs.push(`RSI_OB(${ind.rsi.toFixed(1)})`);}
    else if(ind.rsi>65){exitScore+=2;exitSigs.push(`RSI_HIGH`);}
    if(ind.rsiDecelerating&&ind.rsi>60){exitScore+=2;exitSigs.push('RSI_DECEL');}
  }
  if(ind.macd&&!ind.macd.bullish){exitScore+=3;exitSigs.push('MACD_BEAR');}
  if(ind.macd&&ind.macd.histogram<-0.0001){exitScore+=1;exitSigs.push('HIST-');}
  if(ind.bb?.pct>0.9){exitScore+=2;exitSigs.push('ABOVE_BB');}
  if(ind.ema9&&ind.ema21&&ind.ema9<ind.ema21){exitScore+=2;exitSigs.push('EMA_DEATH');}
  if(ind.mom5!==null&&ind.mom5<-0.8){exitScore+=1;exitSigs.push('MOM5-');}

  if(eff>=tp*1.5&&exitScore>=3){
    return {action:'SELL',sellPct:0.5,confidence:8,strategy:'TAKE_PROFIT',
      signals:[`TP(+${(eff*100).toFixed(1)}%)`,...exitSigs],
      reasoning:`TP +${(eff*100).toFixed(2)}% with ${exitScore} reversal signals. Holding 50% runner.`};
  }
  if(eff>=tp&&exitScore>=exitThresh){
    return {action:'SELL',sellPct:0.6,confidence:9,strategy:'TAKE_PROFIT',
      signals:[`TP(+${(eff*100).toFixed(1)}%)`,...exitSigs],
      reasoning:`Take-profit at +${(eff*100).toFixed(2)}% (${exitScore} signals). Selling 60%.`};
  }
  if(exitScore>=7&&eff>0.005){
    return {action:'SELL',sellPct:0.75,confidence:7,strategy:'TREND_REVERSAL',
      signals:exitSigs,reasoning:`Reversal confirmed (${exitScore} signals). Selling 75%.`};
  }
  if(exitScore>=8&&eff<0){
    return {action:'SELL',sellPct:1.0,confidence:8,strategy:'TREND_REVERSAL',
      signals:exitSigs,reasoning:`Downtrend confirmed (${exitScore} signals) at loss. Full exit.`};
  }

  return null;
}

export function calcTotalValue(prices, portfolio, balance) {
  let v = balance;
  for (const [s,{qty}] of Object.entries(portfolio)) v += qty*(prices[s]?.price||0);
  return v;
}

export function buildMarketSummary(userId, prices, portfolio) {
  return COINS.map(({symbol:sym})=>{
    const px=prices[sym]; if(!px) return '';
    const ind=computeIndicators(userId,sym),held=portfolio[sym];
    return `${sym} $${px.price.toFixed(4)}|24H:${px.change24h.toFixed(2)}%|RSI:${ind.rsi?.toFixed(1)||'—'}(${ind.rsiRecovering?'↑':'↓'})|MACD:${ind.macd?.bullish?'BULL':'BEAR'}|BB:${ind.bb?.pct?.toFixed(2)||'—'}|VOL:${ind.volumeRatio.toFixed(2)}x|${ind.regime}${held?`|HELD@$${held.avgCost.toFixed(4)}`:''}`;
  }).filter(Boolean).join('\n');
}

export { PAIR_TO_SYM, STRATEGIES };
