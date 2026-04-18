/**
 * NEXUS SAAS · Algorithm v8
 * KEY FIX: Pre-seeds history from Binance klines on first fetch
 * so trades can execute from cycle 1, not cycle 20+
 */

import axios from 'axios';

const BINANCE = 'https://api.binance.com/api/v3';
const MIN_TICKS = 5; // reduced from 20 — history is pre-seeded now

export const COINS = [
  { id:'BTCUSDT',    symbol:'BTC',    tier:1, weight:1.5 },
  { id:'ETHUSDT',    symbol:'ETH',    tier:1, weight:1.4 },
  { id:'SOLUSDT',    symbol:'SOL',    tier:1, weight:1.3 },
  { id:'XRPUSDT',    symbol:'XRP',    tier:1, weight:1.2 },
  { id:'BNBUSDT',    symbol:'BNB',    tier:1, weight:1.2 },
  { id:'AVAXUSDT',   symbol:'AVAX',   tier:2, weight:1.1 },
  { id:'DOTUSDT',    symbol:'DOT',    tier:2, weight:1.0 },
  { id:'LINKUSDT',   symbol:'LINK',   tier:2, weight:1.0 },
  { id:'ADAUSDT',    symbol:'ADA',    tier:2, weight:1.0 },
  { id:'LTCUSDT',    symbol:'LTC',    tier:2, weight:1.0 },
  { id:'ATOMUSDT',   symbol:'ATOM',   tier:2, weight:0.9 },
  { id:'UNIUSDT',    symbol:'UNI',    tier:2, weight:0.9 },
  { id:'MATICUSDT',  symbol:'MATIC',  tier:2, weight:0.9 },
  { id:'NEARUSDT',   symbol:'NEAR',   tier:3, weight:0.9 },
  { id:'APTUSDT',    symbol:'APT',    tier:3, weight:0.9 },
  { id:'ARBUSDT',    symbol:'ARB',    tier:3, weight:0.9 },
  { id:'OPUSDT',     symbol:'OP',     tier:3, weight:0.8 },
  { id:'INJUSDT',    symbol:'INJ',    tier:3, weight:0.9 },
  { id:'SUIUSDT',    symbol:'SUI',    tier:3, weight:0.9 },
  { id:'SEIUSDT',    symbol:'SEI',    tier:3, weight:0.8 },
  { id:'TIAUSDT',    symbol:'TIA',    tier:3, weight:0.8 },
  { id:'DOGEUSDT',   symbol:'DOGE',   tier:3, weight:0.8 },
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

// Per-key history (key = userId+botId for isolation)
const pH = new Map();
const vH = new Map();
const rH = new Map();

function getPH(k,s){if(!pH.has(k))pH.set(k,{});if(!pH.get(k)[s])pH.get(k)[s]=[];return pH.get(k)[s];}
function getVH(k,s){if(!vH.has(k))vH.set(k,{});if(!vH.get(k)[s])vH.get(k)[s]=[];return vH.get(k)[s];}
function getRH(k,s){if(!rH.has(k))rH.set(k,{});if(!rH.get(k)[s])rH.get(k)[s]=[];return rH.get(k)[s];}

/**
 * Pre-seed 60 candles of history from Binance klines
 * Called once per bot on startup — eliminates the cold-start problem
 */
export async function seedPriceHistory(botKey) {
  const seeded = new Set();
  const batches = [];
  for (let i = 0; i < COINS.length; i += 5) batches.push(COINS.slice(i, i + 5));

  for (const batch of batches) {
    await Promise.allSettled(batch.map(async ({ id, symbol }) => {
      try {
        const res = await axios.get(`${BINANCE}/klines`, {
          params: { symbol: id, interval: '1m', limit: 80 },
          timeout: 8000,
        });
        const closes = res.data.map(k => parseFloat(k[4]));
        const volumes= res.data.map(k => parseFloat(k[5]));
        const ph = getPH(botKey, symbol);
        const vh = getVH(botKey, symbol);
        // Only seed if empty
        if (ph.length === 0) {
          ph.push(...closes);
          vh.push(...volumes);
          seeded.add(symbol);
        }
      } catch {}
    }));
    // Small delay between batches to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`[Algo] Seeded history for ${seeded.size} coins`);
  return seeded.size;
}

export async function fetchPrices(botKey) {
  const allIds = COINS.map(c => c.id);
  const result = {};
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
        // Append to history
        const p = getPH(botKey, sym); p.push(price); if (p.length > 120) p.shift();
        const v = getVH(botKey, sym); v.push(parseFloat(t.quoteVolume)||0); if (v.length > 120) v.shift();
      }
    } catch (e) { console.error('[Algo] Batch error:', e.message); }
  }
  return result;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function ema(arr, n) {
  if (arr.length < n) return null;
  const k = 2/(n+1);
  let e = arr.slice(0,n).reduce((a,b)=>a+b)/n;
  for (let i=n;i<arr.length;i++) e=arr[i]*k+e*(1-k);
  return e;
}

