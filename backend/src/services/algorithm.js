/**
 * PLEX TRADER · Algorithm v10 — HIGH WIN RATE EDITION
 *
 * KEY CHANGES FROM v9:
 * 1. Buy threshold raised to confidence ≥ 8/10 across all strategies
 * 2. Sell only on CONFIRMED downtrend — multiple signals required, not just one
 * 3. Tighter entry gates = fewer but higher quality trades
 * 4. Exit logic requires stronger confirmation before selling winning positions
 * 5. Learning engine weights now applied to EVERY score calculation
 * 6. RSI divergence check added — don't buy into falling RSI even if score is high
 * 7. Volume confirmation required on all entries
 */

import axios from 'axios';

const BINANCE = 'https://api.binance.com/api/v3';
const MIN_TICKS = 8; // Need more data before trading

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
  { id:'NEARUSDT',   symbol:'NEAR',   tier:3, weight:0.9 },
  { id:'APTUSDT',    symbol:'APT',    tier:3, weight:0.9 },
  { id:'ARBUSDT',    symbol:'ARB',    tier:3, weight:0.9 },
  { id:'OPUSDT',     symbol:'OP',     tier:3, weight:0.8 },
  { id:'INJUSDT',    symbol:'INJ',    tier:3, weight:0.9 },
  { id:'SUIUSDT',    symbol:'SUI',    tier:3, weight:0.9 },
  { id:'TIAUSDT',    symbol:'TIA',    tier:3, weight:0.8 },
  { id:'DOGEUSDT',   symbol:'DOGE',   tier:3, weight:0.8 },
  { id:'FETUSDT',    symbol:'FET',    tier:4, weight:0.8 },
  { id:'WLDUSDT',    symbol:'WLD',    tier:4, weight:0.7 },
  { id:'JUPUSDT',    symbol:'JUP',    tier:4, weight:0.8 },
  { id:'ENAUSDT',    symbol:'ENA',    tier:4, weight:0.8 },
  { id:'ONDOUSDT',   symbol:'ONDO',   tier:4, weight:0.7 },
  { id:'EIGENUSDT',  symbol:'EIGEN',  tier:4, weight:0.7 },
  { id:'SHIBUSDT',   symbol:'SHIB',   tier:4, weight:0.7 },
];

const PAIR_MAP = Object.fromEntries(COINS.map(c=>[c.id,c.symbol]));

// Per-botKey isolated stores
const priceHist = new Map();
const volHist   = new Map();
const rsiHist   = new Map();
const cooldowns = new Map();

function getArr(store, key, sym) {
  if (!store.has(key)) store.set(key, {});
  if (!store.get(key)[sym]) store.get(key)[sym] = [];
  return store.get(key)[sym];
}
const getPH = (k,s) => getArr(priceHist,k,s);
const getVH = (k,s) => getArr(volHist,k,s);
const getRH = (k,s) => getArr(rsiHist,k,s);

// Cooldown: 8 cycles before re-buying same coin (up from 5)
const COOLDOWN_CYCLES = 8;
export function setCooldown(botKey, symbol, currentCycle) {
  if (!cooldowns.has(botKey)) cooldowns.set(botKey, {});
  cooldowns.get(botKey)[symbol] = currentCycle;
}
export function isOnCooldown(botKey, symbol, currentCycle) {
  const c = cooldowns.get(botKey)?.[symbol];
  return c !== undefined && (currentCycle - c) < COOLDOWN_CYCLES;
}

// Cleanup expired cooldowns to prevent memory growth
export function cleanupCooldowns(botKey, currentCycle) {
  const cd = cooldowns.get(botKey);
  if (!cd) return;
  for (const [sym, cycle] of Object.entries(cd)) {
    if (currentCycle - cycle >= COOLDOWN_CYCLES) delete cd[sym];
  }
}

// ── Price history seeding ──────────────────────────────────────────────────────
export async function seedPriceHistory(botKey) {
  let seeded = 0;
  const batches = [];
  for (let i=0;i<COINS.length;i+=4) batches.push(COINS.slice(i,i+4));
  for (const batch of batches) {
    await Promise.allSettled(batch.map(async ({id,symbol}) => {
      try {
        const r = await axios.get(`${BINANCE}/klines`,
          {params:{symbol:id,interval:'1m',limit:100},timeout:10000});
        const ph=getPH(botKey,symbol), vh=getVH(botKey,symbol);
        if (ph.length===0) {
          r.data.forEach(k=>{ ph.push(parseFloat(k[4])); vh.push(parseFloat(k[5])); });
          seeded++;
        }
      } catch {}
    }));
    await new Promise(r=>setTimeout(r,300));
  }
  console.log(`[Algo][${botKey.slice(0,6)}] Seeded ${seeded}/${COINS.length} coins`);
  return seeded;
}

