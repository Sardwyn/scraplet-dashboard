import db from '../db.js';
import { getStatsFromPlatform } from './scrapers/index.js';
import {
  recordScraperRun,
  recordScraperSnapshot,
  recordApiStatus
} from '../utils/metrics.js';

const STATS_TTL_HOURS = 24;

const sanitize = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  const ytMatch = cleaned.match(/youtube\.com\/(?:channel\/|@)?([^\/]+)/);
  if (ytMatch) return ytMatch[1];

  const twitchMatch = cleaned.match(/twitch\.tv\/([^\/]+)/);
  if (twitchMatch) return twitchMatch[1];

  return cleaned;
};

export async function getStatsForUser({
  userId,
  youtube,
  twitch,
  kick,
  instagram,
  tiktok,
  x,
  facebook
}) {
  const stats = {
    followers: {},
    ccv: {},
    engagement: {},
    apiStatus: {}
  };

  const { rows: cachedRows = [] } = await db.query(
    `SELECT * FROM user_stats
     WHERE user_id = $1
       AND last_updated > now() - interval '${STATS_TTL_HOURS} hours'`,
    [userId]
  );

  if (cachedRows.length) {
    console.debug('✅ Using cached stats for user:', userId);
    const row = cachedRows[0];
    const followers  = row.followers  || {};
    const ccv        = row.ccv        || {};
    const engagement = row.engagement || {};

    let timestamp = Date.now();
    if (row.last_updated instanceof Date) {
      timestamp = row.last_updated.getTime();
    } else if (row.last_updated) {
      const parsed = Date.parse(row.last_updated);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    }

    const platformsFromCache = new Set([
      ...Object.keys(followers),
      ...Object.keys(ccv),
      ...Object.keys(engagement)
    ]);

    for (const platform of platformsFromCache) {
      recordScraperSnapshot({
        userId,
        platform,
        followers: followers[platform],
        ccv:        ccv[platform],
        engagement: engagement[platform],
        timestamp
      });
      recordApiStatus({ service: 'scraper', status: 'cache_hit', platform });
    }

    return {
      followers,
      ccv,
      engagement,
      marketability: row.marketability || 'F',
      last_updated: row.last_updated
    };
  }

  const platforms = { instagram, tiktok, x, youtube, facebook, kick, twitch };

  for (const [platform, rawHandle] of Object.entries(platforms)) {
    const handle = sanitize(rawHandle);
    if (!handle) continue;

    try {
      console.debug(`🔍 Scraping ${platform} for handle: ${handle}`);
      const result = await getStatsFromPlatform(platform, handle);

      if (result) {
        recordScraperRun({ platform, status: 'success' });

        if (result.followers  != null) stats.followers[platform]  = Number(result.followers)  || 0;
        if (result.engagement != null) stats.engagement[platform] = Number(result.engagement) || 0;
        if (result.ccv        != null) stats.ccv[platform]        = Number(result.ccv)        || 0;

        recordScraperSnapshot({
          userId,
          platform,
          followers:  stats.followers[platform],
          ccv:        stats.ccv[platform],
          engagement: stats.engagement[platform]
        });

        recordApiStatus({ service: 'scraper', status: 'success', platform });
        stats.apiStatus[platform] = 'ok';
      } else {
        recordScraperRun({ platform, status: 'failure' });
        recordApiStatus({ service: 'scraper', status: 'empty', platform });
        stats.apiStatus[platform] = 'fail';
      }
    } catch (err) {
      console.warn(`⚠️ ${platform} stats failed:`, err.message);
      recordScraperRun({ platform, status: 'failure' });
      recordApiStatus({ service: 'scraper', status: 'error', platform, detail: err.message });
      stats.apiStatus[platform] = 'fail';
    }
  }

  const marketability = gradeMarketability(stats);

  try {
    await db.query(
      `INSERT INTO user_stats (user_id, followers, ccv, engagement, marketability, last_updated)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         followers = $2,
         ccv = $3,
         engagement = $4,
         marketability = $5,
         last_updated = now()`,
      [userId, stats.followers, stats.ccv, stats.engagement, marketability]
    );
    console.debug('📦 Cached fresh stats for user:', userId);
  } catch (err) {
    console.error('❌ Failed to cache stats:', err);
  }

  return {
    ...stats,
    marketability,
    last_updated: new Date()
  };
}

export function gradeMarketability(stats) {
  const totalFollowers = Object.values(stats.followers || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const totalEngagement = Object.values(stats.engagement || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const totalCCV = Object.values(stats.ccv || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);

  const score = totalFollowers * 0.5 + totalEngagement * 0.3 + totalCCV * 0.2;

  if (score > 100000) return 'A+';
  if (score > 50000) return 'A';
  if (score > 20000) return 'B';
  if (score > 5000) return 'C';
  if (score > 1000) return 'D';
  return 'F';
}

