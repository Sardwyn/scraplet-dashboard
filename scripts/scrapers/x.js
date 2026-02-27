import fetch from 'node-fetch';
import https from 'https';
import { load } from 'cheerio';

const mirrors = [
  'https://nitter.tiekoetter.com',
  'https://nitter.fdn.fr',
  'https://nitter.unixfox.eu'
];

export async function getStats(handle) {
  for (const base of mirrors) {
    try {
      const res = await fetch(`${base}/${handle}`, {
        agent: new https.Agent({ rejectUnauthorized: false })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      const $ = load(html);

      const raw = $('span.profile-stat-num').eq(2).text().trim();
if (!raw) {
  console.warn(`[Nitter] Follower count not found for ${handle}`);
  continue;
}
const followers = parseInt(raw.replace(/[^\d]/g, ''), 10);


      console.debug(`[X] ${handle}: ${followers} followers`);
      return { followers, ccv: 0, engagement: 0 };
    } catch (err) {
      console.warn(`⚠️ Nitter scrape failed @ ${base} for ${handle}:`, err.message);
    }
  }

  console.warn(`❌ All Nitter mirrors failed for ${handle}`);
  return null;
}
