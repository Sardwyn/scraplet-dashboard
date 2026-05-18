// services/youtubeChatIngest.js
// Dashboard-first YouTube live chat ingestor -> chat_messages (+ pushes to chat overlay ring buffer)
//
// - Uses external_account_tokens (platform youtube) for OAuth truth
// - Resolves liveChatId from liveBroadcasts.list (mine=true)
// - Polls liveChatMessages.list using nextPageToken + pollingIntervalMillis
// - Inserts into chat_messages with ON CONFLICT DO NOTHING (idempotent)
// - Keeps state in-memory per dashboard user (fine for now)

import db from "../db.js";
import fetch from "node-fetch";
import Redis from "ioredis";
// Legacy overlay imports removed
import { buildChatEnvelopeV1FromYouTube } from "../src/ingest/buildChatEnvelopeV1.js";
import { fanOutAfterModeration } from "../src/ingest/fanOutAfterModeration.js";

const redisClient = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

const YT_BROADCASTS_URL = "https://www.googleapis.com/youtube/v3/liveBroadcasts";
const YT_CHAT_URL = "https://www.googleapis.com/youtube/v3/liveChat/messages";

const YOUTUBE_SEND_TO_SCRAPBOT =
  String(process.env.YOUTUBE_SEND_TO_SCRAPBOT || "true").toLowerCase() === "true";
const SCRAPBOT_INGEST_URL =
  process.env.SCRAPBOT_INGEST_URL || "http://127.0.0.1:3030/api/inbound/kick";
const SCRAPBOT_SHARED_SECRET = process.env.SCRAPBOT_SHARED_SECRET || "";
const SCRAPBOT_TIMEOUT_MS = 300;

const loops = new Map(); // key: dashboardUserId -> { state, getPublicState }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveStateToRedis(userId, state) {
  const publicState = {
    running: state.running,
    startedAt: state.startedAt,
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
    lastInfo: state.lastInfo,
    liveChatId: state.liveChatId,
    broadcastId: state.broadcastId,
    broadcastTitle: state.broadcastTitle,
    channelSlug: state.channelSlug,
    pollingIntervalMillis: state.pollingIntervalMillis,
    lastInsertCount: state.lastInsertCount,
    totalInserted: state.totalInserted,
    overlayPublicId: state.overlayPublicId,
    nextPageToken: state.nextPageToken,
  };
  await redisClient.hset("yt_ingest_state", userId, JSON.stringify(publicState));
}

async function refreshYouTubeAccessToken(externalAccountId, refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET for YouTube refresh");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`YouTube refresh failed (${r.status}): ${data?.error || "unknown_error"}`);
  }

  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in || 0);

  if (!accessToken) throw new Error("YouTube refresh response missing access_token");
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : new Date(Date.now() + 3600 * 1000);

  await db.query(
    `
    UPDATE external_account_tokens
       SET access_token = $2,
           expires_at   = $3,
           updated_at   = now()
      WHERE external_account_id = $1
    `,
    [externalAccountId, accessToken, expiresAt]
  );

  return { accessToken, expiresAt };
}

async function getYouTubeAuthContextForUser(userId) {
  const r = await db.query(
    `
    SELECT
      ea.id AS external_account_id,
      ea.external_user_id AS broadcaster_user_id,
      ea.username AS broadcaster_username,
      t.access_token,
      t.refresh_token,
      t.expires_at,
      c.channel_slug
    FROM external_accounts ea
    JOIN external_account_tokens t ON t.external_account_id = ea.id
    LEFT JOIN channels c ON c.platform = 'youtube' AND c.account_id = ea.id
    WHERE ea.user_id = $1
      AND ea.platform = 'youtube'
    LIMIT 1
    `,
    [userId]
  );

  const row = r.rows[0] || null;
  if (!row?.access_token) return null;

  let accessToken = String(row.access_token);
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const refreshToken = row.refresh_token ? String(row.refresh_token) : null;
  const externalAccountId = String(row.external_account_id);

  // Proactively refresh access token if expired or expiring within 60 seconds
  if (expiresAt && (expiresAt.getTime() - Date.now() < 60 * 1000) && refreshToken) {
    try {
      console.log(`[youtubeChatIngest] Proactively refreshing YouTube token for user ${userId}...`);
      const refreshed = await refreshYouTubeAccessToken(externalAccountId, refreshToken);
      accessToken = refreshed.accessToken;
    } catch (err) {
      console.error(`[youtubeChatIngest] Proactive token refresh failed for user ${userId}:`, err?.message || err);
    }
  }

  return {
    externalAccountId,
    accessToken,
    channelSlug: row.channel_slug ? String(row.channel_slug) : "@youtube",
    broadcasterUserId: row.broadcaster_user_id
      ? String(row.broadcaster_user_id)
      : null,
    broadcasterUsername: row.broadcaster_username
      ? String(row.broadcaster_username)
      : null,
  };
}

