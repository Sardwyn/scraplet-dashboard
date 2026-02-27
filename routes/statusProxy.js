import express from 'express';

const router = express.Router();

const SCRAPBOT_BASE = process.env.SCRAPBOT_BASE_URL || 'http://127.0.0.1:3030';

router.get('/channels', async (req, res) => {
  try {
    const platform = req.query.platform || 'kick';
    const owner_user_id = req.query.owner_user_id;

    const url = new URL('/api/status/channels', SCRAPBOT_BASE);
    url.searchParams.set('platform', String(platform));
    if (owner_user_id != null) url.searchParams.set('owner_user_id', String(owner_user_id));

    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await r.text();

    res.status(r.status);
    res.set('content-type', r.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.send(body);
  } catch (err) {
    console.error('[statusProxy] /api/status/channels failed', err);
    return res.status(502).json({ ok: false, error: 'scrapbot_unreachable' });
  }
});

export default router;
