// routes/profileViewModel.js
import db from "../db.js";
import { ensureLayout, buildVisibilityMap } from "../utils/layout.js";
import { normaliseAppearance } from "../utils/appearance.js";

/**
 * Safe JSON parse for columns that may be stored as JSONB, object, or string.
 */
function safeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Build the profile bundle for the editor & preview, keyed by user id.
 * This follows the DB shape for custom_buttons so the editor preview
 * matches the public card (full-fat buttons, tiles, accents, etc.).
 *
 * IMPORTANT SHIM:
 * - Prefer users.layout (canonical write target in other routes)
 * - Fallback to users.layout_json (legacy)
 */
export async function buildProfileViewModel(userId) {
  // 1) Load user & profile fields + raw layout(s) + appearance
  const {
    rows: [user],
  } = await db.query(
    `
      SELECT
        id,
        username,
        display_name,
        bio,
        avatar_url,
        cover_image_url,
        cover_video_url,
        x_handle,
        youtube_url,
        twitch_url,
        kick_url,

        -- Canonical layout (newer)
        layout,

        -- Legacy layout (older)
        layout_json,

        appearance
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  if (!user) return null;

  // 2) Layout (V2 sections-only model) + sectionVisibility map
  // Prefer users.layout; fallback to users.layout_json.
  const rawLayout =
    safeJson(user.layout) ??
    safeJson(user.layout_json) ??
    null;

  // If we had to fall back, log once (useful to spot drift without breaking anything)
  if (!user.layout && user.layout_json) {
    // eslint-disable-next-line no-console
    console.warn(
      "[profileViewModel] using legacy users.layout_json fallback for user_id=%s (consider migrating to users.layout)",
      user.id
    );
  }

  const layout = ensureLayout(rawLayout);
  const sectionVisibility = buildVisibilityMap(layout);

  // 3) Buttons – FOLLOW THE DB SHAPE
  // Pull the same columns the public route uses, and pass them through.
  const { rows: buttonRows } = await db.query(
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
    [userId]
  );

  // Only minimal normalisation: visible to boolean, accent_target to sane value.
  const customButtons = buttonRows.map((row) => {
    let visible = true;
    const rawVisible = row.visible;
    if (
      rawVisible === false ||
      rawVisible === "false" ||
      rawVisible === 0 ||
      rawVisible === "0"
    ) {
      visible = false;
    }

    let accentTarget = (row.accent_target || "").toLowerCase();
    if (accentTarget === "title" || accentTarget === "text") {
      accentTarget = "label";
    }
    if (accentTarget !== "label" && accentTarget !== "button") {
      accentTarget = "button";
    }

    return {
      id: row.id,
      label: row.label,
      url: row.url,
      visible,
      icon: row.icon,
      sort_order: row.sort_order,
      shape: row.shape, // whatever DB has
      size: row.size, // whatever DB has
      featured_image_url: row.featured_image_url,
      accent_color: row.accent_color,
      accent_target: accentTarget,
    };
  });

  // 4) Appearance – jsonb column `appearance`
  const appearance = normaliseAppearance(user.appearance || null);

  // 5) Profile object for the editor & public card
  const profile = {
    id: user.id,
    username: user.username,
    display_name: user.display_name || user.username,
    bio: user.bio,
    avatar_url: user.avatar_url,
    cover_image_url: user.cover_image_url,
    cover_video_url: user.cover_video_url,
    x: user.x_handle,
    youtube: user.youtube_url,
    twitch: user.twitch_url,
    kick: user.kick_url,
  };

  // No stats/marketability here – editor doesn’t need them for buttons.
  return { profile, layout, sectionVisibility, customButtons, appearance };
}
