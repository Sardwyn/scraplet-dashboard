// email-worker.js
import 'dotenv/config';
import fetch from 'node-fetch';
import db from './db.js';

const POLL_INTERVAL_MS = 15000; // 15s between idle polls

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error('[email-worker] RESEND_API_KEY is not set. Aborting.');
  process.exit(1);
}

// From address for all emails
const EMAIL_FROM =
  process.env.EMAIL_FROM_ADDRESS || 'Scraplet <no-reply@scraplet.store>';

// Base URL for unsubscribe/profile links
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://scraplet.store';

// ======================================================
// Core helpers
// ======================================================

/**
 * Render template strings with {{var}} placeholders.
 * Missing vars resolve to empty string.
 */
function renderTemplate(str, vars) {
  if (!str) return '';
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] != null ? String(vars[key]) : '';
  });
}

/**
 * Format today's date as "December 11, 2025".
 */
function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Safely normalise job.payload into an object.
 */
function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Build unsubscribe URL for a subscriber.
 * Uses slug if provided; otherwise falls back to username.
 * If no slug/username or token, returns empty string.
 */
function buildUnsubscribeUrl({ slug, username, unsubscribeToken }) {
  const effectiveSlug = (slug || username || '').toString().trim();
  if (!effectiveSlug || !unsubscribeToken) return '';
  return `${APP_BASE_URL}/u/${encodeURIComponent(
    effectiveSlug
  )}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
}

/**
 * Load basic user info (id, username, email).
 */
async function loadUserBasic(userId) {
  const { rows } = await db.query(
    `
    SELECT id, username, email
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  if (!rows.length) {
    throw new Error(`no user found for user_id=${userId}`);
  }
  return rows[0];
}

/**
 * Load active subscribers for a user.
 * Returns [{ email, unsubscribe_token }, ...]
 */
async function loadActiveSubscribers(userId) {
  const { rows } = await db.query(
    `
    SELECT email, unsubscribe_token
    FROM email_subscribers
    WHERE user_id = $1
      AND (unsubscribed = false OR unsubscribed IS NULL)
    ORDER BY created_at ASC
    `,
    [userId]
  );
  return rows;
}

/**
 * Resolve the email template to use for go_live:
 * - If email_settings.go_live_template_id set, use that.
 * - Else, use system default where user_id IS NULL, kind = 'go_live', is_default = true.
 */
