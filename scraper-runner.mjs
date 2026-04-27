/**
 * scraper-runner.mjs
 * Scheduled scraper — runs every 30 min, writes to user_stats_history.
 * PM2 process name: scraper-runner
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

const INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS, 10) || 30 * 60 * 1000;
const PLATFORMS   = ['kick','twitch','youtube','x','instagram','tiktok','facebook'];

// In-memory health state (served on :4321/health)
const health = {};
PLATFORMS.forEach(p => { health[p] = { lastRun: null, lastError: null, runs: 0 }; });

async function getUsers() {
  const { rows } = await pool.query(
    'SELECT id, kick, twitch, youtube, x, instagram, tiktok, facebook FROM users'
  );
  return rows;
}

async function ensureConstraint() {
  try {
    await pool.query(`
      ALTER TABLE user_stats_history
        ADD CONSTRAINT user_stats_history_user_platform_date_key
        UNIQUE (user_id, platform, snapshot_date)
    `);
  } catch (e) {
    // already exists — fine
    if (!e.message.includes('already exists')) {
      console.warn('[scraper-runner] constraint:', e.message);
    }
  }
}

async function writeHistory(userId, platform, stats) {
  await pool.query(`
    INSERT INTO user_stats_history (user_id, platform, followers, ccv, engagement, snapshot_date)
    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
    ON CONFLICT (user_id, platform, snapshot_date)
    DO UPDATE SET
      followers  = EXCLUDED.followers,
      ccv        = EXCLUDED.ccv,
      engagement = EXCLUDED.engagement
  `, [userId, platform, stats.followers ?? null, stats.ccv ?? null, stats.engagement ?? null]);
}

async function runOnce() {
  console.log('[scraper-runner] cycle start', new Date().toISOString());
  let users;
  try { users = await getUsers(); }
  catch (e) { console.error('[scraper-runner] DB error:', e.message); return; }

  const { getStatsFromPlatform } = await import('./scripts/scrapers/index.js');

  let total = 0;
  for (const user of users) {
    for (const platform of PLATFORMS) {
      const handle = user[platform];
      if (!handle) continue;
      try {
        const stats = await getStatsFromPlatform(platform, handle);
        await writeHistory(user.id, platform, stats);
        health[platform].lastRun   = new Date().toISOString();
        health[platform].lastError = null;
        health[platform].runs++;
        total++;
      } catch (e) {
        console.warn(`[scraper-runner] ${platform}/${handle}:`, e.message);
        health[platform].lastRun   = new Date().toISOString();
        health[platform].lastError = e.message;
      }
    }
  }
  console.log(`[scraper-runner] done — ${total} rows written`);
}

// Health HTTP endpoint
const HEALTH_PORT = parseInt(process.env.SCRAPER_HEALTH_PORT, 10) || 4321;
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
    runs:       health[p].runs,
    dbTotal:    counts[p]?.total ?? null,
    dbLastDate: counts[p]?.last_date ?? null,
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}).listen(HEALTH_PORT, '127.0.0.1', () => {
  console.log('[scraper-runner] health ->', `http://127.0.0.1:${HEALTH_PORT}/health`);
});

ensureConstraint().then(() => {
  runOnce();
  setInterval(runOnce, INTERVAL_MS);
});
