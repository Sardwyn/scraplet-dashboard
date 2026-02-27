// routes/profileApi.js
import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import validator from 'validator';
import { ensureLayout } from '../utils/layout.js';

const router = express.Router();

/**
 * Helper: is Pro user?
 */
function isProUser(sessionUser) {
  const plan = sessionUser?.plan || sessionUser?.subscription_plan;
  return plan === 'pro' || plan === 'PRO' || plan === 'Premium';
}

/**
 * Appearance defaults + normaliser
 */
const DEFAULT_APPEARANCE = {
  version: 1,
  theme: 'default',
  background: 'gradient-blue', // gradient-blue | gradient-purple | solid-dark
  buttonStyle: 'solid',        // solid | outline | soft
  cardStyle: 'glass',          // glass | flat
};

function normaliseAppearance(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_APPEARANCE };

  if (typeof safe.theme === 'string') out.theme = safe.theme;

  if (typeof safe.background === 'string') out.background = safe.background;
  if (typeof safe.buttonStyle === 'string') out.buttonStyle = safe.buttonStyle;
  if (typeof safe.cardStyle === 'string') out.cardStyle = safe.cardStyle;

  const allowedBackgrounds = new Set(['gradient-blue', 'gradient-purple', 'solid-dark']);
  if (!allowedBackgrounds.has(out.background)) out.background = DEFAULT_APPEARANCE.background;

  const allowedButtonStyles = new Set(['solid', 'outline', 'soft']);
  if (!allowedButtonStyles.has(out.buttonStyle)) out.buttonStyle = DEFAULT_APPEARANCE.buttonStyle;

  const allowedCardStyles = new Set(['glass', 'flat']);
  if (!allowedCardStyles.has(out.cardStyle)) out.cardStyle = DEFAULT_APPEARANCE.cardStyle;

  out.version = 1;
  return out;
}

/**
 * Build a simple visibility map from layout.sections
 * Used by both server and templates.
 */
function buildVisibilityMap(layout) {
  const sections = Array.isArray(layout?.sections) ? layout.sections : [];
  const visibilityMap = {};
  for (const section of sections) {
    if (!section || !section.type) continue;
    visibilityMap[section.type] = section.visible !== false;
  }
  return visibilityMap;
}

/**
 * POST /dashboard/api/profile/basic
 * Body: { display_name, bio }
 */
