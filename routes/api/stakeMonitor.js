// routes/api/stakeMonitor.js
// Stake Monitor beacon endpoint — receives scrape payloads from the OBS browser source.

import express from 'express';
import { validateBeaconPayload } from '../../src/stakeMonitor/validateBeaconPayload.js';
import { insertStakeEvent } from '../../src/stakeMonitor/insertStakeEvent.js';

const router = express.Router();

const STAKE_MONITOR_SECRET = process.env.STAKE_MONITOR_SECRET || '';

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireWidgetSecret(req, res, next) {
  if (!STAKE_MONITOR_SECRET) return next(); // no secret configured → open (dev mode)

  // Accept token from Authorization: Bearer header OR x-widget-secret header
  const provided = (req.headers['authorization'] || '').replace('Bearer ', '').trim()
    || req.headers['x-widget-secret'] || '';

  if (!provided) return res.status(401).json({ ok: false, error: 'unauthorized' });

  // Accept raw secret (legacy)
  if (provided === STAKE_MONITOR_SECRET) return next();

  // Validate HMAC token: overlayId:expires:sig
  try {
    const parts = provided.split(':');
    if (parts.length === 3) {
      const [overlayId, expiresStr, sig] = parts;
      const expires = parseInt(expiresStr, 10);
      if (Date.now() / 1000 > expires) return res.status(401).json({ ok: false, error: 'token expired' });
      const crypto = require('crypto');
      const payload = `${overlayId}:${expires}`;
      const expected = crypto.createHmac('sha256', STAKE_MONITOR_SECRET).update(payload).digest('hex').slice(0, 16);
      if (sig === expected) return next();
    }
  } catch (_) {}

  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

// ── Simple in-memory rate limiter: 60 req/min per IP ─────────────────────────
const rateLimitMap = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ ok: false, error: 'rate limit exceeded' });
  }
  next();
}

// Periodically clean up expired entries to avoid memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW_MS);

// ── POST /api/stake-monitor/beacon ────────────────────────────────────────────
router.post('/api/stake-monitor/beacon', requireWidgetSecret, rateLimit, async (req, res) => {
  try {
    const payload = validateBeaconPayload(req.body);
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid payload' });
    }

    // Accept userId from session (dashboard user) or X-User-Id header (widget token flow)
    const userId = req.session?.user?.id
      ?? (req.headers['x-user-id'] ? Number(req.headers['x-user-id']) : null)
      ?? null;

    await insertStakeEvent(payload, userId, payload.sessionId);

    return res.sendStatus(204);
  } catch (err) {
    console.error('[stake-monitor] beacon error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});


// ── GET /api/widget-token ─────────────────────────────────────────────────────
// Called by the OBS browser source beacon loop on startup.
// Returns a short-lived HMAC token tied to the overlay public ID.
// No auth required - the overlay public ID is the credential.
router.get('/api/widget-token', async (req, res) => {
  try {
    const { overlayId } = req.query;
    if (!overlayId) return res.status(400).json({ ok: false, error: 'overlayId required' });

    const secret = process.env.STAKE_MONITOR_SECRET || process.env.GENERATION_WORKER_SECRET || 'dev-secret';
    const crypto = await import('crypto');
    const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const payload = `${overlayId}:${expires}`;
    const sig = crypto.default.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
    const token = `${payload}:${sig}`;

    return res.json({ ok: true, token, expiresAt: expires * 1000 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
