// services/profileService.js
import db from '../db.js';
import { ensureLayout, buildVisibilityMap } from '../utils/layout.js';
import { getStatsForUser, gradeMarketability } from '../scripts/stats.js';
import { getHandlesForUser } from '../scripts/externalAccounts.js';

/**
 * Local platform → icon helper (same logic as public route)
 */
const platformMap = {
  'twitch.tv': 'twitch',
  'youtube.com': 'youtube',
  'paypal.me': 'paypal',
  'x.com': 'x',
  'buymeacoffee.com': 'buy-me-a-coffee',
  'cash.app': 'cashapp',
  'discord.gg': 'discord',
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'snapchat.com': 'snapchat',
  'tiktok.com': 'tiktok',
  'venmo.com': 'venmo',
  'onlyfans.com': 'onlyfans',
  'threads.net': 'threads',
  'tumblr.com': 'tumblr',
  'deviantart.com': 'deviantart',
  'gog.com': 'gogdotcom',
  'epicgames.com': 'epic-games',
};

function detectIcon(url) {
  if (!url) return null;
  const entry = Object.entries(platformMap).find(([domain]) =>
    url.includes(domain)
  );
  return entry?.[1] || null;
}

/**
 * Normalise sponsor DB row → view model (shared for public + editor)
 */
function normaliseSponsorSize(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'lg';
  if (value === 'sm' || value === 'md' || value === 'lg') return value;
  return 'lg';
}

function mapSponsorRow(row) {
  const isActive =
    row.is_active === true ||
    row.is_active === 'true' ||
    row.is_active === 1 ||
    row.is_active === '1' ||
    row.is_active === null ||
    typeof row.is_active === 'undefined';

  return {
    id: row.id,
    name: row.name,
    url: row.url || null,
    banner_url: row.banner_url || null,
    sort_order: row.sort_order || 0,
    is_active: isActive,
    size: normaliseSponsorSize(row.size || 'lg'),
  };
}

async function loadSponsorsForUser(userId) {
  const { rows } = await db.query(
    `
      SELECT
        id,
        name,
        url,
        banner_url,
        sort_order,
        is_active,
        size
      FROM sponsors
      WHERE user_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
    [userId]
  );

  return rows.map(mapSponsorRow);
}

/**
 * Load full profile bundle by username (for public profile)
 */
export async function loadProfileByUsername(username) {
  const userResult = await db.query(
    `
      SELECT
        id,
        username,
        display_name,
        avatar_url,
        bio,
        x,
        youtube,
        twitch,
        kick,
        instagram,
        tiktok,
        facebook,
        layout,
        appearance,
        cover_image_url
      FROM users
      WHERE username = $1
    `,
    [username]
  );

  const profile = userResult.rows[0] || null;
  if (!profile) return null;

  const handles = await getHandlesForUser(profile.id);

  profile.x       = handles.x       ?? profile.x       ?? null;
  profile.youtube = handles.youtube ?? profile.youtube ?? null;
  profile.twitch  = handles.twitch  ?? profile.twitch  ?? null;
  profile.kick    = handles.kick    ?? profile.kick    ?? null;

  return hydrateProfileBundle(profile);
}

/**
 * Load full profile bundle by user id (for editor)
 */
export async function loadProfileByUserId(userId) {
  const userResult = await db.query(
    `
      SELECT
        id,
        username,
        display_name,
        avatar_url,
        bio,
        x,
        youtube,
        twitch,
        kick,
        instagram,
        tiktok,
        facebook,
        layout,
        appearance,
        cover_image_url
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  const profile = userResult.rows[0] || null;
  if (!profile) return null;

  // Canonical socials from external_accounts
  const handles = await getHandlesForUser(profile.id);

  profile.x       = handles.x       ?? profile.x       ?? null;
  profile.youtube = handles.youtube ?? profile.youtube ?? null;
  profile.twitch  = handles.twitch  ?? profile.twitch  ?? null;
  profile.kick    = handles.kick    ?? profile.kick    ?? null;

  return hydrateProfileBundle(profile);
}

/**
 * Build the full bundle used by public + editor views
 */
async function hydrateProfileBundle(profile) {
  const layout = ensureLayout(profile.layout);
  const sectionVisibility = buildVisibilityMap(layout);

  // Buttons
  const buttonsResult = await db.query(
    `
      SELECT
        id,
        label,
        url,
        visible,
        icon,
        sort_order,
        shape,
        size,
        featured_image_url,
        accent_color,
        accent_target
      FROM custom_buttons
      WHERE user_id = $1
      ORDER BY sort_order NULLS LAST, created_at
    `,
    [profile.id]
  );

  const customButtons = buttonsResult.rows.map((row) => {
    let visible = true;
    const rawVisible = row.visible;
    if (
      rawVisible === false ||
      rawVisible === 'false' ||
      rawVisible === 0 ||
      rawVisible === '0'
    ) {
      visible = false;
    }

    let icon = row.icon;
    if (!icon) {
      const detected = detectIcon(row.url);
      if (detected) icon = detected;
    }

    const accentTarget =
      (row.accent_target || '').toLowerCase() === 'label' ? 'label' : 'button';

    return {
      id: row.id,
      label: row.label,
      url: row.url,
      visible,
      icon,
      sort_order: row.sort_order,
      shape: row.shape || 'pill',
      size: row.size || 'md',
      featured_image_url: row.featured_image_url || null,
      accent_color: row.accent_color || null,
      accent_target: accentTarget,
    };
  });

  // Sponsors (full list for both public + editor)
  const sponsors = await loadSponsorsForUser(profile.id);

  // Stats + marketability
  let stats = {};
  let marketability = 'F';

  try {
    const statsResult = await getStatsForUser({
      userId:    profile.id,
      youtube:   profile.youtube   || null,
      twitch:    profile.twitch    || null,
      kick:      profile.kick      || null,
      instagram: profile.instagram || null,
      tiktok:    profile.tiktok    || null,
      x:         profile.x         || null,
      facebook:  profile.facebook  || null,
    });

    const followers = (statsResult && statsResult.followers) || {};
    const totalFollowers = Object.values(followers).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );

    stats = {
      ...(statsResult || {}),
      totalFollowers,
    };

    marketability =
      (statsResult && statsResult.marketability) ||
      gradeMarketability(statsResult || {});
  } catch (err) {
    console.warn('[profileService] Stats fetch failed:', err);
  }

  return {
    profile,
    layout,
    sectionVisibility,
    customButtons,
    stats,
    marketability,
    appearance: profile.appearance || null,
    sponsors,
  };
}
