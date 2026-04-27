// src/stakeMonitor/validateBeaconPayload.js
// Pure validation function for Stake Monitor beacon payloads.
// Never throws for any input. Returns StakePayload or null.

/**
 * @typedef {Object} StakePayload
 * @property {string}      sessionId       - UUID from client
 * @property {number}      timestamp       - Unix ms
 * @property {string|null} gameName        - sanitised, max 100 chars
 * @property {number|null} currentBalance
 * @property {number|null} betSize
 * @property {number|null} lastWin
 * @property {number|null} multiplier
 * @property {string|null} pageUrl         - query params stripped
 */

/**
 * Validate and sanitise a raw beacon POST body.
 * Returns null if all numeric fields are absent/null/non-finite.
 * Never throws for any input.
 * @param {unknown} body
 * @returns {StakePayload|null}
 */
export function validateBeaconPayload(body) {
  try {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }

    const b = /** @type {Record<string, unknown>} */ (body);

    const currentBalance = toFiniteNumber(b.current_balance ?? b.currentBalance);
    const lastWin        = toFiniteNumber(b.last_win        ?? b.lastWin);
    const betSize        = toFiniteNumber(b.bet_size        ?? b.betSize);
    const multiplier     = toFiniteNumber(b.multiplier);

    // Reject if all numeric fields are null/undefined/absent/non-finite
    if (currentBalance === null && lastWin === null && betSize === null && multiplier === null) {
      return null;
    }

    const rawSessionId = b.sessionId ?? b.session_id;
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.slice(0, 64) : 'unknown';

    const rawTs = b.timestamp ?? b.ts;
    const timestamp = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : Date.now();

    const rawGameName = b.game_name ?? b.gameName;
    const gameName = sanitiseGameName(rawGameName);

    const rawPageUrl = b.pageUrl ?? b.page_url;
    const pageUrl = sanitisePageUrl(rawPageUrl);

    return {
      sessionId,
      timestamp,
      gameName,
      currentBalance,
      lastWin,
      betSize,
      multiplier,
      pageUrl,
    };
  } catch {
    return null;
  }
}

/** @param {unknown} val @returns {number|null} */
function toFiniteNumber(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/** Sanitise game_name: max 100 chars, strip non-printable chars. @param {unknown} val @returns {string|null} */
function sanitiseGameName(val) {
  if (typeof val !== 'string') return null;
  // Strip non-printable ASCII (control chars, except normal whitespace)
  const cleaned = val.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim();
  return cleaned.slice(0, 100) || null;
}

/** Sanitise pageUrl: strip query params to remove any auth tokens. @param {unknown} val @returns {string|null} */
function sanitisePageUrl(val) {
  if (typeof val !== 'string') return null;
  try {
    const url = new URL(val);
    // Return only origin + pathname, no query params or hash
    return url.origin + url.pathname;
  } catch {
    // Not a valid URL — return null rather than leaking raw value
    return null;
  }
}