router.post('/basic', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    let { display_name, bio } = req.body || {};
    display_name = (display_name || '').toString().trim();
    bio = (bio || '').toString().trim();

    if (display_name.length > 80) {
      return res
        .status(400)
        .json({ ok: false, error: 'Display name must be <= 80 characters' });
    }

    if (bio.length > 280) {
      return res
        .status(400)
        .json({ ok: false, error: 'Bio must be <= 280 characters' });
    }

    await db.query(
      `
      UPDATE users
      SET display_name = $1,
          bio = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [display_name || null, bio || null, userId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileApi] POST /basic failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update profile basics' });
  }
});

// Allowed icon IDs for custom buttons.
// These correspond to /public/icons/<icon>.svg files.
const ALLOWED_BUTTON_ICONS = new Set([
  'link',
  'store',
  'discord',
  'github',
  'x',
  'youtube',
  'twitch',
  'kick',
  'mail',
  'globe',
]);

function normaliseButtonIcon(raw) {
  if (!raw) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  if (!ALLOWED_BUTTON_ICONS.has(value)) return null;
  return value;
}


/**
 * GET /dashboard/api/profile/buttons
 * Returns all buttons for the current user.
 */
router.get('/buttons', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { rows } = await db.query(
      `
        SELECT id, label, url, visible, icon, sort_order
        FROM custom_buttons
        WHERE user_id = $1
        ORDER BY sort_order NULLS LAST, created_at
      `,
      [userId]
    );

    const buttons = rows.map((btn) => {
      let visible = true;
      const raw = btn.visible;
      if (raw === false || raw === 'false' || raw === 0 || raw === '0') visible = false;
      return { ...btn, visible };
    });

    const pro = isProUser(req.session?.user);
    const maxButtons = pro ? null : 3;

    return res.json({
      ok: true,
      buttons,
      isProUser: pro,
      maxButtons,
    });
  } catch (err) {
    console.error('[profileApi] GET /buttons failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to load buttons' });
  }
});

/**
 * POST /dashboard/api/profile/buttons
 * Body: { label, url }
 */
router.post('/buttons', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  let { label, url, icon } = req.body || {};
  label = (label || '').trim();
  url = (url || '').trim();
  const normalisedIcon = normaliseButtonIcon(icon);

  if (!label || !url) {
    return res
      .status(400)
      .json({ ok: false, error: 'Label and URL are required' });
  }

  if (!validator.isURL(url, { require_protocol: false })) {
    return res
      .status(400)
      .json({ ok: false, error: 'Please enter a valid URL' });
  }

  const pro = isProUser(sessionUser);
  const maxButtons = pro ? Infinity : 3;

  try {
    if (!pro) {
      const countResult = await db.query(
        `
        SELECT COUNT(*)::int AS count
        FROM custom_buttons
        WHERE user_id = $1
        `,
        [userId]
      );
      const count = countResult.rows[0]?.count || 0;
      if (count >= maxButtons) {
        return res.status(403).json({
          ok: false,
          error: `Free plan: you can add up to ${maxButtons} buttons`,
        });
      }
    }

    const orderResult = await db.query(
      `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort
      FROM custom_buttons
      WHERE user_id = $1
      `,
      [userId]
    );
    const nextSort = orderResult.rows[0]?.next_sort || 1;

    const insertResult = await db.query(
      `
      INSERT INTO custom_buttons (user_id, label, url, visible, icon, sort_order)
      VALUES ($1, $2, $3, true, $4, $5)
      RETURNING id, label, url, visible, icon, sort_order
      `,
      [userId, label, url, normalisedIcon, nextSort]
    );

    return res
      .status(201)
      .json({ ok: true, button: insertResult.rows[0], isProUser: pro });
  } catch (err) {
    console.error('[profileApi] POST /buttons failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to create button' });
  }
});


/**
 * PUT /dashboard/api/profile/buttons/:id
 * Body: { label, url, visible }
 */
router.put('/buttons/:id', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const id = req.params.id;
  let { label, url, visible, icon } = req.body || {};

  label = (label || '').trim();
  url = (url || '').trim();
  const normalisedIcon = normaliseButtonIcon(icon);

  if (!label || !url) {
    return res
      .status(400)
      .json({ ok: false, error: 'Label and URL are required' });
  }

  if (!validator.isURL(url, { require_protocol: false })) {
    return res
      .status(400)
      .json({ ok: false, error: 'Please enter a valid URL' });
  }

  const visibleBool =
    typeof visible === 'boolean'
      ? visible
      : visible === 'true'
      ? true
      : visible === 'false'
      ? false
      : true;

  try {
    const updateResult = await db.query(
      `
      UPDATE custom_buttons
      SET label   = $1,
          url     = $2,
          visible = $3,
          icon    = $4
      WHERE id    = $5
        AND user_id = $6
      RETURNING id, label, url, visible, icon, sort_order
      `,
      [label, url, visibleBool, normalisedIcon, id, userId]
    );


    if (rowCount === 0) {
      return res
        .status(404)
        .json({ ok: false, error: 'Button not found or not owned by user' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileApi] PUT /buttons/:id failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update button' });
  }
});

/**
 * POST /dashboard/api/profile/buttons/reorder
 * Body: { order: [id1, id2, ...] }
 */
router.post('/buttons/reorder', requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      client.release();
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    const cleanOrder = order
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id));

    if (!cleanOrder.length) {
      client.release();
      return res.status(400).json({ ok: false, error: 'Invalid order payload' });
    }

    await client.query('BEGIN');

    let sort = 1;
    for (const id of cleanOrder) {
      await client.query(
        `
          UPDATE custom_buttons
          SET sort_order = $1
          WHERE id = $2
            AND user_id = $3
        `,
        [sort, id, userId]
      );
      sort += 1;
    }

    await client.query('COMMIT');
    client.release();

    return res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error('[profileApi] POST /buttons/reorder failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to reorder buttons' });
  }
});

/**
 * POST /dashboard/api/profile/layout
 * Body: { sections: { [type]: bool } }
 */
router.post('/layout', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const sectionsPayload = req.body?.sections || {};
    const layoutResult = await db.query(
      'SELECT layout FROM users WHERE id = $1',
      [userId]
    );

    const currentLayout = ensureLayout(layoutResult.rows[0]?.layout || {});
    const sections = Array.isArray(currentLayout.sections)
      ? currentLayout.sections
      : [];

    const nextSections = sections.map((section) => {
      if (!section || !section.type) return section;

      if (Object.prototype.hasOwnProperty.call(sectionsPayload, section.type)) {
        const raw = sectionsPayload[section.type];
        const visible =
          typeof raw === 'boolean'
            ? raw
            : raw === '1' || raw === 'true' || raw === 1;
        return { ...section, visible };
      }

      return section;
    });

    const newLayout = {
      ...currentLayout,
      sections: nextSections,
    };

    await db.query(
      'UPDATE users SET layout = $1, updated_at = NOW() WHERE id = $2',
      [newLayout, userId]
    );

    const sectionVisibility = buildVisibilityMap(newLayout);

    return res.json({ ok: true, layout: newLayout, sectionVisibility });
  } catch (err) {
    console.error('[profileApi] POST /layout failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update layout' });
  }
});

/**
 * POST /dashboard/api/profile/appearance
 * Body: { theme?, background?, buttonStyle?, cardStyle? }
 */
router.post('/appearance', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { theme, background, buttonStyle, cardStyle } = req.body || {};
    const incoming = { theme, background, buttonStyle, cardStyle };
    const appearance = normaliseAppearance(incoming);

    // IMPORTANT: this assumes you have `appearance JSONB` on users
    await db.query(
      'UPDATE users SET appearance = $1, updated_at = NOW() WHERE id = $2',
      [appearance, userId]
    );

    return res.json({ ok: true, appearance });
  } catch (err) {
    console.error('[profile/appearance POST] error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * DELETE /dashboard/api/profile/buttons/:id
 */
router.delete('/buttons/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid button ID' });
    }

    const { rowCount } = await db.query(
      `
        DELETE FROM custom_buttons
        WHERE id = $1
          AND user_id = $2
      `,
      [id, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Button not found or not owned by user',
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileApi] DELETE /buttons/:id failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to delete button' });
  }
});

export default router;
