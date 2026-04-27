// src/insights/isStale.js
// Pure function. No side effects. Never throws.
// Returns true if insight is >= 7 days old.

/**
 * @param {Date|string} createdAt
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isStale(createdAt, now = new Date()) {
  try {
    const created = new Date(createdAt);
    const diffMs = now - created;
    return diffMs >= 7 * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}
