// routes/trainingApi.js
// API for Scrapbot training data pipeline management.

import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import { collectDiscordExchanges, collectKickExchanges } from '../services/trainingCollector.js';

const router = express.Router();

// ── GET /dashboard/api/training/stats ─────────────────────────────────────────
router.get('/dashboard/api/training/stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')  AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')  AS rejected,
        COUNT(*) FILTER (WHERE exported_at IS NULL AND status = 'approved') AS ready_to_export,
        COUNT(*) FILTER (WHERE collected_at > now() - interval '7 days') AS last_7_days,
        COUNT(*) AS total
      FROM public.scrapbot_training_candidates
    `);

    const { rows: goldRows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE reaction = 'thumbs_up')   AS gold_positive,
        COUNT(*) FILTER (WHERE reaction = 'thumbs_down') AS gold_negative,
        COUNT(*) FILTER (WHERE exported_at IS NULL)      AS gold_unexported,
        COUNT(*) AS gold_total
      FROM public.scrapbot_training_gold
    `);

    return res.json({ ok: true, candidates: rows[0], gold: goldRows[0] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /dashboard/api/training/candidates ────────────────────────────────────
router.get('/dashboard/api/training/candidates', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const { rows } = await db.query(`
      SELECT id, platform, user_message, bot_response, quality_score, status, collected_at
      FROM public.scrapbot_training_candidates
      WHERE status = $1
      ORDER BY quality_score DESC, collected_at DESC
      LIMIT $2
    `, [status, limit]);
    return res.json({ ok: true, candidates: rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /dashboard/api/training/candidates/:id/approve ───────────────────────
router.post('/dashboard/api/training/candidates/:id/approve', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { corrected_response } = req.body || {};

    await db.query(
      `UPDATE public.scrapbot_training_candidates SET status = 'approved' WHERE id = $1`,
      [id]
    );

    // Get the candidate
    const { rows } = await db.query(
      `SELECT * FROM public.scrapbot_training_candidates WHERE id = $1`, [id]
    );
    if (rows[0]) {
      await db.query(`
        INSERT INTO public.scrapbot_training_gold
          (candidate_id, platform, user_message, bot_response, corrected_response, reaction, curated_by)
        VALUES ($1, $2, $3, $4, $5, 'thumbs_up', $6)
      `, [id, rows[0].platform, rows[0].user_message,
          corrected_response || rows[0].bot_response,
          corrected_response || null,
          req.session?.user?.username || 'admin']);
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /dashboard/api/training/candidates/:id/reject ────────────────────────
router.post('/dashboard/api/training/candidates/:id/reject', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { corrected_response } = req.body || {};

    await db.query(
      `UPDATE public.scrapbot_training_candidates SET status = 'rejected' WHERE id = $1`, [id]
    );

    if (corrected_response) {
      const { rows } = await db.query(
        `SELECT * FROM public.scrapbot_training_candidates WHERE id = $1`, [id]
      );
      if (rows[0]) {
        await db.query(`
          INSERT INTO public.scrapbot_training_gold
            (candidate_id, platform, user_message, bot_response, corrected_response, reaction, curated_by)
          VALUES ($1, $2, $3, $4, $5, 'thumbs_down', $6)
        `, [id, rows[0].platform, rows[0].user_message, rows[0].bot_response,
            corrected_response, req.session?.user?.username || 'admin']);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /dashboard/api/training/export ────────────────────────────────────────
router.get('/dashboard/api/training/export', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT user_message, bot_response, corrected_response, reaction
      FROM public.scrapbot_training_gold
      WHERE exported_at IS NULL
      ORDER BY curated_at DESC
    `);

    if (!rows.length) return res.json({ ok: true, count: 0, data: [] });

    const jsonl = rows.map(r => JSON.stringify({
      messages: [
        { role: 'user', content: r.user_message },
        { role: 'assistant', content: r.corrected_response || r.bot_response }
      ]
    })).join('\n');

    // Mark as exported
    await db.query(
      `UPDATE public.scrapbot_training_gold SET exported_at = now() WHERE exported_at IS NULL`
    );

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="scrapbot_gold_training.jsonl"');
    return res.send(jsonl);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /dashboard/api/training/collect ──────────────────────────────────────
router.post('/dashboard/api/training/collect', requireAuth, async (req, res) => {
  try {
    const hours = parseInt(req.body?.hours || '24');
    const [discord, kick] = await Promise.all([
      collectDiscordExchanges(hours),
      collectKickExchanges(hours),
    ]);
    return res.json({ ok: true, collected: { discord, kick, total: discord + kick } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
