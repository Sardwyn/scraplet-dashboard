// scripts/refreshKickEvents.js
import 'dotenv/config';
import { ensureChatEventsSubscriptionForUser } from '../services/kickEvents.js';

async function main() {
  const raw = process.argv[2] || '4';
  const userId = Number(raw);

  if (!userId) {
    console.error('Usage: node scripts/refreshKickEvents.js <user_id>');
    process.exit(1);
  }

  console.log(
    '[refreshKickEvents] refreshing Kick event subscriptions for user_id=',
    userId
  );

  try {
    const result = await ensureChatEventsSubscriptionForUser(userId);
    console.log('[refreshKickEvents] success:', result);
    process.exit(0);
  } catch (err) {
    console.error('[refreshKickEvents] error:', err);
    process.exit(1);
  }
}

main();
