// routes/publicProfileApi.js
import express from 'express';
import db from '../db.js';
import validator from 'validator';
import crypto from 'crypto';

const router = express.Router();

// Use a secret to derive unsubscribe tokens deterministically per user+email
const UNSUBSCRIBE_SECRET =
  process.env.EMAIL_UNSUBSCRIBE_SECRET ||
  process.env.SESSION_SECRET ||
  'change-me';

/**
 * Build a deterministic unsubscribe token from email + user_id.
 */
function buildUnsubscribeToken(email, userId) {
  const raw = `${(email || '').toLowerCase().trim()}:${userId}:${UNSUBSCRIBE_SECRET}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * POST /dashboard/api/public/profile/contact/:username
 * Body: { email }
 *
 * Public endpoint: no auth, used by profile contact block.
 */
router.post('/profile/contact/:username', async (req, res) => {
  try {
    let { username } = req.params;
    const email = (req.body?.email || '').trim();

    if (!username) {
      return res.status(400).json({ ok: false, error: 'Missing username' });
    }

    username = username.trim().toLowerCase();

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email' });
    }

    // Look up the creator by username (same convention as /u/:username)
    const userResult = await db.query(
      `
      SELECT id
      FROM users
      WHERE lower(username) = $1
      LIMIT 1
      `,
      [username]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Creator not found' });
    }

    const token = buildUnsubscribeToken(email, user.id);

    // Upsert into email_subscribers, reset unsubscribed + refresh token
    await db.query(
      `
      INSERT INTO email_subscribers (user_id, email, source_slug, unsubscribe_token, unsubscribed)
      VALUES ($1, $2, $3, $4, FALSE)
      ON CONFLICT (user_id, email)
      DO UPDATE
      SET
        unsubscribed       = FALSE,
        unsubscribe_token  = EXCLUDED.unsubscribe_token,
        updated_at         = NOW()
      `,
      [user.id, email, username, token]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[publicProfileApi] POST /profile/contact error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
