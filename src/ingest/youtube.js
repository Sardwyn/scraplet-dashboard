// src/ingest/youtube.js
import crypto from "crypto";
import db from "../../db.js";
import { buildChatEnvelopeV1FromYouTube } from "./buildChatEnvelopeV1.js";

// Canonical YouTube ingest handles webhooks/API polling and enqueues to outbox
export async function youtubeWebhookHandler(req, res) {
  try {
    const payload = req.body;
    
    // Quick acknowledge for YouTube verification if needed (PubSubHubbub uses GET, but just in case)
    if (req.method === 'GET' && req.query['hub.challenge']) {
      return res.status(200).send(req.query['hub.challenge']);
    }

    if (!payload || !payload.snippet) {
      return res.json({ ok: true, ignored: true, reason: "missing_payload" });
    }

    const snippet = payload.snippet;
    const authorDetails = payload.authorDetails || {};
    
    const ownerUserId = req.query.owner_user_id || 0;

    const chat_v1 = buildChatEnvelopeV1FromYouTube({
      ownerUserId,
      channelSlug: snippet.liveChatId,
      platformChannelId: snippet.liveChatId,
      messageId: payload.id,
      messageText: snippet.displayMessage || snippet.textMessageDetails?.messageText,
      messageTs: snippet.publishedAt,
      authorUsername: authorDetails.channelId,
      authorDisplay: authorDetails.displayName,
      authorPlatformUserId: authorDetails.channelId,
      authorAvatarUrl: authorDetails.profileImageUrl,
      platformPayload: payload,
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
    console.error("[youtubeWebhook] handler error", err);
    return res.status(500).json({ ok: false });
  }
}

export async function youtubeIngestHandler(req, res) {
  try {
    const payload = req.body;
    if (!payload || !payload.owner_user_id) {
      return res.status(400).json({ ok: false, error: "missing_owner_user_id" });
    }

    const chat_v1 = buildChatEnvelopeV1FromYouTube({
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
    console.error("[youtubeIngest] error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