function rsiCalc(arr, n=14) {
  if (arr.length < n+2) return null;
  const sl = arr.slice(-(n+1));
  let g=0,l=0;
  for (let i=1;i<sl.length;i++){const d=sl[i]-sl[i-1];if(d>0)g+=d;else l+=Math.abs(d);}
  const ag=g/n,al=l/n;
  return al===0?100:100-100/(1+ag/al);
}

function macdCalc(arr) {
  if (arr.length < 26) return null;
  const e12=ema(arr,12),e26=ema(arr,26);
  if (!e12||!e26) return null;
  const line = e12-e26;
  const ms=[];
  for (let i=26;i<=arr.length;i++){const a=ema(arr.slice(0,i),12),b=ema(arr.slice(0,i),26);if(a&&b)ms.push(a-b);}
  const signal = ms.length>=9?ema(ms,9):line*0.9;
  const histogram = line-(signal||line*0.9);
  return {line,signal,histogram,bullish:line>signal&&histogram>0};
}

function bbCalc(arr, n=20, mult=2) {
  if (arr.length < n) {
    // Use whatever we have if less than 20
    const sl=arr.slice(-Math.min(arr.length,10));
    if (sl.length < 3) return null;
    const m=sl.reduce((a,b)=>a+b)/sl.length;
    const sd=Math.sqrt(sl.reduce((s,p)=>s+(p-m)**2)/sl.length)||m*0.02;
    const cur=arr[arr.length-1];
    return {upper:m+mult*sd,middle:m,lower:m-mult*sd,pct:sd>0?(cur-m)/(mult*sd):0,width:sd>0?(2*mult*sd)/m:0.04};
  }
  const sl=arr.slice(-n),m=sl.reduce((a,b)=>a+b)/n;
  const sd=Math.sqrt(sl.reduce((s,p)=>s+(p-m)**2)/n)||m*0.02;
  const cur=arr[arr.length-1];
  return {upper:m+mult*sd,middle:m,lower:m-mult*sd,pct:sd>0?(cur-m)/(mult*sd):0,width:sd>0?(2*mult*sd)/m:0.04};
}

function stochRSI(arr,n=14) {
  if (arr.length<n*2) return null;
  const rsiVals=[];
  for(let i=n;i<=arr.length;i++){const r=rsiCalc(arr.slice(0,i),n);if(r!==null)rsiVals.push(r);}
  if(rsiVals.length<n) return null;
  const sl=rsiVals.slice(-n),mn=Math.min(...sl),mx=Math.max(...sl);
  return mx===mn?50:((rsiVals[rsiVals.length-1]-mn)/(mx-mn))*100;
}

function momCalc(arr,n) { if(arr.length<n+1)return null; return((arr[arr.length-1]-arr[arr.length-1-n])/arr[arr.length-1-n])*100; }
function volRatio(vols,n=10) { if(vols.length<n+1)return 1.0; const r=vols[vols.length-1],avg=vols.slice(-n-1,-1).reduce((a,b)=>a+b)/n; return avg>0?r/avg:1.0; }

function rsiRecovering(k,sym) { const h=getRH(k,sym); return h.length>=3&&h[h.length-1]>h[h.length-2]&&h[h.length-2]>h[h.length-3]; }
function rsiDecelerating(k,sym) { const h=getRH(k,sym); return h.length>=2&&h[h.length-1]<h[h.length-2]; }

