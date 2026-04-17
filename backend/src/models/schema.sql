-- NEXUS SAAS · Supabase Schema
-- Run this in Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  first_name      TEXT DEFAULT '',
  last_name       TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Subscription
  plan                TEXT DEFAULT 'trial',
  trial_ends_at       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_id     TEXT,
  customer_id         TEXT,
  subscription_status TEXT DEFAULT 'trialing',

  -- Bot settings
  bot_enabled         BOOLEAN DEFAULT FALSE,
  bot_mode            TEXT DEFAULT 'PAPER',
  starting_balance    NUMERIC DEFAULT 100,
  max_trade_usd       NUMERIC DEFAULT 20,
  stop_loss_pct       NUMERIC DEFAULT 0.05,
  take_profit_pct     NUMERIC DEFAULT 0.08,
  max_drawdown_pct    NUMERIC DEFAULT 0.20,
  max_position_pct    NUMERIC DEFAULT 0.35,
  leverage_enabled    BOOLEAN DEFAULT FALSE,
  max_leverage        INTEGER DEFAULT 3,
  trading_strategy    TEXT DEFAULT 'PRECISION',

  -- Exchange connections (encrypted)
  exchanges           JSONB DEFAULT '{}',

  -- Bot runtime state
  bot_balance         NUMERIC DEFAULT 100,
  bot_portfolio       JSONB DEFAULT '{}',
  bot_peak_value      NUMERIC DEFAULT 100,
  bot_cycle_count     INTEGER DEFAULT 0,
  bot_total_fees      NUMERIC DEFAULT 0,
  bot_status          TEXT DEFAULT 'idle',
  bot_started_at      TIMESTAMPTZ,
  bot_last_cycle_at   TIMESTAMPTZ
);

-- Trades table (separate — no more JSON array bloat)
CREATE TABLE IF NOT EXISTS trades (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL, -- BUY, SELL, HOLD
  coin          TEXT,
  qty           NUMERIC,
  price         NUMERIC,
  gross         NUMERIC,
  fee           NUMERIC,
  net_proceeds  NUMERIC,
  pnl           NUMERIC,
  leverage      NUMERIC DEFAULT 1,
  is_perp       BOOLEAN DEFAULT FALSE,
  strategy      TEXT,
  confidence    INTEGER,
  signals       JSONB DEFAULT '[]',
  reasoning     TEXT,
  source        TEXT DEFAULT 'RULES',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Bot logs table (separate — no more log bloat in user row)
CREATE TABLE IF NOT EXISTS bot_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  level      TEXT NOT NULL,
  msg        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS trades_user_id_idx     ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bot_logs_user_id_idx   ON bot_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS users_email_idx        ON users(email);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security) — disable for service role
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (backend uses service role key)
CREATE POLICY "service_role_all" ON users    FOR ALL USING (true);
CREATE POLICY "service_role_all" ON trades   FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bot_logs FOR ALL USING (true);
