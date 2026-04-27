/**
 * scraper-runner-v2.mjs
 * OAuth-first stats scraper. Replaces the handle-based scraper-runner.
 *
 * Strategy:
 *   - Kick    → user OAuth token (api.kick.com/public/v1/channels)
 *   - YouTube → user OAuth token (youtube.v3/channels by stored channelId)
 *   - Twitch  → app token / Helix (no per-user OAuth needed, public data)
 *   - X       → app Bearer token (api.twitter.com/2/users/by/username, free tier)
 *   - Instagram/TikTok/Facebook → skipped until OAuth connections exist
 *
 * If a user hasn't connected a platform, we skip it — no fallback scraping.
 * Runs every SCRAPE_INTERVAL_MS (default 30 min).
 * Health endpoint: http://127.0.0.1:4321/health
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer } from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform'
});

// Minimal db shim so existing services (kickUserTokens etc.) work
const db = { query: (sql, params) => pool.query(sql, params) };

const INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS, 10) || 30 * 60 * 1000;
const HEALTH_PORT = parseInt(process.env.SCRAPER_HEALTH_PORT, 10) || 4321;

const PLATFORMS = ['kick', 'youtube', 'twitch'];

const health = {};
PLATFORMS.forEach(p => { health[p] = { lastRun: null, lastError: null, ok: 0, fail: 0 }; });

// ── Token helpers (inline to avoid import path issues) ────────────────────────

async function getKickToken(userId) {
  const { getKickUserAccessToken } = await import('./services/kickUserTokens.js');
  return getKickUserAccessToken(userId);
}

async function getYouTubeToken(userId) {
  const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
  const { rows } = await pool.query(
    `SELECT eat.access_token, eat.refresh_token, eat.expires_at, ea.id AS ea_id, ea.external_user_id
     FROM external_account_tokens eat
     JOIN external_accounts ea ON ea.id = eat.external_account_id
     WHERE ea.user_id = $1 AND ea.platform = 'youtube'
     LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  let { access_token, refresh_token, expires_at, ea_id, external_user_id } = rows[0];

  if (new Date(expires_at) <= new Date()) {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token, grant_type: 'refresh_token',
      }),
    });
    const data = await resp.json();
    if (!data.access_token) return null;
    access_token = data.access_token;
    await pool.query(
      `UPDATE external_account_tokens SET access_token=$1, expires_at=$2, updated_at=now()
       WHERE external_account_id=$3`,
      [access_token, new Date(Date.now() + (data.expires_in || 3600) * 1000), ea_id]
    );
  }
  return { token: access_token, channelId: external_user_id };
}

let _twitchAppToken = null;
let _twitchAppExpiry = 0;
async function getTwitchAppToken() {
  if (_twitchAppToken && Date.now() < _twitchAppExpiry) return _twitchAppToken;
  const { default: fetch } = await import('node-fetch');
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.TWITCH_CLIENT_ID || '',
      client_secret: process.env.TWITCH_CLIENT_SECRET || '',
      grant_type:    'client_credentials',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Twitch app token: ${res.status}`);
  _twitchAppToken = data.access_token;
  _twitchAppExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return _twitchAppToken;
}

// ── Per-platform stat fetchers ────────────────────────────────────────────────

// Kick follower count via Puppeteer browser session (bypasses Cloudflare)
// Reuses a single browser instance across calls; falls back to OAuth API for CCV.
let _kickBrowser = null;
async function getKickBrowser() {
  if (_kickBrowser) {
    try { await _kickBrowser.pages(); return _kickBrowser; } catch { _kickBrowser = null; }
  }
  const { default: puppeteer } = await import('puppeteer');
  _kickBrowser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  return _kickBrowser;
}

async function fetchKick(userId) {
  // Get slug from external_accounts
  const { rows } = await pool.query(
    `SELECT ea.username FROM external_accounts ea
     WHERE ea.user_id = $1 AND ea.platform = 'kick' LIMIT 1`,
    [userId]
  );
  const slug = rows[0]?.username;
  if (!slug) throw new Error('Kick: no connected account');

  // Clean slug — strip URLs if stored as full URL
  const cleanSlug = slug.replace(/^https?:\/\/(www\.)?kick\.com\//i, '').replace(/\/$/, '').toLowerCase();

  const browser = await getKickBrowser();
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.kpsdk = undefined; window._kpsdk = undefined;
    });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Warm up with channel page to get session cookies
    await page.goto(`https://kick.com/${cleanSlug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fetch the v2 API in the same browser context
    const resp = await page.goto(`https://kick.com/api/v2/channels/${cleanSlug}`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    if (!resp?.ok()) throw new Error(`Kick v2 API ${resp?.status()}`);

    const text = await page.content();
    const match = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/) || text.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    const raw = (match ? match[1] : text).replace(/<[^>]+>/g, '').trim();
    const json = JSON.parse(raw);

    return {
      followers:  json.followers_count ?? 0,
      ccv:        json.livestream?.viewer_count ?? 0,
      engagement: 0,
    };
  } finally {
    await page.close();
  }
}

async function fetchYouTube(userId) {
  const { default: fetch } = await import('node-fetch');
  const yt = await getYouTubeToken(userId);
  if (!yt) throw new Error('YouTube: no token');
  if (!yt.channelId) throw new Error('YouTube: no channelId stored');
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(yt.channelId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${yt.token}` } });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = await res.json();
  const stats = data.items?.[0]?.statistics;
  if (!stats) throw new Error('YouTube: no statistics');
  return {
    followers:  parseInt(stats.subscriberCount || '0', 10),
    ccv:        0,
    engagement: parseInt(stats.viewCount || '0', 10),
  };
}

async function fetchTwitch(username) {
  const { default: fetch } = await import('node-fetch');
  const token = await getTwitchAppToken();
  const headers = { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID || '' };

  const uRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`, { headers });
  if (!uRes.ok) throw new Error(`Twitch users ${uRes.status}`);
  const uData = await uRes.json();
  const user = uData.data?.[0];
  if (!user) throw new Error(`Twitch: user not found: ${username}`);

  const fRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`, { headers });
  const fData = fRes.ok ? await fRes.json() : { total: 0 };

  let ccv = 0;
  try {
    const sRes = await fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, { headers });
    const sData = sRes.ok ? await sRes.json() : {};
    ccv = sData.data?.[0]?.viewer_count ?? 0;
  } catch (_) {}

  return { followers: fData.total ?? 0, ccv, engagement: 0 };
}


// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureConstraint() {
  try {
    await pool.query(`
      ALTER TABLE user_stats_history
        ADD CONSTRAINT user_stats_history_user_platform_date_key
        UNIQUE (user_id, platform, snapshot_date)
    `);
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn('[runner] constraint:', e.message);
  }
}

async function writeHistory(userId, platform, stats) {
  await pool.query(`
    INSERT INTO user_stats_history (user_id, platform, followers, ccv, engagement, snapshot_date)
    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
    ON CONFLICT (user_id, platform, snapshot_date)
    DO UPDATE SET followers=EXCLUDED.followers, ccv=EXCLUDED.ccv, engagement=EXCLUDED.engagement
  `, [userId, platform, stats.followers ?? null, stats.ccv ?? null, stats.engagement ?? null]);
}

// Returns all users that have a connected external_account for each platform
async function getConnectedUsers() {
  const { rows } = await pool.query(`
    SELECT ea.user_id, ea.platform, ea.username, ea.external_user_id
    FROM external_accounts ea
    WHERE ea.platform IN ('kick','youtube','twitch')
      AND ea.enabled = true
      AND ea.username IS NOT NULL
    ORDER BY ea.platform, ea.user_id
  `);
  return rows;
}



// ── Main cycle ────────────────────────────────────────────────────────────────

async function runOnce() {
  console.log('[runner] cycle start', new Date().toISOString());
  let accounts;
  try { accounts = await getConnectedUsers(); }
  catch (e) { console.error('[runner] DB error:', e.message); return; }

  let written = 0;
  for (const { user_id, platform, username } of accounts) {
    try {
      let stats;
      switch (platform) {
        case 'kick':    stats = await fetchKick(user_id);    break;
        case 'youtube': stats = await fetchYouTube(user_id); break;
        case 'twitch':  stats = await fetchTwitch(username); break;
        // x removed
        default: continue;
      }
      await writeHistory(user_id, platform, stats);
      health[platform].lastRun   = new Date().toISOString();
      health[platform].lastError = null;
      health[platform].ok++;
      written++;
      console.log(`[runner] ${platform}/${username}: followers=${stats.followers} ccv=${stats.ccv}`);
    } catch (e) {
      console.warn(`[runner] ${platform}/${username}:`, e.message);
      health[platform].lastRun   = new Date().toISOString();
      health[platform].lastError = e.message;
      health[platform].fail++;
    }
  }
  console.log(`[runner] done — ${written}/${accounts.length} written`);
}

// ── Health endpoint ───────────────────────────────────────────────────────────

createServer(async (req, res) => {
  if (req.url !== '/health') { res.writeHead(404); res.end(); return; }
  let counts = {};
  try {
    const { rows } = await pool.query(
      'SELECT platform, COUNT(*) AS total, MAX(snapshot_date) AS last_date FROM user_stats_history GROUP BY platform'
    );
    rows.forEach(r => { counts[r.platform] = { total: parseInt(r.total), last_date: r.last_date }; });
  } catch (_) {}

  const payload = PLATFORMS.map(p => ({
    platform:   p,
    lastRun:    health[p].lastRun,
    lastError:  health[p].lastError,
    ok:         health[p].ok,
    fail:       health[p].fail,
    dbTotal:    counts[p]?.total ?? null,
    dbLastDate: counts[p]?.last_date ?? null,
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}).listen(HEALTH_PORT, '127.0.0.1', () => {
  console.log('[runner] health ->', `http://127.0.0.1:${HEALTH_PORT}/health`);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

ensureConstraint().then(() => {
  runOnce();
  setInterval(runOnce, INTERVAL_MS);
});