export function computeIndicators(botKey, symbol) {
  const prices=getPH(botKey,symbol), vols=getVH(botKey,symbol);
  const rsiVal=rsiCalc(prices);
  if(rsiVal!==null){const h=getRH(botKey,symbol);h.push(rsiVal);if(h.length>12)h.shift();}
  const e9=ema(prices,9),e21=ema(prices,21),e50=ema(prices,50);
  const macdVal=macdCalc(prices);
  const bbVal=bbCalc(prices);
  const stoch=stochRSI(prices);
  const vr=volRatio(vols);
  let regime='unknown';
  if(e9&&e21&&e50){const sp=Math.abs(e9-e50)/e50;regime=sp>0.015?'trending':sp<0.005?'ranging':'neutral';}
  return {
    symbol, priceCount:prices.length, currentPrice:prices[prices.length-1]||null,
    rsi:rsiVal, rsiRecovering:rsiRecovering(botKey,symbol), rsiDecelerating:rsiDecelerating(botKey,symbol),
    macd:macdVal, bb:bbVal, stochRSI:stoch,
    ema9:e9, ema21:e21, ema50:e50,
    mom5:momCalc(prices,5), mom10:momCalc(prices,10), mom20:momCalc(prices,20),
    volumeRatio:vr, regime,
  };
}

