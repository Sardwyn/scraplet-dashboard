CREATE TABLE IF NOT EXISTS loyalty_balances (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(128) NOT NULL,
  username VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  last_active TIMESTAMPTZ,
  UNIQUE(channel_id, username, platform)
);

CREATE TABLE IF NOT EXISTS loyalty_config (
  channel_id VARCHAR(128) PRIMARY KEY,
  points_per_interval INTEGER DEFAULT 10,
  interval_minutes INTEGER DEFAULT 5,
  require_chat BOOLEAN DEFAULT TRUE,
  enabled BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(128) NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  status VARCHAR(16) DEFAULT 'open',
  winning_option_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS prediction_bets (
  id SERIAL PRIMARY KEY,
  prediction_id INTEGER REFERENCES predictions(id),
  username VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  option_id VARCHAR(64) NOT NULL,
  amount INTEGER NOT NULL,
  payout INTEGER
);
