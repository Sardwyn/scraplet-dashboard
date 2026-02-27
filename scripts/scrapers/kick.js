// /scripts/scrapers/kick.js
import fetch from 'node-fetch';

export async function getStats(handle) {
  if (!handle) {
    console.warn('⚠️ Kick scrape skipped: empty handle');
    return null;
  }

  try {
    const url = `https://kick.com/api/v1/channels/${encodeURIComponent(handle)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ScrapletStatsBot/1.0 (+https://scraplet.store)',
        'Accept': 'application/json',
      },
    });

    if (res.status === 404) {
      console.warn(`⚠️ Kick API 404 for ${handle}`);
      return null;
    }

    if (!res.ok) {
      throw new Error(`Kick API returned ${res.status}`);
    }

    const data = await res.json();

    const followers = data.followersCount || 0;
    const ccv = data.livestream?.viewer_count || 0;

    console.debug(`[Kick API] ${handle}: ${followers} followers, ${ccv} viewers`);

    return {
      followers,
      ccv,
      engagement: 0,
    };
  } catch (err) {
    console.warn(`⚠️ Kick API failed for ${handle}:`, err.message);
    return null;
  }
}
