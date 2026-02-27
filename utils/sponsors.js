// routes/utils/sponsors.js
// Helper to load sponsors for a user in the shape the card expects.

import db from '../../db.js';

/**
 * Load sponsors by dashboard user id.
 * Adjust column names / table name to match your real schema.
 */
export async function getSponsorsForUserId(userId) {
  if (!userId) return [];

  const { rows } = await db.query(
    `
      SELECT
        id,
        name,
        url,
        -- pick whichever column actually stores your logo/banner URL
        banner_path     AS logo_url,
        sort_order,
        is_active
      FROM sponsors
      WHERE user_id = $1
        AND (is_active IS NULL OR is_active = TRUE)
      ORDER BY sort_order NULLS LAST, id ASC
    `,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name || '',
    url: row.url || null,
    logoUrl: row.logo_url || null,
  }));
}

/**
 * Optional: load sponsors by username/slug instead of user id.
 * Useful for the public /u/:slug route.
 */
export async function getSponsorsForUsername(username) {
  if (!username) return [];

  const { rows } = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.url,
        s.banner_path AS logo_url
      FROM sponsors s
      JOIN users u ON u.id = s.user_id
      WHERE u.username = $1
        AND (s.is_active IS NULL OR s.is_active = TRUE)
      ORDER BY s.sort_order NULLS LAST, s.id ASC
    `,
    [username]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name || '',
    url: row.url || null,
    logoUrl: row.logo_url || null,
  }));
}
