// src/services/subathonTimer.js
// Server-side subathon timer state manager.
// Persists to DB, broadcasts via SSE to connected widgets.

import db from '../../db.js';

// In-memory timer state per userId
// userId -> { status, remainingMs, startedAt, pausedAt, config, clients: Set }
const timers = new Map();

// SSE clients per userId
const clients = new Map(); // userId -> Set<res>

function getTimer(userId) {
  return timers.get(userId) || null;
}

function getEffectiveRemaining(timer) {
  if (!timer) return 0;
  if (timer.status === 'paused' || timer.status === 'stopped') return timer.remainingMs;
  if (timer.status === 'running') {
    const elapsed = Date.now() - timer.startedAt;
    return Math.max(0, timer.remainingMs - elapsed);
  }
  return 0;
}

function broadcast(userId) {
  const timer = timers.get(userId);
  if (!timer) return;
  const remaining = getEffectiveRemaining(timer);
  const payload = JSON.stringify({
    status: timer.status,
    remainingMs: remaining,
    config: timer.config,
  });
  const userClients = clients.get(userId);
  if (userClients) {
    for (const res of userClients) {
      try { res.write(`data: ${payload}\n\n`); } catch { userClients.delete(res); }
    }
  }
}

// Tick every second for running timers
setInterval(() => {
  for (const [userId, timer] of timers) {
    if (timer.status !== 'running') continue;
    const remaining = getEffectiveRemaining(timer);
    if (remaining <= 0) {
      timer.status = 'ended';
      timer.remainingMs = 0;
      broadcast(userId);
      saveTimer(userId);
    } else {
      broadcast(userId);
    }
  }
}, 1000);

async function saveTimer(userId) {
  const timer = timers.get(userId);
  if (!timer) return;
  try {
    await db.query(
      `INSERT INTO subathon_timers (user_id, status, remaining_ms, config_json, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         status = EXCLUDED.status,
         remaining_ms = EXCLUDED.remaining_ms,
         config_json = EXCLUDED.config_json,
         updated_at = NOW()`,
      [userId, timer.status, getEffectiveRemaining(timer), JSON.stringify(timer.config)]
    );
  } catch (e) {
    console.error('[subathon] save failed:', e.message);
  }
}

async function loadTimer(userId) {
  try {
    const { rows } = await db.query(
      `SELECT status, remaining_ms, config_json FROM subathon_timers WHERE user_id = $1`,
      [userId]
    );
    if (rows.length) {
      const r = rows[0];
      timers.set(userId, {
        status: r.status === 'running' ? 'paused' : r.status, // resume as paused after restart
        remainingMs: Number(r.remaining_ms),
        startedAt: null,
        config: r.config_json || defaultConfig(),
      });
    }
  } catch { /* table may not exist yet */ }
}

function defaultConfig() {
  return {
    startMs: 2 * 60 * 60 * 1000, // 2 hours
    addPerSub: 5 * 60 * 1000,     // +5 min per sub
    addPerFollow: 30 * 1000,       // +30 sec per follow
    addPerTipPerUnit: 60 * 1000,   // +1 min per £1 tip
    addPerGiftSub: 10 * 60 * 1000, // +10 min per gift sub
    addPerRaid: 2 * 60 * 1000,     // +2 min per raid
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startTimer(userId, config) {
  let timer = timers.get(userId);
  const cfg = { ...defaultConfig(), ...(config || {}) };
  if (!timer || timer.status === 'ended' || timer.status === 'stopped') {
    timer = { status: 'running', remainingMs: cfg.startMs, startedAt: Date.now(), config: cfg };
  } else if (timer.status === 'paused') {
    timer.status = 'running';
    timer.startedAt = Date.now();
  }
  timers.set(userId, timer);
  broadcast(userId);
  await saveTimer(userId);
  return getTimerState(userId);
}

export async function pauseTimer(userId) {
  const timer = timers.get(userId);
  if (!timer || timer.status !== 'running') return null;
  timer.remainingMs = getEffectiveRemaining(timer);
  timer.status = 'paused';
  timer.startedAt = null;
  broadcast(userId);
  await saveTimer(userId);
  return getTimerState(userId);
}

export async function resumeTimer(userId) {
  const timer = timers.get(userId);
  if (!timer || timer.status !== 'paused') return null;
  timer.status = 'running';
  timer.startedAt = Date.now();
  broadcast(userId);
  await saveTimer(userId);
  return getTimerState(userId);
}

export async function stopTimer(userId) {
  const timer = timers.get(userId);
  if (!timer) return null;
  timer.remainingMs = 0;
  timer.status = 'stopped';
  timer.startedAt = null;
  broadcast(userId);
  await saveTimer(userId);
  return getTimerState(userId);
}

export async function addTime(userId, ms) {
  let timer = timers.get(userId);
  if (!timer) return null;
  const current = getEffectiveRemaining(timer);
  timer.remainingMs = current + ms;
  if (timer.status === 'running') timer.startedAt = Date.now();
  broadcast(userId);
  await saveTimer(userId);
  return getTimerState(userId);
}

export function getTimerState(userId) {
  const timer = timers.get(userId);
  if (!timer) return { status: 'stopped', remainingMs: 0, config: defaultConfig() };
  return { status: timer.status, remainingMs: getEffectiveRemaining(timer), config: timer.config };
}

export function subscribeClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  // Send current state immediately
  const state = getTimerState(userId);
  res.write(`data: ${JSON.stringify(state)}\n\n`);
  return () => clients.get(userId)?.delete(res);
}

export async function handleEvent(userId, kind, payload) {
  const timer = timers.get(userId);
  if (!timer || timer.status !== 'running') return;
  const cfg = timer.config;
  let addMs = 0;
  if (kind === 'channel.subscription.new' || kind === 'subscribe') addMs = cfg.addPerSub;
  else if (kind === 'channel.subscription.renewal' || kind === 'resub') addMs = cfg.addPerSub;
  else if (kind === 'channel.subscription.gifts' || kind === 'gift_sub') addMs = cfg.addPerGiftSub;
  else if (kind === 'channel.followed' || kind === 'follow') addMs = cfg.addPerFollow;
  else if (kind === 'raid') addMs = cfg.addPerRaid;
  else if (kind === 'kicks.gifted' || kind === 'tip' || kind === 'donation') {
    const amount = parseFloat(payload?.amount || payload?.kicks || 0);
    if (amount > 0) addMs = Math.floor(amount) * cfg.addPerTipPerUnit;
  }
  if (addMs > 0) await addTime(userId, addMs);
}

export async function ensureTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS subathon_timers (
        user_id INTEGER PRIMARY KEY,
        status VARCHAR(16) DEFAULT 'stopped',
        remaining_ms BIGINT DEFAULT 0,
        config_json JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[subathon] table create failed:', e.message); }
}
