// routes/public.js
import express from 'express';
import db from '../db.js';
import validator from 'validator';
import { getStatsForUser, gradeMarketability } from '../scripts/stats.js';
import { ensureLayout, buildVisibilityMap } from '../utils/layout.js';
import { recordProfileRequest, recordLayoutState } from '../utils/metrics.js';
import { loadProfileByUsername } from '../services/profileService.js';

const router = express.Router();

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
  'epicgames.com': 'epic-games'
};

function detectIcon(url) {
  if (!url) return null;
  const match = Object.entries(platformMap).find(([domain]) =>
    url.includes(domain)
  );
  return match?.[1] || null;
}

/* -------------------------------------------------------------
   PUBLIC PROFILE PAGE
------------------------------------------------------------- */

router.get('/u/:username', async (req, res) => {
  let { username } = req.params;
  username = validator.escape(username.trim());

  console.debug('Public profile request for:', username);

  try {
    const bundle = await loadProfileByUsername(username);

    if (!bundle) {
      recordProfileRequest({ username, status: 'not_found' });
      console.debug('User not found:', username);
      return res.status(404).send('User not found');
    }

    const {
      profile,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability,
      appearance,
      sponsors,
    } = bundle;

    recordLayoutState({ userId: profile.id, layout });
    recordProfileRequest({
      userId: profile.id,
      username,
      status: 'success'
    });

    res.render('public-profile', {
      username,
      profile,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability,
      appearance,
      sponsors,
    });
  } catch (err) {
    console.error('Public profile error:', err);
    recordProfileRequest({ username, status: 'error' });
    res.status(500).send('Failed to load profile');
  }
});

/* -------------------------------------------------------------
   UNSUBSCRIBE FLOW
   GET /u/:username/unsubscribe?token=...
------------------------------------------------------------- */

router.get('/u/:username/unsubscribe', async (req, res) => {
  let { username } = req.params;
  const { token } = req.query;

  username = validator.escape(username.trim());
  const lowerUsername = username.toLowerCase();

  if (!token || typeof token !== 'string') {
    return res.status(400).render('unsubscribe-invalid', {
      reason: 'Missing or invalid token',
    });
  }

  try {
    // 1) Resolve user
    const result = await db.query(
      `
        SELECT id
        FROM users
        WHERE LOWER(username) = $1
        LIMIT 1
      `,
      [lowerUsername]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).render('unsubscribe-invalid', {
        reason: 'Unknown creator profile',
      });
    }

    // 2) Attempt to mark unsubscribed
    const update = await db.query(
      `
        UPDATE email_subscribers
        SET unsubscribed = TRUE,
            updated_at  = NOW()
        WHERE user_id = $1
          AND unsubscribe_token = $2
        RETURNING email
      `,
      [user.id, token]
    );

    if (update.rows.length === 0) {
      return res.status(400).render('unsubscribe-invalid', {
        reason: 'Invalid or expired unsubscribe link',
      });
    }

    const unsubEmail = update.rows[0].email;

    // 3) Show success screen
    return res.render('unsubscribe-success', {
      email: unsubEmail,
      username: lowerUsername,
    });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).render('unsubscribe-invalid', {
      reason: 'Internal server error',
    });
  }
});




export default router;
