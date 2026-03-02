CREATE TABLE IF NOT EXISTS lower_third_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, public_id)
);

CREATE INDEX IF NOT EXISTS idx_lower_third_templates_user_id ON lower_third_templates(user_id);
