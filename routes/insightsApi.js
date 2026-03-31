// routes/insightsApi.js
// GET /dashboard/api/insights — fresh non-dismissed insights grouped by metric_key
// POST /dashboard/api/insights/:id/dismiss — sets dismissed_at
// GET /dashboard/api/insights/history — all insights including dismissed

import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

// GET /dashboard/api/insights
router.get('/dashboard/api/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await db.query(
      `SELECT insight_id, metric_key, insight_text, confidence,
              supporting_data->>'action_suggestion' AS action_suggestion,
              date_range_start, date_range_end, created_at
       FROM public.insights
       WHERE user_id = $1
         AND dismissed_at IS NULL
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY metric_key, confidence DESC`,
      [userId]
    );
    // Return highest-confidence insight per metric_key
    const byMetric = {};
    for (const row of rows) {
      if (!byMetric[row.metric_key]) byMetric[row.metric_key] = row;
    }
    return res.json({ ok: true, insights: Object.values(byMetric) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /dashboard/api/insights/:id/dismiss
router.post('/dashboard/api/insights/:id/dismiss', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await db.query(
      `UPDATE public.insights
       SET dismissed_at = NOW()
       WHERE insight_id = $1 AND user_id = $2 AND dismissed_at IS NULL`,
      [req.params.id, userId]
    );
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /dashboard/api/insights/history
router.get('/dashboard/api/insights/history', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await db.query(
      `SELECT insight_id, metric_key, insight_text, confidence,
              supporting_data->>'action_suggestion' AS action_suggestion,
              date_range_start, date_range_end, created_at, dismissed_at
       FROM public.insights
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );
    return res.json({ ok: true, insights: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
