// routes/profileApi.js
import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import validator from 'validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ensureLayout, buildVisibilityMap } from '../utils/layout.js';

const router = express.Router();

// Allowed button shapes/sizes for profile buttons
const ALLOWED_BUTTON_SHAPES = new Set(['pill', 'soft', 'square']);
const ALLOWED_BUTTON_SIZES = new Set(['sm', 'md', 'lg']);

// Allowed sizes for sponsors (behaviour like tiles)
const ALLOWED_SPONSOR_SIZES = new Set(['sm', 'md', 'lg']);

/**
 * Helper: is Pro user?
 */
function isProUser(sessionUser) {
  const plan = sessionUser?.plan || sessionUser?.subscription_plan;
  return plan === 'pro' || plan === 'PRO' || plan === 'Premium';
}

// ---------------- APPEARANCE ----------------

const DEFAULT_APPEARANCE = {
  theme: 'midnight',          // default theme
  background: 'hero-dark',
  buttonStyle: 'solid',
  cardStyle: 'glass',
  canvasBg: '',               // CSS background value for the page canvas
  canvasVideo: '',            // URL for background video
  qrEnabled: true,            // show QR code toggle on public profile
};

function normaliseAppearance(raw) {
  const out = { ...DEFAULT_APPEARANCE };

  if (!raw || typeof raw !== 'object') return out;

  // Theme
  if (raw.theme && typeof raw.theme === 'string') {
    const v = raw.theme.trim().toLowerCase();
    const allowed = ['midnight', 'neon', 'soft', 'kick', 'pixel'];

    out.theme = allowed.includes(v) ? v : DEFAULT_APPEARANCE.theme;
  }

  // Simple passthrough for the rest for now
  if (raw.background && typeof raw.background === 'string') {
    out.background = raw.background.trim();
  }

  if (raw.canvasBg !== undefined) {
    out.canvasBg = typeof raw.canvasBg === 'string' ? raw.canvasBg.slice(0, 500) : '';
  }
  if (raw.canvasVideo !== undefined) {
    out.canvasVideo = typeof raw.canvasVideo === 'string' ? raw.canvasVideo.slice(0, 500) : '';
  }
  if (raw.qrEnabled !== undefined) {
    out.qrEnabled = raw.qrEnabled !== false;
  }

  if (raw.buttonStyle && typeof raw.buttonStyle === 'string') {
    out.buttonStyle = raw.buttonStyle.trim();
  }

  if (raw.cardStyle && typeof raw.cardStyle === 'string') {
    out.cardStyle = raw.cardStyle.trim();
  }

  return out;
}

// ==== COVER UPLOAD ====

const coverUploadDir = '/var/www/scraplet-uploads/profile-covers';
if (!fs.existsSync(coverUploadDir)) {
  fs.mkdirSync(coverUploadDir, { recursive: true });
}

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, coverUploadDir),
  filename: (req, file, cb) => {
    const userId = req.session?.user?.id || 'anon';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `cover-${userId}-${Date.now()}${ext}`);
  },
});

const coverUpload = multer({
  storage: coverStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// POST /dashboard/api/profile/cover
router.post(
  '/cover',
  requireAuth,
  coverUpload.single('cover'),
  async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Not authenticated' });

      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }

      // URL the browser can reach, assuming app serves /uploads -> /var/www/scraplet-uploads
      const relativePath = `/uploads/profile-covers/${req.file.filename}`;

      await db.query(
        `
          UPDATE users
          SET cover_image_url = $1,
              updated_at      = NOW()
          WHERE id = $2
        `,
        [relativePath, userId]
      );

      // Redirect back to editor (same pattern as avatar upload)
      if (String(req.headers.accept || '').includes('text/html')) {
        return res.redirect('/profile/editor?cover=ok');
      }
      return res.json({ ok: true, cover_image_url: relativePath });
    } catch (err) {
      console.error('[profileApi] POST /cover failed:', err);
      if (String(req.headers.accept || '').includes('text/html')) {
        return res.redirect('/profile/editor?cover=error');
      }
      return res.status(500).json({ ok: false, error: 'Failed to upload cover' });
    }
  }
);

/**
 * POST /dashboard/api/profile/basic
 * Body: { display_name, bio }
 */

// ==== AVATAR UPLOAD ====

