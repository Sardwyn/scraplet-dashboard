// routes/generationApi.js
// Internal API for the spot worker:
//   POST /api/generation/upload   — receive generated file
//   POST /api/generation/callback — mark job done/failed, trigger Discord post
//   GET  /api/generation/jobs/next — worker polls for next pending job
//   POST /api/generation/jobs/:id/heartbeat — worker keepalive
//
// Worker auth: x-worker-secret header must match GENERATION_WORKER_SECRET env var

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, '..', 'public', 'generated');
const WORKER_SECRET = process.env.GENERATION_WORKER_SECRET || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://scraplet.store';

// Ensure generated dir exists
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

function requireWorkerAuth(req, res, next) {
  if (!WORKER_SECRET) return next(); // dev mode: no secret required
  if (req.headers['x-worker-secret'] !== WORKER_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

// ── GET /api/generation/jobs/next ────────────────────────────────────────────
// Worker polls this to claim the next pending job (atomic claim via UPDATE...RETURNING)
router.get('/api/generation/jobs/next', requireWorkerAuth, async (req, res) => {
  const workerId = String(req.query.worker_id || req.headers['x-worker-id'] || 'unknown');

  try {
    const { rows } = await db.query(
      `UPDATE public.generation_jobs
       SET status = 'processing',
           worker_id = $1,
           last_heartbeat_at = now(),
           attempts = attempts + 1,
           updated_at = now()
       WHERE id = (
         SELECT id FROM public.generation_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId]
    );

    if (!rows.length) return res.json({ ok: true, job: null });
    return res.json({ ok: true, job: rows[0] });
  } catch (err) {
    console.error('[generationApi] next job error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/generation/jobs/:id/heartbeat ──────────────────────────────────
router.post('/api/generation/jobs/:id/heartbeat', requireWorkerAuth, async (req, res) => {
  try {
    await db.query(
      `UPDATE public.generation_jobs
       SET last_heartbeat_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/generation/upload ──────────────────────────────────────────────
// Worker streams the generated file to the VPS
// Expects: multipart/form-data with field 'file' + query param job_id
router.post('/api/generation/upload', requireWorkerAuth, async (req, res) => {
  try {
    const jobId = String(req.query.job_id || '');
    const filename = String(req.query.filename || `${jobId}.png`);

    if (!jobId) return res.status(400).json({ ok: false, error: 'missing job_id' });

    // Sanitise filename
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const dest = path.join(GENERATED_DIR, safe);

    // Read raw body from stream (works regardless of Content-Type)
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const body = Buffer.concat(chunks);
    if (!body.length) return res.status(400).json({ ok: false, error: 'empty body' });
    fs.writeFileSync(dest, body);

    const resultUrl = `${PUBLIC_BASE_URL}/generated/${safe}`;

    await db.query(
      `UPDATE public.generation_jobs
       SET result_filename = $1, result_url = $2, updated_at = now()
       WHERE id = $3`,
      [safe, resultUrl, jobId]
    );

    console.log('[generationApi] file uploaded:', { jobId, safe, resultUrl });
    return res.json({ ok: true, result_url: resultUrl, filename: safe });
  } catch (err) {
    console.error('[generationApi] upload error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/generation/callback ────────────────────────────────────────────
// Worker calls this when job is done or failed
// Body: { job_id, status: 'done'|'failed', error_message? }
router.post('/api/generation/callback', requireWorkerAuth, express.json(), async (req, res) => {
  try {
    const { job_id, status, error_message } = req.body || {};
    if (!job_id || !['done', 'failed'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'invalid payload' });
    }

    const { rows } = await db.query(
      `UPDATE public.generation_jobs
       SET status = $1,
           error_message = $2,
           completed_at = now(),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [status, error_message || null, job_id]
    );

    // Update or create generation session for edit continuity
    if (status === 'done' && rows[0]?.result_url) {
      const j = rows[0];
      await db.query(
        `INSERT INTO public.generation_sessions
           (guild_id, channel_id, owner_user_id, requested_by, latest_job_id, latest_result_url, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')
         ON CONFLICT (id) DO NOTHING`,
        [j.guild_id, j.channel_id, j.owner_user_id, j.requested_by, j.id, j.result_url]
      ).catch(() => {});
      // Also upsert by channel+user for session lookup
      await db.query(
        `INSERT INTO public.generation_sessions
           (guild_id, channel_id, owner_user_id, requested_by, latest_job_id, latest_result_url, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')
         ON CONFLICT DO NOTHING`,
        [j.guild_id, j.channel_id, j.owner_user_id, j.requested_by, j.id, j.result_url]
      ).catch(() => {});
    }

    if (!rows.length) return res.status(404).json({ ok: false, error: 'job not found' });

    const job = rows[0];
    console.log('[generationApi] callback received:', { job_id, status, result_url: job.result_url });

    // Fire Discord delivery (non-blocking)
    deliverToDiscord(job).catch(e =>
      console.error('[generationApi] discord delivery failed:', e.message)
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[generationApi] callback error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Discord delivery ─────────────────────────────────────────────────────────
async function deliverToDiscord(job) {
  // Import the bot client via internal HTTP to avoid circular deps
  // The discord-bot-worker exposes an internal API on port 3025
  const base = 'http://localhost:3025';

  const payload = {
    guild_id: job.guild_id,
    channel_id: job.channel_id,
    discord_message_id: job.discord_message_id,
    job_id: job.id,
    job_type: job.job_type,
    status: job.status,
    result_url: job.result_url,
    result_filename: job.result_filename,
    error_message: job.error_message,
    params: job.params,
  };

  const resp = await fetch(`${base}/internal/generation/deliver`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`discord delivery HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }

  return resp.json();
}

// ── POST /api/generation/enqueue ─────────────────────────────────────────────
// Called by the discord bot to queue a new generation job
router.post('/api/generation/enqueue', express.json(), async (req, res) => {
  try {
    const {
      guild_id, channel_id, owner_user_id,
      requested_by, job_type, params, discord_message_id
    } = req.body || {};

    const validTypes = ['image_fast','image_premium','image_stylized','image_edit','video_from_image','video_from_prompt'];
    if (!guild_id || !channel_id || !owner_user_id || !validTypes.includes(job_type)) {
      return res.status(400).json({ ok: false, error: 'invalid payload' });
    }

    const { rows } = await db.query(
      `INSERT INTO public.generation_jobs
         (guild_id, channel_id, owner_user_id, requested_by, job_type, params, discord_message_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, status, created_at`,
      [guild_id, channel_id, Number(owner_user_id), String(requested_by || ''),
       job_type, JSON.stringify(params || {}), discord_message_id || null]
    );

    console.log('[generationApi] job enqueued:', rows[0]);
    return res.json({ ok: true, job: rows[0] });
  } catch (err) {
    console.error('[generationApi] enqueue error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/generation/session/active ──────────────────────────────────────
// Bot uses this to check if user has an active edit session
router.get('/api/generation/session/active', requireWorkerAuth, async (req, res) => {
  try {
    const { guild_id, channel_id, requested_by } = req.query;
    if (!guild_id || !channel_id || !requested_by) {
      return res.status(400).json({ ok: false, error: 'missing params' });
    }
    const { rows } = await db.query(
      `SELECT id, latest_job_id, latest_result_url, expires_at
       FROM public.generation_sessions
       WHERE guild_id = $1 AND channel_id = $2 AND requested_by = $3
         AND expires_at > now()
       ORDER BY expires_at DESC LIMIT 1`,
      [guild_id, channel_id, requested_by]
    );
    return res.json({ ok: true, session: rows[0] || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Heartbeat monitor (runs in-process every 60s) ────────────────────────────
// Resets jobs whose workers have gone silent (spot interruption)
async function resetStalledJobs() {
  try {
    const { rows } = await db.query(
      `UPDATE public.generation_jobs
       SET status = 'pending',
           worker_id = NULL,
           last_heartbeat_at = NULL,
           updated_at = now()
       WHERE status = 'processing'
         AND last_heartbeat_at < now() - interval '2 minutes'
         AND attempts < 3
       RETURNING id, guild_id, channel_id`
    );
    if (rows.length) {
      console.log('[generationApi] reset stalled jobs:', rows.map(r => r.id));
    }

    // Fail jobs that have exceeded max attempts
    await db.query(
      `UPDATE public.generation_jobs
       SET status = 'failed',
           error_message = 'max attempts exceeded',
           completed_at = now(),
           updated_at = now()
       WHERE status = 'processing'
         AND last_heartbeat_at < now() - interval '2 minutes'
         AND attempts >= 3`
    );
  } catch (err) {
    console.error('[generationApi] heartbeat monitor error:', err.message);
  }
}

setInterval(resetStalledJobs, 60_000);

export default router;