async function resolveGoLiveTemplate(userId) {
  const { rows: settingsRows } = await db.query(
    `
    SELECT go_live_template_id
    FROM email_settings
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  const templateId = settingsRows[0]?.go_live_template_id || null;

  if (templateId) {
    const { rows } = await db.query(
      `
      SELECT *
      FROM email_templates
      WHERE id = $1
      LIMIT 1
      `,
      [templateId]
    );
    if (!rows.length) {
      throw new Error(`Configured go_live_template_id=${templateId} not found`);
    }
    return rows[0];
  }

  const { rows: defaultRows } = await db.query(
    `
    SELECT *
    FROM email_templates
    WHERE user_id IS NULL
      AND kind = 'go_live'
      AND is_default = true
    ORDER BY id ASC
    LIMIT 1
    `
  );

  if (!defaultRows.length) {
    throw new Error(
      'No system default go_live template found (user_id IS NULL, kind = go_live, is_default = true)'
    );
  }

  return defaultRows[0];
}

/**
 * Resolve campaign row + template row for a given campaign_id.
 * Returns { campaign, template }.
 */
async function resolveCampaignWithTemplate(campaignId) {
  const { rows } = await db.query(
    `
    SELECT
      c.id              AS campaign_id,
      c.user_id         AS campaign_user_id,
      c.name            AS campaign_name,
      c.status          AS campaign_status,
      c.scheduled_at    AS campaign_scheduled_at,

      t.id              AS template_id,
      t.user_id         AS template_user_id,
      t.name            AS template_name,
      t.description     AS template_description,
      t.kind            AS template_kind,
      t.subject         AS template_subject,
      t.html_body       AS template_html_body,
      t.text_body       AS template_text_body,
      t.is_default      AS template_is_default,
      t.created_at      AS template_created_at,
      t.updated_at      AS template_updated_at
    FROM email_campaigns c
    JOIN email_templates t ON c.template_id = t.id
    WHERE c.id = $1
    LIMIT 1
    `,
    [campaignId]
  );

  if (!rows.length) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const row = rows[0];
  const campaign = {
    id: row.campaign_id,
    user_id: row.campaign_user_id,
    name: row.campaign_name,
    status: row.campaign_status,
    scheduled_at: row.campaign_scheduled_at,
  };
  const template = {
    id: row.template_id,
    user_id: row.template_user_id,
    name: row.template_name,
    description: row.template_description,
    kind: row.template_kind,
    subject: row.template_subject,
    html_body: row.template_html_body,
    text_body: row.template_text_body,
    is_default: row.template_is_default,
    created_at: row.template_created_at,
    updated_at: row.template_updated_at,
  };

  return { campaign, template };
}

// ======================================================
// Job claiming / status helpers
// ======================================================

/**
 * Claim the next pending job in a concurrency-safe way.
 * - Moves status from 'pending' -> 'processing'
 * - Returns the claimed row (id, user_id, kind, payload) or null if none
 */
async function claimNextJob() {
  const { rows } = await db.query(
    `
    WITH next_job AS (
      SELECT id, user_id, kind, payload
      FROM email_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE email_jobs j
    SET status = 'processing',
        updated_at = now()
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.id, next_job.user_id, next_job.kind, next_job.payload
    `
  );

  if (!rows.length) return null;
  return rows[0];
}

/**
 * Mark job as sent (success).
 */
async function markJobSent(jobId) {
  await db.query(
    `
    UPDATE email_jobs
    SET status = 'sent',
        error = NULL,
        updated_at = now()
    WHERE id = $1
    `,
    [jobId]
  );
}

/**
 * Mark job as failed (non-fatal for worker).
 */
async function markJobFailed(jobId, err) {
  const msg = (err && err.message) || String(err || 'Unknown error');
  await db.query(
    `
    UPDATE email_jobs
    SET status = 'failed',
        error = $2,
        updated_at = now()
    WHERE id = $1
    `,
    [jobId, msg.slice(0, 500)]
  );
}

// ======================================================
// Resend sender
// ======================================================

async function resendSend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      text: text || undefined,
      html,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error('[email-worker] Resend API error', {
      status: res.status,
      body: bodyText.slice(0, 500),
    });
    throw new Error(`Resend HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
  }
}

// ======================================================
// Job handlers
// ======================================================

/**
 * GO-LIVE JOB
 * kind = 'go_live'
 */
async function handleGoLiveJob(job) {
  const userId = job.user_id;
  const payload = parsePayload(job.payload);
  const platform = (payload.platform || 'kick').toLowerCase();

  if (platform !== 'kick') {
    throw new Error(`unsupported platform for go_live: ${platform}`);
  }

  const user = await loadUserBasic(userId);
  const username = user.username || 'your favourite creator';

  const subscribers = await loadActiveSubscribers(userId);
  if (!subscribers.length) {
    throw new Error(`no active subscribers for user_id=${userId}; nothing to send`);
  }

  const channelSlug = payload.channel_slug || payload.slug || null;
  const title = payload.title || null;

  const kickUrl = channelSlug ? `https://kick.com/${channelSlug}` : 'https://kick.com';

  const template = await resolveGoLiveTemplate(userId);

  console.log(
    '[email-worker] sending go_live email via Resend',
    'user_id=',
    userId,
    'recipients=',
    subscribers.length,
    'template_id=',
    template.id
  );

  const baseVars = {
    username,
    title: title || '',
    platform: 'kick',
    channel_slug: channelSlug || '',
    kick_url: kickUrl,
    today: formatToday(),
  };

  // Per-subscriber send so unsubscribe_url is unique
  for (const sub of subscribers) {
    const unsubscribe_url = buildUnsubscribeUrl({
      slug: payload.slug || payload.channel_slug || null,
      username,
      unsubscribeToken: sub.unsubscribe_token,
    });

    const vars = { ...baseVars, unsubscribe_url };

    const subject = renderTemplate(template.subject, vars);
    const htmlBody = renderTemplate(template.html_body, vars);
    const textBody = template.text_body ? renderTemplate(template.text_body, vars) : null;

    await resendSend({
      to: sub.email,
      subject,
      html: htmlBody,
      text: textBody,
    });
  }

  console.log(
    '[email-worker] go_live send success:',
    'user_id=',
    userId,
    'recipients=',
    subscribers.length
  );

  await db.query(
    `
    UPDATE email_settings
    SET last_go_live_email_at = now()
    WHERE user_id = $1
    `,
    [userId]
  );

  await db.query(
    `
    INSERT INTO email_sends (user_id, kind, platform, subject, recipients, template_id)
    VALUES ($1, 'go_live', $2, $3, $4, $5)
    `,
    [
      userId,
      platform,
      renderTemplate(template.subject, {
        ...baseVars,
        unsubscribe_url: '',
      }),
      subscribers.length,
      template.id,
    ]
  );
}

/**
 * CAMPAIGN SEND JOB
 * kind = 'campaign_send'
 *
 * payload: { campaign_id, slug? }
 */
async function handleCampaignJob(job) {
  const payload = parsePayload(job.payload);
  const campaignId = payload.campaign_id;

  if (!campaignId) {
    throw new Error('campaign_send job missing payload.campaign_id');
  }

  const { campaign, template } = await resolveCampaignWithTemplate(campaignId);

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    throw new Error(`Campaign ${campaignId} has status=${campaign.status}; cannot send`);
  }

  const user = await loadUserBasic(campaign.user_id);
  const username = user.username || '';

  const subscribers = await loadActiveSubscribers(campaign.user_id);
  if (!subscribers.length) {
    console.log(
      `[email-worker] campaign_send: campaign=${campaignId} has no subscribers; marking failed`
    );
    await db.query(
      `
      UPDATE email_campaigns
      SET status = 'failed',
          updated_at = now()
      WHERE id = $1
      `,
      [campaignId]
    );
    return;
  }

  // Mark as sending
  await db.query(
    `
    UPDATE email_campaigns
    SET status = 'sending',
        updated_at = now()
    WHERE id = $1
    `,
    [campaignId]
  );

  console.log(
    '[email-worker] sending campaign via Resend',
    'campaign_id=',
    campaignId,
    'user_id=',
    campaign.user_id,
    'recipients=',
    subscribers.length,
    'template_id=',
    template.id
  );

  const baseVars = {
    username,
    campaign_name: campaign.name || '',
    today: formatToday(),
  };

  // IMPORTANT: slug fallback
  const effectiveSlug = (payload.slug || username || '').toString().trim();

  // Per-subscriber for unsubscribe token
  for (const sub of subscribers) {
    const unsubscribe_url = buildUnsubscribeUrl({
      slug: effectiveSlug,
      username,
      unsubscribeToken: sub.unsubscribe_token,
    });

    const vars = { ...baseVars, unsubscribe_url };

    const subject = renderTemplate(template.subject, vars);
    const htmlBody = renderTemplate(template.html_body, vars);
    const textBody = template.text_body ? renderTemplate(template.text_body, vars) : null;

    await resendSend({
      to: sub.email,
      subject,
      html: htmlBody,
      text: textBody,
    });
  }

  // Log send (single row)
  const loggedSubject = renderTemplate(template.subject, {
    ...baseVars,
    unsubscribe_url: '',
  });

  await db.query(
    `
    INSERT INTO email_sends (user_id, kind, platform, subject, recipients, template_id, campaign_id)
    VALUES ($1, 'campaign', NULL, $2, $3, $4, $5)
    `,
    [campaign.user_id, loggedSubject, subscribers.length, template.id, campaignId]
  );

  // Mark campaign sent
  await db.query(
    `
    UPDATE email_campaigns
    SET status = 'sent',
        updated_at = now()
    WHERE id = $1
    `,
    [campaignId]
  );

  console.log(
    '[email-worker] campaign_send success:',
    'campaign_id=',
    campaignId,
    'recipients=',
    subscribers.length
  );
}