// ── 7 STRATEGY ENGINES ────────────────────────────────────────────────────────
const STRATEGIES = {

  PRECISION: {
    name:'Precision', minScore:7,
    description:'Triple-confirm RSI+MACD+BB. Highest win rate, fewer trades.',
    scoreEntry(ind,prices,sym){
      let score=0;const sigs=[];
      // MACD gate — softer: block only if clearly bearish
      const macdBearish=ind.macd&&!ind.macd.bullish&&ind.macd.histogram<-0.0005;
      if(macdBearish&&(!ind.rsi||ind.rsi>30))return{score:-99,sigs:['MACD_BEARISH'],strategy:'PRECISION'};
      if(ind.rsi!==null){
        if(ind.rsi<25&&ind.rsiRecovering){score+=6;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi<32&&ind.rsiRecovering){score+=4;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi<42&&ind.rsiRecovering){score+=2;sigs.push(`RSI_LOW(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi>=42&&ind.rsi<=60&&ind.macd?.bullish){score+=2;sigs.push(`RSI_RANGE(${ind.rsi.toFixed(1)})`);}
        if(!ind.rsiRecovering&&ind.rsi<40){score-=3;sigs.push('RSI_FALLING⚠');}
      }
      if(ind.macd){
        if(ind.macd.bullish&&ind.macd.histogram>0){score+=4;sigs.push('MACD_BULL');}
        else if(ind.macd.histogram>0){score+=2;sigs.push('MACD_HIST+');}
        else if(ind.macd.histogram>-0.0001){score+=1;sigs.push('MACD_NEUTRAL');}
      }
      if(ind.bb){
        if(ind.bb.pct<-0.8){score+=4;sigs.push(`BB_EXTREME`);}
        else if(ind.bb.pct<-0.4){score+=2;sigs.push(`BB_LOWER`);}
        else if(ind.bb.pct<0){score+=1;sigs.push('BB_BELOW_MID');}
      }
      if(ind.stochRSI!==null&&ind.stochRSI<25){score+=2;sigs.push(`STOCH(${ind.stochRSI.toFixed(0)})`);}
      if(ind.volumeRatio>1.5){score+=2;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio<0.6){score-=1;}
      if(ind.ema9&&ind.ema21&&ind.ema9>ind.ema21){score+=1;sigs.push('EMA9>21');}
      return{score,sigs,strategy:'PRECISION'};
    },
  },

  MOMENTUM: {
    name:'Momentum', minScore:6,
    description:'EMA cascade + volume surge. Rides strong trends.',
    scoreEntry(ind,prices,sym){
      let score=0;const sigs=[];
      if(ind.ema9&&ind.ema21&&ind.ema9>ind.ema21){score+=3;sigs.push('EMA9>21');}
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=3;sigs.push('EMA21>50');}
      if(ind.macd?.bullish){score+=3;sigs.push('MACD_BULL');}
      else if(ind.macd?.histogram>0){score+=1;sigs.push('MACD+');}
      if(ind.rsi!==null&&ind.rsi>=40&&ind.rsi<=68){score+=2;sigs.push(`RSI(${ind.rsi.toFixed(1)})`);}
      if(ind.mom10!==null&&ind.mom10>1){score+=2;sigs.push(`MOM10(+${ind.mom10.toFixed(2)}%)`);}
      if(ind.mom5!==null&&ind.mom5>0.3){score+=1;sigs.push(`MOM5+`);}
      if(ind.volumeRatio>2){score+=3;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.3){score+=1;sigs.push('VOL+');}
      const chg=(prices[sym]?.change24h||0);
      if(chg>3){score+=2;sigs.push(`24H+${chg.toFixed(1)}%`);}
      else if(chg>1){score+=1;}
      if(ind.regime==='trending'){score+=1;sigs.push('TRENDING');}
      return{score,sigs,strategy:'MOMENTUM'};
    },
  },

  REVERSAL: {
    name:'Mean Reversion', minScore:7,
    description:'Deep oversold bounce. RSI<30 + BB lower.',
    scoreEntry(ind){
      let score=0;const sigs=[];
      if(ind.rsi===null||ind.rsi>40)return{score:-99,sigs:['RSI_NOT_OVERSOLD'],strategy:'REVERSAL'};
      if(ind.rsi<22&&ind.rsiRecovering){score+=8;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(1)})↑`);}
      else if(ind.rsi<28&&ind.rsiRecovering){score+=6;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(1)})↑`);}
      else if(ind.rsi<35&&ind.rsiRecovering){score+=4;sigs.push(`RSI_LOW(${ind.rsi.toFixed(1)})↑`);}
      else if(ind.rsi<40){score+=2;sigs.push(`RSI_BELOW40(${ind.rsi.toFixed(1)})`);}
      if(!ind.rsiRecovering){score-=3;sigs.push('NOT_RECOVERING⚠');}
      if(ind.bb?.pct<-0.8){score+=4;sigs.push('BB_EXTREME');}
      else if(ind.bb?.pct<-0.5){score+=2;sigs.push('BB_LOWER');}
      else if(ind.bb?.pct<-0.2){score+=1;sigs.push('BB_LOW');}
      if(ind.stochRSI!==null&&ind.stochRSI<20){score+=3;sigs.push(`STOCH_LOW(${ind.stochRSI.toFixed(0)})`);}
      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=2;sigs.push('MACD_TURNING');}
      if(ind.volumeRatio>1.3){score+=1;sigs.push('VOL+');}
      return{score,sigs,strategy:'REVERSAL'};
    },
  },

  BREAKOUT: {
    name:'Breakout', minScore:7,
    description:'BB squeeze + volume explosion. Captures big moves.',
    scoreEntry(ind,prices,sym){
      let score=0;const sigs=[];
      if(ind.bb){
        if(ind.bb.width<0.03){score+=5;sigs.push(`BB_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}
        else if(ind.bb.width<0.05){score+=3;sigs.push('BB_TIGHT');}
        else if(ind.bb.width<0.08){score+=1;sigs.push('BB_COMPRESSING');}
        else{score-=2;}// Wide bands — no squeeze
        if(ind.bb.pct>0.2){score+=2;sigs.push('BREAKING_UP');}
      }
      if(ind.volumeRatio>2.5){score+=5;sigs.push(`VOL_EXPLOSION(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.8){score+=3;sigs.push(`VOL_SURGE`);}
      else if(ind.volumeRatio>1.3){score+=1;}
      else{score-=1;}
      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=2;sigs.push('MACD+');}
      if(ind.mom5!==null&&ind.mom5>0.4){score+=2;sigs.push(`MOM5+`);}
      if(ind.rsi!==null&&ind.rsi>40&&ind.rsi<75){score+=1;sigs.push(`RSI_OK`);}
      return{score,sigs,strategy:'BREAKOUT'};
    },
  },

  SWING: {
    name:'Swing Trade', minScore:6,
    description:'Multi-day positions. Pullback entries in uptrends.',
    scoreEntry(ind,prices,sym){
      let score=0;const sigs=[];
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=3;sigs.push('UPTREND');}
      if(ind.rsi!==null){
        if(ind.rsi>28&&ind.rsi<50&&ind.rsiRecovering){score+=4;sigs.push(`RSI_PULLBACK(${ind.rsi.toFixed(1)})↑`);}
        else if(ind.rsi<35&&ind.rsiRecovering){score+=3;sigs.push(`RSI_DIP`);}
        else if(ind.rsi<55){score+=1;sigs.push(`RSI_OK`);}
      }
      if(ind.bb?.pct>-0.6&&ind.bb?.pct<0.1){score+=2;sigs.push('BB_LOWER_HALF');}
      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=3;sigs.push('MACD+');}
      if(ind.ema9&&ind.ema21&&ind.ema9>ind.ema21){score+=2;sigs.push('EMA9>21');}
      if(ind.mom20!==null&&ind.mom20>1.5){score+=2;sigs.push(`TREND_MOM`);}
      if(ind.volumeRatio>1.2){score+=1;sigs.push('VOL+');}
      return{score,sigs,strategy:'SWING'};
    },
  },

  AGGRESSIVE: {
    name:'Aggressive', minScore:5,
    description:'High risk/reward. Wider stops, bigger targets.',
    scoreEntry(ind,prices,sym){
      let score=0;const sigs=[];
      const chg=prices[sym]?.change24h||0;
      if(ind.volumeRatio>3){score+=5;sigs.push(`VOL_MASSIVE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>2){score+=3;sigs.push(`VOL_HIGH`);}
      else if(ind.volumeRatio>1.3){score+=1;}
      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=2;sigs.push('MACD+');}
      if(ind.mom5!==null&&ind.mom5>0.5){score+=3;sigs.push(`MOM5(+${ind.mom5.toFixed(2)}%)`);}
      else if(ind.mom5!==null&&ind.mom5>0){score+=1;}
      if(ind.rsi!==null&&ind.rsi<45&&ind.rsiRecovering){score+=3;sigs.push(`RSI_BOUNCE(${ind.rsi.toFixed(1)})`);}
      else if(ind.rsi!==null&&ind.rsi<60){score+=1;}
      if(chg>2&&chg<20){score+=2;sigs.push(`24H_PUMP(+${chg.toFixed(1)}%)`);}
      if(chg<-5&&ind.rsiRecovering){score+=3;sigs.push('DEEP_DIP_BOUNCE');}
      else if(chg<-2){score+=1;sigs.push('DIP');}
      if(ind.bb?.pct<-0.3){score+=1;sigs.push('BB_BELOW_MID');}
      return{score,sigs,strategy:'AGGRESSIVE'};
    },
  },

  DCA_PLUS: {
    name:'DCA+', minScore:4,
    description:'Systematic dip buying with tech confirmation. Most consistent.',
    scoreEntry(ind,prices,sym){
      let score=0;const sigs=[];
      const chg=prices[sym]?.change24h||0;
      const coin=COINS.find(c=>c.symbol===sym);
      if(coin?.tier===1){score+=2;sigs.push('TIER1_SAFE');}
      else if(coin?.tier===2){score+=1;}
      else{score-=1;sigs.push('HIGH_TIER⚠');}
      if(chg<-2){score+=3;sigs.push(`DIP(${chg.toFixed(1)}%)`);}
      else if(chg<0){score+=1;sigs.push('SLIGHT_DIP');}
      if(ind.rsi!==null&&ind.rsi<50){score+=2;sigs.push(`RSI_BELOW_MID(${ind.rsi.toFixed(1)})`);}
      if(ind.rsiRecovering){score+=2;sigs.push('RSI_RECOVERING');}
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=2;sigs.push('ABOVE_50EMA');}
      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=1;sigs.push('MACD+');}
      if(ind.volumeRatio>1.1){score+=1;sigs.push('VOL_OK');}
      return{score,sigs,strategy:'DCA_PLUS'};
    },
  },
};

