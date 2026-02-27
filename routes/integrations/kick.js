import express from 'express';
import db from '../../db.js';
import requireAuth from '../../utils/requireAuth.js';

const router = express.Router();

router.post('/kick/disconnect', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  // Single authority: delete token rows, then channels, then external_accounts
  await db.query(
    `DELETE FROM external_account_tokens
     WHERE external_account_id IN (
       SELECT id FROM external_accounts
       WHERE platform = 'kick' AND user_id = $1
     )`,
    [userId]
  );

  // Channels references external_accounts.id via account_id FK
  await db.query(
    `DELETE FROM channels
     WHERE account_id IN (
       SELECT id FROM external_accounts
       WHERE platform = 'kick' AND user_id = $1
     )`,
    [userId]
  );

  await db.query(
    `DELETE FROM external_accounts WHERE platform = 'kick' AND user_id = $1`,
    [userId]
  );

  // Legacy cleanup (table is dead but remove stale rows)
  await db.query(
    `DELETE FROM kick_tokens_user WHERE dashboard_user_id = $1`,
    [userId]
  ).catch(() => { });

  console.log('[integrations/kick] disconnected', { dashboard_user_id: userId });

  res.redirect('/dashboard');
});

export default router;
