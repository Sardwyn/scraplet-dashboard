// src/ingest/buildChatEnvelopeV1.js

import * as contracts from "../contracts/chatEnvelopeV1.js";

const normalizeChatEnvelopeV1 = contracts.normalizeChatEnvelopeV1;

const _PLATFORM = contracts.PLATFORM || { KICK: "kick", TIKTOK: "tiktok" };
const _INGEST = contracts.INGEST || { API: "api", PUSHER: "pusher", CONNECTOR: "connector" };
const _ROLE = contracts.ROLE || { VIEWER: "viewer" };

function isoNow() {
  return new Date().toISOString();
}

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function cleanSlug(v) {
  const s = str(v);
  if (!s) return null;
  return s.replace(/^@+/, "").toLowerCase();
}

function cleanUsername(v) {
  const s = str(v);
  if (!s) return null;
  return s.replace(/^@+/, "").toLowerCase();
}

function safeRole(v) {
  const r = String(v || "").trim().toLowerCase();
  const allowed = new Set(Object.values(_ROLE));
  return allowed.has(r) ? r : _ROLE.VIEWER;
}

function safeIngest(v) {
  const i = String(v || "").trim().toLowerCase();
  const allowed = new Set(Object.values(_INGEST));
  return allowed.has(i) ? i : _INGEST.API;
}

/**
 * Kick → ChatEnvelopeV1
 */
export function buildChatEnvelopeV1FromKick({
  ownerUserId,
  channelSlug,
  platformChannelId = null,

  messageId = null,
  messageText,

  authorUsername = null,
  authorDisplay = null,
  authorPlatformUserId = null,
  role = "viewer",
  badges = null,

  ingest = "api",
  supervisorId = "dashboard:kick-forwarder",

  platformPayload = null,
  raw = null,
} = {}) {
  // ... (existing implementation) ...
  if (typeof normalizeChatEnvelopeV1 !== "function") {
    throw new Error("normalizeChatEnvelopeV1 missing from contracts/chatEnvelopeV1.js");
  }

  const env = {
    v: 1,
    id: str(messageId) || undefined,
    ts: isoNow(),

    platform: _PLATFORM.KICK || "kick",
    scraplet_user_id: Number(ownerUserId),

    channel: {
      slug: cleanSlug(channelSlug) || undefined,
      platform_channel_id: str(platformChannelId) || undefined,
    },

    author: {
      display: str(authorDisplay || authorUsername) || "Unknown",
      username: cleanUsername(authorUsername) || undefined,
      platform_user_id: str(authorPlatformUserId) || undefined,
      role: safeRole(role),
      badges: Array.isArray(badges) ? badges.map((b) => String(b)) : undefined,
    },

    message: {
      text: String(messageText ?? ""),
      emotes: (platformPayload && Array.isArray(platformPayload.emotes)) ? platformPayload.emotes : undefined,
    },

    source: {
      ingest: safeIngest(ingest),
      supervisor_id: str(supervisorId) || "dashboard:kick-forwarder",
      received_ts: isoNow(),
    },

    platform_payload:
      platformPayload && typeof platformPayload === "object" ? platformPayload : undefined,

    raw: raw && typeof raw === "object" ? raw : undefined,
  };

  return normalizeChatEnvelopeV1(env, {
    ingest: env.source.ingest,
    supervisor_id: env.source.supervisor_id,
  });
}

/**
 * YouTube → ChatEnvelopeV1
 */