const avatarUploadDir = '/var/www/scraplet-uploads/avatars';
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarUploadDir),
  filename: (req, file, cb) => {
    const userId = req.session?.user?.id || 'anon';
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
    cb(null, `avatar-${userId}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// POST /dashboard/api/profile/avatar
router.post(
  '/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      if (!req.file) {
        if (String(req.headers.accept || '').includes('text/html')) {
          return res.redirect('/profile/editor?avatar=missing');
        }
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }

      // URL the browser can reach, assuming app serves /uploads -> /var/www/scraplet-uploads
      const relativePath = `/uploads/avatars/${req.file.filename}`;

      await db.query(
        `
          UPDATE users
          SET avatar_url = $1,
              has_onboarded = TRUE,
              updated_at = NOW()
          WHERE id = $2
        `,
        [relativePath, userId]
      );

      if (String(req.headers.accept || '').includes('text/html')) {
        return res.redirect('/profile/editor?avatar=ok');
      }

      return res.json({ ok: true, avatar_url: relativePath });
    } catch (err) {
      console.error('[profileApi] POST /avatar failed:', err);
      if (String(req.headers.accept || '').includes('text/html')) {
        return res.redirect('/profile/editor?avatar=error');
      }
      return res.status(500).json({ ok: false, error: 'Failed to upload avatar' });
    }
  }
);

router.post('/basic', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    let { display_name, bio, tags } = req.body || {};
    display_name = (display_name || '').toString().trim();
    bio = (bio || '').toString().trim();

    // tags can come as CSV string or array
    let tagArray = [];
    if (Array.isArray(tags)) {
      tagArray = tags.map((t) => (t || '').toString().trim()).filter(Boolean);
    } else {
      tagArray = (tags || '')
        .toString()
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    // hard limits to keep profile sane
    tagArray = tagArray.slice(0, 20).map((t) => t.slice(0, 24));

    if (display_name.length > 80) {
      return res.status(400).json({ ok: false, error: 'Display name must be <= 80 characters' });
    }

    if (bio.length > 280) {
      return res.status(400).json({ ok: false, error: 'Bio must be <= 280 characters' });
    }

    await db.query(
      `
      UPDATE users
      SET display_name = $1,
          bio = $2,
          tags = $3,
          has_onboarded = TRUE,
          updated_at = NOW()
      WHERE id = $4
      `,
      [display_name || null, bio || null, tagArray, userId]
    );

    if (String(req.headers.accept || '').includes('text/html')) {
      return res.redirect('/profile/editor?basic=ok');
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileApi] POST /basic failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update profile basics' });
  }
});


// GET /dashboard/api/profile/socials
// Returns which platforms are OAuth-managed (locked) for this user.
router.get('/socials', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Default: only Kick can be OAuth-owned right now
    const locks = {
      x: false,
      youtube: false,
      twitch: false,
      kick: false,
    };

    // Kick OAuth is now stored in external_account_tokens (single authority)
    const { rows } = await db.query(
      `
      SELECT 1
        FROM external_account_tokens eat
        JOIN external_accounts ea ON ea.id = eat.external_account_id
       WHERE ea.platform = 'kick' AND ea.user_id = $1
       LIMIT 1
      `,
      [userId]
    );

    if (rows.length > 0) {
      locks.kick = true;
    }

    return res.json({ ok: true, locks });
  } catch (err) {
    console.error('[profileApi] GET /socials failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load social lock status',
    });
  }
});

// POST /dashboard/api/profile/socials
router.post('/socials', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    let { x, youtube, twitch, kick } = req.body || {};

    const norm = (v) => {
      if (!v) return null;
      const s = String(v).trim();
      return s || null;
    };

    x = norm(x);
    youtube = norm(youtube);
    twitch = norm(twitch);
    kick = norm(kick);

    // Is Kick OAuth'd for this user? (single authority: external_account_tokens)
    const { rows: kickRows } = await db.query(
      `
      SELECT 1
        FROM external_account_tokens eat
        JOIN external_accounts ea ON ea.id = eat.external_account_id
       WHERE ea.platform = 'kick' AND ea.user_id = $1
       LIMIT 1
      `,
      [userId]
    );

    const kickLocked = kickRows.length > 0;

    // Get current values so we can preserve kick when locked
    const { rows: currentRows } = await db.query(
      `
      SELECT x, youtube, twitch, kick
      FROM public.users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    const current = currentRows[0] || {};

    const nextX = x;
    const nextYoutube = youtube;
    const nextTwitch = twitch;
    const nextKick = kickLocked ? current.kick : kick;

    await db.query(
      `
      UPDATE users
      SET x       = $1,
          youtube = $2,
          twitch  = $3,
          kick    = $4,
          updated_at = NOW()
      WHERE id = $5
      `,
      [nextX, nextYoutube, nextTwitch, nextKick, userId]
    );

    return res.json({
      ok: true,
      locked: {
        x: false,
        youtube: false,
        twitch: false,
        kick: kickLocked,
      },
    });
  } catch (err) {
    console.error('[profileApi] POST /socials failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to update social links',
    });
  }
});

