// routes/publicStatus.js
// Unauthenticated aggregate Scrapbot telemetry for the marketing site dossier.
// No PII, no channel slugs, no usernames — pure system health numbers.
import express from 'express';

const router = express.Router();

const SCRAPBOT_BASE = process.env.SCRAPBOT_BASE_URL || 'http://127.0.0.1:3030';
const SECRET = process.env.SCRAPBOT_SHARED_SECRET || '';
const THREAT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

function threatLabel(score) {
  if (score === 0)   return 'MINIMAL';
  if (score < 1)     return 'LOW';
  if (score < 4)     return 'ELEVATED';
  if (score < 10)    return 'HIGH';
  return 'CRITICAL';
}

router.get('/api/public/scrapbot-status', async (req, res) => {
  try {
    const headers = { 'x-scrapbot-secret': SECRET, accept: 'application/json' };
    const opts = { headers, signal: AbortSignal.timeout(4000) };

    // Fetch snapshot + recent ring in parallel
    const [snapRes, recentRes] = await Promise.all([
      fetch(`${SCRAPBOT_BASE}/api/metrics`, opts),
      fetch(`${SCRAPBOT_BASE}/api/metrics/recent?limit=500&order=newest`, opts),
    ]);

    if (!snapRes.ok) throw new Error(`scrapbot ${snapRes.status}`);
    const data = await snapRes.json();
    const recentData = recentRes.ok ? await recentRes.json() : { items: [] };

    const c = data.counters || {};
    const derived = data.derived || {};

    // Count active channels
    const channelsActive = Array.isArray(derived.channels)
      ? derived.channels.filter(ch => ch.last_ts && (Date.now() - ch.last_ts) < 3600000).length
      : 0;

    // Avg pressure
    const pressures = Array.isArray(derived.channels)
      ? derived.channels.map(ch => ch.pulse?.pressure).filter(p => typeof p === 'number')
      : [];
    const avgPressure = pressures.length
      ? Math.round(pressures.reduce((a, b) => a + b, 0) / pressures.length)
      : null;

    // Rolling threat: last 10 minutes from ring buffer
    const now = Date.now();
    const windowItems = (recentData.items || []).filter(it => it && it.ts && (now - it.ts) <= THREAT_WINDOW_MS);
    const windowMsgs  = windowItems.length;
    const windowFlood = windowItems.filter(it => it.flood).length;
    const windowSwarm = windowItems.filter(it => it.swarm).length;
    const rollingScore = windowMsgs > 0
      ? ((windowFlood * 2 + windowSwarm * 3) / windowMsgs) * 100
      : 0;

    // Lifetime fallback score when no recent traffic
    const lifetimeMsgs  = c.inbound_total || 0;
    const lifetimeFlood = c.flood_tripped_total || 0;
    const lifetimeSwarm = c.swarm_matched_total || 0;
    const lifetimeScore = lifetimeMsgs > 0
      ? ((lifetimeFlood * 2 + lifetimeSwarm * 3) / lifetimeMsgs) * 100
      : 0;
    const usingFallback = windowMsgs === 0 && lifetimeMsgs > 0;
    const effectiveScore = usingFallback ? lifetimeScore : rollingScore;

    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.json({
      ok: true,
      uptime: fmtUptime(data.uptime_ms || 0),
      uptime_ms: data.uptime_ms || 0,
      msgs_processed: c.inbound_total || 0,
      flood_events: c.flood_tripped_total || 0,
      swarm_events: c.swarm_matched_total || 0,
      mod_actions: c.moderation_matched_total || 0,
      commands_matched: c.commands_matched_total || 0,
      channels_active: channelsActive,
      threat_level: threatLabel(effectiveScore),
      threat_score: Math.round(effectiveScore * 100) / 100,
      threat_live: !usingFallback,
      threat_window_msgs: windowMsgs,
      pressure: avgPressure,
      ts: data.now,
    });
  } catch (err) {
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.json({
      ok: false,
      uptime: 'UNKNOWN',
      msgs_processed: 0,
      flood_events: 0,
      swarm_events: 0,
      mod_actions: 0,
      commands_matched: 0,
      channels_active: 0,
      threat_level: 'UNKNOWN',
      threat_score: 0,
      pressure: null,
      ts: new Date().toISOString(),
      error: err.message,
    });
  }
});

export default router;
