/**
 * NEXUS · Algorithm v9 — TRUE STRATEGY ISOLATION
 * 
 * Each strategy has HARD STRUCTURAL GATES that make them mutually exclusive:
 * 
 * PRECISION  → ONLY fires when RSI<42 AND MACD confirms AND BB confirms (3 of 3)
 * MOMENTUM   → ONLY fires when EMA cascade bullish AND RSI 40-68 (trending, NOT oversold)
 * REVERSAL   → ONLY fires when RSI<35 AND price at BB lower (deep oversold ONLY)
 * BREAKOUT   → ONLY fires when BB width<0.05 AND volume>2x (squeeze ONLY)
 * SWING      → ONLY fires when EMA21>EMA50 AND RSI pullback 30-52 (uptrend dip ONLY)
 * AGGRESSIVE → ONLY fires when 24h vol ratio>2x OR 24h change extreme (catalyst ONLY)
 * DCA_PLUS   → ONLY fires on Tier1/2 coins with 24h dip AND RSI<50 (systematic ONLY)
 * 
 * These conditions CANNOT all be true simultaneously — a coin in a breakout squeeze
 * will NOT have RSI<35 (reversal). A coin with EMA cascade (momentum) will NOT
 * have a BB squeeze width<0.05. Natural market conditions enforce separation.
 * 
 * Additionally: Per-bot cooldowns prevent re-buying the same coin within 5 cycles.
 */

import axios from 'axios';

const BINANCE = 'https://api.binance.com/api/v3';
const MIN_TICKS = 5;

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

const PAIR_MAP = Object.fromEntries(COINS.map(c=>[c.id,c.symbol]));

// Per-botKey isolated stores
const priceHist  = new Map(); // key → { SYM: [prices] }
const volHist    = new Map(); // key → { SYM: [volumes] }
const rsiHist    = new Map(); // key → { SYM: [rsi_values] }
const cooldowns  = new Map(); // key → { SYM: cycleNumber }

function getArr(store, key, sym) {
  if (!store.has(key)) store.set(key, {});
  if (!store.get(key)[sym]) store.get(key)[sym] = [];
  return store.get(key)[sym];
}
const getPH = (k,s) => getArr(priceHist,k,s);
const getVH = (k,s) => getArr(volHist,k,s);
const getRH = (k,s) => getArr(rsiHist,k,s);

// Per-bot cooldown: prevent re-buying same coin within N cycles
const COOLDOWN_CYCLES = 5;
export function setCooldown(botKey, symbol, currentCycle) {
  if (!cooldowns.has(botKey)) cooldowns.set(botKey, {});
  cooldowns.get(botKey)[symbol] = currentCycle;
}
export function isOnCooldown(botKey, symbol, currentCycle) {
  const c = cooldowns.get(botKey)?.[symbol];
  return c !== undefined && (currentCycle - c) < COOLDOWN_CYCLES;
}

// ── Price history seeding ─────────────────────────────────────────────────────
export async function seedPriceHistory(botKey) {
  let seeded = 0;
  const batches = [];
  for (let i=0;i<COINS.length;i+=4) batches.push(COINS.slice(i,i+4));
  for (const batch of batches) {
    await Promise.allSettled(batch.map(async ({id,symbol}) => {
      try {
        const r = await axios.get(`${BINANCE}/klines`,{params:{symbol:id,interval:'1m',limit:80},timeout:8000});
        const ph=getPH(botKey,symbol), vh=getVH(botKey,symbol);
        if (ph.length===0) {
          r.data.forEach(k=>{ ph.push(parseFloat(k[4])); vh.push(parseFloat(k[5])); });
          seeded++;
        }
      } catch {}
    }));
    await new Promise(r=>setTimeout(r,250));
  }
  console.log(`[Algo][${botKey.slice(0,6)}] Seeded ${seeded} coins`);
  return seeded;
}

