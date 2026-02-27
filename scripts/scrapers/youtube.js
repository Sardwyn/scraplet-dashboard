// /scripts/scrapers/youtube.js
import fetch from 'node-fetch';

function sanitize(handle) {
  if (!handle) return null;

  // Strip protocol + trailing slash
  const cleaned = handle.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  // Extract from full URLs like youtube.com/@Handle or /channel/UCxxx
  const match = cleaned.match(/youtube\.com\/(?:channel\/|@)?([^\/]+)/);
  return match ? match[1] : cleaned;
}

export async function getStats(rawHandle) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const handle = sanitize(rawHandle);

  if (!apiKey) {
    console.warn('⚠️ YouTube scrape skipped: missing YOUTUBE_API_KEY');
    return null;
  }

  if (!handle) {
    console.warn(`⚠️ YouTube scrape skipped: invalid handle "${rawHandle}"`);
    return null;
  }

  try {
    // 1) Find the channelId by searching for the handle
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=id&type=channel&maxResults=1&q=${encodeURIComponent(handle)}&key=${apiKey}`;

    let res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`search HTTP ${res.status}`);
    let data = await res.json();

    const channelId = data.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error('No channelId found from search');

    // 2) Fetch stats for that channelId
    const statsUrl =
      `https://www.googleapis.com/youtube/v3/channels` +
      `?part=statistics&id=${channelId}&key=${apiKey}`;

    res = await fetch(statsUrl);
    if (!res.ok) throw new Error(`channels HTTP ${res.status}`);
    data = await res.json();

    const stats = data.items?.[0]?.statistics;
    if (!stats) throw new Error('No statistics found on channel');

    const followers = parseInt(stats.subscriberCount || '0', 10);
    const engagement = parseInt(stats.commentCount || '0', 10);

    console.debug(
      `[YouTube API] ${handle} (channelId=${channelId}): ${followers} subs, ${engagement} comments`
    );

    return {
      followers,
      ccv: 0,
      engagement,
    };
  } catch (err) {
    console.warn(`⚠️ YouTube API failed for ${handle}:`, err.message);
    return null;
  }
}
