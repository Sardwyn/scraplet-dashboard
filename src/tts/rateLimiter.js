// src/tts/rateLimiter.js
// Pure function. No side effects. Never throws.
// Enforces 120s cooldown per viewer per channel for free TTS.

const COOLDOWN_MS = 120_000;

/**
 * @param {string} viewerUserId
 * @param {string} channelSlug
 * @param {Array<{requested_by_user_id: string, channel_slug: string, created_at: Date|string}>} recentJobs
 * @returns {{ allowed: boolean, cooldownSeconds: number }}
 */
export function checkRateLimit(viewerUserId, channelSlug, recentJobs) {
  try {
    const now = Date.now();
    const userJobs = (recentJobs || []).filter(
      j => String(j.requested_by_user_id) === String(viewerUserId) &&
           j.channel_slug === channelSlug
    );
    if (userJobs.length === 0) return { allowed: true, cooldownSeconds: 0 };

    const latest = userJobs.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    );
    const elapsed = now - new Date(latest.created_at).getTime();
    if (elapsed >= COOLDOWN_MS) return { allowed: true, cooldownSeconds: 0 };

    const cooldownSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, cooldownSeconds };
  } catch {
    return { allowed: true, cooldownSeconds: 0 };
  }
}
