// routes/api/widgetTestFire.js
// POST /dashboard/api/widget-test-fire
// Injects a test event into the widget SSE stream for the authenticated user.
// Used by the overlay editor to test widget rendering.

import express from 'express';
import requireAuth from '../../utils/requireAuth.js';
import { mintWidgetToken } from '../../utils/widgetTokens.js';
import db from '../../db.js';

const router = express.Router();

// In-memory test event store (per user, cleared after 30s)
const testEvents = new Map(); // userId -> { events: [], timer }

router.post('/dashboard/api/widget-test-fire', requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { widgetId, eventType, payload } = req.body || {};

    if (!widgetId || !eventType) {
      return res.status(400).json({ ok: false, error: 'widgetId and eventType required' });
    }

    // Store the test event for SSE delivery
    if (!testEvents.has(userId)) {
      testEvents.set(userId, { events: [], timer: null });
    }
    const userEvents = testEvents.get(userId);
    userEvents.events.push({ type: eventType, ...payload, _test: true, _ts: Date.now() });

    // Clear after 30s
    if (userEvents.timer) clearTimeout(userEvents.timer);
    userEvents.timer = setTimeout(() => testEvents.delete(userId), 30000);

    // Also try to inject via the widget SSE stream directly
    // by writing to the widget_events table if it exists
    try {
      await db.query(
        `INSERT INTO widget_test_events (user_id, widget_id, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [userId, widgetId, eventType, JSON.stringify(payload)]
      ).catch(() => {}); // table may not exist yet
    } catch { /* non-fatal */ }

    return res.json({ ok: true, message: 'Test event queued. Open the overlay in OBS or the preview to see it.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /dashboard/api/widget-test-events — SSE stream for test events
// The widget runtime polls this to get test events
router.get('/dashboard/api/widget-test-events', requireAuth, (req, res) => {
  const userId = req.session.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const interval = setInterval(() => {
    const userEvents = testEvents.get(userId);
    if (userEvents && userEvents.events.length > 0) {
      const event = userEvents.events.shift();
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }, 500);

  req.on('close', () => clearInterval(interval));
});

export { testEvents };
export default router;
