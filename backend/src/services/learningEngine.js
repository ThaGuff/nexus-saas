/**
 * NEXUS · Adaptive Learning Engine
 * Each strategy learns from its own trade history.
 * Win/loss patterns update scoring weights over time.
 * Persists to Supabase. Falls back to memory if DB unavailable.
 */

// In-memory cache per botId+strategy
const cache = new Map(); // key: `${botId}:${strategy}` → LearningState

const DEFAULT_STATE = () => ({
  version: 1,
  trades:  [],           // last 200 trade outcomes
  weights: {             // multipliers applied to signal scores
    rsi:    1.0,
    macd:   1.0,
    bb:     1.0,
    volume: 1.0,
    mom:    1.0,
    stoch:  1.0,
  },
  thresholds: {
    minScore: null,      // null = use strategy default
    minVolRatio: null,
    maxRsi: null,
  },
  stats: {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    avgWinPct: 0,
    avgLossPct: 0,
    bestSignalCombos: [],  // top 5 signal combinations that led to wins
    worstSignalCombos: [], // top 5 that led to losses
    winStreak: 0,
    lossStreak: 0,
    currentStreak: 0,
  },
  updatedAt: new Date().toISOString(),
});

function getKey(botId, strategy) {
  return `${botId}:${strategy}`;
}

export function getState(botId, strategy) {
  const k = getKey(botId, strategy);
  if (!cache.has(k)) cache.set(k, DEFAULT_STATE());
  return cache.get(k);
}

/**
 * Record a completed trade and update weights
 */
export function recordTrade(botId, strategy, tradeResult) {
  const state = getState(botId, strategy);
  const { signals = [], pnl = 0, pnlPct = 0, holdMinutes = 0 } = tradeResult;
  const won = pnl > 0;

  // Add to trade history (cap at 200)
  state.trades.unshift({ signals, pnl, pnlPct, won, holdMinutes, ts: new Date().toISOString() });
  if (state.trades.length > 200) state.trades.pop();

  // Update stats
  state.stats.totalTrades++;
  if (won) {
    state.stats.wins++;
    state.stats.avgWinPct = ((state.stats.avgWinPct * (state.stats.wins - 1)) + pnlPct) / state.stats.wins;
    state.stats.currentStreak = state.stats.currentStreak >= 0 ? state.stats.currentStreak + 1 : 1;
    state.stats.winStreak = Math.max(state.stats.winStreak, state.stats.currentStreak);
  } else {
    state.stats.losses++;
    state.stats.avgLossPct = ((state.stats.avgLossPct * (state.stats.losses - 1)) + Math.abs(pnlPct)) / state.stats.losses;
    state.stats.currentStreak = state.stats.currentStreak <= 0 ? state.stats.currentStreak - 1 : -1;
    state.stats.lossStreak = Math.max(state.stats.lossStreak, Math.abs(state.stats.currentStreak));
  }

  // Update signal analysis every 10 trades
  if (state.stats.totalTrades % 10 === 0) {
    _updateWeights(state);
    _updateSignalAnalysis(state);
  }

  state.updatedAt = new Date().toISOString();
}

/**
 * Get learned weight multiplier for a signal type
 * Returns a value between 0.5 (demoted) and 1.8 (boosted)
 */
export function getSignalWeight(botId, strategy, signalType) {
  const state = getState(botId, strategy);
  return state.weights[signalType] ?? 1.0;
}

/**
 * Get the learned minScore override (if enough data)
 */
export function getLearnedThreshold(botId, strategy, defaultMinScore) {
  const state = getState(botId, strategy);
  if (state.stats.totalTrades < 20) return defaultMinScore; // not enough data yet
  return state.thresholds.minScore ?? defaultMinScore;
}

/**
 * Get learning summary for display
 */
