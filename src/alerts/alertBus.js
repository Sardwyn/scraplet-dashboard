// src/alerts/alertBus.js
// In-memory fire-and-forget alert broadcaster.
// No DB queue — if nobody is connected the alert is dropped.

const listeners = new Map(); // userId (string) -> Set<fn>

export function registerAlertListener(userId, fn) {
  const key = String(userId);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
}

export function unregisterAlertListener(userId, fn) {
  const key = String(userId);
  listeners.get(key)?.delete(fn);
  if (listeners.get(key)?.size === 0) listeners.delete(key);
}

export function fireAlert(userId, resolvedPayload) {
  const key = String(userId);
  const fns = listeners.get(key);
  if (!fns || fns.size === 0) return 0;
  for (const fn of fns) {
    try { fn(resolvedPayload); } catch { /* ignore dead connections */ }
  }
  return fns.size;
}
