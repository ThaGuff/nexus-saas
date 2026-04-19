-- NEXUS SAAS · Schema v3 — Missing columns + Learning Engine persistence
-- Run in Supabase SQL Editor AFTER schema v1 and v2

-- Add missing solana_wallet column
ALTER TABLE users ADD COLUMN IF NOT EXISTS solana_wallet TEXT;

-- Bot learning engine persistence
CREATE TABLE IF NOT EXISTS bot_learning (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id       UUID REFERENCES bots(id) ON DELETE CASCADE,
  strategy     TEXT NOT NULL,
  weights      JSONB DEFAULT '{"rsi":1.0,"macd":1.0,"bb":1.0,"volume":1.0,"mom":1.0,"stoch":1.0}',
  thresholds   JSONB DEFAULT '{}',
  stats        JSONB DEFAULT '{"totalTrades":0,"wins":0,"losses":0}',
  trade_history JSONB DEFAULT '[]',
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, strategy)
);

CREATE INDEX IF NOT EXISTS bot_learning_bot_id_idx ON bot_learning(bot_id);

ALTER TABLE bot_learning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON bot_learning FOR ALL USING (true);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prt_token_idx ON password_reset_tokens(token_hash);
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON password_reset_tokens FOR ALL USING (true);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON email_verifications FOR ALL USING (true);