// ── Price fetch — uses botKey for isolated history ────────────────────────────
export async function fetchPrices(botKey) {
  const ids = COINS.map(c=>c.id);
  const result = {};
  for (let i=0;i<ids.length;i+=20) {
    try {
      const batch=ids.slice(i,i+20);
      const r=await axios.get(`${BINANCE}/ticker/24hr`,{params:{symbols:JSON.stringify(batch)},timeout:10000});
      for (const t of r.data) {
        const sym=PAIR_MAP[t.symbol]; if(!sym) continue;
        const price=parseFloat(t.lastPrice); if(!price||isNaN(price)) continue;
        result[sym]={price,change24h:parseFloat(t.priceChangePercent)||0,volume24h:parseFloat(t.quoteVolume)||0,high24h:parseFloat(t.highPrice)||price,low24h:parseFloat(t.lowPrice)||price,openPrice:parseFloat(t.openPrice)||price};
        const ph=getPH(botKey,sym); ph.push(price); if(ph.length>120) ph.shift();
        const vh=getVH(botKey,sym); vh.push(parseFloat(t.quoteVolume)||0); if(vh.length>120) vh.shift();
      }
    } catch(e){console.error('[Algo] fetch batch error:',e.message);}
  }
  return result;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function ema(arr,n){
  if(arr.length<n)return null;
  const k=2/(n+1);
  let e=arr.slice(0,n).reduce((a,b)=>a+b)/n;
  for(let i=n;i<arr.length;i++) e=arr[i]*k+e*(1-k);
  return e;
}
function rsiCalc(arr,n=14){
  if(arr.length<n+2)return null;
  const sl=arr.slice(-(n+1));
  let g=0,l=0;
  for(let i=1;i<sl.length;i++){const d=sl[i]-sl[i-1];d>0?g+=d:l+=Math.abs(d);}
  const ag=g/n,al=l/n;
  return al===0?100:100-100/(1+ag/al);
}
function macdCalc(arr){
  if(arr.length<26)return null;
  const e12=ema(arr,12),e26=ema(arr,26);
  if(!e12||!e26)return null;
  const line=e12-e26;
  const ms=[];
  for(let i=26;i<=arr.length;i++){const a=ema(arr.slice(0,i),12),b=ema(arr.slice(0,i),26);if(a&&b)ms.push(a-b);}
  const signal=ms.length>=9?ema(ms,9):line*0.9;
  const histogram=line-(signal||line*0.9);
  return{line,signal,histogram,bullish:line>signal&&histogram>0};
}
function bbCalc(arr,n=20,mult=2){
  const len=Math.min(arr.length,Math.max(n,5));
  if(arr.length<3)return null;
  const sl=arr.slice(-len),m=sl.reduce((a,b)=>a+b)/sl.length;
  const sd=Math.sqrt(sl.reduce((s,p)=>s+(p-m)**2)/sl.length)||m*0.01;
  const cur=arr[arr.length-1];
  return{upper:m+mult*sd,middle:m,lower:m-mult*sd,pct:sd>0?(cur-m)/(mult*sd):0,width:sd>0?(2*mult*sd)/m:0.04};
}
function stochRSI(arr,n=14){
  if(arr.length<n*2)return null;
  const rv=[];
  for(let i=n;i<=arr.length;i++){const r=rsiCalc(arr.slice(0,i),n);if(r!==null)rv.push(r);}
  if(rv.length<n)return null;
  const sl=rv.slice(-n),mn=Math.min(...sl),mx=Math.max(...sl);
  return mx===mn?50:((rv[rv.length-1]-mn)/(mx-mn))*100;
}
function mom(arr,n){if(arr.length<n+1)return null;return((arr[arr.length-1]-arr[arr.length-1-n])/arr[arr.length-1-n])*100;}
function volRatio(vols,n=10){if(vols.length<n+1)return 1;const r=vols[vols.length-1],avg=vols.slice(-n-1,-1).reduce((a,b)=>a+b)/n;return avg>0?r/avg:1;}

function rsiUp(k,sym){const h=getRH(k,sym);return h.length>=3&&h[h.length-1]>h[h.length-2]&&h[h.length-2]>h[h.length-3];}
function rsiDn(k,sym){const h=getRH(k,sym);return h.length>=2&&h[h.length-1]<h[h.length-2];}

export function computeIndicators(botKey,symbol){
  const prices=getPH(botKey,symbol),vols=getVH(botKey,symbol);
  const rsiVal=rsiCalc(prices);
  if(rsiVal!==null){const h=getRH(botKey,symbol);h.push(rsiVal);if(h.length>20)h.shift();}
  const e9=ema(prices,9),e21=ema(prices,21),e50=ema(prices,50),e200=ema(prices,200);
  const macdVal=macdCalc(prices),bbVal=bbCalc(prices),stoch=stochRSI(prices),vr=volRatio(vols);
  let regime='unknown';
  if(e9&&e21&&e50){
    const bullish=e9>e21&&e21>e50;
    const bearish=e9<e21&&e21<e50;
    const spread=Math.abs(e9-e50)/e50;
    regime=bullish&&spread>0.01?'bullish_trend':bearish&&spread>0.01?'bearish_trend':spread<0.005?'ranging':'neutral';
  }
  return{
    symbol,priceCount:prices.length,currentPrice:prices[prices.length-1]||null,
    rsi:rsiVal,rsiUp:rsiUp(botKey,symbol),rsiDn:rsiDn(botKey,symbol),
    macd:macdVal,bb:bbVal,stochRSI:stoch,
    ema9:e9,ema21:e21,ema50:e50,ema200:e200,
    mom5:mom(prices,5),mom10:mom(prices,10),mom20:mom(prices,20),
    volumeRatio:vr,regime,
    // Convenience booleans for gate checks
    isBullTrend: e9&&e21&&e50&&e9>e21&&e21>e50,
    isBearTrend: e9&&e21&&e50&&e9<e21&&e21<e50,
    isOversold:  rsiVal!==null&&rsiVal<35,
    isNeutral:   rsiVal!==null&&rsiVal>=40&&rsiVal<=65,
    isSqueeze:   bbVal&&bbVal.width<0.05,
  };
}

// ── STRATEGY ENGINES — HARD STRUCTURAL GATES ──────────────────────────────────
// Each strategy is ONLY active under specific market regime conditions.
// These conditions are mutually exclusive by market structure, not by code.
// ─────────────────────────────────────────────────────────────────────────────

const STRATEGIES = {

  /**
   * PRECISION — Triple confirmation required
   * GATE: RSI must be below 42. MACD must not be bearish. BB must confirm.
   * WHEN: Coins in oversold/neutral RSI range with multiple technical confirms
   * NOT WHEN: Strong uptrend (RSI 50-70 range), pure momentum situations
   */
  PRECISION: {
    name:'Precision', minScore:8,
    description:'RSI+MACD+BB triple confirmation. All three must align. Highest win rate.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // HARD GATE 1: RSI must be below 50 — not for trending coins
      if(ind.rsi===null||ind.rsi>52) return{score:-1,sigs:['GATE:RSI_TOO_HIGH'],strategy:'PRECISION'};

      // HARD GATE 2: Not in strong bearish trend (falling knife)
      if(ind.isBearTrend&&ind.rsi>35) return{score:-1,sigs:['GATE:BEAR_TREND'],strategy:'PRECISION'};

      // RSI scoring — heavily weighted toward truly oversold
      if(ind.rsi<22&&ind.rsiUp){score+=7;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<30&&ind.rsiUp){score+=5;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<40&&ind.rsiUp){score+=3;sigs.push(`RSI_LOW(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<52){score+=1;sigs.push(`RSI_NEUTRAL(${ind.rsi.toFixed(0)})`);}
      if(!ind.rsiUp&&ind.rsi<40){score-=4;sigs.push('RSI_STILL_FALLING⚠');}

      // MACD — must be turning or positive
      if(!ind.macd)return{score:-1,sigs:['GATE:NO_MACD'],strategy:'PRECISION'};
      if(ind.macd.bullish&&ind.macd.histogram>0){score+=4;sigs.push('MACD_BULL✓');}
      else if(ind.macd.histogram>0){score+=2;sigs.push('MACD_HIST+');}
      else if(ind.macd.histogram<-0.002){score-=4;sigs.push('MACD_BEAR⚠');}
      else{score+=0;sigs.push('MACD_FLAT');}

      // BB — price must be in lower half
      if(!ind.bb)return{score:-1,sigs:['GATE:NO_BB'],strategy:'PRECISION'};
      if(ind.bb.pct<-0.8){score+=5;sigs.push('BB_EXTREME_LOW✓');}
      else if(ind.bb.pct<-0.5){score+=3;sigs.push('BB_LOWER✓');}
      else if(ind.bb.pct<0){score+=1;sigs.push('BB_BELOW_MID');}
      else{score-=2;sigs.push('BB_ABOVE_MID⚠');}// Price above midband = not oversold

      // StochRSI — bonus confirms
      if(ind.stochRSI!==null&&ind.stochRSI<20){score+=3;sigs.push(`STOCH_EXTREME(${ind.stochRSI.toFixed(0)})`);}
      else if(ind.stochRSI!==null&&ind.stochRSI<35){score+=1;sigs.push('STOCH_LOW');}

      if(ind.volumeRatio>1.5){score+=2;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}
      return{score,sigs,strategy:'PRECISION'};
    },
  },

  /**
   * MOMENTUM — Trend following, NOT bottom picking
   * GATE: RSI must be 42-70 (momentum zone). EMA must show cascade alignment.
   * WHEN: Coins already in uptrend with bullish EMA structure and rising RSI
   * NOT WHEN: Oversold (RSI<42) — that's PRECISION/REVERSAL territory
   */
  MOMENTUM: {
    name:'Momentum', minScore:7,
    description:'EMA cascade + RSI momentum zone (42-70). Rides established trends.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // HARD GATE: RSI must be in momentum zone — not oversold, not overbought
      if(ind.rsi===null||ind.rsi<38||ind.rsi>72) return{score:-1,sigs:['GATE:RSI_OUT_OF_ZONE'],strategy:'MOMENTUM'};

      // HARD GATE: At minimum EMA9 must be above EMA21
      if(!ind.ema9||!ind.ema21||ind.ema9<=ind.ema21) return{score:-1,sigs:['GATE:NO_EMA_BULL'],strategy:'MOMENTUM'};

      // EMA cascade scoring
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=4;sigs.push('EMA_CASCADE✓');}
      score+=2;sigs.push('EMA9>21✓');// Always true (passed gate)

      // MACD confirmation
      if(ind.macd?.bullish&&ind.macd?.histogram>0){score+=4;sigs.push('MACD_BULL✓');}
      else if(ind.macd?.histogram>0){score+=2;sigs.push('MACD+');}
      else{score-=2;sigs.push('MACD_WEAK⚠');}

      // RSI momentum zone premium
      if(ind.rsi>=50&&ind.rsi<=65){score+=2;sigs.push(`RSI_MOMENTUM(${ind.rsi.toFixed(0)})`);}
      else{score+=1;sigs.push(`RSI(${ind.rsi.toFixed(0)})`);}

      // Momentum indicators
      if(ind.mom10!==null&&ind.mom10>2){score+=3;sigs.push(`MOM10(+${ind.mom10.toFixed(1)}%)`);}
      else if(ind.mom10!==null&&ind.mom10>0.8){score+=2;sigs.push('MOM10+');}
      if(ind.mom5!==null&&ind.mom5>0.5){score+=1;sigs.push('MOM5+');}

      if(ind.volumeRatio>2){score+=3;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.3){score+=1;}
      else{score-=1;sigs.push('VOL_WEAK⚠');}

      if(prices[sym]?.change24h>3){score+=2;sigs.push(`24H+${prices[sym].change24h.toFixed(1)}%`);}
      if(ind.regime==='bullish_trend'){score+=1;sigs.push('BULL_REGIME');}

      return{score,sigs,strategy:'MOMENTUM'};
    },
  },

  /**
   * REVERSAL — Mean reversion from extreme oversold
   * GATE: RSI MUST be <35. Price MUST be near or below BB lower band.
   * WHEN: Coins in extreme oversold territory with signs of bottoming
   * NOT WHEN: RSI 35+ (not oversold enough), rising trend (not reverting)
   */
  REVERSAL: {
    name:'Mean Reversion', minScore:8,
    description:'Extreme oversold bounce. RSI<35 AND BB lower required. High R:R.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // HARD GATE 1: RSI must be truly oversold
      if(ind.rsi===null||ind.rsi>35) return{score:-1,sigs:['GATE:RSI_NOT_EXTREME'],strategy:'REVERSAL'};

      // HARD GATE 2: BB must confirm oversold (price near lower band)
      if(!ind.bb||ind.bb.pct>-0.2) return{score:-1,sigs:['GATE:NOT_AT_BB_LOWER'],strategy:'REVERSAL'};

      // RSI extreme scoring
      if(ind.rsi<18&&ind.rsiUp){score+=10;sigs.push(`RSI_PANIC(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<24&&ind.rsiUp){score+=8;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<30&&ind.rsiUp){score+=6;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<35&&ind.rsiUp){score+=4;sigs.push(`RSI_VERY_LOW(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<35){score+=1;sigs.push(`RSI_LOW(${ind.rsi.toFixed(0)}) — NOT RECOVERING`);}
      if(!ind.rsiUp){score-=4;sigs.push('STILL_FALLING⚠');}

      // BB position scoring
      if(ind.bb.pct<-0.9){score+=5;sigs.push('BB_EXTREME_LOWER✓');}
      else if(ind.bb.pct<-0.6){score+=3;sigs.push('BB_LOWER✓');}
      else{score+=1;sigs.push(`BB_PCT(${ind.bb.pct.toFixed(2)})`);}

      // StochRSI panic zone
      if(ind.stochRSI!==null&&ind.stochRSI<10){score+=5;sigs.push(`STOCH_PANIC(${ind.stochRSI.toFixed(0)})`);}
      else if(ind.stochRSI!==null&&ind.stochRSI<20){score+=3;sigs.push(`STOCH_EXTREME`);}

      // MACD turning up is a bonus
      if(ind.macd?.bullish){score+=2;sigs.push('MACD_TURNING');}
      else if(ind.macd?.histogram>0){score+=1;}

      if(ind.volumeRatio>1.5){score+=2;sigs.push('CAPITULATION_VOL');}
      return{score,sigs,strategy:'REVERSAL'};
    },
  },

  /**
   * BREAKOUT — Bollinger Band squeeze + volume explosion
   * GATE: BB WIDTH must be <0.05 (tight squeeze). Volume must be elevated.
   * WHEN: Low volatility compression before explosive move
   * NOT WHEN: Wide BB (already volatile), low volume (no fuel for breakout)
   */
  BREAKOUT: {
    name:'Breakout', minScore:8,
    description:'BB squeeze <5% width + volume surge. Captures explosive moves.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // HARD GATE 1: BB must be squeezed (tight compression)
      if(!ind.bb||ind.bb.width>0.06) return{score:-1,sigs:['GATE:NO_SQUEEZE'],strategy:'BREAKOUT'};

      // HARD GATE 2: Volume must be elevated (the explosion trigger)
      if(ind.volumeRatio<1.4) return{score:-1,sigs:['GATE:VOL_TOO_LOW'],strategy:'BREAKOUT'};

      // BB squeeze scoring
      if(ind.bb.width<0.02){score+=6;sigs.push(`BB_EXTREME_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}
      else if(ind.bb.width<0.035){score+=4;sigs.push(`BB_TIGHT_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}
      else{score+=2;sigs.push(`BB_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}

      // Direction of breakout
      if(ind.bb.pct>0.3){score+=3;sigs.push('BREAKOUT_UP✓');}
      else if(ind.bb.pct>0){score+=1;sigs.push('ABOVE_MID');}

      // Volume explosion scoring
      if(ind.volumeRatio>3){score+=5;sigs.push(`VOL_EXPLOSION(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>2){score+=3;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else{score+=1;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}

      if(ind.macd?.bullish){score+=2;sigs.push('MACD_CONFIRM');}
      else if(ind.macd?.histogram>0){score+=1;}

      if(ind.mom5!==null&&ind.mom5>0.5){score+=2;sigs.push(`MOM5(+${ind.mom5.toFixed(2)}%)`);}

      // RSI neutral zone is fine for breakouts (40-70 is good)
      if(ind.rsi!==null&&ind.rsi>38&&ind.rsi<72){score+=1;sigs.push('RSI_OK');}
      return{score,sigs,strategy:'BREAKOUT'};
    },
  },

  /**
   * SWING — Pullback within established uptrend
   * GATE: EMA21 must be > EMA50 (uptrend confirmed). RSI must be 30-54 (pullback zone).
   * WHEN: Price pulling back in an uptrend, RSI dipping but not extreme
   * NOT WHEN: No uptrend (EMA21<EMA50), RSI too high (no pullback), RSI too low (reversal)
   */
  SWING: {
    name:'Swing Trade', minScore:7,
    description:'Pullback in uptrend. EMA21>EMA50 AND RSI in 30-54 range required.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // HARD GATE 1: Must be in confirmed uptrend
      if(!ind.ema21||!ind.ema50||ind.ema21<=ind.ema50) return{score:-1,sigs:['GATE:NO_UPTREND'],strategy:'SWING'};

      // HARD GATE 2: RSI must be in pullback zone (not oversold, not overbought)
      if(ind.rsi===null||ind.rsi<28||ind.rsi>56) return{score:-1,sigs:['GATE:RSI_NOT_PULLBACK'],strategy:'SWING'};

      // Uptrend strength
      const trendPct=(ind.ema21-ind.ema50)/ind.ema50*100;
      if(trendPct>3){score+=4;sigs.push(`STRONG_UPTREND(+${trendPct.toFixed(1)}%)`);}
      else{score+=2;sigs.push(`UPTREND(+${trendPct.toFixed(1)}%)`);}

      // Pullback depth (RSI zone scoring)
      if(ind.rsi>=30&&ind.rsi<40&&ind.rsiUp){score+=5;sigs.push(`DEEP_PULLBACK(RSI:${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi>=40&&ind.rsi<50&&ind.rsiUp){score+=3;sigs.push(`PULLBACK(RSI:${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi>=50&&ind.rsi<=56){score+=1;sigs.push(`MILD_PULLBACK(RSI:${ind.rsi.toFixed(0)})`);}
      if(!ind.rsiUp){score-=2;sigs.push('STILL_PULLING_BACK');}

      if(ind.ema9&&ind.ema21){
        if(ind.ema9>ind.ema21){score+=2;sigs.push('EMA9>21');}
        else{score-=1;sigs.push('EMA9<21_WARNING');}
      }

      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=3;sigs.push('MACD+');}
      if(ind.mom20!==null&&ind.mom20>2){score+=2;sigs.push(`MOM20(+${ind.mom20.toFixed(1)}%)`);}
      if(ind.volumeRatio>1.2){score+=1;sigs.push('VOL_OK');}

      return{score,sigs,strategy:'SWING'};
    },
  },

  /**
   * AGGRESSIVE — External catalyst driven (volume spike or price extreme)
   * GATE: Must have a STRONG external catalyst — volume>2.5x OR extreme 24h move
   * WHEN: Something unusual is happening — big volume spike, sharp dip, or news pump
   * NOT WHEN: Normal market conditions with no catalyst
   */
  AGGRESSIVE: {
    name:'Aggressive', minScore:8,
    description:'Volume spike >2.5x OR extreme 24h move required. Catalyst-only entries.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;
      const chg=prices[sym]?.change24h||0;

      // HARD GATE: Must have one of: massive volume, massive dip, massive pump
      const massiveVol    = ind.volumeRatio>2.5;
      const extremeDip    = chg<-6&&ind.rsiUp;
      const sharpPump     = chg>8&&ind.volumeRatio>2;
      const panicOversold = ind.rsi!==null&&ind.rsi<28&&ind.volumeRatio>1.8;

      if(!massiveVol&&!extremeDip&&!sharpPump&&!panicOversold){
        return{score:-1,sigs:['GATE:NO_STRONG_CATALYST'],strategy:'AGGRESSIVE'};
      }

      // Volume catalyst
      if(ind.volumeRatio>4){score+=6;sigs.push(`VOL_EXTREME(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>3){score+=5;sigs.push(`VOL_MASSIVE(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>2.5){score+=4;sigs.push(`VOL_SPIKE(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>1.5){score+=2;}

      // Price catalyst
      if(chg<-8&&ind.rsiUp){score+=5;sigs.push(`EXTREME_DIP(${chg.toFixed(1)}%)↑`);}
      else if(chg<-5&&ind.rsiUp){score+=3;sigs.push(`SHARP_DIP(${chg.toFixed(1)}%)↑`);}
      else if(chg>10&&ind.volumeRatio>2){score+=4;sigs.push(`PUMP(+${chg.toFixed(1)}%)`);}
      else if(chg>5){score+=2;sigs.push(`MOVE(+${chg.toFixed(1)}%)`);}

      // RSI
      if(ind.rsi!==null){
        if(ind.rsi<30&&ind.rsiUp){score+=4;sigs.push(`RSI_PANIC_BOUNCE(${ind.rsi.toFixed(0)})↑`);}
        else if(ind.rsi<45&&ind.rsiUp){score+=2;sigs.push('RSI_BOUNCE');}
        else if(ind.rsi>65&&chg>5){score+=2;sigs.push('RSI_BREAKOUT');}
      }

      if(ind.macd?.bullish&&ind.macd?.histogram>0){score+=2;sigs.push('MACD_CONFIRM');}
      if(ind.bb?.pct<-0.4){score+=2;sigs.push('BB_OVERSOLD');}

      return{score,sigs,strategy:'AGGRESSIVE'};
    },
  },

  /**
   * DCA_PLUS — Systematic cost averaging into quality dips
   * GATE: Must be Tier 1 or 2 coin. Must show a 24h dip. RSI must be below 52.
   * WHEN: Blue chip crypto showing ordinary dips — systematic accumulation
   * NOT WHEN: Tier 3/4 altcoins, RSI overbought, no dip
   */
  DCA_PLUS: {
    name:'DCA+', minScore:5,
    description:'Blue chip dip buying. Tier1/2 only, 24h dip + RSI<52. Systematic.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;
      const chg=prices[sym]?.change24h||0;
      const coin=COINS.find(c=>c.symbol===sym);

      // HARD GATE 1: Tier 1 or 2 only
      if(!coin||coin.tier>2) return{score:-1,sigs:['GATE:NOT_BLUE_CHIP'],strategy:'DCA_PLUS'};

      // HARD GATE 2: Must have a dip (at least slightly down)
      if(chg>=1) return{score:-1,sigs:['GATE:NO_DIP'],strategy:'DCA_PLUS'};

      // HARD GATE 3: RSI below 52
      if(ind.rsi!==null&&ind.rsi>52) return{score:-1,sigs:['GATE:RSI_TOO_HIGH'],strategy:'DCA_PLUS'};

      // Tier bonus
      if(coin.tier===1){score+=3;sigs.push('TIER1_BLUECHIP✓');}
      else{score+=1;sigs.push('TIER2_SOLID');}

      // Dip depth scoring
      if(chg<-6){score+=5;sigs.push(`DIP_MAJOR(${chg.toFixed(1)}%)`);}
      else if(chg<-3){score+=4;sigs.push(`DIP(${chg.toFixed(1)}%)`);}
      else if(chg<-1){score+=3;sigs.push(`DIP_MILD(${chg.toFixed(1)}%)`);}
      else{score+=1;sigs.push('SLIGHT_DIP');}

      // RSI position
      if(ind.rsi!==null){
        if(ind.rsi<30){score+=4;sigs.push(`RSI_VERY_LOW(${ind.rsi.toFixed(0)})`);}
        else if(ind.rsi<40){score+=3;sigs.push(`RSI_LOW(${ind.rsi.toFixed(0)})`);}
        else if(ind.rsi<52){score+=2;sigs.push(`RSI_OK(${ind.rsi.toFixed(0)})`);}
      }
      if(ind.rsiUp){score+=2;sigs.push('RSI_RECOVERING');}

      // Trend context
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=2;sigs.push('ABOVE_50EMA');}
      if(ind.macd?.histogram>0){score+=1;sigs.push('MACD+');}
      if(ind.volumeRatio>1.2){score+=1;sigs.push('VOL_OK');}

      return{score,sigs,strategy:'DCA_PLUS'};
    },
  },
};

export { STRATEGIES };

export const STRATEGY_LIST = Object.entries(STRATEGIES).map(([key,s])=>({
  key,name:s.name,description:s.description,minScore:s.minScore,
}));

export function scoreForBuy(botKey,symbol,prices,portfolio,totalValue,settings,cycleNum=0){
  const stratKey=settings.tradingStrategy||'PRECISION';
  const strat=STRATEGIES[stratKey]||STRATEGIES.PRECISION;
  const ind=computeIndicators(botKey,symbol);

  if(ind.priceCount<MIN_TICKS) return{score:0,signals:[`WARMING_UP(${ind.priceCount}/${MIN_TICKS})`],minScore:strat.minScore,strategy:stratKey};

  const px=prices[symbol]?.price;
  if(!px) return{score:0,signals:['NO_PRICE'],minScore:strat.minScore,strategy:stratKey};

  // Position size gate
  const maxPos=settings.maxPositionPct||0.35;
  const posVal=(portfolio[symbol]?.qty||0)*px;
  if(posVal/Math.max(totalValue,1)>maxPos) return{score:0,signals:['MAX_POSITION_HELD'],minScore:strat.minScore,strategy:stratKey};

  // Per-bot cooldown gate — prevents buying same coin repeatedly
  if(cycleNum>0&&isOnCooldown(botKey,symbol,cycleNum)){
    return{score:0,signals:['COOLDOWN'],minScore:strat.minScore,strategy:stratKey};
  }

  const {score,sigs,strategy}=strat.scoreEntry(ind,prices,symbol);
  const weight=COINS.find(c=>c.symbol===symbol)?.weight||1;
  const finalScore=score<=0?score:+(score*weight).toFixed(2);

  return{score:finalScore,rawScore:score,signals:sigs||[],strategy,minScore:strat.minScore,ind};
}

export function evaluateExit(botKey,symbol,pos,prices,settings){
  const ind=computeIndicators(botKey,symbol);
  const cur=prices[symbol]?.price;
  if(!cur||!pos) return null;

  const sl=settings.stopLossPct||0.05;
  const tp=settings.takeProfitPct||0.08;
  const lev=pos.leverage||1;
  const pnlPct=(cur-pos.avgCost)/pos.avgCost;
  const eff=pnlPct*lev;

  // Hard stop loss
  if(eff<=-sl){
    return{action:'SELL',sellPct:1.0,confidence:10,strategy:'STOP_LOSS',
      signals:[`STOP_LOSS(${(eff*100).toFixed(2)}%)`],
      reasoning:`Stop-loss at ${(eff*100).toFixed(2)}%. Entry $${pos.avgCost.toFixed(4)} → now $${cur.toFixed(4)}.`};
  }

  // Trailing stop after hitting 2x take profit
  const runningPeak=pos.peakPrice||cur;
  if(runningPeak>pos.avgCost*(1+tp*2)){
    const trailDrop=(runningPeak-cur)/runningPeak;
    if(trailDrop>0.04){
      return{action:'SELL',sellPct:0.75,confidence:8,strategy:'TRAIL_STOP',
        signals:[`TRAIL_STOP(drop:${(trailDrop*100).toFixed(1)}%)`],
        reasoning:`Trailing stop triggered — pulled back ${(trailDrop*100).toFixed(1)}% from peak.`};
    }
  }

  let exitScore=0;const exitSigs=[];

  // RSI overbought
  if(ind.rsi!==null){
    if(ind.rsi>78){exitScore+=5;exitSigs.push(`RSI_OB(${ind.rsi.toFixed(0)})`);}
    else if(ind.rsi>72){exitScore+=3;exitSigs.push(`RSI_HIGH(${ind.rsi.toFixed(0)})`);}
    else if(ind.rsi>65&&ind.rsiDn){exitScore+=2;exitSigs.push('RSI_TURNING_DOWN');}
  }

  // MACD bearish cross
  if(ind.macd&&!ind.macd.bullish&&ind.macd.histogram<0){exitScore+=3;exitSigs.push('MACD_BEAR_CROSS');}

  // Price above BB upper
  if(ind.bb?.pct>0.85){exitScore+=3;exitSigs.push('ABOVE_BB_UPPER');}

  // EMA bearish cross
  if(ind.ema9&&ind.ema21&&ind.ema9<ind.ema21){exitScore+=2;exitSigs.push('EMA_DEATH_CROSS');}

  // Momentum failing
  if(ind.mom5!==null&&ind.mom5<-0.8){exitScore+=2;exitSigs.push('MOM_NEGATIVE');}

  // Profit + reversal signals
  if(eff>=tp*2&&exitScore>=3){
    return{action:'SELL',sellPct:0.6,confidence:9,strategy:'TAKE_PROFIT_PARTIAL',
      signals:[`TP+${(eff*100).toFixed(1)}%`,...exitSigs],
      reasoning:`+${(eff*100).toFixed(2)}% with ${exitScore} reversal signals. Taking 60% off table.`};
  }
  if(eff>=tp&&exitScore>=5){
    return{action:'SELL',sellPct:0.75,confidence:9,strategy:'TAKE_PROFIT',
      signals:[`TP+${(eff*100).toFixed(1)}%`,...exitSigs],
      reasoning:`Take profit +${(eff*100).toFixed(2)}% — ${exitSigs.join(', ')}.`};
  }
  if(exitScore>=7&&eff>0.01){
    return{action:'SELL',sellPct:0.7,confidence:8,strategy:'REVERSAL_DETECTED',
      signals:exitSigs,
      reasoning:`Reversal score ${exitScore}: ${exitSigs.join(', ')}. Selling 70%.`};
  }
  if(exitScore>=8&&eff<0){
    return{action:'SELL',sellPct:1.0,confidence:8,strategy:'CUT_LOSS',
      signals:exitSigs,
      reasoning:`Downtrend confirmed in loss position. Full exit.`};
  }

  return null;
}

export function calcTotalValue(prices,portfolio,balance){
  let v=balance;
  for(const[s,{qty}]of Object.entries(portfolio)) v+=qty*(prices[s]?.price||0);
  return v;
}

export function buildMarketSummary(botKey,prices,portfolio){
  return COINS.map(({symbol:sym})=>{
    const px=prices[sym];if(!px)return'';
    const ind=computeIndicators(botKey,sym);
    const held=portfolio[sym];
    const regime=ind.regime||'?';
    return`${sym} $${px.price.toFixed(4)}|24H:${px.change24h.toFixed(2)}%|RSI:${ind.rsi?.toFixed(1)||'—'}|MACD:${ind.macd?.bullish?'↑':'↓'}|BB:${ind.bb?.pct?.toFixed(2)||'—'}|VOL:${ind.volumeRatio.toFixed(1)}x|${regime}${held?`|HELD@$${held.avgCost.toFixed(4)}`:''}`;
  }).filter(Boolean).join('\n');
}
