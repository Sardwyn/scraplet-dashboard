-- =========================================
-- Email templates & campaigns core schema
-- =========================================

-- 1) email_templates
CREATE TABLE IF NOT EXISTS email_templates (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL,            -- e.g. 'go_live', 'campaign', 'sponsor'

  subject       TEXT NOT NULL,            -- supports {{vars}}
  html_body     TEXT NOT NULL,            -- supports {{vars}}
  text_body     TEXT,                     -- optional plain text, supports {{vars}}

  is_default    BOOLEAN DEFAULT false,    -- per-kind default, per user or system

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS email_templates_user_id_idx
  ON email_templates (user_id);

CREATE INDEX IF NOT EXISTS email_templates_kind_idx
  ON email_templates (kind);

CREATE INDEX IF NOT EXISTS email_templates_user_kind_idx
  ON email_templates (user_id, kind);

-- 2) email_campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id   BIGINT NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,

  name          TEXT NOT NULL,            -- e.g. "Season 2 Launch"
  status        TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'failed'

  scheduled_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_campaigns_user_id_idx
  ON email_campaigns (user_id);

CREATE INDEX IF NOT EXISTS email_campaigns_status_idx
  ON email_campaigns (status);

CREATE INDEX IF NOT EXISTS email_campaigns_user_status_idx
  ON email_campaigns (user_id, status);


-- =========================================
-- 3) Extend email_settings
-- =========================================

-- Default go-live template per creator.
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS go_live_template_id BIGINT
    REFERENCES email_templates(id);


-- =========================================
-- 4) Extend email_sends
-- =========================================

-- Tie sends back to templates & campaigns.
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS template_id BIGINT
    REFERENCES email_templates(id),
  ADD COLUMN IF NOT EXISTS campaign_id BIGINT
    REFERENCES email_campaigns(id);

CREATE INDEX IF NOT EXISTS email_sends_template_id_idx
  ON email_sends (template_id);

CREATE INDEX IF NOT EXISTS email_sends_campaign_id_idx
  ON email_sends (campaign_id);


-- =========================================
-- 5) Extend email_subscribers
-- =========================================

-- Unsubscribe token for one-click unsubscribe links.
ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

CREATE INDEX IF NOT EXISTS email_subscribers_user_token_idx
  ON email_subscribers (user_id, unsubscribe_token);


-- =========================================
-- 6) (Optional) simple updated_at triggers
-- If you already use a global "set_updated_at" trigger, hook it up here.
-- If not, you can ignore this section or adapt to your existing pattern.
-- =========================================

-- Example (only if you already have a function set_updated_at_timestamp()):
-- CREATE TRIGGER set_email_templates_updated_at
--   BEFORE UPDATE ON email_templates
--   FOR EACH ROW
--   EXECUTE FUNCTION set_updated_at_timestamp();
--
-- CREATE TRIGGER set_email_campaigns_updated_at
--   BEFORE UPDATE ON email_campaigns
--   FOR EACH ROW
--   EXECUTE FUNCTION set_updated_at_timestamp();