/**
 * TEST GO-LIVE
 * kind = 'test_go_live'
 *
 * payload: { to_email, platform?, channel_slug?, title?, slug? }
 */
async function handleTestGoLiveJob(job) {
  const userId = job.user_id;
  const payload = parsePayload(job.payload);

  const user = await loadUserBasic(userId);
  const username = user.username || 'your favourite creator';

  const toEmail = (payload.to_email || user.email || '').toString().trim();
  if (!toEmail) throw new Error('test_go_live missing to_email and user has no email');

  const platform = (payload.platform || 'kick').toLowerCase();
  const channelSlug = payload.channel_slug || payload.slug || user.username || null;
  const title = payload.title || 'This is a test go-live email';

  const kickUrl = channelSlug ? `https://kick.com/${channelSlug}` : 'https://kick.com';

  const template = await resolveGoLiveTemplate(userId);

  const baseVars = {
    username,
    title: title || '',
    platform,
    channel_slug: channelSlug || '',
    kick_url: kickUrl,
    today: formatToday(),
  };

  const subject = renderTemplate(template.subject, { ...baseVars, unsubscribe_url: '' });
  const htmlBody = renderTemplate(template.html_body, { ...baseVars, unsubscribe_url: '' });
  const textBody = template.text_body
    ? renderTemplate(template.text_body, { ...baseVars, unsubscribe_url: '' })
    : null;

  await resendSend({
    to: toEmail,
    subject: `[TEST] ${subject}`,
    html: htmlBody,
    text: textBody,
  });

  await db.query(
    `
    INSERT INTO email_sends (user_id, kind, platform, subject, recipients, template_id)
    VALUES ($1, 'test_go_live', $2, $3, 1, $4)
    `,
    [userId, platform, `[TEST] ${subject}`, template.id]
  );
}

