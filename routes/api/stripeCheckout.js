// routes/api/stripeCheckout.js
import express from 'express';
import requireAuth from '../../utils/requireAuth.js';
import db from '../../db.js';

const router = express.Router();
const PLATFORM_FEE_PCT = 0.30; // 30% to Scraplet

async function getStripe() {
  const { default: Stripe } = await import('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
}

// POST /dashboard/api/marketplace/checkout/:listingId
// Creates a Stripe Checkout Session for a paid overlay
router.post('/dashboard/api/marketplace/checkout/:listingId', requireAuth, async (req, res) => {
  try {
    const buyerId = req.session.user.id;
    const listingId = Number(req.params.listingId);

    const { rows: [listing] } = await db.query(`
      SELECT m.*, u.stripe_connect_account_id, u.stripe_connect_onboarded,
             o.public_id as overlay_public_id
      FROM marketplace_overlays m
      JOIN users u ON u.id = m.user_id
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [listingId]);

    if (!listing) return res.status(404).json({ ok: false, error: 'Listing not found' });
    if (listing.price_cents === 0) return res.status(400).json({ ok: false, error: 'Use acquire for free overlays' });
    if (!listing.stripe_connect_onboarded || !listing.stripe_connect_account_id) {
      return res.status(402).json({ ok: false, error: 'Creator has not set up payouts yet' });
    }

    const stripe = await getStripe();
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const base = `${proto}://${req.headers.host}`;
    const feeCents = Math.round(listing.price_cents * PLATFORM_FEE_PCT);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: listing.price_cents,
          product_data: {
            name: listing.title,
            description: listing.description || 'Scraplet overlay',
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: listing.stripe_connect_account_id },
      },
      metadata: {
        listing_id: String(listingId),
        buyer_user_id: String(buyerId),
        overlay_public_id: listing.overlay_public_id,
      },
      success_url: `${base}/marketplace/${listingId}?purchase=success`,
      cancel_url: `${base}/marketplace/${listingId}?purchase=cancelled`,
    });

    res.json({ ok: true, checkoutUrl: session.url });
  } catch (err) {
    console.error('[checkout] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/stripe/webhook
// Handles checkout.session.completed — clones overlay to buyer, records earnings
router.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const stripe = await getStripe();
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      : JSON.parse(req.body);
  } catch (err) {
    console.error('[webhook] signature error:', err.message);
    return res.status(400).send('Webhook signature failed');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { listing_id, buyer_user_id } = session.metadata || {};
    if (!listing_id || !buyer_user_id) return res.json({ received: true });

    try {
      const listingId = Number(listing_id);
      const buyerId = Number(buyer_user_id);
      const crypto = await import('crypto');

      const { rows: [listing] } = await db.query(`
        SELECT m.*, o.name as overlay_name FROM marketplace_overlays m
        JOIN overlays o ON o.id = m.overlay_id
        WHERE m.id = $1
      `, [listingId]);

      if (!listing) throw new Error('Listing not found: ' + listingId);

      // Clone overlay to buyer
      const publicId = crypto.default.randomBytes(12).toString('hex');
      const slug = 'marketplace-' + listing.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
      await db.query(`
        INSERT INTO overlays (user_id, slug, name, public_id, config_json, scene_type)
        VALUES ($1, $2, $3, $4, $5, 'overlay')
        ON CONFLICT DO NOTHING
      `, [buyerId, slug, listing.title + ' (from marketplace)', publicId, JSON.stringify(listing.snapshot_config || {})]);

      // Record earnings for creator (70%)
      const amountCents = session.amount_total || listing.price_cents;
      const feeCents = Math.round(amountCents * 0.30);
      const netCents = amountCents - feeCents;
      await db.query(`
        INSERT INTO creator_earnings (user_id, source, amount_cents, platform_fee_cents, net_cents, status, reference_id, description)
        VALUES ($1, 'marketplace_sale', $2, $3, $4, 'pending', $5, $6)
      `, [listing.user_id, amountCents, feeCents, netCents, session.payment_intent, `Sale of "${listing.title}"`]);

      console.log('[webhook] checkout complete — listing', listingId, 'buyer', buyerId);
    } catch (err) {
      console.error('[webhook] fulfillment error:', err.message);
    }
  }

  res.json({ received: true });
});

export default router;
