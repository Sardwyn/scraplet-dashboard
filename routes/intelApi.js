// routes/intelApi.js
import express from "express";
import scrapbotDb from "../scrapbotDb.js"; // scrapbot_clean

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
}

/**
 * GET /api/intel/pulse
 * Returns the last 60 minutes of room intel snapshots and key moments.
 */
router.get("/api/intel/pulse", requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const platform = req.query.platform || "kick";
        const channelSlug = req.query.channel_slug || req.query.channelSlug;

        if (!channelSlug) {
            return res.status(400).json({ ok: false, error: "channel_slug_required" });
        }

        // 1. Fetch Timeline (smooth 30s buckets if possible, but we store 5s/10s)
        // We'll fetch all and let the frontend downsample or just render the dense line.
        const { rows: timeline } = await scrapbotDb.query(
            `
      SELECT
        bucket_ts,
        engagement_index,
        room_state,
        messages,
        mpm,
        pressure
      FROM public.sc_roomintel_snapshots
      WHERE scraplet_user_id = $1
        AND platform = $2
        AND channel_slug = $3
        AND bucket_ts >= (now() - interval '60 minutes')
      ORDER BY bucket_ts ASC
      `,
            [userId, platform, channelSlug.toLowerCase().trim()]
        );

        // 2. Fetch Moments (Transitions + Spikes)
        const { rows: moments } = await scrapbotDb.query(
            `
      WITH base AS (
        SELECT
          bucket_ts,
          engagement_index,
          room_state,
          LAG(room_state) OVER (ORDER BY bucket_ts) AS prev_state
        FROM public.sc_roomintel_snapshots
        WHERE scraplet_user_id = $1
          AND platform = $2
          AND channel_slug = $3
          AND bucket_ts >= (now() - interval '60 minutes')
      ),
      transitions AS (
        SELECT bucket_ts, engagement_index, room_state, 'transition'::text AS kind
        FROM base
        WHERE prev_state IS NOT NULL AND prev_state <> room_state
      ),
      spikes AS (
        SELECT bucket_ts, engagement_index, room_state, 'spike'::text AS kind
        FROM base
        WHERE engagement_index >= 80
      )
      SELECT * FROM (
        SELECT * FROM transitions
        UNION ALL
        SELECT * FROM spikes
      ) m
      ORDER BY bucket_ts DESC
      LIMIT 20
      `,
            [userId, platform, channelSlug.toLowerCase().trim()]
        );

        res.json({
            ok: true,
            timeline,
            moments,
        });

    } catch (err) {
        console.error("[intelApi] pulse failed:", err);
        res.status(500).json({ ok: false, error: "internal_error" });
    }
});

export default router;
