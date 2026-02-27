// /scripts/externalAccounts.js
import db from '../db.js';
import { normaliseHandle } from './normalise.js';

/**
 * Upsert a social / external account for a user.
 *
 * - For simple socials (x, twitch, youtube, etc.), this:
 *   - Inserts or updates (user_id, platform) with username.
 *   - Deletes the row if both username and externalUserId are empty.
 *
 * - For Kick (platform === 'kick'):
 *   - If there is an existing row with external_user_id (OAuth-linked),
 *     we NEVER delete it from the profile form.
 *   - If called with a new username but no externalUserId, we update only
 *     the username and preserve external_user_id.
 *   - If there is no existing row, we create a profile-only Kick row
 *     with username and external_user_id = NULL.
 *
 * @param {Object} params
 * @param {number} params.userId
 * @param {string} params.platform - e.g. 'x', 'twitch', 'youtube', 'kick'
 * @param {string|null} params.username - human-readable handle or URL
 * @param {string|null|number} params.externalUserId - OAuth external ID (Kick, etc.)
 */
export async function upsertExternalAccount({
  userId,
  platform,
  username,
  externalUserId,
}) {
  if (!userId || !platform) {
    throw new Error('upsertExternalAccount requires userId and platform');
  }

  const cleanUsername = username
    ? normaliseHandle(platform, username)
    : null;

  const cleanExternalId = externalUserId || null;

  // Look up existing row so we can behave differently for linked accounts
  const { rows } = await db.query(
    `
    SELECT id, external_user_id
    FROM public.external_accounts
    WHERE user_id = $1 AND platform = $2
    `,
    [userId, platform]
  );
  const existing = rows[0] || null;

  // --- CASE 1: Nothing to store (no username, no external ID) ---

  if (!cleanUsername && !cleanExternalId) {
    // For Kick with an OAuth-linked account, do NOT delete.
    if (platform === 'kick' && existing && existing.external_user_id) {
      console.debug(
        '[externalAccounts] Not deleting Kick account with external_user_id for user',
        userId
      );
      return;
    }

    // For everything else, or Kick with no external_user_id, we can delete.
    if (existing) {
      await db.query(
        'DELETE FROM public.external_accounts WHERE id = $1',
        [existing.id]
      );
      console.debug('[externalAccounts] Deleted external account row', {
        userId,
        platform,
        id: existing.id,
      });
    }
    return;
  }

  // --- CASE 2: Existing row with external_user_id, but caller didn't pass a new one ---


  if (platform === 'kick' && existing && existing.external_user_id && !cleanExternalId) {
  console.debug('[externalAccounts] Ignoring profile username update for OAuth-linked Kick account');
  return; // do NOTHING – OAuth username is authoritative
}


  // --- CASE 3: Normal insert/upsert path ---

  // This covers:
  // - First-time social account setup (no existing row)
  // - OAuth linking that sets external_user_id
  // - Any platform where we actually do want to update external_user_id
  await db.query(
    `
    INSERT INTO public.external_accounts (platform, external_user_id, username, user_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, platform) DO UPDATE SET
      external_user_id = EXCLUDED.external_user_id,
      username         = EXCLUDED.username,
      updated_at       = now()
    `,
    [platform, cleanExternalId, cleanUsername, userId]
  );

  console.debug('[externalAccounts] Upserted account', {
    userId,
    platform,
    hasExternalId: !!cleanExternalId,
    username: cleanUsername,
  });
}

/**
 * Return a simple map of platform -> handle for a user.
 * Prefers username, falls back to external_user_id if needed.
 */
export async function getHandlesForUser(userId) {
  const { rows } = await db.query(
    `
    SELECT platform, username, external_user_id
    FROM public.external_accounts
    WHERE user_id = $1
    `,
    [userId]
  );

  const handles = {};

  for (const row of rows) {
    const key = row.platform; // 'x', 'twitch', 'youtube', 'kick', etc.
    handles[key] = row.username || row.external_user_id || null;
  }

  return handles;
}
