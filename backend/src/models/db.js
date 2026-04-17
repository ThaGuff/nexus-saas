/**
 * NEXUS SAAS · Database Layer
 * Supabase PostgreSQL — fast, reliable, no JSON file I/O
 * Falls back gracefully if Supabase not configured
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Supabase REST client (no SDK needed) ─────────────────────────────────────
async function sb(method, table, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (opts.query) url += `?${opts.query}`;

  const res = await fetch(url, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || (method === 'POST' ? 'return=representation' : 'return=representation'),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${err}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── User helpers ──────────────────────────────────────────────────────────────
function rowToUser(row) {
  if (!row) return null;
  return {
    id:                 row.id,
    email:              row.email,
    passwordHash:       row.password_hash,
    firstName:          row.first_name || '',
    lastName:           row.last_name  || '',
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
    plan:               row.plan || 'trial',
    trialEndsAt:        row.trial_ends_at,
    subscriptionId:     row.subscription_id,
    customerId:         row.customer_id,
    subscriptionStatus: row.subscription_status || 'trialing',
    botEnabled:         row.bot_enabled || false,
    botMode:            row.bot_mode || 'PAPER',
    startingBalance:    parseFloat(row.starting_balance) || 100,
    maxTradeUSD:        parseFloat(row.max_trade_usd)    || 20,
    stopLossPct:        parseFloat(row.stop_loss_pct)    || 0.05,
    takeProfitPct:      parseFloat(row.take_profit_pct)  || 0.08,
    maxDrawdownPct:     parseFloat(row.max_drawdown_pct) || 0.20,
    maxPositionPct:     parseFloat(row.max_position_pct) || 0.35,
    leverageEnabled:    row.leverage_enabled || false,
    maxLeverage:        row.max_leverage || 3,
    tradingStrategy:    row.trading_strategy || 'PRECISION',
    exchanges:          row.exchanges || {},
    botState: {
      balance:      parseFloat(row.bot_balance)    || parseFloat(row.starting_balance) || 100,
      startingBalance: parseFloat(row.starting_balance) || 100,
      portfolio:    row.bot_portfolio   || {},
      peakValue:    parseFloat(row.bot_peak_value) || parseFloat(row.starting_balance) || 100,
      cycleCount:   row.bot_cycle_count || 0,
      totalFeesUSD: parseFloat(row.bot_total_fees) || 0,
      status:       row.bot_status      || 'idle',
      startedAt:    row.bot_started_at,
      lastCycleAt:  row.bot_last_cycle_at,
      mode:         row.bot_mode || 'PAPER',
      trades:       [], // loaded separately
    },
  };
}

function userToRow(data) {
  const row = {};
  if (data.email            != null) row.email              = data.email.toLowerCase();
  if (data.passwordHash     != null) row.password_hash      = data.passwordHash;
  if (data.firstName        != null) row.first_name         = data.firstName;
  if (data.lastName         != null) row.last_name          = data.lastName;
  if (data.plan             != null) row.plan               = data.plan;
  if (data.trialEndsAt      != null) row.trial_ends_at      = data.trialEndsAt;
  if (data.subscriptionId   != null) row.subscription_id    = data.subscriptionId;
  if (data.customerId       != null) row.customer_id        = data.customerId;
  if (data.subscriptionStatus!=null) row.subscription_status= data.subscriptionStatus;
  if (data.botEnabled       != null) row.bot_enabled        = data.botEnabled;
  if (data.botMode          != null) row.bot_mode           = data.botMode;
  if (data.startingBalance  != null) row.starting_balance   = data.startingBalance;
  if (data.maxTradeUSD      != null) row.max_trade_usd      = data.maxTradeUSD;
  if (data.stopLossPct      != null) row.stop_loss_pct      = data.stopLossPct;
  if (data.takeProfitPct    != null) row.take_profit_pct    = data.takeProfitPct;
  if (data.maxDrawdownPct   != null) row.max_drawdown_pct   = data.maxDrawdownPct;
  if (data.maxPositionPct   != null) row.max_position_pct   = data.maxPositionPct;
  if (data.leverageEnabled  != null) row.leverage_enabled   = data.leverageEnabled;
  if (data.maxLeverage      != null) row.max_leverage       = data.maxLeverage;
  if (data.tradingStrategy  != null) row.trading_strategy   = data.tradingStrategy;
  if (data.exchanges        != null) row.exchanges          = data.exchanges;
  return row;
}

export const Users = {
  all: async () => {
    const rows = await sb('GET', 'users', { query: 'select=*&order=created_at.asc' });
    return (rows || []).map(rowToUser);
  },

  findById: async (id) => {
    const rows = await sb('GET', 'users', { query: `select=*&id=eq.${id}&limit=1` });
    return rows?.[0] ? rowToUser(rows[0]) : null;
  },

  findByEmail: async (email) => {
    const rows = await sb('GET', 'users', { query: `select=*&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1` });
    return rows?.[0] ? rowToUser(rows[0]) : null;
  },

  create: async (data) => {
    const trialEndsAt = new Date(Date.now() + parseInt(process.env.TRIAL_DAYS || '14') * 86400000).toISOString();
    const row = {
      id:                 data.id,
      email:              data.email.toLowerCase(),
      password_hash:      data.passwordHash,
      first_name:         data.firstName || '',
      last_name:          data.lastName  || '',
      plan:               'trial',
      trial_ends_at:      trialEndsAt,
      subscription_status:'trialing',
      starting_balance:   100,
      bot_balance:        100,
      bot_peak_value:     100,
    };
    const rows = await sb('POST', 'users', { body: row, prefer: 'return=representation' });
    return rowToUser(rows?.[0] || row);
  },

  update: async (id, data) => {
    const row = userToRow(data);
    if (!Object.keys(row).length) return Users.findById(id);
    const rows = await sb('PATCH', 'users', { query: `id=eq.${id}`, body: row, prefer: 'return=representation' });
    return rowToUser(rows?.[0]);
  },

  updateBotState: async (id, botState) => {
    const row = {};
    if (botState.balance      != null) row.bot_balance       = botState.balance;
    if (botState.portfolio    != null) row.bot_portfolio      = botState.portfolio;
    if (botState.peakValue    != null) row.bot_peak_value     = botState.peakValue;
    if (botState.cycleCount   != null) row.bot_cycle_count    = botState.cycleCount;
    if (botState.totalFeesUSD != null) row.bot_total_fees     = botState.totalFeesUSD;
    if (botState.status       != null) row.bot_status         = botState.status;
    if (botState.startedAt    != null) row.bot_started_at     = botState.startedAt;
    if (botState.lastCycleAt  != null) row.bot_last_cycle_at  = botState.lastCycleAt;
    if (!Object.keys(row).length) return;
    await sb('PATCH', 'users', { query: `id=eq.${id}`, body: row, prefer: 'return=minimal' });
  },

  safePublic: (user) => {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  },
};

// ── Trades ────────────────────────────────────────────────────────────────────
export const Trades = {
  forUser: async (userId, limit = 200) => {
    const rows = await sb('GET', 'trades', {
      query: `user_id=eq.${userId}&order=created_at.desc&limit=${limit}`,
    });
    return (rows || []).map(r => ({
      id: r.id, type: r.type, coin: r.coin, qty: parseFloat(r.qty) || 0,
      price: parseFloat(r.price) || 0, gross: parseFloat(r.gross) || 0,
      fee: parseFloat(r.fee) || 0, netProceeds: parseFloat(r.net_proceeds) || 0,
      pnl: r.pnl != null ? parseFloat(r.pnl) : null,
      leverage: parseFloat(r.leverage) || 1,
      strategy: r.strategy, confidence: r.confidence,
      signals: r.signals || [], reasoning: r.reasoning, source: r.source,
      ts: r.created_at,
    }));
  },

  insert: async (userId, trade) => {
    await sb('POST', 'trades', {
      body: {
        user_id:     userId,
        type:        trade.type,
        coin:        trade.coin,
        qty:         trade.qty,
        price:       trade.price,
        gross:       trade.gross,
        fee:         trade.fee,
        net_proceeds:trade.netProceeds,
        pnl:         trade.pnl,
        leverage:    trade.leverage || 1,
        is_perp:     trade.isPerp || false,
        strategy:    trade.strategy,
        confidence:  trade.confidence,
        signals:     trade.signals || [],
        reasoning:   trade.reasoning,
        source:      trade.source || 'RULES',
      },
      prefer: 'return=minimal',
    });
  },

  deleteForUser: async (userId) => {
    await sb('DELETE', 'trades', { query: `user_id=eq.${userId}` });
  },
};

// ── Bot Logs ──────────────────────────────────────────────────────────────────
// Keep logs in memory (fast), batch-write every 10 entries, read last 200 from DB
const memLogs = new Map(); // userId -> []

export const BotLogs = {
  append: async (userId, entry) => {
    if (!memLogs.has(userId)) memLogs.set(userId, []);
    const logs = memLogs.get(userId);
    logs.unshift(entry);
    if (logs.length > 300) logs.pop();

    // Async write to DB — don't await (non-blocking)
    sb('POST', 'bot_logs', {
      body: { user_id: userId, level: entry.level, msg: entry.msg },
      prefer: 'return=minimal',
    }).catch(() => {});
  },

  getRecent: async (userId, limit = 150) => {
    // Return from memory first (fastest), fall back to DB
    if (memLogs.has(userId) && memLogs.get(userId).length > 0) {
      return memLogs.get(userId).slice(0, limit);
    }
    try {
      const rows = await sb('GET', 'bot_logs', {
        query: `user_id=eq.${userId}&order=created_at.desc&limit=${limit}`,
      });
      const logs = (rows || []).map(r => ({ ts: r.created_at, level: r.level, msg: r.msg }));
      memLogs.set(userId, logs);
      return logs;
    } catch { return []; }
  },

  clearForUser: (userId) => {
    memLogs.delete(userId);
    sb('DELETE', 'bot_logs', { query: `user_id=eq.${userId}` }).catch(() => {});
  },
};