// ---------------- BUTTON HELPERS ----------------

function normaliseButtonIcon(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  return value || null;
}

function normaliseButtonShape(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || !ALLOWED_BUTTON_SHAPES.has(value)) return 'pill';
  return value;
}

function normaliseButtonSize(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || !ALLOWED_BUTTON_SIZES.has(value)) return 'md';
  return value;
}

function normaliseAccentColor(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  return value;
}

function normaliseAccentTarget(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'label' || value === 'title' || value === 'text') return 'label';
  return 'button';
}

// -------- SPONSOR HELPERS --------

function normaliseSponsorSize(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'lg';
  if (ALLOWED_SPONSOR_SIZES.has(value)) return value;
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

async function getSponsorsForUser(userId) {
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

// ---------- SPONSORS (PROFILE-LEVEL CRUD) ----------

/**
 * GET /dashboard/api/profile/sponsors
 * Returns: { ok, sponsors }
 */
router.get('/sponsors', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const sponsors = await getSponsorsForUser(userId);
    return res.json({ ok: true, sponsors });
  } catch (err) {
    console.error('[profileApi] GET /sponsors failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to load sponsors' });
  }
});

/**
 * POST /dashboard/api/profile/sponsors
 * Body: { name, url?, size? }
 * Returns: { ok, sponsors }
 */
router.post('/sponsors', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    let { name, url, size } = req.body || {};
    name = (name || '').toString().trim();
    url = (url || '').toString().trim();
    const normSize = normaliseSponsorSize(size);

    if (!name) {
      return res
        .status(400)
        .json({ ok: false, error: 'Sponsor name is required' });
    }

    if (url && !validator.isURL(url, { require_protocol: false })) {
      return res
        .status(400)
        .json({ ok: false, error: 'Please enter a valid URL' });
    }

    // Next sort_order for this user
    const { rows: orderRows } = await db.query(
      `
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort
        FROM sponsors
        WHERE user_id = $1
      `,
      [userId]
    );
    const nextSort = orderRows[0]?.next_sort || 1;

    await db.query(
      `
        INSERT INTO sponsors (
          user_id,
          name,
          url,
          banner_url,
          is_active,
          sort_order,
          size,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, NULL, TRUE, $4, $5, NOW(), NOW())
      `,
      [userId, name, url || null, nextSort, normSize]
    );

    const sponsors = await getSponsorsForUser(userId);
    return res.status(201).json({ ok: true, sponsors });
  } catch (err) {
    console.error('[profileApi] POST /sponsors failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to create sponsor' });
  }
});

/**
 * PUT /dashboard/api/profile/sponsors/:id
 * Body: { name?, url?, is_active?, size? }
 * Returns: { ok, sponsors }
 */
router.put('/sponsors/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid sponsor ID' });
    }

    let { name, url, is_active, size } = req.body || {};
    name = (name || '').toString().trim();
    url = (url || '').toString().trim();
    const normSize = normaliseSponsorSize(size);

    if (!name) {
      return res
        .status(400)
        .json({ ok: false, error: 'Sponsor name is required' });
    }

    if (url && !validator.isURL(url, { require_protocol: false })) {
      return res
        .status(400)
        .json({ ok: false, error: 'Please enter a valid URL' });
    }

    let active = true;
    if (
      is_active === false ||
      is_active === 'false' ||
      is_active === 0 ||
      is_active === '0'
    ) {
      active = false;
    }

    const { rowCount } = await db.query(
      `
        UPDATE sponsors
        SET
          name       = $1,
          url        = $2,
          is_active  = $3,
          size       = $4,
          updated_at = NOW()
        WHERE id = $5
          AND user_id = $6
      `,
      [name, url || null, active, normSize, id, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Sponsor not found or not owned by user',
      });
    }

    const sponsors = await getSponsorsForUser(userId);
    return res.json({ ok: true, sponsors });
  } catch (err) {
    console.error('[profileApi] PUT /sponsors/:id failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to update sponsor' });
  }
});

