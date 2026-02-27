import fetch from 'node-fetch';

function sanitize(handle) {
  if (!handle) return null;
  const cleaned = handle.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const match = cleaned.match(/twitch\.tv\/([^\/]+)/);
  return match ? match[1] : cleaned;
}

export async function getStats(rawHandle) {
  const handle = sanitize(rawHandle);
  if (!handle) {
    console.warn(`⚠️ Twitch scrape skipped: invalid handle "${rawHandle}"`);
    return null;
  }

  try {
    const res = await fetch(`https://decapi.me/twitch/followcount/${handle}`);
    const text = await res.text();
    console.log('[DecAPI raw]', text);

    const followers = parseInt(text.replace(/[^\d]/g, ''), 10);
    console.debug(`[Twitch] ${handle}: ${followers} followers`);

    return { followers, ccv: 0, engagement: 0 };
  } catch (err) {
    console.warn(`⚠️ Twitch scrape failed for ${handle}:`, err.message);
    return null;
  }
}
