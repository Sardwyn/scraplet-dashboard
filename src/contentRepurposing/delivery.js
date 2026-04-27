// src/contentRepurposing/delivery.js
// Delivers content packs to Discord and handles approval reactions.

import db from '../../db.js';

const BOT_INTERNAL_PORT = process.env.BOT_INTERNAL_PORT || 3025;

/**
 * Deliver a content pack to the streamer's designated Discord channel.
 * Posts the pack as a structured message with ✅ ✏️ ❌ reactions.
 */
export async function deliverContentPack(packId, userId) {
  try {
    // Get pack
    const { rows: [pack] } = await db.query(
      `SELECT * FROM content_packs WHERE pack_id = $1`,
      [packId]
    );
    if (!pack) return;

    // Get Discord config
    const { rows: guildRows } = await db.query(
      `SELECT sgs.debrief_channel_id, sgs.guild_id
       FROM scrapbot_guild_settings sgs
       JOIN discord_guild_integrations dgi ON dgi.guild_id = sgs.guild_id
       WHERE dgi.owner_user_id = $1 AND dgi.status = 'active'
         AND sgs.debrief_channel_id IS NOT NULL
       LIMIT 1`,
      [userId]
    );
    if (!guildRows.length) return;

    const channelId = guildRows[0].debrief_channel_id;
    const thread = JSON.parse(pack.twitter_thread || '[]');
    const script = JSON.parse(pack.shorts_script || '{}');

    // Build message
    const tweetLines = thread.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const message = [
      `📦 **Content Pack — Session ${pack.session_id.slice(0, 8)}**`,
      ``,
      `**🐦 Twitter/X Thread** *(copy & paste to post):*`,
      `\`\`\``,
      tweetLines,
      `\`\`\``,
      ``,
      `**🎬 YouTube Shorts:**`,
      `Title: ${script.title || '—'}`,
      `Script: ${script.script || '—'}`,
      `Tags: ${(script.hashtags || []).map(h => `#${h}`).join(' ')}`,
      ``,
      `**💬 Discord Recap:**`,
      pack.discord_recap || '—',
      ``,
      `React: ✅ approve & post | ✏️ edit | ❌ discard`,
    ].join('\n');

    // Send to bot for Discord delivery
    const resp = await fetch(`http://127.0.0.1:${BOT_INTERNAL_PORT}/internal/content-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId,
        message,
        packId,
        userId,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.messageId) {
        await db.query(
          `UPDATE content_packs SET discord_message_id = $1, designated_channel_id = $2 WHERE pack_id = $3`,
          [data.messageId, channelId, packId]
        );
      }
    }
  } catch (err) {
    console.error('[contentPackDelivery] error:', err.message);
  }
}
