// routes/earnings.js
import express from 'express';
import requireAuth from '../utils/requireAuth.js';
import db from '../db.js';

const router = express.Router();

async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  const { default: Stripe } = await import('stripe');
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

// GET /dashboard/earnings
router.get('/dashboard/earnings', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    // Auto-migrate
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT`).catch(()=>{});
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_onboarded BOOLEAN NOT NULL DEFAULT FALSE`).catch(()=>{});
    await db.query(`CREATE TABLE IF NOT EXISTS creator_earnings (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL, amount_cents INTEGER NOT NULL, platform_fee_cents INTEGER NOT NULL DEFAULT 0,
      net_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reference_id TEXT,
      description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ
    )`).catch(()=>{});
    await db.query(`CREATE TABLE IF NOT EXISTS marketplace_overlays (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      overlay_id BIGINT NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT, price_cents INTEGER NOT NULL DEFAULT 0,
      snapshot_config JSONB, asset_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'draft', published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch(()=>{});

    const { rows: [user] } = await db.query(
      `SELECT stripe_connect_account_id, stripe_connect_onboarded FROM users WHERE id = $1`, [userId]
    );

    const { rows: [s] } = await db.query(`
      SELECT
        COALESCE(SUM(net_cents),0) AS total_net_cents,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month',NOW()) THEN net_cents ELSE 0 END),0) AS month_net_cents,
        COALESCE(SUM(CASE WHEN status='pending' THEN net_cents ELSE 0 END),0) AS pending_cents
      FROM creator_earnings WHERE user_id=$1
    `, [userId]);

    const { rows: transactions } = await db.query(`
      SELECT id, source, amount_cents, net_cents, status, description, created_at
      FROM creator_earnings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50
    `, [userId]);

    const { rows: listings } = await db.query(`
      SELECT m.id, m.title, m.price_cents, m.status, m.published_at, o.name as overlay_name
      FROM marketplace_overlays m JOIN overlays o ON o.id=m.overlay_id
      WHERE m.user_id=$1 ORDER BY m.created_at DESC
    `, [userId]).catch(() => ({ rows: [] }));

    res.render('tabs/earnings', {
    currentPage: "earnings",
    currentPage: "earnings",
      tabView: 'tabs/earnings',
      user: req.session.user,
      stripeOnboarded: user?.stripe_connect_onboarded || false,
      stripeAccountId: user?.stripe_connect_account_id || null,
      stripeStatus: req.query.stripe || null,
      totalNetCents: Number(s?.total_net_cents || 0),
      monthNetCents: Number(s?.month_net_cents || 0),
      pendingCents: Number(s?.pending_cents || 0),
      transactions,
      listings,
    });
  } catch (err) { next(err); }
});

// POST /dashboard/earnings/stripe/connect
router.post('/dashboard/earnings/stripe/connect', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const stripe = await getStripe();
    const { rows: [user] } = await db.query(`SELECT stripe_connect_account_id FROM users WHERE id=$1`, [userId]);
    let accountId = user?.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express', metadata: { scraplet_user_id: String(userId) } });
      accountId = account.id;
      await db.query(`UPDATE users SET stripe_connect_account_id=$1 WHERE id=$2`, [accountId, userId]);
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const base = `${proto}://${req.headers.host}`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/dashboard/earnings/stripe/connect`,
      return_url: `${base}/dashboard/earnings?stripe=success`,
      type: 'account_onboarding',
    });
    res.redirect(link.url);
  } catch (err) {
    console.error('[earnings] stripe connect error:', err.message);
    res.redirect('/dashboard/earnings?stripe=error');
  }
});

// POST /dashboard/earnings/stripe/verify
router.post('/dashboard/earnings/stripe/verify', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows: [user] } = await db.query(`SELECT stripe_connect_account_id FROM users WHERE id=$1`, [userId]);
    if (!user?.stripe_connect_account_id) return res.json({ ok: false });
    const stripe = await getStripe();
    const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);
    const onboarded = account.details_submitted && account.charges_enabled;
    await db.query(`UPDATE users SET stripe_connect_onboarded=$1 WHERE id=$2`, [onboarded, userId]);
    res.json({ ok: true, onboarded });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

export default router;
