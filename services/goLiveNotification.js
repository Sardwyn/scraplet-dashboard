// services/goLiveNotification.js
// Sends a "going live" Discord notification when a stream starts.

import db from '../db.js';

const BOT_INTERNAL_PORT = process.env.BOT_INTERNAL_PORT || 3025;

export async function sendGoLiveDiscordNotification({ ownerUserId, channelSlug, platform }) {
  try {
    // Get guild and go-live settings
    const { rows } = await db.query(
      `SELECT dgi.guild_id, sgs.go_live_discord_enabled, sgs.go_live_discord_channel_id
       FROM public.discord_guild_integrations dgi
       LEFT JOIN public.scrapbot_guild_settings sgs ON sgs.guild_id = dgi.guild_id
       WHERE dgi.owner_user_id = $1 AND dgi.status = 'active'
       LIMIT 1`,
      [ownerUserId]
    );

    if (!rows.length) return;
    const { guild_id, go_live_discord_enabled, go_live_discord_channel_id } = rows[0];

    if (!go_live_discord_enabled || !go_live_discord_channel_id) return;

    // Get streamer display name
    const { rows: userRows } = await db.query(
      `SELECT username, display_name FROM public.users WHERE id = $1 LIMIT 1`,
      [ownerUserId]
    );
    const name = userRows[0]?.display_name || userRows[0]?.username || channelSlug;

    // Get Kick channel URL
    const platformLabel = (platform || 'kick').charAt(0).toUpperCase() + (platform || 'kick').slice(1);
    const streamUrl = platform === 'kick'
      ? `https://kick.com/${channelSlug}`
      : `https://twitch.tv/${channelSlug}`;

    const message = `🔴 **${name} is live on ${platformLabel}!**\n${streamUrl}`;

    const resp = await fetch(`http://127.0.0.1:${BOT_INTERNAL_PORT}/internal/go-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guild_id,
        channel_id: go_live_discord_channel_id,
        message,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      console.log('[goLiveNotification] sent to Discord', { guild_id, channel_id: go_live_discord_channel_id });
    } else {
      console.warn('[goLiveNotification] bot returned', resp.status);
    }
  } catch (e) {
    console.error('[goLiveNotification] error:', e.message);
  }
}