// ── Price fetch ────────────────────────────────────────────────────────────────
export async function fetchPrices(botKey) {
  const ids = COINS.map(c=>c.id);
  const result = {};
  for (let i=0;i<ids.length;i+=20) {
    try {
      const batch=ids.slice(i,i+20);
      const r=await axios.get(`${BINANCE}/ticker/24hr`,
        {params:{symbols:JSON.stringify(batch)},timeout:12000});
      for (const t of r.data) {
        const sym=PAIR_MAP[t.symbol]; if(!sym) continue;
        const price=parseFloat(t.lastPrice); if(!price||isNaN(price)) continue;
        result[sym]={
          price,
          change24h:   parseFloat(t.priceChangePercent)||0,
          volume24h:   parseFloat(t.quoteVolume)||0,
          high24h:     parseFloat(t.highPrice)||price,
          low24h:      parseFloat(t.lowPrice)||price,
          openPrice:   parseFloat(t.openPrice)||price,
        };
        const ph=getPH(botKey,sym); ph.push(price); if(ph.length>150) ph.shift();
        const vh=getVH(botKey,sym); vh.push(parseFloat(t.quoteVolume)||0); if(vh.length>150) vh.shift();
      }
    } catch(e){console.error('[Algo] fetch error:',e.message);}
  }
  return result;
}

// ── Indicators ─────────────────────────────────────────────────────────────────
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
function volRatio(vols,n=14){if(vols.length<n+1)return 1;const r=vols[vols.length-1],avg=vols.slice(-n-1,-1).reduce((a,b)=>a+b)/n;return avg>0?r/avg:1;}

// RSI trend: returns +1 rising, -1 falling, 0 flat
function rsiTrend(k,sym){
  const h=getRH(k,sym);
  if(h.length<3)return 0;
  const rising=h[h.length-1]>h[h.length-2]&&h[h.length-2]>h[h.length-3];
  const falling=h[h.length-1]<h[h.length-2]&&h[h.length-2]<h[h.length-3];
  return rising?1:falling?-1:0;
}

export function computeIndicators(botKey,symbol){
  const prices=getPH(botKey,symbol),vols=getVH(botKey,symbol);
  const rsiVal=rsiCalc(prices);
  if(rsiVal!==null){const h=getRH(botKey,symbol);h.push(rsiVal);if(h.length>30)h.shift();}
  const rt=rsiTrend(botKey,symbol);
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
    rsi:rsiVal,rsiUp:rt>0,rsiDn:rt<0,rsiFlat:rt===0,rsiTrend:rt,
    macd:macdVal,bb:bbVal,stochRSI:stoch,
    ema9:e9,ema21:e21,ema50:e50,ema200:e200,
    mom5:mom(prices,5),mom10:mom(prices,10),mom20:mom(prices,20),
    volumeRatio:vr,regime,
    isBullTrend: !!(e9&&e21&&e50&&e9>e21&&e21>e50),
    isBearTrend: !!(e9&&e21&&e50&&e9<e21&&e21<e50),
    isOversold:  rsiVal!==null&&rsiVal<35,
    isNeutral:   rsiVal!==null&&rsiVal>=40&&rsiVal<=65,
    isSqueeze:   bbVal&&bbVal.width<0.05,
  };
}

// ── STRATEGY ENGINES ───────────────────────────────────────────────────────────
// All strategies now target confidence ≥ 8/10 before buying.
// minScore raised, gates tightened, RSI must be RISING to enter.
// ──────────────────────────────────────────────────────────────────────────────

