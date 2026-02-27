import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * GET /api/internal/session/current
 * Internal endpoint for Scrapbot to determine the active stream session for tagging moderation events.
 * Auth: x-scraplet-internal-key header
 */
router.get('/api/internal/session/current', async (req, res) => {
    try {
        const internalKey = req.headers['x-scraplet-internal-key'];

        // Ensure authorized via shared secret
        if (!internalKey || internalKey !== process.env.SCRAPLET_SHARED_SECRET) {
            return res.status(401).json({ ok: false, error: 'Unauthorized internal access' });
        }

        const platform = String(req.query.platform || '').trim().toLowerCase();
        const channelSlug = String(req.query.channel || '').trim().toLowerCase();

        if (!platform || !channelSlug) {
            return res.status(400).json({ ok: false, error: 'Missing platform or channel' });
        }

        // 1. Check for active session first
        const { rows: activeRows } = await db.query(
            `
            SELECT session_id, started_at, status 
            FROM public.stream_sessions 
            WHERE platform = $1 AND channel_slug = $2 AND ended_at IS NULL 
            LIMIT 1
            `,
            [platform, channelSlug]
        );

        if (activeRows.length > 0) {
            return res.json({
                ok: true,
                session_id: activeRows[0].session_id,
                started_at: activeRows[0].started_at,
                status: activeRows[0].status
            });
        }

        // 2. If no active session, fetch the most recent ended session
        const { rows: latestRows } = await db.query(
            `
            SELECT session_id, started_at, status 
            FROM public.stream_sessions 
            WHERE platform = $1 AND channel_slug = $2 
            ORDER BY started_at DESC 
            LIMIT 1
            `,
            [platform, channelSlug]
        );

        if (latestRows.length > 0) {
            return res.json({
                ok: true,
                session_id: latestRows[0].session_id,
                started_at: latestRows[0].started_at,
                status: latestRows[0].status
            });
        }

        // 3. No sessions ever recorded for this channel
        return res.json({
            ok: true,
            session_id: null,
            started_at: null,
            status: 'none'
        });

    } catch (err) {
        console.error('[apiInternal] /session/current fail', err);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
});

export default router;