export const STRATEGY_LIST = Object.entries(STRATEGIES).map(([key,s])=>({key,name:s.name,description:s.description,minScore:s.minScore}));

export function scoreForBuy(botKey, symbol, prices, portfolio, totalValue, settings) {
  const stratKey = settings.tradingStrategy || 'PRECISION';
  const strat    = STRATEGIES[stratKey] || STRATEGIES.PRECISION;
  const ind      = computeIndicators(botKey, symbol);

  if (ind.priceCount < MIN_TICKS) return { score:0, signals:[`NEED_${MIN_TICKS}_TICKS(have ${ind.priceCount})`], ind, minScore:strat.minScore };

  const px = prices[symbol]?.price;
  if (!px) return { score:0, signals:['NO_PRICE'], ind, minScore:strat.minScore };

  const maxPos = settings.maxPositionPct || 0.35;
  const posVal = (portfolio[symbol]?.qty || 0) * px;
  if (posVal / Math.max(totalValue,1) > maxPos) return { score:0, signals:['MAX_POSITION'], ind, minScore:strat.minScore };

  const { score, sigs, strategy } = strat.scoreEntry(ind, prices, symbol);
  const weight = COINS.find(c => c.symbol === symbol)?.weight || 1;
  return { score: +(score * weight).toFixed(2), rawScore:score, signals:sigs||[], strategy, minScore:strat.minScore, ind };
}

