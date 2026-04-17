/**
 * NEXUS SAAS · Database Layer v2
 * Supabase PostgreSQL — multi-bot, exchange connections
 */

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ENC_KEY      = (process.env.JWT_SECRET || 'nexus-enc-key-32chars-padded!!!').slice(0, 32);

// ── Encryption (AES-256-CBC for API keys) ────────────────────────────────────
function encrypt(text) {
  if (!text) return null;
  const iv  = crypto.randomBytes(16);
  const c   = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENC_KEY), iv);
  const enc = Buffer.concat([c.update(text), c.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}
function decrypt(text) {
  if (!text) return null;
  try {
    const [ivHex, encHex] = text.split(':');
    const iv  = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const d   = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY), iv);
    return Buffer.concat([d.update(enc), d.final()]).toString();
  } catch { return null; }
}

// ── Supabase REST client ──────────────────────────────────────────────────────
async function sb(method, table, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (opts.query) url += `?${opts.query}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || 'return=representation',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`Supabase ${method} ${table}: ${res.status} ${e}`); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// ── Users ─────────────────────────────────────────────────────────────────────
function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id, email: row.email, passwordHash: row.password_hash,
    firstName: row.first_name||'', lastName: row.last_name||'',
    createdAt: row.created_at, updatedAt: row.updated_at,
    plan: row.plan||'trial', trialEndsAt: row.trial_ends_at,
    subscriptionId: row.subscription_id, customerId: row.customer_id,
    subscriptionStatus: row.subscription_status||'trialing',
    // Global defaults (used for new bots)
    botMode: row.bot_mode||'PAPER',
    startingBalance: parseFloat(row.starting_balance)||100,
    maxTradeUSD: parseFloat(row.max_trade_usd)||20,
    stopLossPct: parseFloat(row.stop_loss_pct)||0.05,
    takeProfitPct: parseFloat(row.take_profit_pct)||0.08,
    maxDrawdownPct: parseFloat(row.max_drawdown_pct)||0.20,
    maxPositionPct: parseFloat(row.max_position_pct)||0.35,
    leverageEnabled: row.leverage_enabled||false,
    maxLeverage: row.max_leverage||3,
    tradingStrategy: row.trading_strategy||'PRECISION',
    // Legacy single-bot state (kept for backward compat)
    botEnabled: row.bot_enabled||false,
    botState: {
      balance: parseFloat(row.bot_balance)||parseFloat(row.starting_balance)||100,
      startingBalance: parseFloat(row.starting_balance)||100,
      portfolio: row.bot_portfolio||{}, peakValue: parseFloat(row.bot_peak_value)||100,
      cycleCount: row.bot_cycle_count||0, totalFeesUSD: parseFloat(row.bot_total_fees)||0,
      status: row.bot_status||'idle', startedAt: row.bot_started_at,
      lastCycleAt: row.bot_last_cycle_at, mode: row.bot_mode||'PAPER', trades:[],
    },
  };
}

function userToRow(data) {
  const r = {};
  if (data.email            != null) r.email               = data.email.toLowerCase();
  if (data.passwordHash     != null) r.password_hash       = data.passwordHash;
  if (data.firstName        != null) r.first_name          = data.firstName;
  if (data.lastName         != null) r.last_name           = data.lastName;
  if (data.plan             != null) r.plan                = data.plan;
  if (data.trialEndsAt      != null) r.trial_ends_at       = data.trialEndsAt;
  if (data.subscriptionId   != null) r.subscription_id     = data.subscriptionId;
  if (data.customerId       != null) r.customer_id         = data.customerId;
  if (data.subscriptionStatus!=null) r.subscription_status = data.subscriptionStatus;
  if (data.botEnabled       != null) r.bot_enabled         = data.botEnabled;
  if (data.botMode          != null) r.bot_mode            = data.botMode;
  if (data.startingBalance  != null) r.starting_balance    = data.startingBalance;
  if (data.maxTradeUSD      != null) r.max_trade_usd       = data.maxTradeUSD;
  if (data.stopLossPct      != null) r.stop_loss_pct       = data.stopLossPct;
  if (data.takeProfitPct    != null) r.take_profit_pct     = data.takeProfitPct;
  if (data.maxDrawdownPct   != null) r.max_drawdown_pct    = data.maxDrawdownPct;
  if (data.maxPositionPct   != null) r.max_position_pct    = data.maxPositionPct;
  if (data.leverageEnabled  != null) r.leverage_enabled    = data.leverageEnabled;
  if (data.maxLeverage      != null) r.max_leverage        = data.maxLeverage;
  if (data.tradingStrategy  != null) r.trading_strategy    = data.tradingStrategy;
  return r;
}

export const Users = {
  all:         async ()    => { const r=await sb('GET','users',{query:'select=*&order=created_at.asc'}); return(r||[]).map(rowToUser); },
  findById:    async (id)  => { const r=await sb('GET','users',{query:`select=*&id=eq.${id}&limit=1`}); return r?.[0]?rowToUser(r[0]):null; },
  findByEmail: async (em)  => { const r=await sb('GET','users',{query:`select=*&email=eq.${encodeURIComponent(em.toLowerCase())}&limit=1`}); return r?.[0]?rowToUser(r[0]):null; },
  create: async (data) => {
    const trial = new Date(Date.now()+parseInt(process.env.TRIAL_DAYS||'14')*864e5).toISOString();
    const r = { id:data.id, email:data.email.toLowerCase(), password_hash:data.passwordHash, first_name:data.firstName||'', last_name:data.lastName||'', plan:'trial', trial_ends_at:trial, subscription_status:'trialing', starting_balance:100, bot_balance:100, bot_peak_value:100 };
    const rows = await sb('POST','users',{body:r,prefer:'return=representation'});
    return rowToUser(rows?.[0]||r);
  },
  update: async (id, data) => {
    const r = userToRow(data);
    if (!Object.keys(r).length) return Users.findById(id);
    const rows = await sb('PATCH','users',{query:`id=eq.${id}`,body:r,prefer:'return=representation'});
    return rowToUser(rows?.[0]);
  },
  updateBotState: async (id, bs) => {
    const r = {};
    if (bs.balance      != null) r.bot_balance      = bs.balance;
    if (bs.portfolio    != null) r.bot_portfolio     = bs.portfolio;
    if (bs.peakValue    != null) r.bot_peak_value    = bs.peakValue;
    if (bs.cycleCount   != null) r.bot_cycle_count   = bs.cycleCount;
    if (bs.totalFeesUSD != null) r.bot_total_fees    = bs.totalFeesUSD;
    if (bs.status       != null) r.bot_status        = bs.status;
    if (bs.startedAt    != null) r.bot_started_at    = bs.startedAt;
    if (bs.lastCycleAt  != null) r.bot_last_cycle_at = bs.lastCycleAt;
    if (!Object.keys(r).length) return;
    await sb('PATCH','users',{query:`id=eq.${id}`,body:r,prefer:'return=minimal'});
  },
  safePublic: (u) => { if(!u)return null; const {passwordHash,...s}=u; return s; },
};

// ── Bots ───────────────────────────────────────────────────────────────────────
function rowToBot(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, name: row.name||'Bot 1',
    strategy: row.strategy||'PRECISION', botMode: row.bot_mode||'PAPER',
    enabled: row.enabled||false, color: row.color||'#00d68f',
    exchangeId: row.exchange_id||'paper',
    startingBalance: parseFloat(row.starting_balance)||100,
    balance:         parseFloat(row.balance)||100,
    portfolio:       row.portfolio||{},
    peakValue:       parseFloat(row.peak_value)||100,
    cycleCount:      row.cycle_count||0,
    totalFees:       parseFloat(row.total_fees)||0,
    status:          row.status||'idle',
    startedAt:       row.started_at,
    lastCycleAt:     row.last_cycle_at,
    maxTradeUSD:     parseFloat(row.max_trade_usd)||20,
    stopLossPct:     parseFloat(row.stop_loss_pct)||0.05,
    takeProfitPct:   parseFloat(row.take_profit_pct)||0.08,
    maxDrawdownPct:  parseFloat(row.max_drawdown_pct)||0.20,
    maxPositionPct:  parseFloat(row.max_position_pct)||0.35,
    leverageEnabled: row.leverage_enabled||false,
    maxLeverage:     row.max_leverage||3,
    createdAt:       row.created_at,
  };
}

export const Bots = {
  forUser: async (userId) => {
    const r = await sb('GET','bots',{query:`user_id=eq.${userId}&order=created_at.asc`});
    return (r||[]).map(rowToBot);
  },
  findById: async (id) => {
    const r = await sb('GET','bots',{query:`select=*&id=eq.${id}&limit=1`});
    return r?.[0]?rowToBot(r[0]):null;
  },
  create: async (userId, data) => {
    const row = {
      user_id: userId, name: data.name||'Bot 1',
      strategy: data.strategy||'PRECISION', bot_mode: data.botMode||'PAPER',
      color: data.color||'#00d68f', exchange_id: data.exchangeId||'paper',
      starting_balance: data.startingBalance||100, balance: data.startingBalance||100,
      peak_value: data.startingBalance||100,
      max_trade_usd: data.maxTradeUSD||20, stop_loss_pct: data.stopLossPct||0.05,
      take_profit_pct: data.takeProfitPct||0.08, max_drawdown_pct: data.maxDrawdownPct||0.20,
      max_position_pct: data.maxPositionPct||0.35, leverage_enabled: data.leverageEnabled||false,
      max_leverage: data.maxLeverage||3,
    };
    const rows = await sb('POST','bots',{body:row,prefer:'return=representation'});
    return rowToBot(rows?.[0]);
  },
  update: async (id, data) => {
    const r = {};
    if (data.name           != null) r.name             = data.name;
    if (data.strategy       != null) r.strategy         = data.strategy;
    if (data.botMode        != null) r.bot_mode         = data.botMode;
    if (data.enabled        != null) r.enabled          = data.enabled;
    if (data.color          != null) r.color            = data.color;
    if (data.exchangeId     != null) r.exchange_id      = data.exchangeId;
    if (data.startingBalance!= null) r.starting_balance = data.startingBalance;
    if (data.balance        != null) r.balance          = data.balance;
    if (data.portfolio      != null) r.portfolio        = data.portfolio;
    if (data.peakValue      != null) r.peak_value       = data.peakValue;
    if (data.cycleCount     != null) r.cycle_count      = data.cycleCount;
    if (data.totalFees      != null) r.total_fees       = data.totalFees;
    if (data.status         != null) r.status           = data.status;
    if (data.startedAt      != null) r.started_at       = data.startedAt;
    if (data.lastCycleAt    != null) r.last_cycle_at    = data.lastCycleAt;
    if (data.maxTradeUSD    != null) r.max_trade_usd    = data.maxTradeUSD;
    if (data.stopLossPct    != null) r.stop_loss_pct    = data.stopLossPct;
    if (data.takeProfitPct  != null) r.take_profit_pct  = data.takeProfitPct;
    if (data.maxDrawdownPct != null) r.max_drawdown_pct = data.maxDrawdownPct;
    if (data.maxPositionPct != null) r.max_position_pct = data.maxPositionPct;
    if (data.leverageEnabled!= null) r.leverage_enabled = data.leverageEnabled;
    if (data.maxLeverage    != null) r.max_leverage     = data.maxLeverage;
    if (!Object.keys(r).length) return Bots.findById(id);
    const rows = await sb('PATCH','bots',{query:`id=eq.${id}`,body:r,prefer:'return=representation'});
    return rowToBot(rows?.[0]);
  },
  delete: async (id) => { await sb('DELETE','bots',{query:`id=eq.${id}`,prefer:'return=minimal'}); },
  resetBot: async (id) => {
    const bot = await Bots.findById(id);
    if (!bot) return;
    await Bots.update(id, { balance:bot.startingBalance, portfolio:{}, peakValue:bot.startingBalance, cycleCount:0, totalFees:0, status:'idle', startedAt:null, lastCycleAt:null });
    await Trades.deleteForBot(id);
    BotLogs.clearForBot(id);
  },
};

// ── Exchange Connections ──────────────────────────────────────────────────────
function rowToExchange(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, exchange: row.exchange,
    label: row.label||'', mode: row.mode||'PAPER',
    isActive: row.is_active, connectedAt: row.connected_at,
    lastVerifiedAt: row.last_verified_at, permissions: row.permissions||[],
    walletAddress: row.wallet_address,
    apiKeyMask: row.api_key_enc ? '••••' + decrypt(row.api_key_enc)?.slice(-4) : null,
    // Decrypted keys — only returned when needed for trading
    _apiKey:        row.api_key_enc ? decrypt(row.api_key_enc) : null,
    _apiSecret:     row.api_secret_enc ? decrypt(row.api_secret_enc) : null,
    _apiPassphrase: row.api_passphrase_enc ? decrypt(row.api_passphrase_enc) : null,
  };
}

export const Exchanges = {
  forUser: async (userId) => {
    const r = await sb('GET','exchange_connections',{query:`user_id=eq.${userId}&order=connected_at.asc`});
    return (r||[]).map(rowToExchange);
  },
  findById: async (id) => {
    const r = await sb('GET','exchange_connections',{query:`select=*&id=eq.${id}&limit=1`});
    return r?.[0]?rowToExchange(r[0]):null;
  },
  connect: async (userId, data) => {
    const row = {
      user_id: userId, exchange: data.exchange, label: data.label||'',
      api_key_enc:        data.apiKey        ? encrypt(data.apiKey)        : null,
      api_secret_enc:     data.apiSecret     ? encrypt(data.apiSecret)     : null,
      api_passphrase_enc: data.apiPassphrase ? encrypt(data.apiPassphrase) : null,
      wallet_address:     data.walletAddress || null,
      mode:               data.mode||'PAPER', is_active: true,
      permissions:        data.permissions||['read','trade'],
    };
    const rows = await sb('POST','exchange_connections',{body:row,prefer:'return=representation'});
    return rowToExchange(rows?.[0]);
  },
  update: async (id, data) => {
    const r = {};
    if (data.label   != null) r.label    = data.label;
    if (data.mode    != null) r.mode     = data.mode;
    if (data.isActive!= null) r.is_active= data.isActive;
    if (data.lastVerifiedAt!= null) r.last_verified_at = data.lastVerifiedAt;
    const rows = await sb('PATCH','exchange_connections',{query:`id=eq.${id}`,body:r,prefer:'return=representation'});
    return rowToExchange(rows?.[0]);
  },
  disconnect: async (id) => { await sb('DELETE','exchange_connections',{query:`id=eq.${id}`,prefer:'return=minimal'}); },
};

// ── Trades ────────────────────────────────────────────────────────────────────
export const Trades = {
  forUser: async (userId, limit=200) => {
    const r = await sb('GET','trades',{query:`user_id=eq.${userId}&order=created_at.desc&limit=${limit}`});
    return (r||[]).map(rowToTrade);
  },
  forBot: async (botId, limit=200) => {
    const r = await sb('GET','trades',{query:`bot_id=eq.${botId}&order=created_at.desc&limit=${limit}`});
    return (r||[]).map(rowToTrade);
  },
  insert: async (userId, trade, botId=null) => {
    await sb('POST','trades',{body:{
      user_id:userId, bot_id:botId||null, type:trade.type, coin:trade.coin,
      qty:trade.qty, price:trade.price, gross:trade.gross, fee:trade.fee,
      net_proceeds:trade.netProceeds, pnl:trade.pnl, leverage:trade.leverage||1,
      is_perp:trade.isPerp||false, strategy:trade.strategy, confidence:trade.confidence,
      signals:trade.signals||[], reasoning:trade.reasoning, source:trade.source||'RULES',
    },prefer:'return=minimal'});
  },
  deleteForUser: async (userId) => { await sb('DELETE','trades',{query:`user_id=eq.${userId}`,prefer:'return=minimal'}); },
  deleteForBot:  async (botId)  => { await sb('DELETE','trades',{query:`bot_id=eq.${botId}`,prefer:'return=minimal'}); },
};

function rowToTrade(r) {
  return { id:r.id, type:r.type, coin:r.coin, qty:parseFloat(r.qty)||0, price:parseFloat(r.price)||0, gross:parseFloat(r.gross)||0, fee:parseFloat(r.fee)||0, netProceeds:parseFloat(r.net_proceeds)||0, pnl:r.pnl!=null?parseFloat(r.pnl):null, leverage:parseFloat(r.leverage)||1, strategy:r.strategy, confidence:r.confidence, signals:r.signals||[], reasoning:r.reasoning, source:r.source, botId:r.bot_id, ts:r.created_at };
}

// ── Bot Logs ──────────────────────────────────────────────────────────────────
const memLogs = new Map(); // key: userId or botId

export const BotLogs = {
  append: async (key, entry) => {
    if (!memLogs.has(key)) memLogs.set(key, []);
    const logs = memLogs.get(key);
    logs.unshift(entry);
    if (logs.length > 300) logs.pop();
    sb('POST','bot_logs',{body:{user_id:key,level:entry.level,msg:entry.msg},prefer:'return=minimal'}).catch(()=>{});
  },
  getRecent: async (key, limit=150) => {
    if (memLogs.has(key) && memLogs.get(key).length > 0) return memLogs.get(key).slice(0,limit);
    try {
      const r = await sb('GET','bot_logs',{query:`user_id=eq.${key}&order=created_at.desc&limit=${limit}`});
      const logs = (r||[]).map(row=>({ts:row.created_at,level:row.level,msg:row.msg}));
      memLogs.set(key, logs);
      return logs;
    } catch { return []; }
  },
  clearForBot: (key) => { memLogs.delete(key); sb('DELETE','bot_logs',{query:`user_id=eq.${key}`,prefer:'return=minimal'}).catch(()=>{}); },
};