/**
 * POST /dashboard/api/profile/sponsors/reorder
 * Body: { order: [id1, id2, ...] }
 * Returns: { ok, sponsors }
 */
router.post('/sponsors/reorder', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    const cleanOrder = order
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id));

    if (!cleanOrder.length) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid order payload' });
    }

    let sort = 1;
    for (const id of cleanOrder) {
      await db.query(
        `
          UPDATE sponsors
          SET sort_order = $1,
              updated_at = NOW()
          WHERE id = $2
            AND user_id = $3
        `,
        [sort, id, userId]
      );
      sort += 1;
    }

    const sponsors = await getSponsorsForUser(userId);
    return res.json({ ok: true, sponsors });
  } catch (err) {
    console.error('[profileApi] POST /sponsors/reorder failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to reorder sponsors' });
  }
});

/**
 * DELETE /dashboard/api/profile/sponsors/:id
 * Returns: { ok, sponsors }
 */
router.delete('/sponsors/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid sponsor ID' });
    }

    await db.query(
      `
        DELETE FROM sponsors
        WHERE id = $1
          AND user_id = $2
      `,
      [id, userId]
    );

    const sponsors = await getSponsorsForUser(userId);
    return res.json({ ok: true, sponsors });
  } catch (err) {
    console.error('[profileApi] DELETE /sponsors/:id failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to delete sponsor' });
  }
});

// ---------- SPONSOR BANNER UPLOAD (PROFILE) ----------

const sponsorUploadDir = '/var/www/scraplet-uploads/profile-sponsors';
if (!fs.existsSync(sponsorUploadDir)) {
  fs.mkdirSync(sponsorUploadDir, { recursive: true });
}

const sponsorBannerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, sponsorUploadDir),
  filename: (req, file, cb) => {
    const userId = req.session?.user?.id || 'anon';
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `sponsor-${userId}-${Date.now()}${ext}`);
  },
});

const sponsorBannerUpload = multer({
  storage: sponsorBannerStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

/**
 * POST /dashboard/api/profile/sponsors/:id/banner
 * Form field: banner (file)
 * Returns: { ok, sponsor }
 */
router.post(
  '/sponsors/:id/banner',
  requireAuth,
  sponsorBannerUpload.single('banner'),
  async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Invalid sponsor ID' });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ ok: false, error: 'No file uploaded' });
      }

      const relativePath = `/uploads/profile-sponsors/${req.file.filename}`;

      const { rows } = await db.query(
        `
          UPDATE sponsors
          SET banner_url = $1,
              updated_at = NOW()
          WHERE id = $2
            AND user_id = $3
          RETURNING
            id,
            name,
            url,
            banner_url,
            sort_order,
            is_active,
            size
        `,
        [relativePath, id, userId]
      );

      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          error: 'Sponsor not found or not owned by user',
        });
      }

      const sponsor = mapSponsorRow(rows[0]);
      return res.json({ ok: true, sponsor });
    } catch (err) {
      console.error(
        '[profileApi] POST /sponsors/:id/banner failed:',
        err
      );
      return res
        .status(500)
        .json({ ok: false, error: 'Failed to upload sponsor banner' });
    }
  }
);

function mapButtonRow(row) {
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

  const accentTarget =
    (row.accent_target || '').toLowerCase() === 'label' ? 'label' : 'button';

  return {
    id: row.id,
    label: row.label,
    url: row.url,
    visible,
    icon: row.icon,
    sort_order: row.sort_order,
    shape: row.shape || 'pill',
    size: row.size || 'md',
    featured_image_url: row.featured_image_url || null,
    accent_color: row.accent_color || null,
    accent_target: accentTarget,
  };
}

// ---------- BUTTON IMAGE UPLOAD (LARGE FEATURED LINKS) ----------

// Store under /var/www/scraplet-uploads/profile-buttons
const buttonUploadDir = '/var/www/scraplet-uploads/profile-buttons';
if (!fs.existsSync(buttonUploadDir)) {
  fs.mkdirSync(buttonUploadDir, { recursive: true });
}

const buttonImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, buttonUploadDir),
  filename: (req, file, cb) => {
    const userId = req.session?.user?.id || 'anon';
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `button-${userId}-${Date.now()}${ext}`);
  },
});