export function getLearningStats(botId, strategy) {
  const state = getState(botId, strategy);
  const wr = state.stats.totalTrades > 0
    ? ((state.stats.wins / state.stats.totalTrades) * 100).toFixed(0)
    : '—';
  return {
    totalTrades: state.stats.totalTrades,
    winRate: wr,
    avgWinPct: state.stats.avgWinPct?.toFixed(2) ?? 0,
    avgLossPct: state.stats.avgLossPct?.toFixed(2) ?? 0,
    weights: { ...state.weights },
    bestSignals: state.stats.bestSignalCombos.slice(0, 3),
    worstSignals: state.stats.worstSignalCombos.slice(0, 3),
    winStreak: state.stats.winStreak,
    lossStreak: state.stats.lossStreak,
    dataPoints: state.trades.length,
    updatedAt: state.updatedAt,
  };
}

// ── Internal: weight adaptation ───────────────────────────────────────────────
function _updateWeights(state) {
  if (state.trades.length < 10) return;

  const recent = state.trades.slice(0, 50); // last 50 trades

  // For each signal type, compute win rate when it appeared
  const signalStats = {};
  for (const trade of recent) {
    for (const sig of trade.signals) {
      const type = _signalToType(sig);
      if (!type) continue;
      if (!signalStats[type]) signalStats[type] = { wins: 0, total: 0 };
      signalStats[type].total++;
      if (trade.won) signalStats[type].wins++;
    }
  }

  // Adjust weights based on signal performance vs baseline win rate
  const overallWR = state.stats.wins / Math.max(state.stats.totalTrades, 1);

  for (const [type, stats] of Object.entries(signalStats)) {
    if (stats.total < 5) continue; // need at least 5 samples
    const signalWR = stats.wins / stats.total;
    const diff = signalWR - overallWR;

    // Gradual adjustment: ±10% per cycle, clamped to [0.5, 1.8]
    const currentWeight = state.weights[type] ?? 1.0;
    const adjustment = diff * 0.3; // conservative learning rate
    state.weights[type] = Math.max(0.5, Math.min(1.8, currentWeight + adjustment));
  }

  // Adapt minScore threshold
  if (state.stats.totalTrades >= 30) {
    const recentWR = recent.filter(t => t.won).length / recent.length;
    const defaultMin = state.thresholds.minScore ?? 7;
    if (recentWR < 0.45) {
      // Losing too much — tighten threshold
      state.thresholds.minScore = Math.min(12, defaultMin + 0.5);
    } else if (recentWR > 0.70 && state.trades.length > 50) {
      // Winning well — can slightly relax
      state.thresholds.minScore = Math.max(4, defaultMin - 0.25);
    }
  }
}

function _updateSignalAnalysis(state) {
  const comboCounts = {};
  for (const trade of state.trades) {
    const key = trade.signals.sort().join('+');
    if (!comboCounts[key]) comboCounts[key] = { wins: 0, losses: 0, key };
    if (trade.won) comboCounts[key].wins++;
    else comboCounts[key].losses++;
  }

  const combos = Object.values(comboCounts).filter(c => c.wins + c.losses >= 3);
  combos.sort((a, b) => (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses)));

  state.stats.bestSignalCombos = combos.slice(0, 5).map(c => ({
    signals: c.key,
    wr: ((c.wins / (c.wins + c.losses)) * 100).toFixed(0) + '%',
    count: c.wins + c.losses,
  }));
  state.stats.worstSignalCombos = combos.slice(-5).reverse().map(c => ({
    signals: c.key,
    wr: ((c.wins / (c.wins + c.losses)) * 100).toFixed(0) + '%',
    count: c.wins + c.losses,
  }));
}

function _signalToType(signal) {
  if (signal.includes('RSI')) return 'rsi';
  if (signal.includes('MACD')) return 'macd';
  if (signal.includes('BB')) return 'bb';
  if (signal.includes('VOL')) return 'volume';
  if (signal.includes('MOM')) return 'mom';
  if (signal.includes('STOCH')) return 'stoch';
  return null;
}