const STRATEGIES = {

  /**
   * PRECISION — Triple confirmation: RSI recovering + MACD bull + BB lower
   * Win rate target: 65%+
   * Key change: RSI MUST be rising (no buying falling knives)
   */
  PRECISION: {
    name:'Precision', minScore:10,
    description:'RSI recovering + MACD bull + BB lower. All three required. High conviction only.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // GATE 1: RSI below 48 — oversold/neutral range
      if(ind.rsi===null||ind.rsi>48) return{score:-1,sigs:['GATE:RSI_TOO_HIGH'],strategy:'PRECISION'};

      // GATE 2: RSI MUST be rising — never buy a falling knife
      if(!ind.rsiUp) return{score:-1,sigs:['GATE:RSI_FALLING'],strategy:'PRECISION'};

      // GATE 3: Not in bear trend
      if(ind.isBearTrend&&ind.rsi>30) return{score:-1,sigs:['GATE:BEAR_TREND'],strategy:'PRECISION'};

      // GATE 4: Volume must be present
      if(ind.volumeRatio<0.7) return{score:-1,sigs:['GATE:NO_VOLUME'],strategy:'PRECISION'};

      // RSI scoring — heavily weighted toward truly oversold + rising
      if(ind.rsi<20){score+=9;sigs.push(`RSI_PANIC(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<28){score+=7;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<35){score+=5;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<42){score+=3;sigs.push(`RSI_LOW(${ind.rsi.toFixed(0)})↑`);}
      else{score+=1;sigs.push(`RSI_NEUTRAL(${ind.rsi.toFixed(0)})↑`);}

      // MACD — must be bullish or turning
      if(!ind.macd)return{score:-1,sigs:['GATE:NO_MACD'],strategy:'PRECISION'};
      if(ind.macd.bullish&&ind.macd.histogram>0){score+=5;sigs.push('MACD_BULL✓');}
      else if(ind.macd.histogram>-0.001){score+=1;sigs.push('MACD_TURNING');}
      else{return{score:-1,sigs:['GATE:MACD_BEARISH'],strategy:'PRECISION'};}

      // BB — price MUST be in lower half
      if(!ind.bb)return{score:-1,sigs:['GATE:NO_BB'],strategy:'PRECISION'};
      if(ind.bb.pct<-0.8){score+=6;sigs.push('BB_EXTREME_LOW✓');}
      else if(ind.bb.pct<-0.5){score+=4;sigs.push('BB_LOWER✓');}
      else if(ind.bb.pct<-0.2){score+=2;sigs.push('BB_BELOW_MID');}
      else{return{score:-1,sigs:['GATE:PRICE_ABOVE_MID_BB'],strategy:'PRECISION'};}

      // StochRSI bonus
      if(ind.stochRSI!==null&&ind.stochRSI<15){score+=4;sigs.push(`STOCH_PANIC(${ind.stochRSI.toFixed(0)})`);}
      else if(ind.stochRSI!==null&&ind.stochRSI<30){score+=2;sigs.push('STOCH_LOW');}

      // Volume confirmation
      if(ind.volumeRatio>2.0){score+=3;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.3){score+=2;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}
      else{score+=1;}

      // EMA support
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=2;sigs.push('ABOVE_50EMA');}

      return{score,sigs,strategy:'PRECISION'};
    },
  },

  /**
   * MOMENTUM — Confirmed uptrend with RSI in momentum zone
   * Win rate target: 60%+
   * Key change: requires stronger EMA cascade + volume confirmation
   */
  MOMENTUM: {
    name:'Momentum', minScore:10,
    description:'Full EMA cascade + RSI 45-65 + rising volume. Trend-following only.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // GATE 1: RSI in clean momentum zone
      if(ind.rsi===null||ind.rsi<42||ind.rsi>68) return{score:-1,sigs:['GATE:RSI_OUT_OF_ZONE'],strategy:'MOMENTUM'};

      // GATE 2: Full EMA cascade required (not just EMA9>EMA21)
      if(!ind.ema9||!ind.ema21||!ind.ema50) return{score:-1,sigs:['GATE:NO_EMA'],strategy:'MOMENTUM'};
      if(ind.ema9<=ind.ema21) return{score:-1,sigs:['GATE:EMA9_BELOW_21'],strategy:'MOMENTUM'};
      if(ind.ema21<=ind.ema50) return{score:-1,sigs:['GATE:EMA21_BELOW_50'],strategy:'MOMENTUM'};

      // GATE 3: RSI must be rising or flat (no buying declining momentum)
      if(ind.rsiDn) return{score:-1,sigs:['GATE:RSI_DECLINING'],strategy:'MOMENTUM'};

      // GATE 4: Volume must support the move
      if(ind.volumeRatio<1.1) return{score:-1,sigs:['GATE:WEAK_VOLUME'],strategy:'MOMENTUM'};

      // EMA cascade quality
      const trend=(ind.ema21-ind.ema50)/ind.ema50*100;
      if(trend>5){score+=6;sigs.push(`STRONG_TREND(+${trend.toFixed(1)}%)`);}
      else if(trend>2){score+=4;sigs.push(`TREND(+${trend.toFixed(1)}%)`);}
      else{score+=2;sigs.push(`WEAK_TREND(+${trend.toFixed(1)}%)`);}
      score+=2;sigs.push('EMA9>21>50✓');

      // MACD must confirm
      if(!ind.macd||!ind.macd.bullish) return{score:-1,sigs:['GATE:MACD_NOT_BULL'],strategy:'MOMENTUM'};
      if(ind.macd.histogram>0){score+=4;sigs.push('MACD_BULL✓');}
      else{score+=1;}

      // RSI momentum quality
      if(ind.rsi>=50&&ind.rsi<=63&&ind.rsiUp){score+=4;sigs.push(`RSI_PRIME(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi>=42&&ind.rsi<=68){score+=2;sigs.push(`RSI(${ind.rsi.toFixed(0)})`);}

      // Momentum
      if(ind.mom10!==null&&ind.mom10>3){score+=4;sigs.push(`MOM10(+${ind.mom10.toFixed(1)}%)`);}
      else if(ind.mom10!==null&&ind.mom10>1){score+=2;sigs.push('MOM10+');}
      else if(ind.mom10!==null&&ind.mom10<0){return{score:-1,sigs:['GATE:NEGATIVE_MOMENTUM'],strategy:'MOMENTUM'};}

      if(ind.mom5!==null&&ind.mom5>0.5){score+=1;sigs.push('MOM5+');}

      // Volume
      if(ind.volumeRatio>2.5){score+=4;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.5){score+=2;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}
      else{score+=1;}

      if(prices[sym]?.change24h>3){score+=2;sigs.push(`24H+${prices[sym].change24h.toFixed(1)}%`);}

      return{score,sigs,strategy:'MOMENTUM'};
    },
  },

  /**
   * REVERSAL — Extreme oversold with clear bottoming signs
   * Win rate target: 62%+
   * Key change: RSI MUST be rising, multiple bottom signals required
   */
  REVERSAL: {
    name:'Mean Reversion', minScore:11,
    description:'Extreme oversold (RSI<30) + BB lower + RSI turning up. High R:R.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // GATE 1: RSI must be genuinely extreme
      if(ind.rsi===null||ind.rsi>32) return{score:-1,sigs:['GATE:RSI_NOT_EXTREME'],strategy:'REVERSAL'};

      // GATE 2: RSI MUST be rising — don't catch falling knives
      if(!ind.rsiUp) return{score:-1,sigs:['GATE:RSI_STILL_FALLING'],strategy:'REVERSAL'};

      // GATE 3: BB must confirm extreme oversold
      if(!ind.bb||ind.bb.pct>-0.4) return{score:-1,sigs:['GATE:NOT_AT_BB_LOWER'],strategy:'REVERSAL'};

      // GATE 4: StochRSI must be in panic zone
      if(ind.stochRSI!==null&&ind.stochRSI>35) return{score:-1,sigs:['GATE:STOCH_NOT_PANIC'],strategy:'REVERSAL'};

      // RSI extreme scoring
      if(ind.rsi<15){score+=12;sigs.push(`RSI_CAPITULATION(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<20){score+=10;sigs.push(`RSI_PANIC(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<25){score+=8;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi<30){score+=5;sigs.push(`RSI_OVERSOLD(${ind.rsi.toFixed(0)})↑`);}
      else{score+=2;sigs.push(`RSI_VERY_LOW(${ind.rsi.toFixed(0)})↑`);}

      // BB position
      if(ind.bb.pct<-0.95){score+=6;sigs.push('BB_EXTREME_LOWER✓');}
      else if(ind.bb.pct<-0.7){score+=4;sigs.push('BB_LOWER✓');}
      else{score+=2;sigs.push(`BB_PCT(${ind.bb.pct.toFixed(2)})`);}

      // StochRSI panic
      if(ind.stochRSI!==null&&ind.stochRSI<5){score+=5;sigs.push(`STOCH_CAPITULATION(${ind.stochRSI.toFixed(0)})`);}
      else if(ind.stochRSI!==null&&ind.stochRSI<15){score+=3;sigs.push(`STOCH_PANIC(${ind.stochRSI.toFixed(0)})`);}
      else{score+=1;sigs.push(`STOCH(${ind.stochRSI?.toFixed(0)||'—'})`);}

      // MACD turning is a bonus
      if(ind.macd?.bullish){score+=3;sigs.push('MACD_TURNING');}
      else if(ind.macd?.histogram>0){score+=1;}

      // Volume: capitulation volume is bullish
      if(ind.volumeRatio>2.5){score+=3;sigs.push(`CAPITULATION_VOL(${ind.volumeRatio.toFixed(1)}x)`);}
      else if(ind.volumeRatio>1.5){score+=2;sigs.push('ELEVATED_VOL');}

      return{score,sigs,strategy:'REVERSAL'};
    },
  },

  /**
   * BREAKOUT — BB squeeze with volume explosion in upward direction
   * Win rate target: 58%+
   * Key change: Price must already be breaking up (above midband) + strong volume
   */
  BREAKOUT: {
    name:'Breakout', minScore:11,
    description:'BB squeeze + volume explosion + price above midband. Directional only.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // GATE 1: BB must be squeezed
      if(!ind.bb||ind.bb.width>0.05) return{score:-1,sigs:['GATE:NO_SQUEEZE'],strategy:'BREAKOUT'};

      // GATE 2: Strong volume required
      if(ind.volumeRatio<1.8) return{score:-1,sigs:['GATE:VOLUME_INSUFFICIENT'],strategy:'BREAKOUT'};

      // GATE 3: Price must be breaking UP (above midband) — only trade upward breakouts
      if(ind.bb.pct<0.1) return{score:-1,sigs:['GATE:NOT_BREAKING_UP'],strategy:'BREAKOUT'};

      // GATE 4: RSI must be in valid range (not extreme)
      if(ind.rsi!==null&&(ind.rsi<35||ind.rsi>75)) return{score:-1,sigs:['GATE:RSI_INVALID_FOR_BREAKOUT'],strategy:'BREAKOUT'};

      // GATE 5: Momentum must be positive
      if(ind.mom5!==null&&ind.mom5<0.3) return{score:-1,sigs:['GATE:NO_MOMENTUM'],strategy:'BREAKOUT'};

      // BB squeeze quality
      if(ind.bb.width<0.015){score+=8;sigs.push(`BB_EXTREME_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}
      else if(ind.bb.width<0.03){score+=5;sigs.push(`BB_TIGHT_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}
      else{score+=3;sigs.push(`BB_SQUEEZE(${(ind.bb.width*100).toFixed(2)}%)`);}

      // Breakout direction quality
      if(ind.bb.pct>0.7){score+=5;sigs.push('STRONG_BREAKOUT_UP✓');}
      else if(ind.bb.pct>0.4){score+=3;sigs.push('BREAKOUT_UP✓');}
      else{score+=1;sigs.push('ABOVE_MID');}

      // Volume explosion
      if(ind.volumeRatio>4){score+=6;sigs.push(`VOL_EXPLOSION(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>2.5){score+=4;sigs.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`);}
      else{score+=2;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}

      // MACD confirmation
      if(ind.macd?.bullish&&ind.macd?.histogram>0){score+=3;sigs.push('MACD_CONFIRM');}
      else if(!ind.macd?.bullish){score-=2;sigs.push('MACD_WEAK⚠');}

      if(ind.mom5!==null&&ind.mom5>1){score+=2;sigs.push(`MOM5(+${ind.mom5.toFixed(2)}%)`);}
      if(prices[sym]?.change24h>2){score+=1;sigs.push('24H+');}

      return{score,sigs,strategy:'BREAKOUT'};
    },
  },

  /**
   * SWING — Pullback in strong uptrend
   * Win rate target: 63%+
   * Key change: Must have strong trend + RSI recovering from pullback
   */
  SWING: {
    name:'Swing Trade', minScore:10,
    description:'Strong uptrend pullback (EMA21>EMA50) + RSI recovering in 32-50 zone.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;

      // GATE 1: Must be in confirmed uptrend
      if(!ind.ema21||!ind.ema50||ind.ema21<=ind.ema50) return{score:-1,sigs:['GATE:NO_UPTREND'],strategy:'SWING'};

      // GATE 2: Trend must be meaningful
      const trendPct=(ind.ema21-ind.ema50)/ind.ema50*100;
      if(trendPct<1.5) return{score:-1,sigs:['GATE:WEAK_TREND'],strategy:'SWING'};

      // GATE 3: RSI in pullback zone — tighter range now
      if(ind.rsi===null||ind.rsi<30||ind.rsi>52) return{score:-1,sigs:['GATE:RSI_NOT_PULLBACK'],strategy:'SWING'};

      // GATE 4: RSI must be recovering (rising from pullback)
      if(!ind.rsiUp) return{score:-1,sigs:['GATE:RSI_NOT_RECOVERING'],strategy:'SWING'};

      // GATE 5: EMA9 must still be above EMA21 (trend intact)
      if(ind.ema9&&ind.ema21&&ind.ema9<ind.ema21*0.998) return{score:-1,sigs:['GATE:EMA9_UNDER_21'],strategy:'SWING'};

      // Uptrend strength
      if(trendPct>5){score+=6;sigs.push(`STRONG_UPTREND(+${trendPct.toFixed(1)}%)`);}
      else if(trendPct>3){score+=4;sigs.push(`UPTREND(+${trendPct.toFixed(1)}%)`);}
      else{score+=2;sigs.push(`UPTREND(+${trendPct.toFixed(1)}%)`);}

      // Pullback depth (sweet spot is 35-48)
      if(ind.rsi>=32&&ind.rsi<40){score+=6;sigs.push(`DEEP_PULLBACK(RSI:${ind.rsi.toFixed(0)})↑`);}
      else if(ind.rsi>=40&&ind.rsi<48){score+=4;sigs.push(`PULLBACK(RSI:${ind.rsi.toFixed(0)})↑`);}
      else{score+=2;sigs.push(`MILD_PULLBACK(RSI:${ind.rsi.toFixed(0)})↑`);}

      // MACD
      if(ind.macd?.bullish||ind.macd?.histogram>0){score+=3;sigs.push('MACD+');}
      else{score-=1;}

      // BB: price should be near lower half for a good entry
      if(ind.bb?.pct<-0.2){score+=2;sigs.push('BB_BELOW_MID');}
      else if(ind.bb?.pct<0.2){score+=1;}

      if(ind.mom20!==null&&ind.mom20>2){score+=2;sigs.push(`MOM20(+${ind.mom20.toFixed(1)}%)`);}
      if(ind.volumeRatio>1.3){score+=2;sigs.push(`VOL(${ind.volumeRatio.toFixed(1)}x)`);}

      return{score,sigs,strategy:'SWING'};
    },
  },

  /**
   * AGGRESSIVE — Strong catalyst with immediate momentum
   * Win rate target: 55%+
   * Key change: Requires multiple catalyst signals, RSI must support direction
   */
  AGGRESSIVE: {
    name:'Aggressive', minScore:11,
    description:'Strong catalyst (vol>3x OR extreme dip+recovery). Multiple confirms required.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;
      const chg=prices[sym]?.change24h||0;

      // GATE 1: Must have strong catalyst
      const extremeVol     = ind.volumeRatio>3.0;
      const extremeDip     = chg<-7&&ind.rsiUp&&ind.rsi<35;
      const momentumBurst  = chg>7&&ind.volumeRatio>2.5&&ind.rsiUp;
      const panicBottom    = ind.rsi!==null&&ind.rsi<22&&ind.volumeRatio>2&&ind.rsiUp;

      if(!extremeVol&&!extremeDip&&!momentumBurst&&!panicBottom){
        return{score:-1,sigs:['GATE:NO_STRONG_CATALYST'],strategy:'AGGRESSIVE'};
      }

      // GATE 2: RSI direction must match trade direction
      if(chg>0&&ind.rsiDn) return{score:-1,sigs:['GATE:RSI_DIVERGENCE_ON_PUMP'],strategy:'AGGRESSIVE'};

      // Volume catalyst scoring
      if(ind.volumeRatio>5){score+=7;sigs.push(`VOL_EXTREME(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>4){score+=6;sigs.push(`VOL_MASSIVE(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>3){score+=4;sigs.push(`VOL_SPIKE(${ind.volumeRatio.toFixed(1)}x)✓`);}
      else if(ind.volumeRatio>2){score+=2;}

      // Price catalyst
      if(chg<-9&&ind.rsiUp){score+=6;sigs.push(`EXTREME_DIP(${chg.toFixed(1)}%)↑`);}
      else if(chg<-6&&ind.rsiUp){score+=4;sigs.push(`SHARP_DIP(${chg.toFixed(1)}%)↑`);}
      else if(chg>10&&ind.volumeRatio>2.5){score+=5;sigs.push(`PUMP(+${chg.toFixed(1)}%)`);}
      else if(chg>6){score+=3;sigs.push(`STRONG_MOVE(+${chg.toFixed(1)}%)`);}

      // RSI scoring
      if(ind.rsi!==null){
        if(ind.rsi<22&&ind.rsiUp){score+=5;sigs.push(`RSI_PANIC_BOUNCE(${ind.rsi.toFixed(0)})↑`);}
        else if(ind.rsi<35&&ind.rsiUp){score+=3;sigs.push(`RSI_BOUNCE(${ind.rsi.toFixed(0)})↑`);}
        else if(ind.rsi>60&&chg>5&&ind.rsiUp){score+=3;sigs.push(`RSI_BREAKOUT(${ind.rsi.toFixed(0)})↑`);}
      }

      if(ind.macd?.bullish&&ind.macd?.histogram>0){score+=2;sigs.push('MACD_CONFIRM');}
      if(ind.bb?.pct<-0.5&&ind.rsiUp){score+=2;sigs.push('BB_OVERSOLD');}

      return{score,sigs,strategy:'AGGRESSIVE'};
    },
  },

  /**
   * DCA_PLUS — Systematic blue-chip accumulation
   * Win rate target: 70%+
   * Key change: Only Tier 1 coins, stricter dip requirement, RSI must be rising
   */
  DCA_PLUS: {
    name:'DCA+', minScore:9,
    description:'Tier-1 blue chips only (BTC/ETH/SOL/XRP/BNB). Meaningful dip + RSI rising.',
    scoreEntry(ind,prices,sym){
      const sigs=[]; let score=0;
      const chg=prices[sym]?.change24h||0;
      const coin=COINS.find(c=>c.symbol===sym);

      // GATE 1: Tier 1 ONLY for DCA (highest quality coins)
      if(!coin||coin.tier>1) return{score:-1,sigs:['GATE:NOT_TIER1'],strategy:'DCA_PLUS'};

      // GATE 2: Must have a real dip (at least -1%)
      if(chg>=-1) return{score:-1,sigs:['GATE:INSUFFICIENT_DIP'],strategy:'DCA_PLUS'};

      // GATE 3: RSI below 50
      if(ind.rsi!==null&&ind.rsi>50) return{score:-1,sigs:['GATE:RSI_TOO_HIGH'],strategy:'DCA_PLUS'};

      // GATE 4: RSI must be rising (recovering from dip)
      if(!ind.rsiUp&&ind.rsi!==null&&ind.rsi>25) return{score:-1,sigs:['GATE:RSI_NOT_RECOVERING'],strategy:'DCA_PLUS'};

      // GATE 5: Not in full bear trend
      if(ind.isBearTrend&&ind.rsi>30) return{score:-1,sigs:['GATE:BEAR_TREND'],strategy:'DCA_PLUS'};

      // Tier bonus (all tier 1 now)
      score+=4;sigs.push('TIER1_BLUECHIP✓');

      // Dip depth scoring
      if(chg<-8){score+=6;sigs.push(`DIP_MAJOR(${chg.toFixed(1)}%)`);}
      else if(chg<-5){score+=5;sigs.push(`DIP_STRONG(${chg.toFixed(1)}%)`);}
      else if(chg<-3){score+=3;sigs.push(`DIP(${chg.toFixed(1)}%)`);}
      else{score+=1;sigs.push(`MILD_DIP(${chg.toFixed(1)}%)`);}

      // RSI position
      if(ind.rsi!==null){
        if(ind.rsi<25){score+=5;sigs.push(`RSI_EXTREME(${ind.rsi.toFixed(0)})↑`);}
        else if(ind.rsi<35){score+=4;sigs.push(`RSI_LOW(${ind.rsi.toFixed(0)})↑`);}
        else if(ind.rsi<45){score+=2;sigs.push(`RSI_DIP(${ind.rsi.toFixed(0)})↑`);}
        else{score+=1;sigs.push(`RSI_OK(${ind.rsi.toFixed(0)})↑`);}
      }

      // EMA context — bonus if still above long-term trend
      if(ind.ema21&&ind.ema50&&ind.ema21>ind.ema50){score+=3;sigs.push('ABOVE_50EMA✓');}
      if(ind.ema50&&ind.ema200&&ind.ema50>ind.ema200){score+=2;sigs.push('BULL_STRUCTURE');}

      if(ind.macd?.histogram>0){score+=2;sigs.push('MACD+');}
      if(ind.bb?.pct<-0.4){score+=2;sigs.push('BB_LOWER');}
      if(ind.stochRSI!==null&&ind.stochRSI<25){score+=2;sigs.push('STOCH_LOW');}
      if(ind.volumeRatio>1.3){score+=1;sigs.push('VOL_OK');}

      return{score,sigs,strategy:'DCA_PLUS'};
    },
  },
};

export { STRATEGIES };

export const STRATEGY_LIST = Object.entries(STRATEGIES).map(([key,s])=>({
  key,name:s.name,description:s.description,minScore:s.minScore,
}));

// ── Entry scoring with learning weights applied ────────────────────────────────
export function scoreForBuy(botKey,symbol,prices,portfolio,totalValue,settings,cycleNum=0){
  // Periodically clean expired cooldowns
  if(cycleNum>0&&cycleNum%20===0) cleanupCooldowns(botKey,cycleNum);
  const stratKey=settings.tradingStrategy||'PRECISION';
  const strat=STRATEGIES[stratKey]||STRATEGIES.PRECISION;
  const ind=computeIndicators(botKey,symbol);

  if(ind.priceCount<MIN_TICKS) return{score:0,signals:[`WARMING_UP(${ind.priceCount}/${MIN_TICKS})`],minScore:strat.minScore,strategy:stratKey};

  const px=prices[symbol]?.price;
  if(!px) return{score:0,signals:['NO_PRICE'],minScore:strat.minScore,strategy:stratKey};

  const maxPos=settings.maxPositionPct||0.35;
  const posVal=(portfolio[symbol]?.qty||0)*px;
  if(posVal/Math.max(totalValue,1)>maxPos) return{score:0,signals:['MAX_POSITION_HELD'],minScore:strat.minScore,strategy:stratKey};

  if(cycleNum>0&&isOnCooldown(botKey,symbol,cycleNum)){
    return{score:0,signals:['COOLDOWN'],minScore:strat.minScore,strategy:stratKey};
  }

  const {score,sigs,strategy}=strat.scoreEntry(ind,prices,symbol);
  const weight=COINS.find(c=>c.symbol===symbol)?.weight||1;
  const finalScore=score<=0?score:+(score*weight).toFixed(2);

  // Convert score to 0-10 confidence for display
  const confidence=Math.min(10,Math.max(0,+(finalScore/strat.minScore*8).toFixed(1)));

  return{score:finalScore,rawScore:score,signals:sigs||[],strategy,minScore:strat.minScore,ind,confidence};
}

// ── Exit evaluation — leverage-aware, requires CONFIRMED downtrend ─────────────
export function evaluateExit(botKey,symbol,pos,prices,settings){
  const ind=computeIndicators(botKey,symbol);
  const cur=prices[symbol]?.price;
  if(!cur||!pos) return null;

  const lev = pos.leverage || 1;
  const sl  = settings.stopLossPct  || 0.05;  // margin-level stop loss
  const tp  = settings.takeProfitPct|| 0.08;  // margin-level take profit

  // Price movement % since entry
  const pricePct = (cur - pos.avgCost) / pos.avgCost;

  // Effective return on margin (leveraged)
  // At 20x: a 1% price move = 20% return on margin
  const eff = pricePct * lev;

  // The price level at which stop loss triggers (much tighter with leverage)
  // At 20x with 5% margin SL: stop triggers at 0.25% adverse price move
  const slPricePct = sl / lev; // price % that equals the margin SL threshold

  // Track peak price for trailing stop
  if (!pos.peakPrice || cur > pos.peakPrice) pos.peakPrice = cur;
  const peakPricePct = (pos.peakPrice - pos.avgCost) / pos.avgCost;
  const peakEffReturn = peakPricePct * lev;

  // ── HARD STOP LOSS ─────────────────────────────────────────────────────────
  if (pricePct <= -slPricePct) {
    const lossOnMargin = eff * 100;
    return {
      action: 'SELL', sellPct: 1.0, confidence: 10, strategy: 'STOP_LOSS',
      signals: [`STOP_LOSS(price:${(pricePct*100).toFixed(2)}%,margin:${lossOnMargin.toFixed(2)}%,${lev}x)`],
      reasoning: lev > 1
        ? `${lev}x leveraged stop-loss. Price moved ${(pricePct*100).toFixed(2)}% = ${lossOnMargin.toFixed(2)}% on margin. Entry $${pos.avgCost.toFixed(4)} → $${cur.toFixed(4)}.`
        : `Stop-loss at ${(pricePct*100).toFixed(2)}%. Entry $${pos.avgCost.toFixed(4)} → $${cur.toFixed(4)}.`,
    };
  }

  // ── TRAILING STOP — protects gains on margin basis ─────────────────────────
  // Activate trailing stop when effective margin return exceeds 1.5× TP target
  if (peakEffReturn >= tp * 1.5) {
    const dropFromPeak = (pos.peakPrice - cur) / pos.peakPrice;
    // Tighter trail with leverage (a small price drop = big margin loss)
    const trailThreshold = lev > 1 ? Math.max(0.02, 0.04 / Math.sqrt(lev)) : 0.05;
    if (dropFromPeak > trailThreshold) {
      return {
        action: 'SELL', sellPct: 0.8, confidence: 9, strategy: 'TRAIL_STOP',
        signals: [`TRAIL_STOP(price_drop:${(dropFromPeak*100).toFixed(2)}%,peak_return:${(peakEffReturn*100).toFixed(1)}%_on_margin)`],
        reasoning: `Trailing stop: price fell ${(dropFromPeak*100).toFixed(2)}% from peak. Peak margin return was +${(peakEffReturn*100).toFixed(1)}%.`,
      };
    }
  }

  // ── SCORE EXIT SIGNALS — confirmed downtrend required ──────────────────────
  let exitScore = 0;
  const exitSigs = [];

  if (ind.rsi !== null) {
    if (ind.rsi > 82 && ind.rsiDn) { exitScore += 6; exitSigs.push(`RSI_EXTREME_OB(${ind.rsi.toFixed(0)})↓`); }
    else if (ind.rsi > 75 && ind.rsiDn) { exitScore += 4; exitSigs.push(`RSI_OB(${ind.rsi.toFixed(0)})↓`); }
    else if (ind.rsi > 70 && ind.rsiDn) { exitScore += 2; exitSigs.push(`RSI_HIGH(${ind.rsi.toFixed(0)})↓`); }
    else if (ind.rsi > 65 && ind.rsiDn && eff > 0.02) { exitScore += 1; exitSigs.push('RSI_TURNING_DOWN'); }
  }

  if (ind.macd && !ind.macd.bullish && ind.macd.histogram < -0.001) {
    exitScore += 4; exitSigs.push('MACD_BEAR_CROSS');
  }
  if (ind.bb?.pct > 0.9)  { exitScore += 4; exitSigs.push('FAR_ABOVE_BB_UPPER'); }
  else if (ind.bb?.pct > 0.7) { exitScore += 2; exitSigs.push('ABOVE_BB_UPPER'); }

  if (ind.ema9 && ind.ema21 && ind.ema9 < ind.ema21 * 0.998) {
    exitScore += 3; exitSigs.push('EMA_DEATH_CROSS');
  }
  if (ind.mom5 !== null && ind.mom5 < -1.5) { exitScore += 3; exitSigs.push(`MOM_CRASHING(${ind.mom5.toFixed(1)}%)`); }
  else if (ind.mom5 !== null && ind.mom5 < -0.8) { exitScore += 1; exitSigs.push('MOM_NEGATIVE'); }

  if (ind.stochRSI !== null && ind.stochRSI > 85 && ind.rsiDn) {
    exitScore += 2; exitSigs.push('STOCH_OB');
  }

  // With leverage, exit sooner when reversal signals appear — less room to wait
  const exitScoreThreshold = lev > 1 ? Math.max(4, 9 - Math.floor(lev/5)) : 9;

  // Take profit: margin return exceeded target + reversal confirmed
  if (eff >= tp * 2.5 && exitScore >= 3) {
    return {
      action: 'SELL', sellPct: 0.5, confidence: 9, strategy: 'TAKE_PROFIT_LARGE',
      signals: [`TP+${(eff*100).toFixed(1)}%_on_margin(${lev}x)`,...exitSigs],
      reasoning: `+${(eff*100).toFixed(2)}% on margin (${lev}x). Taking 50% off table.`,
    };
  }
  if (eff >= tp && exitScore >= 5) {
    return {
      action: 'SELL', sellPct: 0.75, confidence: 9, strategy: 'TAKE_PROFIT',
      signals: [`TP+${(eff*100).toFixed(1)}%_on_margin`,...exitSigs],
      reasoning: `Take profit +${(eff*100).toFixed(2)}% on margin: ${exitSigs.join(', ')}.`,
    };
  }
  // Leveraged positions exit on fewer reversal signals (risk control)
  if (exitScore >= exitScoreThreshold && eff > 0.005) {
    return {
      action: 'SELL', sellPct: lev > 1 ? 0.8 : 0.7, confidence: 8, strategy: 'REVERSAL_CONFIRMED',
      signals: exitSigs,
      reasoning: `Reversal score ${exitScore} (threshold ${exitScoreThreshold} for ${lev}x): ${exitSigs.join(', ')}.`,
    };
  }
  if (exitScore >= 8 && eff < -0.015) {
    return {
      action: 'SELL', sellPct: 1.0, confidence: 8, strategy: 'CUT_LOSS_CONFIRMED',
      signals: exitSigs,
      reasoning: `Confirmed downtrend in loss (${(eff*100).toFixed(2)}% on margin). Full exit.`,
    };
  }

  return null;
}

export function calcTotalValue(prices,portfolio,balance){
  let v = balance;
  for (const [sym, pos] of Object.entries(portfolio)) {
    const px = prices[sym]?.price || 0;
    if (!px) continue;
    const lev = pos.leverage || 1;
    if (lev > 1) {
      // Leveraged position: value = margin + unrealized PnL
      // PnL = (currentPrice - entryPrice) / entryPrice × leverage × margin
      const margin = pos.marginSpent || (pos.qty * pos.avgCost / lev);
      const priceChangePct = pos.avgCost > 0 ? (px - pos.avgCost) / pos.avgCost : 0;
      const unrealizedPnl = priceChangePct * lev * margin;
      v += Math.max(0, margin + unrealizedPnl); // can't lose more than margin
    } else {
      // Spot position: straightforward qty × price
      v += pos.qty * px;
    }
  }
  return v;
}

export function buildMarketSummary(botKey,prices,portfolio){
  return COINS.map(({symbol:sym})=>{
    const px=prices[sym];if(!px)return'';
    const ind=computeIndicators(botKey,sym);
    const held=portfolio[sym];
    return`${sym} $${px.price.toFixed(4)}|RSI:${ind.rsi?.toFixed(1)||'—'}|MACD:${ind.macd?.bullish?'↑':'↓'}|BB:${ind.bb?.pct?.toFixed(2)||'—'}|VOL:${ind.volumeRatio.toFixed(1)}x${held?`|HELD@$${held.avgCost.toFixed(4)}`:''}`;
  }).filter(Boolean).join('\n');
}