const buttonImageUpload = multer({
  storage: buttonImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// POST /dashboard/api/profile/buttons/:id/image
router.post(
  '/buttons/:id/image',
  requireAuth,
  buttonImageUpload.single('image'),
  async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid button ID' });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }

      const relativePath = `/uploads/profile-buttons/${req.file.filename}`;

      const { rows } = await db.query(
        `
          UPDATE custom_buttons
          SET featured_image_url = $1
          WHERE id = $2
            AND user_id = $3
          RETURNING
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
        `,
        [relativePath, id, userId]
      );

      if (!rows.length) {
        return res
          .status(404)
          .json({ ok: false, error: 'Button not found or not owned by user' });
      }

      const button = mapButtonRow(rows[0]);
      return res.json({ ok: true, button });
    } catch (err) {
      console.error('[profileApi] POST /buttons/:id/image failed:', err);
      return res
        .status(500)
        .json({ ok: false, error: 'Failed to upload button image' });
    }
  }
);

// ---------- CUSTOM BUTTONS ----------

/**
 * GET /dashboard/api/profile/buttons
 * Returns: { ok, buttons, isProUser, maxButtons }
 */
router.get('/buttons', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { rows } = await db.query(
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

    const buttons = rows.map(mapButtonRow);
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
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to load buttons' });
  }
});

/**
 * POST /dashboard/api/profile/buttons
 * Body: { label, url, shape?, size?, icon_url?, accent_color?, accent_target? }
 * Returns: { ok, buttons, isProUser, maxButtons }
 */
router.post('/buttons', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  let { label, url, icon, icon_url, shape, size, accent_color, accent_target } =
    req.body || {};

  label = (label || '').trim();
  url = (url || '').trim();

  const iconRaw = icon_url ?? icon;
  const normalisedIcon = normaliseButtonIcon(iconRaw);
  const normalisedShape = normaliseButtonShape(shape);
  const normalisedSize = normaliseButtonSize(size);

  const normalisedAccentColor = normaliseAccentColor(accent_color);
  const normalisedAccentTarget = normaliseAccentTarget(accent_target);

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

    await db.query(
      `
        INSERT INTO custom_buttons (
          user_id,
          label,
          url,
          visible,
          icon,
          sort_order,
          shape,
          size,
          accent_color,
          accent_target
        )
        VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9)
      `,
      [
        userId,
        label,
        url,
        normalisedIcon,
        nextSort,
        normalisedShape,
        normalisedSize,
        normalisedAccentColor,
        normalisedAccentTarget,
      ]
    );

    const listResult = await db.query(
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

    const buttons = listResult.rows.map(mapButtonRow);

    return res.status(201).json({
      ok: true,
      buttons,
      isProUser: pro,
      maxButtons: pro ? null : 3,
    });
  } catch (err) {
    console.error('[profileApi] POST /buttons failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to create button' });
  }
});

/**
 * PUT /dashboard/api/profile/buttons/:id
 */
router.put('/buttons/:id', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const id = req.params.id;

  let {
    label,
    url,
    visible,
    icon,
    icon_url,
    shape,
    size,
    accent_color,
    accent_target,
  } = req.body || {};

  label = (label || '').trim();
  url = (url || '').trim();

  const iconRaw = icon_url ?? icon;
  const normIcon = normaliseButtonIcon(iconRaw);
  const normShape = normaliseButtonShape(shape);
  const normSize = normaliseButtonSize(size);
  const normAccentColor = normaliseAccentColor(accent_color);
  const normAccentTarget = normaliseAccentTarget(accent_target);

  if (!label || !url) {
    return res.status(400).json({
      ok: false,
      error: 'Label and URL are required',
    });
  }

  const isVisible =
    visible === true ||
    visible === 'true' ||
    visible === 1 ||
    visible === '1';

  try {
    const { rowCount } = await db.query(
      `
        UPDATE custom_buttons
        SET
          label         = $1,
          url           = $2,
          visible       = $3,
          icon          = $4,
          shape         = $5,
          size          = $6,
          accent_color  = $7,
          accent_target = $8
        WHERE id = $9 AND user_id = $10
      `,
      [
        label,
        url,
        isVisible,
        normIcon,
        normShape,
        normSize,
        normAccentColor,
        normAccentTarget,
        id,
        userId,
      ]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Button not found or not owned by user',
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileApi] PUT /buttons/:id failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to update button' });
  }
});

// ---------- BUTTON REORDER ----------

/**
 * POST /dashboard/api/profile/buttons/reorder
 * Body: { order: [id1, id2, ...] }
 */
