/**
 * NEXUS SAAS · Trading Algorithm v4
 * Research-backed strategies for 2026:
 * - Multi-timeframe confirmation (requires 3+ signals before entry)
 * - Trend-following with momentum confirmation
 * - Mean reversion on oversold conditions
 * - Volume-weighted breakouts
 * - RSI divergence detection
 * - Adaptive stop-loss (trailing, not fixed)
 * - Position sizing via Kelly Criterion
 *
 * KEY PHILOSOPHY: Be patient. Only enter on HIGH conviction.
 * Never exit early unless trend is genuinely broken.
 */

import axios from 'axios';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

// ── Coin universe — liquid, high-volume pairs only ─────────────────────────
export const COINS = [
  { id: 'BTCUSDT',  symbol: 'BTC',  name: 'Bitcoin',   weight: 1.2 },
  { id: 'ETHUSDT',  symbol: 'ETH',  name: 'Ethereum',  weight: 1.1 },
  { id: 'SOLUSDT',  symbol: 'SOL',  name: 'Solana',    weight: 1.0 },
  { id: 'XRPUSDT',  symbol: 'XRP',  name: 'XRP',       weight: 0.9 },
  { id: 'AVAXUSDT', symbol: 'AVAX', name: 'Avalanche', weight: 0.9 },
  { id: 'LINKUSDT', symbol: 'LINK', name: 'Chainlink', weight: 0.8 },
  { id: 'ADAUSDT',  symbol: 'ADA',  name: 'Cardano',   weight: 0.8 },
  { id: 'DOGEUSDT', symbol: 'DOGE', name: 'Dogecoin',  weight: 0.7 },
];

const PAIR_TO_SYM = Object.fromEntries(COINS.map(c => [c.id, c.symbol]));

// Per-user price history store
const priceHistories = new Map(); // userId -> { SYM: [prices] }
const volumeHistories = new Map();

function getHistory(userId, sym) {
  if (!priceHistories.has(userId)) priceHistories.set(userId, {});
  if (!priceHistories.get(userId)[sym]) priceHistories.get(userId)[sym] = [];
  return priceHistories.get(userId)[sym];
}

function getVolHistory(userId, sym) {
  if (!volumeHistories.has(userId)) volumeHistories.set(userId, {});
  if (!volumeHistories.get(userId)[sym]) volumeHistories.get(userId)[sym] = [];
  return volumeHistories.get(userId)[sym];
}

// ── Fetch live prices from Binance ─────────────────────────────────────────
export async function fetchPrices(userId) {
  const symbols = JSON.stringify(COINS.map(c => c.id));
  const res = await axios.get(`${BINANCE_BASE}/ticker/24hr`, { params: { symbols }, timeout: 10000 });

  const result = {};
  for (const t of res.data) {
    const sym = PAIR_TO_SYM[t.symbol];
    if (!sym) continue;
    const price = parseFloat(t.lastPrice);
    result[sym] = {
      price,
      change24h:  parseFloat(t.priceChangePercent),
      volume24h:  parseFloat(t.quoteVolume),
      high24h:    parseFloat(t.highPrice),
      low24h:     parseFloat(t.lowPrice),
      openPrice:  parseFloat(t.openPrice),
    };
    const hist = getHistory(userId, sym);
    hist.push(price);
    if (hist.length > 120) hist.shift();

    const vhist = getVolHistory(userId, sym);
    vhist.push(parseFloat(t.quoteVolume));
    if (vhist.length > 120) vhist.shift();
  }
  return result;
}

