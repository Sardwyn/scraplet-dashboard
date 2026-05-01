/**
 * Scheduled Message Worker
 * Loads enabled scheduled messages for a channel and posts them at configured intervals.
 * Called when a channel goes live; timers cleared when channel goes offline.
 */
import scrapbotDb from '../../scrapbotDb.js';

const activeTimers = new Map(); // channelId -> [timerId, ...]

export async function startScheduledMessages(channelId, sendChatFn) {
  await stopScheduledMessages(channelId);
  
  const { rows } = await scrapbotDb.query(
    'SELECT * FROM scheduled_messages WHERE channel_id = $1 AND enabled = TRUE',
    [channelId]
  );
  
  if (!rows.length) return;
  
  const timers = rows.map(msg => {
    const intervalMs = (msg.interval_minutes || 30) * 60 * 1000;
    const timerId = setInterval(async () => {
      try {
        await sendChatFn(channelId, msg.message);
        await scrapbotDb.query(
          'UPDATE scheduled_messages SET last_sent_at = NOW() WHERE id = $1',
          [msg.id]
        );
      } catch (err) {
        console.error('[ScheduledMessages] Error sending message:', err.message);
      }
    }, intervalMs);
    return timerId;
  });
  
  activeTimers.set(channelId, timers);
}

export async function stopScheduledMessages(channelId) {
  const timers = activeTimers.get(channelId);
  if (timers) {
    timers.forEach(t => clearInterval(t));
    activeTimers.delete(channelId);
  }
}
