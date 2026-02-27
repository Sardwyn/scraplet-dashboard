// routes/integrations.js
import express from 'express';

const router = express.Router();

/**
 * GET /account/connect/kick
 *
 * Dashboard entry point for user Kick OAuth.
 * - Requires a logged-in dashboard user
 * - Simply redirects to /auth/kick/start (handled by kickAuth.js)
 */
router.get('/account/connect/kick', (req, res) => {
  if (!req.session?.user?.id) {
    return res.redirect('/auth/login');
  }

  return res.redirect('/auth/kick/start');
});

export default router;
