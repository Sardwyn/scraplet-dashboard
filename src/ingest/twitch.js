// src/ingest/twitch.js
import crypto from "crypto";
import db from "../../db.js";
import { buildChatEnvelopeV1FromTwitch } from "./buildChatEnvelopeV1.js";

// Canonical Twitch ingest handles EventSub/webhooks and enqueues to outbox
export async function twitchWebhookHandler(req, res) {
  try {
    // Note: Twitch EventSub challenge verification is expected to be handled in transport or here
    if (req.headers["twitch-eventsub-message-type"] === "webhook_callback_verification") {
      return res.status(200).send(req.body.challenge);
    }

    const payload = req.body;
    if (!payload || !payload.subscription || !payload.event) {
      return res.json({ ok: true, ignored: true, reason: "missing_payload" });
    }

    // For now we only handle chat messages
    if (payload.subscription.type !== "channel.chat.message") {
      return res.json({ ok: true, ignored: true, reason: "unsupported_event_type" });
    }

    const event = payload.event;
    
    // Convert to scraplet_user_id (would require a mapping table in reality, assuming we have owner_user_id passed somehow or mapped)
    // For simplicity of this task, we assume the streamer's dashboard id is passed in a query param or mapped via channel_id.
    // Let's extract it from query or assume 0 for stub if missing.
    const ownerUserId = req.query.owner_user_id || 0;

    const chat_v1 = buildChatEnvelopeV1FromTwitch({
      ownerUserId,
      channelSlug: event.broadcaster_user_login,
      platformChannelId: event.broadcaster_user_id,
      messageId: event.message_id,
      messageText: event.message?.text,
      authorUsername: event.chatter_user_login,
      authorDisplay: event.chatter_user_name,
      authorPlatformUserId: event.chatter_user_id,
      platformPayload: event,
      raw: payload
    });

    const eventId = chat_v1.id || crypto.randomUUID();

    await db.query(
      `
      INSERT INTO public.chat_outbox (event_id, payload)
      VALUES ($1, $2)
      ON CONFLICT (event_id) DO NOTHING
      `,
      [eventId, JSON.stringify({ chat_v1 })]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[twitchWebhook] handler error", err);
    return res.status(500).json({ ok: false });
  }
}

export async function twitchIngestHandler(req, res) {
  try {
    const payload = req.body;
    if (!payload || !payload.owner_user_id) {
      return res.status(400).json({ ok: false, error: "missing_owner_user_id" });
    }

    const chat_v1 = buildChatEnvelopeV1FromTwitch({
      ownerUserId: payload.owner_user_id,
      channelSlug: payload.channel_slug,
      messageId: payload.message_id,
      messageText: payload.text,
      authorUsername: payload.author_username,
      authorDisplay: payload.author_display,
      platformPayload: payload
    });

    const eventId = chat_v1.id || crypto.randomUUID();

    await db.query(
      `
      INSERT INTO public.chat_outbox (event_id, payload)
      VALUES ($1, $2)
      ON CONFLICT (event_id) DO NOTHING
      `,
      [eventId, JSON.stringify({ chat_v1 })]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[twitchIngest] error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