/**
 * TEST CAMPAIGN
 * kind = 'test_campaign'
 *
 * payload: { campaign_id, to_email, slug? }
 */
async function handleTestCampaignJob(job) {
  const payload = parsePayload(job.payload);
  const campaignId = payload.campaign_id;

  if (!campaignId) throw new Error('test_campaign missing payload.campaign_id');

  const { campaign, template } = await resolveCampaignWithTemplate(campaignId);
  const user = await loadUserBasic(campaign.user_id);
  const username = user.username || '';

  const toEmail = (payload.to_email || user.email || '').toString().trim();
  if (!toEmail) throw new Error('test_campaign missing to_email and user has no email');

  const baseVars = {
    username,
    campaign_name: campaign.name || '',
    today: formatToday(),
  };

  const effectiveSlug = (payload.slug || username || '').toString().trim();
  const unsubscribe_url = buildUnsubscribeUrl({
    slug: effectiveSlug,
    username,
    unsubscribeToken: 'test', // doesn't matter in test context
  });

  const subject = renderTemplate(template.subject, { ...baseVars, unsubscribe_url });
  const htmlBody = renderTemplate(template.html_body, { ...baseVars, unsubscribe_url });
  const textBody = template.text_body
    ? renderTemplate(template.text_body, { ...baseVars, unsubscribe_url })
    : null;

  await resendSend({
    to: toEmail,
    subject: `[TEST] ${subject}`,
    html: htmlBody,
    text: textBody,
  });

  await db.query(
    `
    INSERT INTO email_sends (user_id, kind, platform, subject, recipients, template_id, campaign_id)
    VALUES ($1, 'test_campaign', NULL, $2, 1, $3, $4)
    `,
    [campaign.user_id, `[TEST] ${subject}`, template.id, campaign.id]
  );
}

// ======================================================
// Worker loop
// ======================================================

/**
 * Process a single job if one exists.
 * Returns true if we did work, false if there was nothing to do.
 */
async function processOnce() {
  const job = await claimNextJob();
  if (!job) return false;

  console.log(
    '[email-worker] picked job',
    'id=',
    job.id,
    'kind=',
    job.kind,
    'user_id=',
    job.user_id
  );

  try {
    if (job.kind === 'go_live') {
      await handleGoLiveJob(job);
    } else if (job.kind === 'campaign_send') {
      await handleCampaignJob(job);
    } else if (job.kind === 'test_go_live') {
      await handleTestGoLiveJob(job);
    } else if (job.kind === 'test_campaign') {
      await handleTestCampaignJob(job);
    } else {
      throw new Error(`unsupported job kind: ${job.kind}`);
    }

    await markJobSent(job.id);
    console.log('[email-worker] job completed', 'id=', job.id, 'kind=', job.kind);
  } catch (err) {
    console.error('[email-worker] job failed', 'id=', job.id, 'kind=', job.kind, 'error=', err);

    // If a campaign send fails, mark campaign failed too (best-effort)
    try {
      if (job.kind === 'campaign_send') {
        const payload = parsePayload(job.payload);
        if (payload?.campaign_id) {
          await db.query(
            `
            UPDATE email_campaigns
            SET status = 'failed',
                updated_at = now()
            WHERE id = $1
            `,
            [payload.campaign_id]
          );
        }
      }
    } catch (e) {
      console.warn('[email-worker] failed to mark campaign failed:', e?.message || e);
    }

    await markJobFailed(job.id, err);
  }

  return true;
}

/**
 * Main loop.
 */
async function main() {
  console.log('[email-worker] starting up…');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let didWork = false;
    try {
      didWork = await processOnce();
    } catch (err) {
      console.error('[email-worker] loop error', err);
    }

    if (didWork) {
      // We processed a job -> sleep a bit to respect Resend rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      // Nothing to do -> sleep longer
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error('[email-worker] fatal error', err);
  process.exit(1);
});
