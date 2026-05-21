import pg from 'pg';

export function startPostgresListener() {
  const cs = process.env.DASHBOARD_DATABASE_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.error('[postgresListener] DATABASE_URL not set');
    return;
  }

  const client = new pg.Client({ connectionString: cs, ssl: false });

  client.on('notification', (msg) => {
    try {
      if (msg.channel === 'canvas_updated') {
        const payload = JSON.parse(msg.payload);
        console.log('[postgresListener] Received canvas_updated:', payload);
        
        // Broadcast to the user via SSE
        const bus = global.studioEventBus;
        if (bus && typeof bus.publish === 'function') {
          // Send to the ownerUserId
          bus.publish(payload.ownerUserId, payload);
        }
      }
    } catch (err) {
      console.error('[postgresListener] Error parsing notification:', err);
    }
  });

  client.connect()
    .then(() => {
      console.log('[postgresListener] Connected, listening for NOTIFY canvas_updated');
      return client.query('LISTEN canvas_updated');
    })
    .catch((err) => {
      console.error('[postgresListener] Connection error:', err);
      // Try to reconnect after 5s
      setTimeout(startPostgresListener, 5000);
    });

  client.on('error', (err) => {
    console.error('[postgresListener] Client error:', err);
    // Connection died, try to reconnect
    setTimeout(startPostgresListener, 5000);
  });
}
