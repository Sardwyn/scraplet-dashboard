// src/contentRepurposing/youtubePublisher.js
// Creates a private YouTube video draft from a Shorts script.
// Uses the user's existing YouTube OAuth connection from external_account_tokens.

import db from '../../db.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

async function getYouTubeToken(userId) {
  const { rows } = await db.query(
    `SELECT eat.access_token, eat.refresh_token, eat.expires_at
     FROM external_account_tokens eat
     JOIN external_accounts ea ON ea.id = eat.external_account_id
     WHERE ea.user_id = $1 AND ea.platform = 'youtube'
     ORDER BY eat.created_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;

  let { access_token, refresh_token, expires_at } = rows[0];

  // Refresh if expired
  if (new Date(expires_at) <= new Date()) {
    try {
      const resp = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const data = await resp.json();
      if (data.access_token) {
        access_token = data.access_token;
        // Update stored token
        await db.query(
          `UPDATE external_account_tokens SET access_token = $1, expires_at = $2
           WHERE external_account_id = (
             SELECT id FROM external_accounts WHERE user_id = $3 AND platform = 'youtube' LIMIT 1
           )`,
          [access_token, new Date(Date.now() + (data.expires_in || 3600) * 1000), userId]
        );
      }
    } catch { return null; }
  }

  return access_token;
}

/**
 * Create a private YouTube video draft from a Shorts script.
 * @param {number} userId
 * @param {{ title: string, description: string, hashtags: string[] }} script
 * @returns {Promise<string|null>} YouTube video ID or null
 */
export async function createYoutubeDraft(userId, script) {
  try {
    const token = await getYouTubeToken(userId);
    if (!token) return null;

    const tags = (script.hashtags || []).map(h => h.replace(/^#/, ''));
    const description = [
      script.description || '',
      '',
      tags.map(t => `#${t}`).join(' '),
    ].join('\n').trim();

    const resp = await fetch(`${YT_VIDEOS_URL}?part=snippet,status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title: (script.title || 'Stream Highlight').slice(0, 100),
          description: description.slice(0, 5000),
          tags: tags.slice(0, 10),
          categoryId: '20', // Gaming
        },
        status: {
          privacyStatus: 'private',
          selfDeclaredMadeForKids: false,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[youtubePublisher] API error:', err.slice(0, 200));
      return null;
    }

    const data = await resp.json();
    return data.id || null;
  } catch (err) {
    console.error('[youtubePublisher] error:', err.message);
    return null;
  }
}
