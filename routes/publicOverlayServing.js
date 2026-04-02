import express from 'express';
import db from '../db.js';
import path from 'path';

const router = express.Router();
const ASSET_BASE = '/static/overlays';

router.get('/o/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await db.query(
            `SELECT o.public_id, o.id, o.name, o.user_id,
                    COALESCE(sa.channel_slug, '') as channel_slug
             FROM overlays o
             LEFT JOIN scrapbot_accounts sa ON sa.owner_user_id = o.user_id AND sa.platform = 'kick' AND sa.enabled = true
             WHERE o.slug = $1 OR o.public_id = $1
             LIMIT 1`,
            [slug]
        );

        if (result.rows.length === 0) return res.status(404).send('Overlay not found');

        const overlay = result.rows[0];
        const publicId = overlay.public_id;
        const channelSlug = overlay.channel_slug || '';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${overlay.name || 'Scraplet Overlay'}</title>
    <style>body{margin:0;overflow:hidden;background:transparent}#overlay-runtime-root{width:100vw;height:100vh}</style>
</head>
<body>
    <div id="overlay-runtime-root"></div>
    <script>window.__OVERLAY_PUBLIC_ID__ = "${publicId}"; window.__OVERLAY_CHANNEL_SLUG__ = "${channelSlug}";</script>
    <script type="module" src="${ASSET_BASE}/overlay-runtime.bundle.js?v=${Date.now()}"></script>
</body>
</html>`;

        res.send(html);
    } catch (err) {
        console.error("Overlay Serving Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

export default router;