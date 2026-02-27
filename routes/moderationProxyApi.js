// routes/moderationProxyApi.js
import express from 'express';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

const SCRAPBOT_BASE =
  process.env.SCRAPBOT_BASE_URL || "http://127.0.0.1:3030";

function getSessionUserId(req) {
  const u = req?.session?.user || null;
  const id = u?.id ?? u?.user_id ?? null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ensureUserOr401(req, res) {
  const uid = getSessionUserId(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Not authenticated' });
    return null;
  }
  return uid;
}

function buildUrlWithUser(req, path) {
  const uid = getSessionUserId(req);
  const qs = new URLSearchParams(req.query || {});
  if (!qs.has('scraplet_user_id') && uid) qs.set('scraplet_user_id', String(uid));
  const q = qs.toString();
  return `${SCRAPBOT_BASE}${path}${q ? `?${q}` : ''}`;
}

function buildBodyWithUser(req) {
  const uid = getSessionUserId(req);
  const body = (req.body && typeof req.body === 'object') ? { ...req.body } : {};
  if ((body.scraplet_user_id == null || body.scraplet_user_id === '') && uid) {
    body.scraplet_user_id = uid;
  }
  return body;
}

async function proxy(req, res, path) {
  if (!ensureUserOr401(req, res)) return;

  const url = buildUrlWithUser(req, path);
  const required = process.env.SCRAPBOT_REQUIRED === "1";

  const init = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(buildBodyWithUser(req));
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    init.signal = controller.signal;

    const r = await fetch(url, init);
    clearTimeout(timeout);

    if (!r.ok && required) {
      return res.status(502).json({ ok: false, error: "scrapbot_unreachable" });
    }

    const text = await r.text();
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    if (!required) {
      return res.status(200).json({ ok: true, offline: true, error: "offline" });
    }
    return res.status(502).json({ ok: false, error: "scrapbot_unreachable" });
  }
}

// Page
router.get('/dashboard/moderation', requireAuth, (req, res) => {
  res.set('X-SCRAPLET-MOD-ROUTE', 'tabs-moderation-2026-02-18');
  res.render('layout', {
    tabView: 'tabs/moderation',
    user: req.session.user || null,
  });
});


// Rules
router.get('/dashboard/api/moderation/rules', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/rules')
);
router.post('/dashboard/api/moderation/rules', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/rules')
);
router.put('/dashboard/api/moderation/rules/:id', requireAuth, (req, res) =>
  proxy(req, res, `/api/moderation/rules/${encodeURIComponent(req.params.id)}`)
);
router.delete('/dashboard/api/moderation/rules/:id', requireAuth, (req, res) =>
  proxy(req, res, `/api/moderation/rules/${encodeURIComponent(req.params.id)}`)
);

// Test
router.post('/dashboard/api/moderation/test', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/test')
);

// Activity
router.get('/dashboard/api/moderation/activity', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/activity')
);

// Settings
router.get('/dashboard/api/moderation/settings', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/settings')
);
router.put('/dashboard/api/moderation/settings', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/settings')
);

/**
 * Intel + Incidents + Overrides
 */

// Hot signatures
router.get('/dashboard/api/moderation/intel/hot', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/intel/hot')
);

// Incident snapshots
router.get('/dashboard/api/moderation/incidents', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/incidents')
);

// Signature overrides (allow / deny)
router.get('/dashboard/api/moderation/overrides', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/overrides')
);
router.put('/dashboard/api/moderation/overrides', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/overrides')
);

router.post('/dashboard/api/moderation/explain', requireAuth, (req, res) =>
  proxy(req, res, '/api/moderation/explain')
);

export default router;
