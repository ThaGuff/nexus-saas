/**
 * NEXUS SAAS · Database (Flat File Store)
 * No external database needed — persists to Railway volume
 * Handles users, subscriptions, bot states, trades
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || './data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback = []) {
  ensureDir();
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return fallback;
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Users ──────────────────────────────────────────────────────────────────
export const Users = {
  all: () => readJSON(USERS_FILE, []),

  findById: (id) => Users.all().find(u => u.id === id),

  findByEmail: (email) => Users.all().find(u => u.email?.toLowerCase() === email?.toLowerCase()),

  create: (data) => {
    const users = Users.all();
    const user = {
      id:              data.id,
      email:           data.email.toLowerCase(),
      passwordHash:    data.passwordHash,
      firstName:       data.firstName || '',
      lastName:        data.lastName || '',
      createdAt:       new Date().toISOString(),
      plan:            'trial',
      trialEndsAt:     new Date(Date.now() + parseInt(process.env.TRIAL_DAYS || '14') * 86400000).toISOString(),
      subscriptionId:  null,
      customerId:      null,
      subscriptionStatus: 'trialing',
      // Bot settings per user
      botEnabled:      false,
      botMode:         'PAPER',
      startingBalance: 100,
      maxTradeUSD:     20,
      stopLossPct:     0.05,
      takeProfitPct:   0.08,
      maxDrawdownPct:  0.20,
      leverageEnabled: false,
      maxLeverage:     3,
      // Exchange API keys (encrypted in production — stored plaintext here for MVP)
      exchanges: {},
      // Bot state
      botState: {
        balance:         100,
        startingBalance: 100,
        portfolio:       {},
        trades:          [],
        cycleCount:      0,
        totalFeesUSD:    0,
        peakValue:       100,
        status:          'stopped',
        lastCycleAt:     null,
        startedAt:       null,
      },
      botLog: [],
    };
    users.push(user);
    writeJSON(USERS_FILE, users);
    return user;
  },

  update: (id, updates) => {
    const users = Users.all();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    writeJSON(USERS_FILE, users);
    return users[idx];
  },

  updateBotState: (id, botState) => {
    const users = Users.all();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx].botState = { ...users[idx].botState, ...botState };
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);
    return users[idx];
  },

  appendBotLog: (id, entry) => {
    const users = Users.all();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return;
    if (!users[idx].botLog) users[idx].botLog = [];
    users[idx].botLog.unshift(entry);
    if (users[idx].botLog.length > 200) users[idx].botLog = users[idx].botLog.slice(0, 200);
    writeJSON(USERS_FILE, users);
  },

  appendTrade: (id, trade) => {
    const users = Users.all();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return;
    if (!users[idx].botState.trades) users[idx].botState.trades = [];
    users[idx].botState.trades.unshift(trade);
    if (users[idx].botState.trades.length > 500) users[idx].botState.trades = users[idx].botState.trades.slice(0, 500);
    writeJSON(USERS_FILE, users);
  },

  delete: (id) => {
    const users = Users.all().filter(u => u.id !== id);
    writeJSON(USERS_FILE, users);
  },

  safePublic: (user) => {
    const { passwordHash, ...safe } = user;
    return safe;
  },
};
