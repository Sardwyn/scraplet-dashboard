// src/insights/confidenceScore.js
// Pure function. No side effects. Never throws.
// confidenceScore(n, variance) → float [0, 1]
// Higher n = higher confidence. Higher variance = lower confidence.

/**
 * @param {number} n - sample size (number of sessions)
 * @param {number} variance - normalised variance [0, 1]
 * @returns {number} confidence score [0, 1]
 */
export function confidenceScore(n, variance) {
  if (typeof n !== 'number' || typeof variance !== 'number') return 0;
  if (n < 1) return 0;
  const raw = (n / (n + 10)) * (1 - Math.max(0, Math.min(1, variance)));
  return Math.max(0, Math.min(1, raw));
}