router.post('/buttons/reorder', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    const cleanOrder = order
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id));

    if (!cleanOrder.length) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid order payload' });
    }

    let sort = 1;
    for (const id of cleanOrder) {
      await db.query(
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

    const { rows } = await db.query(
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
        ORDER BY sort_order NULLS LAST, id
      `,
      [userId]
    );

    const buttons = rows.map(mapButtonRow);

    return res.json({ ok: true, buttons });
  } catch (err) {
    console.error('[profileApi] POST /buttons/reorder failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to reorder buttons' });
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

    await db.query(
      `
        DELETE FROM custom_buttons
        WHERE id = $1 AND user_id = $2
      `,
      [id, userId]
    );

    const { rows } = await db.query(
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
        ORDER BY sort_order NULLS LAST, id
      `,
      [userId]
    );

    const buttons = rows.map(mapButtonRow);

    return res.json({ ok: true, buttons });
  } catch (err) {
    console.error('[profileApi] DELETE /buttons/:id failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to delete button' });
  }
});

/**
 * POST /dashboard/api/profile/layout
 * Body: { layout: { sections: [...] } } or { sections: [...] }
 */
router.post('/layout', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const layoutPayload = req.body?.layout || {};
    const incomingSections = Array.isArray(layoutPayload.sections)
      ? layoutPayload.sections
      : Array.isArray(req.body.sections)
        ? req.body.sections
        : [];

    if (!incomingSections.length) {
      return res.status(400).json({ ok: false, error: 'No sections provided' });
    }

    // Load existing layout (JSONB in users.layout)
    const { rows } = await db.query(
      'SELECT layout FROM users WHERE id = $1',
      [userId]
    );

    const raw = rows[0]?.layout || null;
    const currentLayout = ensureLayout(raw);

    // Build a new layout where sections are canonical and ordered as given
    const newLayout = ensureLayout({
      ...currentLayout,
      sections: incomingSections,
    });

    const sectionVisibility = buildVisibilityMap(newLayout);

    // Persist back to users.layout
    await db.query(
      'UPDATE users SET layout = $1, updated_at = NOW() WHERE id = $2',
      [newLayout, userId]
    );

    return res.json({
      ok: true,
      layout: newLayout,
      sectionVisibility,
    });
  } catch (err) {
    console.error('[layout] V2 save error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to update layout' });
  }
});

// ---------- APPEARANCE ----------

/**
 * POST /dashboard/api/profile/appearance
 * Body: { theme?, background?, buttonStyle?, cardStyle? }
 */
router.post('/appearance', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const incoming = req.body || {};

    // Read current appearance from DB first, then merge incoming on top
    const { rows: currentRows } = await db.query(
      'SELECT appearance FROM users WHERE id = $1',
      [userId]
    );
    const currentAppearance = currentRows[0]?.appearance || {};

    // Merge: start from current DB values, apply incoming changes
    const merged = { ...DEFAULT_APPEARANCE, ...currentAppearance, ...incoming };
    const appearance = normaliseAppearance(merged);

    await db.query(
      `
        UPDATE users
        SET appearance = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [appearance, userId]
    );

    return res.json({ ok: true, appearance });
  } catch (err) {
    console.error('[profileApi] POST /appearance failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to update appearance' });
  }
});

// ------------------------------------------------------------
//  PREVIEW RENDER — returns HTML for the card using EJS partial
// ------------------------------------------------------------
router.post('/preview-render', async (req, res) => {
  try {
    const state = req.body;

    if (!state || typeof state !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid state payload' });
    }

    const {
      profile,
      appearance,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability,
      sponsors,
    } = state;

    const sponsorsSafe = Array.isArray(sponsors)
      ? sponsors.map((sp) => ({
        ...sp,
        size: normaliseSponsorSize(sp.size),
      }))
      : [];

    // Render partial WITHOUT full layout
    req.app.render(
      'partials/profile-card',
      {
        layout: false,
        profile,
        appearance,
        layout,
        sectionVisibility,
        customButtons,
        stats,
        marketability,
        sponsors: sponsorsSafe,
      },
      (err, html) => {
        if (err) {
          console.error('[preview-render] render error:', err);
          return res.status(500).json({ ok: false, error: 'Render failed' });
        }

        res.json({ ok: true, html });
      }
    );
  } catch (err) {
    console.error('[preview-render]', err);
    res.status(500).json({ ok: false, error: 'Server failed' });
  }
});

export default router;
