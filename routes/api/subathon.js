// routes/api/subathon.js
import express from 'express';
import requireAuth from '../../utils/requireAuth.js';
import {
  startTimer, pauseTimer, resumeTimer, stopTimer,
  addTime, getTimerState, subscribeClient, ensureTable
} from '../../src/services/subathonTimer.js';

const router = express.Router();

// Ensure table on first load
ensureTable();

// GET /dashboard/api/subathon/state
router.get('/dashboard/api/subathon/state', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  res.json(getTimerState(userId));
});

// POST /dashboard/api/subathon/start
router.post('/dashboard/api/subathon/start', requireAuth, express.json(), async (req, res) => {
  const userId = req.session.user.id;
  const config = req.body?.config || {};
  // Convert minutes to ms for convenience
  if (config.startMin) config.startMs = config.startMin * 60 * 1000;
  if (config.addPerSubMin) config.addPerSub = config.addPerSubMin * 60 * 1000;
  if (config.addPerFollowSec) config.addPerFollow = config.addPerFollowSec * 1000;
  if (config.addPerGiftSubMin) config.addPerGiftSub = config.addPerGiftSubMin * 60 * 1000;
  if (config.addPerRaidMin) config.addPerRaid = config.addPerRaidMin * 60 * 1000;
  const state = await startTimer(userId, config);
  res.json({ ok: true, ...state });
});

// POST /dashboard/api/subathon/pause
router.post('/dashboard/api/subathon/pause', requireAuth, async (req, res) => {
  const state = await pauseTimer(req.session.user.id);
  res.json({ ok: true, ...state });
});

// POST /dashboard/api/subathon/resume
router.post('/dashboard/api/subathon/resume', requireAuth, async (req, res) => {
  const state = await resumeTimer(req.session.user.id);
  res.json({ ok: true, ...state });
});

// POST /dashboard/api/subathon/stop
router.post('/dashboard/api/subathon/stop', requireAuth, async (req, res) => {
  const state = await stopTimer(req.session.user.id);
  res.json({ ok: true, ...state });
});

// POST /dashboard/api/subathon/add — manually add time
router.post('/dashboard/api/subathon/add', requireAuth, express.json(), async (req, res) => {
  const ms = Number(req.body?.ms) || 0;
  const state = await addTime(req.session.user.id, ms);
  res.json({ ok: true, ...state });
});

// GET /dashboard/api/subathon/stream — SSE for widget
router.get('/dashboard/api/subathon/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const userId = req.session.user.id;
  const unsub = subscribeClient(userId, res);
  req.on('close', unsub);
});

// Public SSE for OBS widget (uses token auth)
router.get('/api/subathon/stream/:token', async (req, res) => {
  // Verify token is a valid widget token for this user
  try {
    const { verifyWidgetToken } = await import('../../utils/widgetTokens.js');
    const payload = verifyWidgetToken(req.params.token);
    if (!payload) return res.status(401).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const unsub = subscribeClient(String(payload.sub), res);
    req.on('close', unsub);
  } catch { res.status(500).end(); }
});

export default router;