async function ytFetchJson(url, accessToken) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function resolveLiveChatId(accessToken) {
  // NOTE: broadcastStatus and mine are incompatible; we use mine=true and filter.
  const url =
    `${YT_BROADCASTS_URL}?` +
    new URLSearchParams({
      part: "snippet,contentDetails,status",
      mine: "true",
      maxResults: "10",
    }).toString();

  const { ok, status, data } = await ytFetchJson(url, accessToken);
  if (!ok) {
    throw new Error(
      `YouTube liveBroadcasts.list failed (${status}): ${JSON.stringify(
        data?.error || data
      )}`
    );
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const live = items.find(
    (it) => it?.status?.lifeCycleStatus === "live" && it?.snippet?.liveChatId
  );

  if (!live) return null;

  return {
    broadcastId: String(live.id),
    liveChatId: String(live.snippet.liveChatId),
    broadcastChannelId: live?.snippet?.channelId
      ? String(live.snippet.channelId)
      : null,
    title: live?.snippet?.title ? String(live.snippet.title) : null,
  };
}

async function pollChatOnce({ accessToken, liveChatId, pageToken }) {
  const qs = new URLSearchParams({
    part: "snippet,authorDetails",
    liveChatId,
    maxResults: "200",
  });
  if (pageToken) qs.set("pageToken", pageToken);

  const url = `${YT_CHAT_URL}?${qs.toString()}`;
  const { ok, status, data } = await ytFetchJson(url, accessToken);

  if (!ok) {
    throw new Error(
      `YouTube liveChatMessages.list failed (${status}): ${JSON.stringify(
        data?.error || data
      )}`
    );
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const nextPageToken = data?.nextPageToken ? String(data.nextPageToken) : null;
  const pollingIntervalMillis = Number(data?.pollingIntervalMillis || 2000);

  return { items, nextPageToken, pollingIntervalMillis };
}

/**
 * Forward ChatEnvelopeV1 to Scrapbot for moderation.
 * Returns { ok: true, action: ... } on success, { ok: false } on failure.
 */
async function forwardToScrapbot(chat_v1) {
  if (!YOUTUBE_SEND_TO_SCRAPBOT) {
    return { ok: false, reason: "feature_disabled" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPBOT_TIMEOUT_MS);

    const resp = await fetch(SCRAPBOT_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SCRAPBOT_SHARED_SECRET ? { "x-scrapbot-secret": SCRAPBOT_SHARED_SECRET } : {}),
      },
      body: JSON.stringify({ chat_v1 }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("[youtubeChatIngest] Scrapbot returned non-ok", resp.status, txt.slice(0, 200));
      return { ok: false, reason: "scrapbot_error", status: resp.status };
    }

    const data = await resp.json().catch(() => ({}));
    return { ok: true, action: data?.action || "allow", scrapbotResponse: data };
  } catch (err) {
    console.error("[youtubeChatIngest] Scrapbot forward failed", err?.message || err);
    return { ok: false, reason: "scrapbot_unreachable", error: err?.message };
  }
}

/**
 * Insert messages and return the subset that were actually inserted,
 * in the lean format the overlay ring buffer expects.
 */
async function insertChatMessages({
  channelSlug,
  broadcasterUserId,
  broadcastChannelId,
  items,
  overlayPublicId,
  overlayBufferMax,
  ownerUserId,
}) {
  if (!items.length) return { inserted: 0 };

  let inserted = 0;
  let messagesPushedToOverlay = 0;
  const leanToPush = [];

  for (const m of items) {
    const id = m?.id ? String(m.id) : null;
    if (!id) continue;

    const snippet = m?.snippet || {};
    const author = m?.authorDetails || {};

    const actorUsername = author.displayName ? String(author.displayName) : null;
    const actorUserId = author.channelId
      ? String(author.channelId)
      : snippet.authorChannelId
        ? String(snippet.authorChannelId)
        : null;

    const avatarUrl = author.profileImageUrl
      ? String(author.profileImageUrl)
      : null;

    const tsRaw = snippet.publishedAt ? String(snippet.publishedAt) : null;
    const ts = tsRaw ? new Date(tsRaw) : null;
    if (!ts || Number.isNaN(ts.getTime())) continue;

    const text =
      (snippet?.textMessageDetails?.messageText &&
        String(snippet.textMessageDetails.messageText)) ||
      (snippet.displayMessage && String(snippet.displayMessage)) ||
      "";

    if (!text) continue;

    const slug = channelSlug || "@youtube";
    const payload = m;

    // Build ChatEnvelopeV1
    let chat_v1 = null;
    let scrapbotDecision = null;

    try {
      chat_v1 = buildChatEnvelopeV1FromYouTube({
        ownerUserId,
        channelSlug: slug,
        platformChannelId: broadcastChannelId,

        messageId: id,
        messageText: text,
        messageTs: ts.toISOString(),

        authorUsername: actorUsername,
        authorDisplay: actorUsername,
        authorPlatformUserId: actorUserId,
        authorAvatarUrl: avatarUrl,
        role: "viewer",
        badges: [], // YouTube badges not yet extracted

        ingest: "api",
        supervisorId: "dashboard:youtube-poller",

        platformPayload: { snippet, authorDetails: author },
        raw: m,
      });

      // Forward to Scrapbot
      scrapbotDecision = await forwardToScrapbot(chat_v1);
    } catch (err) {
      console.error("[youtubeChatIngest] ChatEnvelopeV1 build or forward failed", err);
      // fail-open: allow message through
      scrapbotDecision = { ok: false, reason: "envelope_build_failed" };
    }

    // Determine moderation status
    const moderationStatus = scrapbotDecision?.ok
      ? scrapbotDecision.action || "allow"
      : "unknown";

    const shouldFanOut =
      moderationStatus === "allow" ||
      moderationStatus === "unknown" ||
      moderationStatus === null;

    // Persist to chat_messages
    const r = await db.query(
      `
      INSERT INTO chat_messages (
        id,
        platform,
        channel_slug,
        broadcaster_user_id,
        channel_id,
        chatroom_id,
        actor_username,
        actor_user_id,
        ts,
        text,
        payload,
        ingest_source
      )
      VALUES (
        $1, 'youtube', $2, $3, $4, NULL, $5, $6, $7, $8, $9::jsonb, 'youtube_dashboard'
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [
        id,
        slug,
        broadcasterUserId,
        broadcastChannelId,
        actorUsername,
        actorUserId,
        ts.toISOString(),
        text,
        JSON.stringify(payload),
      ]
    );

    if (r.rowCount === 1) {
      inserted += 1;

      // Phase 3: Use centralized fan-out instead of batch push
      if (shouldFanOut) {
        const fanOutResult = await fanOutAfterModeration({
          chat_v1,
          decision: scrapbotDecision,
          ownerUserId,
        });

        if (fanOutResult?.pushed) {
          messagesPushedToOverlay++;
        }
      }
    }
  }



  return { inserted };
}

async function runLoop(dashboardUserId, state) {
  const userId = Number(dashboardUserId);

  let pageToken = null;
  let liveChatId = null;
  let broadcastChannelId = null;

  // Wait for live broadcast (if user not live yet)
  while (state.running) {
    const ctx = await getYouTubeAuthContextForUser(userId);
    if (!ctx) {
      state.lastError = "No YouTube token found for user (not connected)";
      state.running = false;
      return;
    }

    state.channelSlug = ctx.channelSlug;
    state.broadcasterUserId = ctx.broadcasterUserId;

    try {
      const live = await resolveLiveChatId(ctx.accessToken);
      if (live?.liveChatId) {
        liveChatId = live.liveChatId;
        broadcastChannelId =
          live.broadcastChannelId || ctx.broadcasterUserId || null;
        state.liveChatId = liveChatId;
        state.broadcastId = live.broadcastId;
        state.broadcastTitle = live.title;
        state.lastInfo = null;
        break;
      }
      state.liveChatId = null;
      state.broadcastId = null;
      state.broadcastTitle = null;
      state.lastInfo = "No live broadcast detected (waiting)";
      await saveStateToRedis(userId, state);
      await sleep(5000);
    } catch (e) {
      state.lastError = String(e?.message || e);
      state.lastInfo = "Failed to resolve live broadcast state";
      await saveStateToRedis(userId, state);
      await sleep(5000);
    }
  }

  if (!state.running) return;

  while (state.running) {
    try {
      const ctx = await getYouTubeAuthContextForUser(userId);
      if (!ctx) {
        throw new Error("No YouTube token found for user (not connected)");
      }

      const { items, nextPageToken, pollingIntervalMillis } = await pollChatOnce(
        {
          accessToken: ctx.accessToken,
          liveChatId,
          pageToken,
        }
      );

      const r = await insertChatMessages({
        channelSlug: ctx.channelSlug,
        broadcasterUserId: ctx.broadcasterUserId,
        broadcastChannelId,
        items,
        overlayPublicId: state.overlayPublicId,
        overlayBufferMax: state.overlayBufferMax || 120,
        ownerUserId: userId,
      });

      const n = r?.inserted || 0;

      state.lastPollAt = new Date().toISOString();
      state.pollingIntervalMillis = pollingIntervalMillis;
      state.nextPageToken = nextPageToken;
      state.lastInsertCount = n;
      state.totalInserted += n;
      state.lastError = null;

      pageToken = nextPageToken || pageToken;

      await saveStateToRedis(userId, state);
      await sleep(Math.max(1000, pollingIntervalMillis || 2000));
    } catch (e) {
      state.lastError = String(e?.message || e);
      state.lastPollAt = new Date().toISOString();
      await saveStateToRedis(userId, state);
      await sleep(3000);
    }
  }
}

export async function startYouTubeChatIngest(dashboardUserId) {
  const userId = Number(dashboardUserId);
  if (!Number.isFinite(userId) || userId <= 0)
    throw new Error("Invalid dashboard user id");

  const existing = loops.get(userId);
  if (existing?.state?.running) {
    return existing.getPublicState();
  }

  const savedStateStr = await redisClient.hget("yt_ingest_state", userId);
  const savedState = savedStateStr ? JSON.parse(savedStateStr) : {};

  const state = {
    running: true,
    startedAt: new Date().toISOString(),
    lastPollAt: null,
    lastError: null,
    lastInfo: null,
    liveChatId: null,
    broadcastId: null,
    broadcastTitle: null,
    channelSlug: null,
    broadcasterUserId: null,
    pollingIntervalMillis: null,
    nextPageToken: savedState.nextPageToken || null,
    lastInsertCount: 0,
    totalInserted: savedState.totalInserted || 0,

    overlayPublicId: null,
    overlayBufferMax: 120,
  };

  const getPublicState = () => ({
    running: state.running,
    startedAt: state.startedAt,
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
    lastInfo: state.lastInfo,
    liveChatId: state.liveChatId,
    broadcastId: state.broadcastId,
    broadcastTitle: state.broadcastTitle,
    channelSlug: state.channelSlug,
    pollingIntervalMillis: state.pollingIntervalMillis,
    lastInsertCount: state.lastInsertCount,
    totalInserted: state.totalInserted,

    overlayPublicId: state.overlayPublicId,
  });

  loops.set(userId, { state, getPublicState });

  runLoop(userId, state)
    .catch((e) => {
      state.lastError = String(e?.message || e);
      saveStateToRedis(userId, state).catch(console.error);
    })
    .finally(() => {
      state.running = false;
      saveStateToRedis(userId, state).catch(console.error);
    });

  await saveStateToRedis(userId, state);
  return getPublicState();
}

export async function stopYouTubeChatIngest(dashboardUserId) {
  const userId = Number(dashboardUserId);
  const loopObj = loops.get(userId);
  if (!loopObj) {
    const savedStateStr = await redisClient.hget("yt_ingest_state", userId);
    if (savedStateStr) {
      const parsed = JSON.parse(savedStateStr);
      parsed.running = false;
      await redisClient.hset("yt_ingest_state", userId, JSON.stringify(parsed));
    }
    return { running: false };
  }

  loopObj.state.running = false;
  await saveStateToRedis(userId, loopObj.state);

  return {
    running: false,
    stoppedAt: new Date().toISOString(),
    totalInserted: loopObj.state.totalInserted,
    lastError: loopObj.state.lastError,
  };
}

export async function getYouTubeChatIngestStatus(dashboardUserId) {
  const userId = Number(dashboardUserId);
  const loopObj = loops.get(userId);
  if (loopObj) return loopObj.getPublicState();
  
  const savedStateStr = await redisClient.hget("yt_ingest_state", userId);
  if (savedStateStr) {
    const parsed = JSON.parse(savedStateStr);
    parsed.running = false; // It's not running in this memory space
    return parsed;
  }
  
  return { running: false };
}