export function evaluateExit(botKey, symbol, pos, prices, settings) {
  const ind = computeIndicators(botKey, symbol);
  const cur = prices[symbol]?.price;
  if (!cur || !pos) return null;

  const sl  = settings.stopLossPct   || 0.05;
  const tp  = settings.takeProfitPct || 0.08;
  const lev = pos.leverage || 1;
  const pnlPct = (cur - pos.avgCost) / pos.avgCost;
  const eff    = pnlPct * lev;

  // Hard stop
  if (eff <= -sl) {
    return { action:'SELL', sellPct:1.0, confidence:10, strategy:'STOP_LOSS',
      signals:[`STOP_LOSS(${(eff*100).toFixed(1)}%)`],
      reasoning:`Stop-loss hit at ${(eff*100).toFixed(2)}%. Entry $${pos.avgCost.toFixed(4)} → $${cur.toFixed(4)}.` };
  }

  // Trailing stop
  if (eff > tp * 2 && pnlPct < eff * 0.5 - sl) {
    return { action:'SELL', sellPct:0.65, confidence:8, strategy:'TRAIL_STOP',
      signals:[`TRAIL(+${(eff*100).toFixed(1)}%)`],
      reasoning:`Trailing stop: +${(eff*100).toFixed(2)}% gain, protecting profits.` };
  }

  let exitScore=0;const exitSigs=[];
  if(ind.rsi!==null){
    if(ind.rsi>75){exitScore+=4;exitSigs.push(`RSI_OB(${ind.rsi.toFixed(1)})`);}
    else if(ind.rsi>68){exitScore+=2;exitSigs.push(`RSI_HIGH`);}
    if(ind.rsiDecelerating&&ind.rsi>62){exitScore+=2;exitSigs.push('RSI_DECEL');}
  }
  if(ind.macd&&!ind.macd.bullish&&ind.macd.histogram<0){exitScore+=3;exitSigs.push('MACD_BEAR');}
  if(ind.bb?.pct>0.85){exitScore+=2;exitSigs.push('ABOVE_BB');}
  if(ind.ema9&&ind.ema21&&ind.ema9<ind.ema21){exitScore+=2;exitSigs.push('EMA_CROSS');}
  if(ind.mom5!==null&&ind.mom5<-0.8){exitScore+=1;exitSigs.push('MOM5-');}

  // Partial take profit
  if(eff>=tp*1.5&&exitScore>=2){
    return{action:'SELL',sellPct:0.5,confidence:8,strategy:'TAKE_PROFIT',
      signals:[`TP(+${(eff*100).toFixed(1)}%)`,...exitSigs],
      reasoning:`Take profit +${(eff*100).toFixed(2)}% with ${exitScore} reversal signals. Keeping 50% runner.`};
  }
  if(eff>=tp&&exitScore>=4){
    return{action:'SELL',sellPct:0.6,confidence:9,strategy:'TAKE_PROFIT',
      signals:[`TP(+${(eff*100).toFixed(1)}%)`,...exitSigs],
      reasoning:`Take profit at +${(eff*100).toFixed(2)}% — ${exitSigs.join(', ')}. Selling 60%.`};
  }
  if(exitScore>=6&&eff>0.005){
    return{action:'SELL',sellPct:0.75,confidence:7,strategy:'TREND_REVERSAL',
      signals:exitSigs,reasoning:`Reversal (score ${exitScore}): ${exitSigs.join(', ')}. Selling 75%.`};
  }
  if(exitScore>=7&&eff<0){
    return{action:'SELL',sellPct:1.0,confidence:8,strategy:'TREND_REVERSAL',
      signals:exitSigs,reasoning:`Downtrend confirmed at loss. Full exit.`};
  }
  return null;
}

export function calcTotalValue(prices, portfolio, balance) {
  let v = balance;
  for (const [s,{qty}] of Object.entries(portfolio)) v += qty*(prices[s]?.price||0);
  return v;
}

export function buildMarketSummary(botKey, prices, portfolio) {
  return COINS.map(({symbol:sym})=>{
    const px=prices[sym];if(!px)return'';
    const ind=computeIndicators(botKey,sym),held=portfolio[sym];
    return `${sym} $${px.price.toFixed(4)}|24H:${px.change24h.toFixed(2)}%|RSI:${ind.rsi?.toFixed(1)||'—'}(${ind.rsiRecovering?'↑':'↓'})|MACD:${ind.macd?.bullish?'BULL':'BEAR'}|BB:${ind.bb?.pct?.toFixed(2)||'—'}|VOL:${ind.volumeRatio.toFixed(2)}x${held?`|HELD@$${held.avgCost.toFixed(4)}`:''}`;
  }).filter(Boolean).join('\n');
}

export { STRATEGIES };
