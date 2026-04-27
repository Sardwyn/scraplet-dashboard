// services/gameContext.js
// Captures current game/category from Kick webhook events.
// Enriches with IGDB data (genre, summary, community vibe).
// Provides context injection for Scrapbot's Kick AI responses.

import db from '../db.js';
import https from 'https';

// IGDB uses Twitch OAuth - needs TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET
const TWITCH_CLIENT_ID     = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';

// In-memory cache: channel_slug -> { game_name, category_id, igdb_info, cached_at }
const channelGameCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// IGDB token cache
let igdbToken = null;
let igdbTokenExpiry = 0;

async function getIgdbToken() {
  if (igdbToken && Date.now() < igdbTokenExpiry) return igdbToken;
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;

  try {
    const body = `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'id.twitch.tv',
        path: '/oauth2/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => resolve(JSON.parse(raw)));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    igdbToken = data.access_token;
    igdbTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return igdbToken;
  } catch (e) {
    console.warn('[gameContext] IGDB token error:', e.message);
    return null;
  }
}

async function fetchIgdbInfo(gameName) {
  const token = await getIgdbToken();
  if (!token || !TWITCH_CLIENT_ID) return null;

  try {
    const body = `fields name,genres.name,summary,themes.name,game_modes.name; search "${gameName.replace(/"/g, '')}"; limit 1;`;
    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.igdb.com',
        path: '/v4/games',
        method: 'POST',
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => resolve(JSON.parse(raw)));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    if (!Array.isArray(data) || !data[0]) return null;
    const g = data[0];
    return {
      name: g.name,
      genres: (g.genres || []).map(x => x.name).join(', '),
      themes: (g.themes || []).map(x => x.name).join(', '),
      modes: (g.game_modes || []).map(x => x.name).join(', '),
      summary: g.summary ? g.summary.slice(0, 200) : null,
    };
  } catch (e) {
    console.warn('[gameContext] IGDB fetch error:', e.message);
    return null;
  }
}

/**
 * Called from the kick ingest when livestream.metadata.updated fires.
 * Extracts game/category and caches it.
 */
export async function updateChannelGame(channelSlug, payload) {
  try {
    const meta = payload?.metadata || payload;
    const cat = meta?.category || meta?.Category;
    if (!cat?.name) return;

    const gameName = cat.name;
    const categoryId = cat.id;

    // Check if game changed
    const existing = channelGameCache.get(channelSlug);
    if (existing?.game_name === gameName && Date.now() - existing.cached_at < CACHE_TTL_MS) return;

    // Fetch IGDB enrichment (non-blocking)
    const igdbInfo = await fetchIgdbInfo(gameName).catch(() => null);

    const entry = { game_name: gameName, category_id: categoryId, igdb_info: igdbInfo, cached_at: Date.now() };
    channelGameCache.set(channelSlug, entry);

    // Persist to stream_sessions if there's an active session
    await db.query(
      `UPDATE public.stream_sessions
       SET updated_at = now()
       WHERE channel_slug = $1 AND status = 'live'`,
      [channelSlug]
    ).catch(() => {});

    console.log(`[gameContext] ${channelSlug} → ${gameName}${igdbInfo ? ` (${igdbInfo.genres})` : ''}`);
  } catch (e) {
    console.warn('[gameContext] updateChannelGame error:', e.message);
  }
}

/**
 * Get the current game context for a channel.
 * Returns a formatted string for injection into Scrapbot's system prompt.
 */
export function getGameContextBlock(channelSlug) {
  const entry = channelGameCache.get(channelSlug);
  if (!entry) return null;

  const lines = [`[STREAM CONTEXT]`, `Game/Category: ${entry.game_name}`];

  if (entry.igdb_info) {
    const g = entry.igdb_info;
    if (g.genres) lines.push(`Genre: ${g.genres}`);
    if (g.themes) lines.push(`Themes: ${g.themes}`);
    if (g.modes) lines.push(`Mode: ${g.modes}`);
    if (g.summary) lines.push(`About: ${g.summary}`);
  }

  return lines.join('\n');
}

/**
 * Seed cache from DB on startup — get last known game for active sessions.
 */
export async function seedGameCache() {
  try {
    const { rows } = await db.query(
      `SELECT ked.channel_slug,
              ked.payload->'metadata'->'category'->>'name' AS game_name,
              ked.payload->'metadata'->'category'->>'id' AS category_id
       FROM public.kick_event_discovery ked
       WHERE ked.event_type = 'livestream.metadata.updated'
         AND ked.payload->'metadata'->'category'->>'name' IS NOT NULL
       ORDER BY ked.last_seen_at DESC`
    );
    // One entry per channel (already ordered by recency, take first per slug)
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.channel_slug)) continue;
      seen.add(row.channel_slug);
      channelGameCache.set(row.channel_slug, {
        game_name: row.game_name,
        category_id: row.category_id,
        igdb_info: null, // will enrich on next message
        cached_at: 0,    // force refresh on next use
      });
    }
    console.log(`[gameContext] seeded ${seen.size} channel(s) from DB`);
  } catch (e) {
    console.warn('[gameContext] seed error:', e.message);
  }
}
