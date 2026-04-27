// routes/viewerCountPoller.js
// Polls live viewer counts from platform APIs and pushes viewer.update events
// into the widget SSE stream via public.events.

import fetch from 'node-fetch';
import db from '../db.js';

const POLL_INTERVAL_MS = 30_000; // 30s — respectful to platform APIs
const pollers = new Map(); // userId -> { timer, channels }

/**
 * Start polling viewer counts for a user.
 * Called when a widget SSE stream opens for a user with a viewer-count widget.
 */
export function startViewerPoller(userId, channelsByPlatform) {
  const key = String(userId);
  if (pollers.has(key)) return; // already running

  console.log(`[viewer-poller] starting for user ${userId}`, channelsByPlatform);

  async function poll() {
    try {
      const counts = { kick: 0, youtube: 0, twitch: 0 };

      // ── Kick ──────────────────────────────────────────────────────────────
      if (channelsByPlatform.kick) {
        try {
          // Try the private viewer-count endpoint first (more accurate)
          const channelSlug = channelsByPlatform.kick;
          const res = await fetch(
            `https://kick.com/api/v1/channels/${encodeURIComponent(channelSlug)}`,
            { headers: { 'User-Agent': 'ScrapletOverlay/1.0', Accept: 'application/json' }, timeout: 8000 }
          );
          if (res.ok) {
            const data = await res.json();
            counts.kick = data.livestream?.viewer_count || 0;
          }
        } catch (e) {
          console.warn('[viewer-poller] kick fetch failed:', e.message);
        }
      }

      // ── YouTube ───────────────────────────────────────────────────────────
      // YouTube live viewer count requires OAuth — use cached user_stats for now
      if (channelsByPlatform.youtube) {
        try {
          const r = await db.query(
            `SELECT ccv FROM public.user_stats WHERE user_id = $1`,
            [userId]
          );
          counts.youtube = r.rows[0]?.ccv?.youtube || 0;
        } catch (e) { /* ignore */ }
      }

      // ── Twitch ────────────────────────────────────────────────────────────
      // Twitch requires Helix API — use cached user_stats for now
      if (channelsByPlatform.twitch) {
        try {
          const r = await db.query(
            `SELECT ccv FROM public.user_stats WHERE user_id = $1`,
            [userId]
          );
          counts.twitch = r.rows[0]?.ccv?.twitch || 0;
        } catch (e) { /* ignore */ }
      }

      const total = counts.kick + counts.youtube + counts.twitch;

      // Push into public.events so the SSE stream picks it up
      await db.query(
        `INSERT INTO public.events
           (id, v, source, kind, ts, channel_slug, actor_id, actor_username, payload, user_id)
         VALUES
           ($1, 1, 'system', 'viewer.update', now(), 'system', null, null, $2::jsonb, $3)`,
        [
          'vc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          JSON.stringify({ total, kick: counts.kick, youtube: counts.youtube, twitch: counts.twitch }),
          userId
        ]
      );
    } catch (e) {
      console.warn('[viewer-poller] poll error:', e.message);
    }
  }

  // Poll immediately then on interval
  poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  pollers.set(key, { timer, refCount: 1 });
}

export function stopViewerPoller(userId) {
  const key = String(userId);
  const entry = pollers.get(key);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount <= 0) {
    clearInterval(entry.timer);
    pollers.delete(key);
    console.log(`[viewer-poller] stopped for user ${userId}`);
  }
}

/**
 * Get channel slugs for a user across platforms.
 */
export async function getChannelsForUser(userId) {
  try {
    const r = await db.query(
      `SELECT platform, channel_slug FROM public.channels
       WHERE account_id IN (
         SELECT id FROM public.external_accounts WHERE user_id = $1
       )`,
      [userId]
    );
    const result = {};
    for (const row of r.rows) {
      result[row.platform] = row.channel_slug;
    }
    return result;
  } catch (e) {
    console.warn('[viewer-poller] getChannels failed:', e.message);
    return {};
  }
}
