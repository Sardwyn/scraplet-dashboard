import express from 'express';

const router = express.Router();

router.post('/', (req, res) => {
  const bus = global.studioEventBus;

  if (!bus) {
    console.error('[Dashboard] EventBus is not initialised');
    return res
      .status(500)
      .json({ ok: false, error: 'EventBus not initialised' });
  }

  const event = req.body;

  console.log(
    '[Dashboard] Ingesting external event (raw body):',
    event,
    'typeof =',
    typeof event
  );

  const listeners = bus.listeners;

  if (listeners && typeof listeners.forEach === 'function') {
    listeners.forEach((_set, userId) => {
      try {
        bus.publish(userId, event);
      } catch (err) {
        console.error(
          '[Dashboard] Failed to publish to user',
          userId,
          err
        );
      }
    });
  }

  return res.json({ ok: true, received: event });
});

export default router;
