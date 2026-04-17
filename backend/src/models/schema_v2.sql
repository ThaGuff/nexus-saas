-- NEXUS SAAS · Schema v2 — Multi-Bot + Exchanges
-- Run in Supabase SQL Editor AFTER schema v1

-- ── Bot Instances table (one row per bot per user) ─────────────────────────
CREATE TABLE IF NOT EXISTS bots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Bot 1',
  strategy        TEXT NOT NULL DEFAULT 'PRECISION',
  bot_mode        TEXT NOT NULL DEFAULT 'PAPER',
  enabled         BOOLEAN DEFAULT FALSE,
  color           TEXT DEFAULT '#00d68f',

  -- Capital allocation
  starting_balance  NUMERIC DEFAULT 100,
  balance           NUMERIC DEFAULT 100,
  portfolio         JSONB DEFAULT '{}',
  peak_value        NUMERIC DEFAULT 100,
  cycle_count       INTEGER DEFAULT 0,
  total_fees        NUMERIC DEFAULT 0,
  status            TEXT DEFAULT 'idle',
  started_at        TIMESTAMPTZ,
  last_cycle_at     TIMESTAMPTZ,

  -- Per-bot trade settings
  max_trade_usd     NUMERIC DEFAULT 20,
  stop_loss_pct     NUMERIC DEFAULT 0.05,
  take_profit_pct   NUMERIC DEFAULT 0.08,
  max_drawdown_pct  NUMERIC DEFAULT 0.20,
  max_position_pct  NUMERIC DEFAULT 0.35,
  leverage_enabled  BOOLEAN DEFAULT FALSE,
  max_leverage      INTEGER DEFAULT 3,

  -- Exchange binding (which exchange this bot trades on)
  exchange_id       TEXT DEFAULT 'paper',

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Exchange connections table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  exchange        TEXT NOT NULL,          -- 'coinbase' | 'binance' | 'kraken' | 'nexus_wallet'
  label           TEXT DEFAULT '',
  api_key_enc     TEXT,                   -- AES-256 encrypted
  api_secret_enc  TEXT,                   -- AES-256 encrypted
  api_passphrase_enc TEXT,                -- for Coinbase Advanced
  wallet_address  TEXT,                   -- for non-custodial wallet
  is_active       BOOLEAN DEFAULT TRUE,
  mode            TEXT DEFAULT 'PAPER',   -- PAPER | LIVE
  connected_at    TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  permissions     JSONB DEFAULT '["read","trade"]'
);

-- Update trades table to reference bot_id
ALTER TABLE trades ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES bots(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS bots_user_id_idx        ON bots(user_id);
CREATE INDEX IF NOT EXISTS exchanges_user_id_idx   ON exchange_connections(user_id);
CREATE INDEX IF NOT EXISTS trades_bot_id_idx       ON trades(bot_id);

-- Auto-update updated_at on bots
CREATE TRIGGER bots_updated_at
  BEFORE UPDATE ON bots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE bots                ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON bots                 FOR ALL USING (true);
CREATE POLICY "service_role_all" ON exchange_connections FOR ALL USING (true);
