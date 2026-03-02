// /scripts/scrapbotAccounts.js
// Ensure a Kick-linked dashboard user has a corresponding scrapbot_accounts entry
// in the scrapbot_clean DB.
//
// IMPORTANT: channel_id is ALWAYS the Kick channel slug (stable identifier).
// Do NOT use chatroom_id here; it can be null and/or change shape over time.

import db from "../db.js"; // creator_platform
import scrapbotDb from "../scrapbotDb.js"; // scrapbot_clean

export async function ensureKickScrapbotAccountForUser(userId) {
  // 1) Find a Kick external account for this dashboard user.
  const { rows: kickRows } = await db.query(
    `
    SELECT id, username, external_user_id
    FROM public.external_accounts
    WHERE platform = 'kick'
      AND user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  if (!kickRows.length) return null;

  const kickAccount = kickRows[0];

  // 2) Find the channel slug in creator_platform.channels (best source of truth).
  // We join via external_user_id (Kick broadcaster id) which you already store.
  const { rows: chRows } = await db.query(
    `
    SELECT channel_slug
    FROM public.channels
    WHERE platform = 'kick'
      AND external_user_id = $1
    LIMIT 1
    `,
    [String(kickAccount.external_user_id)]
  );

  // Fallback: use username lowercased (old behaviour), but prefer channels.channel_slug.
  const channelSlug =
    (chRows[0]?.channel_slug || kickAccount.username || "").trim().toLowerCase();

  if (!channelSlug) {
    // Nothing we can safely key on.
    return null;
  }

  // 3) UPSERT into scrapbot_clean.scrapbot_accounts
  // Uniqueness is (platform, channel_id). We set channel_id = channelSlug.
  const { rows: accountRows } = await scrapbotDb.query(
    `
    INSERT INTO public.scrapbot_accounts (owner_user_id, platform, channel_id, channel_name)
    VALUES ($1, 'kick', $2, $3)
    ON CONFLICT (platform, channel_id)
    DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      channel_name  = EXCLUDED.channel_name,
      updated_at    = now()
    RETURNING *;
    `,
    [userId, channelSlug, channelSlug]
  );

  return accountRows[0] || null;
}
