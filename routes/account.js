import express from 'express';
import multer from 'multer';
import { join } from 'path';
import db from '../db.js';
import validator from 'validator';
import { prepareUploadDirectory } from '../services/uploads.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

// Prepare upload directory
const requestedUploadRoot = process.env.UPLOAD_DIR || '/var/www/scraplet-uploads';
let uploadRoot = requestedUploadRoot;

try {
  uploadRoot = await prepareUploadDirectory(requestedUploadRoot);
} catch (err) {
  console.error('Failed to prepare upload directory:', requestedUploadRoot, err);
}

const upload = multer({ dest: join(uploadRoot) });

// Account overview
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.session.user.id]);
    const profile = result.rows[0] || {};

    const buttonsResult = await db.query(
      'SELECT * FROM custom_buttons WHERE user_id = $1 ORDER BY created_at',
      [req.session.user.id]
    );
    const customButtons = buttonsResult.rows;

    res.render('account', {
      user: req.session.user,
      profile,
      customButtons,
      query: req.query
    });
  } catch (err) {
    console.error('Account GET error:', err);
    res.status(500).send('Failed to load account');
  }
});

// Save bio and avatar
router.post('/bio', requireAuth, upload.single('avatar'), async (req, res) => {
  const { display_name, bio, x, youtube, twitch, tags, onboarding } = req.body;
  const avatar_url = req.file ? `/uploads/${req.file.filename}` : null;
  const userId = req.session.user.id;

  let tagsArray = null;
  if (tags) {
    tagsArray = Array.isArray(tags)
      ? tags.map(t => t.trim()).filter(Boolean)
      : tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  try {
    await db.query(
      `
      UPDATE users
      SET
        avatar_url   = COALESCE($1, avatar_url),
        display_name = COALESCE($2, display_name),
        bio          = COALESCE($3, bio),
        x            = COALESCE($4, x),
        youtube      = COALESCE($5, youtube),
        twitch       = COALESCE($6, twitch),
        tags         = COALESCE($7, tags)
      WHERE id = $8
    `,
      [avatar_url, display_name, bio, x, youtube, twitch, tagsArray, userId]
    );

    res.redirect(onboarding ? '/dashboard?welcome=true' : '/account?saved=true');
  } catch (err) {
    console.error('Profile save error:', err);
    res.status(500).send('Failed to save profile');
  }
});

// Add button
router.post('/buttons', requireAuth, async (req, res) => {
  let { label, url } = req.body;
  const userId = req.session.user.id;

  label = validator.escape(label.trim());
  url = url.trim();

  if (!validator.isURL(url, { require_protocol: true })) {
    return res.status(400).send('Invalid URL format');
  }

  const result = await db.query('SELECT COUNT(*) FROM custom_buttons WHERE user_id = $1', [userId]);
  const count = parseInt(result.rows[0].count);
  const isProUser = req.session.user.plan === 'pro';

  if (!isProUser && count >= 3) {
    return res.status(403).send('Upgrade to Pro to add more buttons');
  }

  await db.query(
    'INSERT INTO custom_buttons (user_id, label, url) VALUES ($1, $2, $3)',
    [userId, label, url]
  );
  res.redirect('/account');
});

// Update button
router.post('/buttons/:id/update', requireAuth, async (req, res) => {
  let { label, url } = req.body;
  const { id } = req.params;

  label = validator.escape(label.trim());
  url = url.trim();

  if (!validator.isURL(url, { require_protocol: true })) {
    return res.status(400).send('Invalid URL format');
  }

  await db.query(
    'UPDATE custom_buttons SET label = $1, url = $2 WHERE id = $3 AND user_id = $4',
    [label, url, id, req.session.user.id]
  );
  res.redirect('/account');
});

// Toggle button visibility
router.post('/buttons/:id/toggle', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query(
    'UPDATE custom_buttons SET visible = NOT visible WHERE id = $1 AND user_id = $2',
    [id, req.session.user.id]
  );
  res.redirect('/account');
});

// Delete button
router.post('/buttons/:id/delete', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query(
    'DELETE FROM custom_buttons WHERE id = $1 AND user_id = $2',
    [id, req.session.user.id]
  );
  res.redirect('/account');
});

export default router;
