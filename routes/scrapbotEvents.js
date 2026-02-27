// routes/scrapbotEvents.js
import express from 'express';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

/**
 * POST /dashboard/api/scrapbot/events
 * Receives events forwarded from Scrapbot.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const envelope = req.body;

    if (!envelope || !envelope.type) {
      return res.status(400).json({ ok: false, error: 'Invalid envelope' });
    }

    // Broadcast to Studio EventBus via SSE/WebSocket
    const bus = global.studioEventBus;
    if (bus && typeof bus.publish === 'function') {
      bus.publish(req.session.user.id, envelope);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Dashboard: scrapbot event error', err);
    res.status(500).json({ ok: false });
  }
});

export default router;