export function buildChatEnvelopeV1FromYouTube({
  ownerUserId,
  channelSlug,
  platformChannelId = null,

  messageId = null,
  messageText,
  messageTs = null,

  authorUsername = null,
  authorDisplay = null,
  authorPlatformUserId = null,
  authorAvatarUrl = null,
  role = "viewer",
  badges = null,

  ingest = "api",
  supervisorId = "dashboard:youtube-poller",

  platformPayload = null,
  raw = null,
} = {}) {
  // ... (existing implementation) ...
  if (typeof normalizeChatEnvelopeV1 !== "function") {
    throw new Error("normalizeChatEnvelopeV1 missing from contracts/chatEnvelopeV1.js");
  }

  const env = {
    v: 1,
    id: str(messageId) || undefined,
    ts: messageTs || isoNow(),

    platform: "youtube",
    scraplet_user_id: Number(ownerUserId),

    channel: {
      slug: cleanSlug(channelSlug) || undefined,
      platform_channel_id: str(platformChannelId) || undefined,
    },

    author: {
      display: str(authorDisplay || authorUsername) || "Unknown",
      username: cleanUsername(authorUsername) || undefined,
      platform_user_id: str(authorPlatformUserId) || undefined,
      avatar_url: str(authorAvatarUrl) || undefined,
      role: safeRole(role),
      badges: Array.isArray(badges) ? badges.map((b) => String(b)) : undefined,
    },

    message: {
      text: String(messageText ?? ""),
    },

    source: {
      ingest: safeIngest(ingest),
      supervisor_id: str(supervisorId) || "dashboard:youtube-poller",
      received_ts: isoNow(),
    },

    platform_payload:
      platformPayload && typeof platformPayload === "object" ? platformPayload : undefined,

    raw: raw && typeof raw === "object" ? raw : undefined,
  };

  return normalizeChatEnvelopeV1(env, {
    ingest: env.source.ingest,
    supervisor_id: env.source.supervisor_id,
  });
}

/**
 * TikTok → ChatEnvelopeV1
 */
export function buildChatEnvelopeV1FromTikTok({
  ownerUserId,
  type, // 'chat', 'gift', etc.
  data, // raw payload from tiktok-live-connector
  supervisorId = "dashboard:tiktok-connector"
} = {}) {

  if (typeof normalizeChatEnvelopeV1 !== "function") {
    throw new Error("normalizeChatEnvelopeV1 missing from contracts/chatEnvelopeV1.js");
  }

  let eventType = 'chat.message.sent';
  let text = '';

  // Mapping logic
  if (type === 'chat') {
    text = data.comment || '';
  } else if (type === 'gift') {
    eventType = 'chat.gift.sent';
    const giftName = data.giftName || 'Gift';
    const count = data.repeatCount || 1;
    text = `Sent ${giftName} x${count}`;
  } else if (type === 'like') {
    eventType = 'chat.like.sent';
    text = `Liked the stream x${data.likeCount || 1}`;
  } else if (type === 'share') {
    eventType = 'chat.share.sent';
    text = 'Shared the stream';
  } else if (type === 'follow') {
    eventType = 'chat.follow.joined';
    text = 'Followed';
  } else if (type === 'roomUser') {
    eventType = 'livestream.metadata.updated'; // Matches Kick semantic for roomIntel listener
    text = 'Viewer count updated';
  }

  const env = {
    v: 1,
    id: str(data.msgId) || undefined, // TikTok provides msgId
    ts: data.createTime ? new Date(Number(data.createTime)).toISOString() : isoNow(),

    // TELEMETRY (RoomIntel 2.0)
    viewers: data.viewerCount !== undefined ? data.viewerCount : undefined,
    eventType: eventType, // Pass explicitly for router

    platform: 'tiktok',
    scraplet_user_id: Number(ownerUserId),

    channel: {
      slug: cleanUsername(data.uniqueId) || undefined,
    },

    author: {
      display: str(data.nickname) || "Unknown",
      username: cleanUsername(data.uniqueId) || undefined,
      platform_user_id: str(data.userId) || undefined,
      avatar_url: str(data.profilePictureUrl) || undefined,
      role: safeRole('viewer'), // TODO: Map moderator/subscriber if available
    },

    message: {
      text: String(text),
    },

    source: {
      ingest: 'connector',
      supervisor_id: supervisorId,
      received_ts: isoNow(),
    },

    platform_payload: data,
    raw: data
  };

  return normalizeChatEnvelopeV1(env, {
    ingest: env.source.ingest,
    supervisor_id: env.source.supervisor_id
  });
}
