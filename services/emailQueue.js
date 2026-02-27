// services/emailQueue.js
import db from '../db.js';

/**
 * Decide whether to enqueue a go-live email job for this user.
 * - Only handles Kick for V2
 * - Respects email_settings.go_live_email_kick_enabled
 * - Respects 1-hour cooldown using last_go_live_email_at
 * - Requires at least 1 active subscriber
 */
export async function maybeQueueGoLiveEmail(userId, payload) {
  if (!userId) return;

  const platform = (payload.platform || 'kick').toLowerCase();
  if (platform !== 'kick') {
    // V2: only Kick; Twitch/YT later
    return;
  }

  // 1) Load settings
  const { rows: settingsRows } = await db.query(
    `
    SELECT
      go_live_email_kick_enabled,
      last_go_live_email_at
    FROM email_settings
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  const settings =
    settingsRows[0] || {
      go_live_email_kick_enabled: false,
      last_go_live_email_at: null,
    };

  if (!settings.go_live_email_kick_enabled) {
    // User has not enabled this feature
    return;
  }

  // 2) Cooldown: 1 hour
  if (settings.last_go_live_email_at) {
    const last = new Date(settings.last_go_live_email_at);
    const now = new Date();
    const diffMs = now.getTime() - last.getTime();
    const oneHourMs = 60 * 60 * 1000;

    if (diffMs < oneHourMs) {
      // Within cooldown window; do nothing
      return;
    }
  }

  // 3) Require at least 1 active subscriber
  const {
    rows: [countRow],
  } = await db.query(
    `
    SELECT COUNT(*)::int AS active_contacts
    FROM email_subscribers
    WHERE user_id = $1
      AND unsubscribed = false
    `,
    [userId]
  );

  const activeContacts = countRow?.active_contacts || 0;
  if (activeContacts <= 0) {
    // No one to email, skip job
    return;
  }

  // 4) Build minimal payload for the job
  const jobPayload = {
    type: 'go_live',
    platform,
    channel_slug: payload.channel_slug || payload.slug || null,
    title: payload.title || null,
    // we *don't* bake subscriber emails here; worker will query them fresh
  };

  // 5) Enqueue job
  await db.query(
    `
    INSERT INTO email_jobs (user_id, kind, payload)
    VALUES ($1, 'go_live', $2::jsonb)
    `,
    [userId, jobPayload]
  );

  // NOTE: we intentionally do *not* update last_go_live_email_at here.
  // We'll update that after a successful send in the worker phase.
}
