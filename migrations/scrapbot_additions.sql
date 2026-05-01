CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(128) NOT NULL,
  message TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS command_variables (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(128) NOT NULL,
  name VARCHAR(64) NOT NULL,
  type VARCHAR(16) DEFAULT 'text',
  value TEXT NOT NULL DEFAULT '',
  initial_value TEXT NOT NULL DEFAULT '',
  UNIQUE(channel_id, name)
);
