/**
 * src/services/pipelineHealth.js
 * 
 * Cross-process pipeline health tracker using Redis.
 * Works across scrapletdashboard + chat-outbox-worker processes.
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const KEY_PREFIX = 'scraplet:pipeline:';
const TTL = 3600; // 1 hour

let _redis = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
    _redis.on('error', () => {}); // suppress connection errors
  }
  return _redis;
}

const PIPELINE_DEFS = {
  messages: {
    label: 'Messages',
    steps: {
      1: 'Webhook Received',
      2: 'Outbox Insert',
      3: 'Worker Pickup',
      4: 'Fan-out',
      5: 'Overlay Gate Publish',
    },
  },
  render: {
    label: 'Render',
    steps: {
      1: 'Snapshot Built',
      2: 'HTML Served',
      3: 'SSE Connected',
      4: 'State Hydrated',
      5: 'Widget Rendered',
    },
  },
};

export async function recordStage(pipeline, step, detail) {
  try {
    const r = getRedis();
    const now = Date.now();
    const key = `${KEY_PREFIX}${pipeline}:${step}`;
    const countKey = `${KEY_PREFIX}${pipeline}:${step}:count`;
    const detailKey = `${KEY_PREFIX}${pipeline}:last`;

    await r.set(key, now, 'EX', TTL);
    await r.incr(countKey);
    await r.expire(countKey, TTL);
    if (detail) await r.set(detailKey, String(detail).slice(0, 120), 'EX', TTL);
  } catch (e) {
    // non-fatal — pipeline health is best-effort
  }
}

export async function getPipelineHealth() {
  const now = Date.now();
  const r = getRedis();
  const result = {};

  for (const [pipelineKey, def] of Object.entries(PIPELINE_DEFS)) {
    const steps = [];
    let lastUpdated = null;
    let lastMessage = null;

    try {
      lastMessage = await r.get(`${KEY_PREFIX}${pipelineKey}:last`);
    } catch (e) {}

    for (const [stepNum, stepName] of Object.entries(def.steps)) {
      let lastSeen = null;
      let count = 0;
      try {
        const ts = await r.get(`${KEY_PREFIX}${pipelineKey}:${stepNum}`);
        const cnt = await r.get(`${KEY_PREFIX}${pipelineKey}:${stepNum}:count`);
        lastSeen = ts ? parseInt(ts) : null;
        count = cnt ? parseInt(cnt) : 0;
      } catch (e) {}

      const age = lastSeen ? now - lastSeen : null;
      if (lastSeen && (!lastUpdated || lastSeen > lastUpdated)) lastUpdated = lastSeen;

      steps.push({
        step: parseInt(stepNum),
        name: stepName,
        lastSeen,
        count,
        status: age === null ? 'unknown'
              : age < 5 * 60 * 1000 ? 'ok'
              : age < 30 * 60 * 1000 ? 'warn'
              : 'error',
        ageMs: age,
      });
    }

    result[pipelineKey] = {
      label: def.label,
      lastMessage,
      lastUpdated,
      steps,
    };
  }

  return result;
}
