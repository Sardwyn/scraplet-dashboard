// routes/api/ttsPanel.js
// Public-facing TTS panel API — no auth required (public profile page)
// GET /api/tts/voices/:channelSlug — returns enabled voices + prices for a streamer
// POST /api/tts/paid/intent — creates Stripe PaymentIntent for a paid TTS job
// POST /api/tts/paid/confirm — confirms payment and enqueues the job

import express from 'express';
import Stripe from 'stripe';
import db from '../../db.js';
import { validateBeaconPayload } from '../../src/tts/voiceRouter.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });

// GET /api/tts/voices/:channelSlug
// Returns the voices enabled for this streamer's profile
router.get('/api/tts/voices/:channelSlug', async (req, res) => {
  try {
    const { channelSlug } = req.params;

    // Get user_id for this channel
    const { rows: userRows } = await db.query(
      `SELECT ea.user_id FROM external_accounts ea
       JOIN channels c ON c.account_id = ea.id
       WHERE c.channel_slug = $1 AND c.platform = 'kick' LIMIT 1`,
      [channelSlug]
    );
    if (!userRows.length) return res.json({ ok: true, voices: [] });
    const userId = userRows[0].user_id;

    // Check TTS feature flag
    const { rows: featureRows } = await db.query(
      `SELECT flags_json FROM creator_features WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const flags = featureRows[0]?.flags_json || {};
    if (!flags.tts) return res.json({ ok: true, voices: [], disabled: true });

    // Get streamer's enabled voices
    const { rows: configRows } = await db.query(
      `SELECT enabled_voice_ids FROM streamer_tts_config WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const enabledIds = configRows[0]?.enabled_voice_ids || [];

    // Get voice details
    let voices = [];
    if (enabledIds.length > 0) {
      const { rows: voiceRows } = await db.query(
        `SELECT voice_id, name, tier, price_cents FROM tts_voices
         WHERE voice_id = ANY($1) AND active = true
         ORDER BY price_cents ASC`,
        [enabledIds]
      );
      voices = voiceRows;
    }

    // Always include free voice
    const { rows: freeVoice } = await db.query(
      `SELECT voice_id, name, tier, price_cents FROM tts_voices WHERE tier = 'free' AND active = true LIMIT 1`
    );
    if (freeVoice.length) voices = [freeVoice[0], ...voices.filter(v => v.tier !== 'free')];

    return res.json({ ok: true, voices, userId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/tts/paid/intent
// Creates a Stripe PaymentIntent for a paid TTS job
router.post('/api/tts/paid/intent', express.json(), async (req, res) => {
  try {
    const { channelSlug, voiceId, text, viewerUsername } = req.body || {};
    if (!channelSlug || !voiceId || !text) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    if (text.length > 500) {
      return res.status(400).json({ ok: false, error: 'text_too_long' });
    }

    // Get voice price
    const { rows: voiceRows } = await db.query(
      `SELECT voice_id, name, tier, price_cents FROM tts_voices WHERE voice_id = $1 AND active = true LIMIT 1`,
      [voiceId]
    );
    if (!voiceRows.length) return res.status(400).json({ ok: false, error: 'invalid_voice' });
    const voice = voiceRows[0];

    if (voice.tier === 'free') {
      return res.status(400).json({ ok: false, error: 'use_free_tts_command' });
    }

    // Get streamer user_id
    const { rows: userRows } = await db.query(
      `SELECT ea.user_id FROM external_accounts ea
       JOIN channels c ON c.account_id = ea.id
       WHERE c.channel_slug = $1 AND c.platform = 'kick' LIMIT 1`,
      [channelSlug]
    );
    if (!userRows.length) return res.status(404).json({ ok: false, error: 'streamer_not_found' });
    const scrapletUserId = userRows[0].user_id;

    // Create Stripe PaymentIntent
    const intent = await stripe.paymentIntents.create({
      amount: voice.price_cents,
      currency: 'usd',
      metadata: {
        channelSlug,
        voiceId,
        scrapletUserId: String(scrapletUserId),
        viewerUsername: viewerUsername || 'anonymous',
        textPreview: text.slice(0, 50),
      },
      description: `TTS: ${voice.name} — ${channelSlug}`,
    });

    return res.json({
      ok: true,
      clientSecret: intent.client_secret,
      intentId: intent.id,
      priceCents: voice.price_cents,
      voiceName: voice.name,
    });
  } catch (err) {
    console.error('[ttsPanel] intent error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/tts/paid/confirm
// Called after Stripe payment succeeds — enqueues the paid TTS job
router.post('/api/tts/paid/confirm', express.json(), async (req, res) => {
  try {
    const { intentId, channelSlug, voiceId, text, viewerUsername } = req.body || {};
    if (!intentId || !channelSlug || !voiceId || !text) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    // Verify payment succeeded
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ ok: false, error: 'payment_not_confirmed' });
    }

    // Get streamer user_id and revenue share
    const { rows: userRows } = await db.query(
      `SELECT ea.user_id FROM external_accounts ea
       JOIN channels c ON c.account_id = ea.id
       WHERE c.channel_slug = $1 AND c.platform = 'kick' LIMIT 1`,
      [channelSlug]
    );
    if (!userRows.length) return res.status(404).json({ ok: false, error: 'streamer_not_found' });
    const scrapletUserId = userRows[0].user_id;

    const { rows: configRows } = await db.query(
      `SELECT revenue_share_pct FROM streamer_tts_config WHERE user_id = $1 LIMIT 1`,
      [scrapletUserId]
    );
    const revenueSharePct = configRows[0]?.revenue_share_pct ?? 70;
    const payoutCents = Math.floor(intent.amount * revenueSharePct / 100);

    // Enqueue paid TTS job
    const { rows: [job] } = await db.query(
      `INSERT INTO tts_jobs
         (scraplet_user_id, platform, channel_slug, source, priority, text, text_sanitized,
          char_count, engine, voice_id, payment_intent_id, payment_cents, payout_cents,
          requested_by_username)
       VALUES ($1, 'kick', $2, 'paid_tts', 100, $3, $3, $4, 'elevenlabs', $5, $6, $7, $8, $9)
       RETURNING id`,
      [scrapletUserId, channelSlug, text.slice(0, 500), text.length,
       voiceId, intentId, intent.amount, payoutCents, viewerUsername || 'anonymous']
    );

    return res.json({ ok: true, jobId: job.id });
  } catch (err) {
    console.error('[ttsPanel] confirm error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