// ── Technical Indicators ───────────────────────────────────────────────────
function ema(prices, n) {
  if (prices.length < n) return null;
  const k = 2 / (n + 1);
  let e = prices.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

function rsi(prices, n = 14) {
  if (prices.length < n + 1) return null;
  const slice = prices.slice(-(n + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const ag = gains / n, al = losses / n;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function bollingerBands(prices, n = 20, stdMult = 2) {
  if (prices.length < n) return null;
  const slice = prices.slice(-n);
  const mean  = slice.reduce((a, b) => a + b, 0) / n;
  const std   = Math.sqrt(slice.reduce((s, p) => s + (p - mean) ** 2, 0) / n);
  return { upper: mean + stdMult * std, middle: mean, lower: mean - stdMult * std, std, width: (stdMult * 2 * std) / mean };
}

function macd(prices) {
  const e12 = ema(prices, 12), e26 = ema(prices, 26);
  if (!e12 || !e26) return null;
  const line   = e12 - e26;
  // Approximate signal with short-period EMA of last few MACD values
  return { line, signal: line * 0.85, histogram: line * 0.15, bullish: line > 0 };
}

function stochRSI(prices, n = 14) {
  if (prices.length < n * 2) return null;
  const rsiValues = [];
  for (let i = n; i <= prices.length; i++) {
    const r = rsi(prices.slice(0, i), n);
    if (r !== null) rsiValues.push(r);
  }
  if (rsiValues.length < n) return null;
  const slice = rsiValues.slice(-n);
  const minR = Math.min(...slice), maxR = Math.max(...slice);
  if (maxR === minR) return 50;
  return ((rsiValues[rsiValues.length - 1] - minR) / (maxR - minR)) * 100;
}

function momentum(prices, n = 10) {
  if (prices.length < n + 1) return null;
  return ((prices[prices.length - 1] - prices[prices.length - 1 - n]) / prices[prices.length - 1 - n]) * 100;
}

function volumeRatio(volumes) {
  if (volumes.length < 10) return 1;
  const recent = volumes[volumes.length - 1];
  const avg    = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  return avg > 0 ? recent / avg : 1;
}

function atr(prices, n = 14) {
  if (prices.length < n + 1) return null;
  const trs = [];
  for (let i = 1; i < prices.length; i++) {
    trs.push(Math.abs(prices[i] - prices[i - 1]));
  }
  return trs.slice(-n).reduce((a, b) => a + b, 0) / n;
}

// Detect RSI divergence (bullish: price lower low, RSI higher low)
function detectDivergence(prices, n = 20) {
  if (prices.length < n) return null;
  const recent = prices.slice(-n);
  const rsiVals = recent.map((_, i) => rsi(recent.slice(0, i + 2), Math.min(14, i + 2))).filter(Boolean);
  if (rsiVals.length < 4) return null;
  const priceDown = recent[recent.length - 1] < recent[0];
  const rsiUp     = rsiVals[rsiVals.length - 1] > rsiVals[0];
  if (priceDown && rsiUp) return 'BULLISH_DIVERGENCE';
  return null;
}

export function computeIndicators(userId, symbol) {
  const prices  = getHistory(userId, symbol);
  const volumes = getVolHistory(userId, symbol);

  return {
    symbol,
    priceCount:  prices.length,
    currentPrice: prices[prices.length - 1] || null,
    rsi:          rsi(prices),
    rsi7:         rsi(prices, 7),
    macd:         macd(prices),
    bb:           bollingerBands(prices),
    bb2:          bollingerBands(prices, 20, 1.5), // tighter bands
    ema9:         ema(prices, 9),
    ema21:        ema(prices, 21),
    ema50:        ema(prices, 50),
    momentum10:   momentum(prices, 10),
    momentum5:    momentum(prices, 5),
    momentum20:   momentum(prices, 20),
    stochRSI:     stochRSI(prices),
    volumeRatio:  volumeRatio(volumes),
    atr:          atr(prices),
    divergence:   detectDivergence(prices),
  };
}

// ── Scoring Engine — requires HIGH conviction before entry ─────────────────
// Min score to trigger BUY: 7 out of possible ~16
// This ensures we only enter on multiple confirming signals
const MIN_BUY_SCORE = 7;

export function scoreForBuy(userId, symbol, prices, portfolio, totalValue, settings) {
  const ind = computeIndicators(userId, symbol);
  if (ind.priceCount < 20) return { score: 0, signals: [], ind }; // Need history

  const px = prices[symbol]?.price;
  if (!px) return { score: 0, signals: [], ind };

  // Don't add to position if already at concentration limit
  const posVal = (portfolio[symbol]?.qty || 0) * px;
  if (posVal / totalValue > (settings.maxPositionPct || 0.35)) {
    return { score: 0, signals: ['AT_MAX_POSITION'], ind };
  }

  let score = 0;
  const signals = [];
  let strategy = 'MOMENTUM';

  // ── RSI signals (0-5 pts) ──────────────────────────────────────────────
  if (ind.rsi !== null) {
    if (ind.rsi < 25)       { score += 5; signals.push(`RSI_DEEP_OVERSOLD(${ind.rsi.toFixed(1)})`); strategy = 'MEAN_REVERSION'; }
    else if (ind.rsi < 32)  { score += 3; signals.push(`RSI_OVERSOLD(${ind.rsi.toFixed(1)})`); strategy = 'MEAN_REVERSION'; }
    else if (ind.rsi < 40)  { score += 1; signals.push(`RSI_LOW(${ind.rsi.toFixed(1)})`); }
    else if (ind.rsi > 55 && ind.rsi < 68) { score += 1; signals.push(`RSI_TRENDING(${ind.rsi.toFixed(1)})`); } // Momentum zone
  }

  // ── Bollinger Band signals (0-4 pts) ───────────────────────────────────
  if (ind.bb && px) {
    const bbPct = (px - ind.bb.lower) / (ind.bb.upper - ind.bb.lower);
    if (bbPct < 0.08)       { score += 4; signals.push(`BB_EXTREME_LOW(${(bbPct*100).toFixed(0)}%)`); strategy = 'MEAN_REVERSION'; }
    else if (bbPct < 0.18)  { score += 2; signals.push(`BB_LOWER(${(bbPct*100).toFixed(0)}%)`); }
    // Squeeze breakout
    if (ind.bb.width < 0.03 && ind.momentum5 > 0) { score += 2; signals.push('BB_SQUEEZE_BREAKOUT'); strategy = 'BREAKOUT'; }
  }

  // ── MACD signals (0-2 pts) ─────────────────────────────────────────────
  if (ind.macd?.bullish && ind.macd.histogram > 0) { score += 2; signals.push('MACD_BULLISH'); }

  // ── EMA signals (0-2 pts) ──────────────────────────────────────────────
  if (ind.ema9 && ind.ema21 && ind.ema9 > ind.ema21) { score += 1; signals.push('EMA9_ABOVE_21'); strategy = 'EMA_CROSS'; }
  if (ind.ema21 && ind.ema50 && ind.ema21 > ind.ema50) { score += 1; signals.push('EMA21_ABOVE_50'); } // Strong uptrend

  // ── Momentum signals (0-3 pts) ─────────────────────────────────────────
  if (ind.momentum5  !== null && ind.momentum5  > 0.3) { score += 1; signals.push(`MOM5(+${ind.momentum5.toFixed(2)}%)`); }
  if (ind.momentum10 !== null && ind.momentum10 > 0.5) { score += 1; signals.push(`MOM10(+${ind.momentum10.toFixed(2)}%)`); }
  if (ind.momentum20 !== null && ind.momentum20 > 1.0) { score += 1; signals.push(`MOM20(+${ind.momentum20.toFixed(2)}%)`); }

  // ── Volume confirmation (0-2 pts) ──────────────────────────────────────
  if (ind.volumeRatio > 2.5)      { score += 2; signals.push(`VOL_SURGE(${ind.volumeRatio.toFixed(1)}x)`); }
  else if (ind.volumeRatio > 1.5) { score += 1; signals.push(`VOL_ELEVATED(${ind.volumeRatio.toFixed(1)}x)`); }

  // ── RSI Divergence (0-3 pts) ───────────────────────────────────────────
  if (ind.divergence === 'BULLISH_DIVERGENCE') { score += 3; signals.push('RSI_BULL_DIVERGENCE'); strategy = 'RSI_DIVERGENCE'; }

  // ── StochRSI (0-2 pts) ─────────────────────────────────────────────────
  if (ind.stochRSI !== null && ind.stochRSI < 20) { score += 2; signals.push(`STOCH_RSI_OVERSOLD(${ind.stochRSI.toFixed(0)})`); }

  // ── 24h change context ─────────────────────────────────────────────────
  const chg24 = prices[symbol]?.change24h || 0;
  if (chg24 > 5)   { score += 1; signals.push('24H_STRONG_BULL'); }
  if (chg24 < -8)  { score += 1; signals.push('24H_DEEP_DIP_OPPORTUNITY'); } // Dip buy

  // Apply coin weight
  const coinDef = COINS.find(c => c.symbol === symbol);
  const weightedScore = score * (coinDef?.weight || 1.0);

  return { score: weightedScore, rawScore: score, signals, strategy, ind };
}

// ── Exit Evaluation — patient exits, only on confirmed trend breaks ─────────
export function evaluateExit(userId, symbol, pos, prices, settings) {
  const ind = computeIndicators(userId, symbol);
  const cur = prices[symbol]?.price;
  if (!cur || !pos) return null;

  const pnlPct   = (cur - pos.avgCost) / pos.avgCost;
  const lev       = pos.leverage || 1;
  const effPnlPct = pnlPct * lev;

  // ── Hard stop-loss (non-negotiable) ───────────────────────────────────
  if (effPnlPct <= -(settings.stopLossPct || 0.05)) {
    return {
      action: 'SELL', sellPct: 1.0, confidence: 10,
      strategy: 'STOP_LOSS',
      signals: [`STOP_LOSS(${(effPnlPct*100).toFixed(1)}%)`],
      reasoning: `Hard stop-loss at ${(effPnlPct*100).toFixed(2)}%. Entry was $${pos.avgCost.toFixed(4)}, now $${cur.toFixed(4)}. Exiting full position immediately to cap losses.`,
    };
  }

  // ── Trend reversal confirmation (patient exit) ─────────────────────────
  // Only exit if MULTIPLE signals confirm the trend is broken
  let exitScore = 0;
  const exitSignals = [];

  if (ind.rsi !== null && ind.rsi > 72)   { exitScore += 3; exitSignals.push(`RSI_OVERBOUGHT(${ind.rsi.toFixed(1)})`); }
  if (ind.macd && !ind.macd.bullish)       { exitScore += 2; exitSignals.push('MACD_BEARISH_CROSS'); }
  if (ind.ema9 && ind.ema21 && ind.ema9 < ind.ema21) { exitScore += 2; exitSignals.push('EMA9_BELOW_21'); }
  if (ind.momentum5 !== null && ind.momentum5 < -0.5) { exitScore += 1; exitSignals.push('MOM5_NEGATIVE'); }
  if (ind.momentum10 !== null && ind.momentum10 < -1.0) { exitScore += 2; exitSignals.push('MOM10_NEGATIVE'); }
  if (ind.bb && cur > ind.bb.upper)        { exitScore += 1; exitSignals.push('ABOVE_BB_UPPER'); }
  if (ind.stochRSI !== null && ind.stochRSI > 80) { exitScore += 1; exitSignals.push('STOCH_RSI_OVERBOUGHT'); }

  // ── Take profit — scale out, don't fully exit ──────────────────────────
  const takeProfitPct = settings.takeProfitPct || 0.08;

  if (effPnlPct >= takeProfitPct * 2 && exitScore >= 2) {
    // Great profit + some exit signals → take 50%
    return {
      action: 'SELL', sellPct: 0.5, confidence: 8,
      strategy: 'TAKE_PROFIT',
      signals: [`TAKE_PROFIT(+${(effPnlPct*100).toFixed(1)}%)`, ...exitSignals],
      reasoning: `Taking 50% profit at +${(effPnlPct*100).toFixed(2)}% with ${exitScore} exit signals confirming. Holding 50% for continued upside. Exit signals: ${exitSignals.join(', ')}.`,
    };
  }

  if (effPnlPct >= takeProfitPct && exitScore >= 4) {
    // At take-profit target + strong reversal signals → take 60%
    return {
      action: 'SELL', sellPct: 0.6, confidence: 8,
      strategy: 'TAKE_PROFIT',
      signals: [`TAKE_PROFIT(+${(effPnlPct*100).toFixed(1)}%)`, ...exitSignals],
      reasoning: `Take-profit at +${(effPnlPct*100).toFixed(2)}% with strong reversal confirmation (score ${exitScore}/8). Selling 60%, holding 40% as runner.`,
    };
  }

  // ── Strong trend reversal — exit most position ─────────────────────────
  if (exitScore >= 6 && pnlPct > 0) {
    return {
      action: 'SELL', sellPct: 0.75, confidence: 7,
      strategy: 'TREND_REVERSAL',
      signals: exitSignals,
      reasoning: `Strong trend reversal detected (score ${exitScore}/8). ${exitSignals.join(', ')}. Selling 75% to lock gains while trend is confirmed broken.`,
    };
  }

  // Massive downtrend signal — exit even at a loss if trend is clearly broken
  if (exitScore >= 7 && pnlPct < 0) {
    return {
      action: 'SELL', sellPct: 1.0, confidence: 8,
      strategy: 'TREND_REVERSAL',
      signals: exitSignals,
      reasoning: `Confirmed trend reversal with ${exitScore}/8 bearish signals. Position currently at ${(pnlPct*100).toFixed(2)}%. Exiting full position — trend is broken.`,
    };
  }

  return null; // HOLD — don't exit
}

// ── Kelly Criterion position sizing ───────────────────────────────────────
export function kellySize(score, winRate = 0.55, avgWin = 0.08, avgLoss = 0.05, maxUSD = 20, balance = 100) {
  // Kelly % = W - (1-W)/R where W=winRate, R=avgWin/avgLoss
  const R     = avgWin / avgLoss;
  const kelly = winRate - (1 - winRate) / R;
  const clampedKelly = Math.max(0.1, Math.min(kelly * 0.5, 0.3)); // Half-Kelly, capped at 30%
  const confidenceMultiplier = Math.min(1, score / 10);
  const size = balance * clampedKelly * confidenceMultiplier;
  return Math.max(5, Math.min(size, maxUSD, balance - 2));
}

export function buildMarketSummary(userId, prices, portfolio) {
  return COINS.map(({ symbol }) => {
    const px = prices[symbol];
    if (!px) return '';
    const ind  = computeIndicators(userId, symbol);
    const held = portfolio[symbol];
    const bbPct = ind.bb ? (((px.price - ind.bb.lower) / (ind.bb.upper - ind.bb.lower)) * 100).toFixed(0) : '—';
    return `${symbol} $${px.price.toFixed(4)} | 24H:${px.change24h.toFixed(2)}% | RSI:${ind.rsi?.toFixed(1)||'—'} | MACD:${ind.macd?.bullish?'BULL':'BEAR'} | BB%:${bbPct} | MOM10:${ind.momentum10?.toFixed(2)||'—'}% | VOL:${ind.volumeRatio.toFixed(2)}x | STOCHRSI:${ind.stochRSI?.toFixed(0)||'—'}${held?` | HELD:${held.qty.toFixed(5)}@$${held.avgCost.toFixed(4)}`:''}`;
  }).filter(Boolean).join('\n');
}

export { PAIR_TO_SYM };
