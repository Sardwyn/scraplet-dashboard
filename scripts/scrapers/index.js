import * as youtube from './youtube.js';
import * as kick from './kick.js';
import * as twitch from './twitch.js';
import * as x from './x.js';
import * as instagram from './instagram.js';
import * as tiktok from './tiktok.js';
import * as facebook from './facebook.js';

const map = {
  youtube,
  kick,
  twitch,
  x,
  instagram,
  tiktok,
  facebook
};

export async function getStatsFromPlatform(platform, handle) {
  const scraper = map[platform];
  if (!scraper) throw new Error(`Unsupported platform: ${platform}`);
  return await scraper.getStats(handle);
}
