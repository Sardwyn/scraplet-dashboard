import db from '../db.js';
import {
  recordScraperRun,
  recordScraperSnapshot,
  recordApiStatus
} from '../utils/metrics.js';

const userId = 999;
await db.query(`
  INSERT INTO users (id, email, username, password_hash)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (id) DO NOTHING
`, [userId, 'test@scraplet.dev', 'TestUser', '$2b$10$dummyhash']);

const platforms = ['youtube', 'twitch', 'kick'];
const now = Date.now();

for (const platform of platforms) {
  recordScraperSnapshot({
    userId,
    platform,
    followers: Math.floor(Math.random() * 10000),
    ccv: Math.floor(Math.random() * 200),
    engagement: Math.random().toFixed(2),
    timestamp: now
  });

  recordScraperRun({ platform, status: 'success' });
  recordApiStatus({ service: 'scraper', status: 'success', platform });
}

await db.query(`
  UPDATE users SET layout = $1 WHERE id = $2
`, [{
  order: ['avatar', 'bio', 'stats'],
  theme: { font: 'sans', color: 'dark', layout: 'stacked' },
  sections: [],
  showButtonIcons: true
}, userId]);
