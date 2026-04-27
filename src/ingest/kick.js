// src/ingest/kick.js
//
// CANONICAL KICK INGEST BRAIN (single source of truth)
// - normalization + persistence + side-effects for Kick-derived events
// - transport routes stay thin and delegate here
//

import db from "../../db.js";
import { updateChannelGame } from "../../services/gameContext.js";
import fetch from "node-fetch";
import crypto from "crypto";

import { maybeQueueGoLiveEmail } from "../../services/emailQueue.js";
import { enqueueAlertForUserEvent } from "../alerts/engine.js";

import { getOrCreateUserChatOverlay } from "../widgets/chat-overlay/service.js";
import { push as pushRing } from "../runtime/ringBuffer.js";
import { overlayGate } from "../../services/overlayGate.js";
import { recordStage } from "../services/pipelineHealth.js";

import { rouletteSpin } from "../domains/casino/roulette/service.js";
import { plinkoDrop } from "../domains/casino/plinko/service.js";
import { blackjackStartRound, blackjackAct } from "../domains/casino/blackjack/service.js";
import { startCrashRound, cashoutLatestCrashForUser } from "../domains/casino/crash/service.js";

import { buildChatEnvelopeV1FromKick } from "./buildChatEnvelopeV1.js";
import { fanOutAfterModeration } from "./fanOutAfterModeration.js";
import { publishOverlayIngestEvent } from "./overlayBridge.js";





const KNOWN_KICK_EVENTS = new Set([
  "chat.message.sent",
  "channel.followed",
  "channel.subscription.renewal",
  "channel.subscription.gifts",
  "channel.subscription.new",
  "channel.reward.redemption.updated",
  "livestream.status.updated",
  "livestream.metadata.updated",
  "moderation.banned",
  "kicks.gifted",
]);

const VERBOSE_KICK_WEBHOOK =
  String(process.env.VERBOSE_KICK_WEBHOOK || "").toLowerCase() === "true";

const KICK_DISCOVERY_MODE =
  String(process.env.KICK_DISCOVERY_MODE || "all").toLowerCase();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function markKickIngestActive({ ownerUserId, channelSlug, channelRowId }) {
  if (!ownerUserId || !channelSlug) return;

  // channelRowId is preferred, but we can still upsert without it.
  await db.query(
    `
    INSERT INTO bot_channel_status (
      owner_user_id,
      channel_id,
      channel_slug,
      is_enabled,
      status,
      last_success_at,
      updated_at
    )
    VALUES ($1, $2, $3, true, 'active', now(), now())
    ON CONFLICT (owner_user_id, channel_slug)
    DO UPDATE SET
      channel_id = COALESCE(EXCLUDED.channel_id, bot_channel_status.channel_id),
      is_enabled = true,
      status = 'active',
      last_success_at = now(),
      updated_at = now()
    `,
    [Number(ownerUserId), channelRowId ? Number(channelRowId) : null, String(channelSlug).toLowerCase()]
  );
}


async function narrateToScrapbot({
  scrapletUserId,
  channelSlug,
  broadcasterUserId,
  text,
  dedupeKey = null,
}) {
  const url = "http://127.0.0.1:3030/api/integrations/kick/narrate";
  const token = String(process.env.SCRAPBOT_NARRATION_TOKEN || "").trim();
  if (!text) return;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Scraplet-Secret": token } : {}),
      },
      body: JSON.stringify({
        scraplet_user_id: scrapletUserId,
        channel_slug: channelSlug,
        broadcaster_user_id: broadcasterUserId ? String(broadcasterUserId) : null,
        text: String(text).slice(0, 350),
        dedupe_key: dedupeKey,
      }),
    });

    const raw = await resp.text().catch(() => "");
    console.log("[narration] POST -> scrapbot", {
      status: resp.status,
      ok: resp.ok,
      body: raw.slice(0, 200),
    });
  } catch (err) {
    console.error("[narration] scrapbot narrate exception", err?.message || err);
  }
}

function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    let ok = true;
    for (const k of p.split(".")) {
      if (!cur || typeof cur !== "object" || !(k in cur)) {
        ok = false;
        break;
      }
      cur = cur[k];
    }
    if (ok && cur != null) return cur;
  }
  return null;
}

function parseIntSafe(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloatSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function resolveOwnerRow({ channelSlug, broadcasterUserId }) {
  let ownerRow = null;

  if (channelSlug) {
    const { rows } = await db.query(
      `
  SELECT
    u.id              AS user_id,
    c.id              AS channel_row_id,
    c.channel_slug    AS channel_slug,
    c.external_user_id,
    ea.id             AS external_account_id
  FROM channels c
  JOIN external_accounts ea ON ea.id = c.account_id
  JOIN users u             ON u.id = ea.user_id
  WHERE c.platform = 'kick'
    AND c.channel_slug = $1
  LIMIT 1
  `,
      [String(channelSlug)]
    );

    ownerRow = rows[0] || null;
  }

  if (!ownerRow && broadcasterUserId) {
    const { rows } = await db.query(
      `
  SELECT
    u.id              AS user_id,
    c.id              AS channel_row_id,
    c.channel_slug    AS channel_slug,
    c.external_user_id,
    ea.id             AS external_account_id
  FROM channels c
  JOIN external_accounts ea ON ea.id = c.account_id
  JOIN users u             ON u.id = ea.user_id
  WHERE c.platform = 'kick'
    AND c.external_user_id = $1
  LIMIT 1
  `,
      [String(broadcasterUserId)]
    );

    ownerRow = rows[0] || null;
  }

  return ownerRow;
}

async function recordKickEventDiscovery({
  eventType,
  eventVersion,
  scrapletUserId,
  broadcasterUserId,
  channelSlug,
  payload,
}) {
  if (!scrapletUserId) return;

  await db.query(
    `
    INSERT INTO kick_event_discovery (
      event_type,
      event_version,
      scraplet_user_id,
      broadcaster_user_id,
      channel_slug,
      payload,
      seen_count,
      first_seen_at,
      last_seen_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 1, now(), now())
    ON CONFLICT (event_type, scraplet_user_id)
    DO UPDATE SET
      event_version = EXCLUDED.event_version,
      broadcaster_user_id = EXCLUDED.broadcaster_user_id,
      channel_slug = EXCLUDED.channel_slug,
      payload = EXCLUDED.payload,
      last_seen_at = now(),
      seen_count = kick_event_discovery.seen_count + 1
    `,
    [
      String(eventType || ""),
      parseIntSafe(eventVersion, 1),
      scrapletUserId,
      broadcasterUserId ? String(broadcasterUserId) : null,
      channelSlug ? String(channelSlug) : null,
      payload ?? {},
    ]
  );
}

async function maybeInsertIntoEvents({
  eventId,
  eventType,
  tsIso,
  channelSlug,
  broadcasterUserId,
  actorUsername,
  payload,
  userId,
}) {
  const ALLOW = new Set([
    "channel.followed",
    "channel.subscription.new",
    "channel.subscription.renewal",
    "channel.subscription.gifts",
    "kicks.gifted",
    "livestream.status.updated",
    "livestream.metadata.updated",
    "chat.message.sent",
  ]);

  if (!ALLOW.has(eventType)) return;

  const id =
    String(eventId || "").trim() ||
    `kickwh_${Date.now()}_${Math.random().toString(16).slice(2)}_${eventType}`.slice(0, 120);

  let sessionId = null;
  if (channelSlug) {
    try {
      const { rows } = await db.query(
        `SELECT session_id FROM stream_sessions WHERE platform=$1 AND channel_slug=$2 AND ended_at IS NULL LIMIT 1`,
        ["kick", channelSlug]
      );
      sessionId = rows[0]?.session_id || null;
    } catch (err) {
      console.error("[maybeInsertIntoEvents] session lookup failed", err);
    }
  }

  await db.query(
    `
    INSERT INTO events (
      id, v, source, kind, ts,
      channel_slug, chatroom_id, channel_id,
      actor_id, actor_username,
      payload, user_id, session_id
    )
    VALUES (
      $1, 1, 'kick', $2, $3,
      $4, NULL, $5,
      NULL, $6,
      $7::jsonb, $8, $9
    )
    ON CONFLICT (id) DO NOTHING
    `,
    [
      id,
      eventType,
      tsIso,
      channelSlug ? String(channelSlug) : null,
      broadcasterUserId ? String(broadcasterUserId) : null,
      actorUsername ? String(actorUsername).slice(0, 80) : null,
      JSON.stringify(payload ?? {}),
      userId,
      sessionId,
    ]
  );
}

async function insertChatMessage({
  platform = "kick",
  messageId,
  tsIso,
  channelSlug,
  broadcasterUserId,
  channelId = null,
  chatroomId = null,
  actorUsername = null,
  actorUserId = null,
  text,
  payload,
  ingestSource = "kick_webhook",
}) {
  if (!channelSlug) return;
  if (!text) return;

  const id =
    String(messageId || "").trim() ||
    `kickchat_${Date.now()}_${Math.random().toString(16).slice(2)}`.slice(0, 120);

  await db.query(
    `
    INSERT INTO chat_messages (
      id, platform, channel_slug,
      broadcaster_user_id, channel_id, chatroom_id,
      actor_username, actor_user_id,
      ts, text,
      payload, ingest_source
    )
    VALUES (
      $1, $2, $3,
      $4, $5, $6,
      $7, $8,
      $9, $10,
      $11::jsonb, $12
    )
    ON CONFLICT (id) DO NOTHING
    `,
    [
      id,
      String(platform || "kick"),
      String(channelSlug),
      broadcasterUserId ? String(broadcasterUserId) : null,
      channelId ? String(channelId) : null,
      chatroomId ? String(chatroomId) : null,
      actorUsername ? String(actorUsername).slice(0, 80) : null,
      actorUserId ? String(actorUserId) : null,
      tsIso,
      String(text).slice(0, 2000),
      JSON.stringify(payload ?? {}),
      String(ingestSource || "unknown"),
    ]
  );
}

function mapWebhookTypeToAlertType(eventType) {
  if (eventType === "channel.followed") return "follow";
  if (eventType === "channel.subscription.new") return "subscription";
  if (eventType === "channel.subscription.renewal") return "subscription";
  if (eventType === "channel.subscription.gifts") return "gifted_subscription";
  if (eventType === "kicks.gifted") return "tip";
  return null;
}

function buildAlertEventFromWebhook({ eventType, payload, eventId, tsIso, channelSlug }) {
  const alertType = mapWebhookTypeToAlertType(eventType);
  if (!alertType) return null;

  const actorUsername =
    pick(payload, [
      "user.username",
      "user.slug",
      "follower.username",
      "follower.slug",
      "sender.username",
      "sender.slug",
      "gifter.username",
      "gifter.slug",
      "redeemer.username",
      "redeemer.slug",
    ]) || null;

  const actorDisplay = actorUsername ? String(actorUsername) : "Someone";

  const giftCount = pick(payload, ["gifts", "gift_count", "count", "quantity"]) ?? null;
  const amountRaw = pick(payload, ["amount", "kicks", "value", "total", "gift_amount"]) ?? null;

  const amountValue = toFloatSafe(amountRaw);
  const messageText = pick(payload, ["message.text", "text"]) || null;

  return {
    v: 1,
    id:
      String(eventId || "").trim() ||
      `kickwh_${Date.now()}_${Math.random().toString(16).slice(2)}`.slice(0, 120),
    ts: tsIso,
    platform: "kick",
    type: alertType,
    actor: {
      display: actorDisplay,
      username: actorUsername ? String(actorUsername) : null,
      id: null,
      avatar_url: pick(payload, ["user.avatar_url", "avatar_url", "follower.avatar_url"]) || null,
    },
    message: {
      text: messageText ? String(messageText).slice(0, 240) : null,
    },
    amount: amountValue !== null ? { value: amountValue, currency: "KICKS" } : undefined,
    count: giftCount !== null && giftCount !== undefined ? parseIntSafe(giftCount, 0) : undefined,
    meta: {
      kick_event_type: eventType,
      channel_slug: channelSlug || null,
    },
  };
}

function parseBjActionFromChat(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const clean = t.replace(/^[!/]/, "");
  if (clean === "hit" || clean === "h") return "HIT";
  if (clean === "stand" || clean === "s") return "STAND";
  if (clean === "double" || clean === "d") return "DOUBLE";
  return null;
}

function pickPlayerKey({ senderUserId, senderUsername }) {
  const id = senderUserId ? String(senderUserId) : "";
  if (id) return `kick:${id}`;
  const u = String(senderUsername || "").trim();
  if (u) return `kicku:${u.toLowerCase()}`;
  return null;
}

async function pushChatToOverlay({ ownerUserId, msg }) {
  const w = await getOrCreateUserChatOverlay(ownerUserId);
  if (!w || !w.is_enabled) return;

  const max = parseIntSafe(w?.config_json?.maxMessages, 120) || 120;

  const lean = {
    id: msg.id || null,
    ts: msg.ts || new Date().toISOString(),
    user: msg.user || { name: "unknown", avatar: null },
    badges: Array.isArray(msg.badges) ? msg.badges.slice(0, 6) : [],
    text: String(msg.text || "").slice(0, 400),
  };

  if (!lean.text) return;
  await pushRing(w.public_id, lean, max);

  // NOTE: overlayGate publish is handled by fanOutAfterModeration (chat-outbox-worker)
  // Do NOT publish here — that causes double delivery to the overlay SSE stream.
}

function verifySignature(req) {
  const secret = process.env.SCRAPLET_SHARED_SECRET;
  const sig = req.get("X-Scraplet-Signature");
  if (!secret || !sig || !req.rawBody) return false;

  const expectedHex = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");

  const headerHex = String(sig).trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(headerHex) || headerHex.length !== expectedHex.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(headerHex, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Handlers called by routes/kickWebhook.js
// ─────────────────────────────────────────────────────────────

export async function kickWebhookHandler(req, res) {
  try {
    const eventType = req.get("Kick-Event-Type") || req.get("kick-event-type") || null;
    const eventVersion = req.get("Kick-Event-Version") || req.get("kick-event-version") || null;
    const subscriptionId = req.get("Kick-Subscription-Id") || req.get("kick-subscription-id") || null;

    const eventId =
      req.get("Kick-Event-Id") ||
      req.get("kick-event-id") ||
      req.get("Kick-Event-UUID") ||
      req.get("kick-event-uuid") ||
      null;

    const data = req.body || {};
    const tsIso = new Date().toISOString();

    console.log(
      "[kickWebhook] incoming event",
      "type=",
      eventType,
      "version=",
      eventVersion,
      "subId=",
      subscriptionId
    );

    if (VERBOSE_KICK_WEBHOOK) {
      console.log("[kickWebhook] payload:", JSON.stringify(data, null, 2));
    }

    const broadcasterUserId =
      pick(data, ["broadcaster_user_id", "broadcaster.user_id", "broadcasterUserId"]) || null;

    const channelSlug =
      pick(data, ["channel_slug", "channel.slug", "broadcaster.channel_slug", "broadcaster.channelSlug"]) || null;

    const ownerRow = await resolveOwnerRow({ channelSlug, broadcasterUserId });

    if (!ownerRow) {
      console.warn("[kickWebhook] DROPPED - no dashboard user mapped for event", {
        eventType,
        broadcasterUserId,
        channelSlug,
      });
      return res.json({ ok: true, ignored: "unmapped" });
    }

    const shouldDiscover =
      KICK_DISCOVERY_MODE === "all" ||
      (KICK_DISCOVERY_MODE === "unknown" && eventType && !KNOWN_KICK_EVENTS.has(eventType));

    if (shouldDiscover && eventType) {
      await recordKickEventDiscovery({
        eventType,
        eventVersion,
        scrapletUserId: ownerRow.user_id,
        broadcasterUserId: broadcasterUserId || ownerRow.external_user_id || null,
        channelSlug: ownerRow.channel_slug || channelSlug || null,
        payload: data,
      });

      if (!KNOWN_KICK_EVENTS.has(eventType)) {
        console.warn("[kickWebhook] 🧠 NEW / UNHANDLED KICK EVENT", eventType);
      }
    }

    // Alerts
    if (eventType) {
      const alertEvent = buildAlertEventFromWebhook({
        eventType,
        payload: data,
        eventId: eventId || null,
        tsIso,
        channelSlug: ownerRow.channel_slug || channelSlug || null,
      });

      if (alertEvent) {
        const actorUsername = alertEvent.actor?.username || alertEvent.actor?.display || null;

        try {
          await maybeInsertIntoEvents({
            eventId: alertEvent.id,
            eventType,
            tsIso,
            channelSlug: ownerRow.channel_slug || channelSlug || null,
            broadcasterUserId: broadcasterUserId || ownerRow.external_user_id || null,
            actorUsername,
            payload: data,
            userId: ownerRow.user_id,
          });
        } catch (err) {
          console.error("[kickWebhook] events insert failed (non-fatal)", err?.message || err);
        }

        try {
          const result = await enqueueAlertForUserEvent(ownerRow.user_id, alertEvent);
          if (!result.ok) {
            console.log("[kickWebhook][alerts] not enqueued", {
              reason: result.reason,
              eventType,
              alertType: alertEvent.type,
              user_id: ownerRow.user_id,
            });
          } else {
            console.log("[kickWebhook][alerts] enqueued", {
              queue_id: result.enqueued?.id,
              rule_id: result.rule_id,
              eventType,
              alertType: alertEvent.type,
              user_id: ownerRow.user_id,
            });
          }
        } catch (err) {
          console.error("[kickWebhook][alerts] enqueue failed (non-fatal)", err?.message || err);
        }

        // Bridge to OverlayGate (Phase 12)
        try {
          await publishOverlayIngestEvent(ownerRow.user_id, alertEvent, { platform: "kick" });
        } catch (err) {
          console.error("[kickWebhook] overlay bridge failed", err);
        }
      }
    }

    // Go-live
    if (eventType === "livestream.status.updated") {
      const status = String(pick(data, ["status"]) || "").toLowerCase().trim();

      const isLiveFlag =
        pick(data, ["is_live", "isLive", "livestream.is_live"]) === true ||
        status === "live" ||
        status === "online";

      console.log("[kickWebhook] livestream.status.updated", {
        broadcasterUserId,
        channelSlug,
        status,
        is_live: isLiveFlag,
      });

      const actualChannelSlug = ownerRow.channel_slug || channelSlug;

      if (isLiveFlag) {
        try {
          await db.query(
            `
            INSERT INTO stream_sessions (platform, channel_slug, external_stream_id, started_at, status)
            SELECT $1, $2, $3, $4, 'live'
            WHERE NOT EXISTS (SELECT 1 FROM stream_sessions WHERE platform = $1 AND channel_slug = $2 AND ended_at IS NULL)
            `,
            ["kick", actualChannelSlug, null, tsIso]
          );
          console.log("[kickWebhook] stream session marked LIVE", { channelSlug: actualChannelSlug });
        } catch (err) {
          console.error("[kickWebhook] DB stream session go-live failed", err);
        }

        try {
          await maybeQueueGoLiveEmail(ownerRow.user_id, {
            platform: "kick",
            channel_slug: actualChannelSlug,
            broadcaster_user_id: broadcasterUserId || ownerRow.external_user_id || null,
            raw: data, // FIXED: was k (undefined), use data
          });

          console.log("[kickWebhook] queued go_live email", { user_id: ownerRow.user_id });
        } catch (err) {
          console.error("[kickWebhook] go_live email queue failed", err);
        }
      } else {
        try {
          await db.query(
            `
            UPDATE stream_sessions
            SET ended_at = now(), status = 'ended', updated_at = now()
            WHERE platform = $1 AND channel_slug = $2 AND ended_at IS NULL
            `,
            ["kick", actualChannelSlug]
          );
          console.log("[kickWebhook] stream session marked ENDED", { channelSlug: actualChannelSlug });

          // Fire stream debrief (non-blocking)
          try {
            const { rows: endedSession } = await db.query(
              `SELECT session_id FROM stream_sessions WHERE channel_slug = $1 AND status = 'ended' ORDER BY ended_at DESC LIMIT 1`,
              [actualChannelSlug]
            );
            if (endedSession[0]?.session_id) {
              const { computeSessionStats } = await import('../../services/sessionStats.js');
              await computeSessionStats(endedSession[0].session_id).catch(e => console.error('[kick] session stats error:', e.message));
              const { sendStreamDebrief } = await import('../../services/streamDebrief.js');
              sendStreamDebrief(endedSession[0].session_id, actualChannelSlug).catch(e => console.error('[kick] debrief error:', e.message));
              // Generate content pack (non-blocking)
              import('../../src/contentRepurposing/index.js').then(({ generateContentPack, deliverContentPack: _ }) =>
                import('../../src/contentRepurposing/delivery.js').then(({ deliverContentPack }) =>
                  generateContentPack(endedSession[0].session_id).then(pack => {
                    if (pack) deliverContentPack(pack.packId, pack.input.userId).catch(e => console.error('[kick] content pack delivery error:', e.message));
                  })
                )
              ).catch(e => console.error('[kick] content pack error:', e.message));
            }
          } catch (e) {
            console.error('[kick] post-session hooks error:', e.message);
          }
        } catch (err) {
          console.error("[kickWebhook] DB stream session go-offline failed", err);
        }
      }

      return res.json({ ok: true });
    }

    // Reward redemptions → casino actions
    if (eventType === "channel.reward.redemption.updated") {
      const redeemerUserId =
        pick(data, ["redeemer.user_id", "redeemer.id", "redeemerUserId"]) || null;
      const redeemerUsername =
        pick(data, ["redeemer.username", "redeemer.channel_slug"]) || null;

      const betAmountRaw =
        pick(data, ["reward.cost", "reward.price", "rewardCost", "cost", "amount"]) ?? null;

      let betAmount = parseIntSafe(betAmountRaw, 0);
      if (betAmount < 1) betAmount = 0;

      const rewardTitle = pick(data, ["reward.title"]) || null;
      const redemptionId = pick(data, ["id", "redemption_id"]) || null;

      const statusRaw = pick(data, ["status"]) || null;
      const status = String(statusRaw || "").trim().toLowerCase();

      console.log("[kickWebhook] reward redemption", {
        channelSlug: ownerRow.channel_slug || channelSlug || null,
        redeemerUserId,
        redeemerUsername,
        betAmount,
        rewardId: pick(data, ["reward.id"]) || null,
        rewardTitle,
        status,
        redemptionId,
      });

      // Kick often only emits "pending" on redemption.updated in our current subscription flow.
      // We accept pending as the trigger, but dedupe by redemption id to prevent double-start.
      const isAcceptableStatus =
        status === "pending" ||
        status === "fulfilled" ||
        status === "completed" ||
        status === "approved" ||
        status === "redeemed";

      if (!isAcceptableStatus) {
        return res.json({ ok: true, ignored: `reward-status-not-accepted:${status || "unknown"}` });
      }

      const title = String(rewardTitle || "").trim();
      const isBlackjackReward = /\bblackjack\b/i.test(title) || /\bbj\b/i.test(title);
      const isPlinkoReward = /\bplinko\b/i.test(title);
      const isRouletteReward = /\broulette\b/i.test(title) || /\broul\b/i.test(title);
      const isCrashReward = /\bcrash\b/i.test(title) || /\brocket\b/i.test(title);

      if (!isBlackjackReward && !isPlinkoReward && !isRouletteReward && !isCrashReward) {
        return res.json({ ok: true, ignored: "not-supported-reward" });
      }

      if (!betAmount) return res.json({ ok: true, ignored: "no-bet" });

      const playerKey = pickPlayerKey({
        senderUserId: redeemerUserId,
        senderUsername: redeemerUsername,
      });
      if (!playerKey) return res.json({ ok: true, ignored: "no-player" });

      const meta = {
        source: "kick_reward",
        platform: "kick",
        channelSlug: ownerRow.channel_slug || channelSlug || null,
        broadcasterUserId: broadcasterUserId || ownerRow.external_user_id || null,
        reward: pick(data, ["reward"]) || null,
        reward_id: pick(data, ["reward.id"]) || null,
        redemption_id: redemptionId,
        status,
        user_input: pick(data, ["user_input"]) || null,
      };

      async function alreadyProcessedCrashRedemption(redemption_id) {
        if (!redemption_id) return false;
        try {
          const r = await db.query(
            `
            SELECT id
              FROM casino_rounds
             WHERE game_key = 'crash'
               AND (meta_json->>'redemption_id') = $1
             LIMIT 1
            `,
            [String(redemption_id)]
          );
          return r.rows.length > 0;
        } catch (e) {
          console.warn("[kickWebhook][crash] dedupe check failed (non-fatal)", e?.message || e);
          return false;
        }
      }

      // Crash
      if (isCrashReward) {
        try {
          if (await alreadyProcessedCrashRedemption(redemptionId)) {
            return res.json({ ok: true, ignored: "crash-duplicate-redemption" });
          }

          const r = await startCrashRound({
            platform: "kick",
            channel_id: String(meta.broadcasterUserId || "").trim() || null,
            username: redeemerUsername || String(redeemerUserId || "unknown"),
            chip_wager: betAmount,
            meta_json: {
              ...meta,
              playerKey,
              redeemerUserId,
              redeemerUsername,
            },
          });

          console.log("[kickWebhook] crash round started", {
            user_id: ownerRow.user_id,
            channel_slug: meta.channelSlug,
            username: redeemerUsername,
            playerKey,
            betAmount,
            roundId: r?.id || null,
            crashMultiplier: r?.crash_multiplier || null,
          });

          await narrateToScrapbot({
            scrapletUserId: ownerRow.user_id,
            channelSlug: meta.channelSlug,
            broadcasterUserId: meta.broadcasterUserId,
            text: `🚀 ${redeemerUsername || "Player"} launched Crash (${betAmount}).`,
            dedupeKey: `crash:start:${r?.id || "x"}:${playerKey}`,
          });
        } catch (err) {
          console.error("[kickWebhook] crash start failed", err);
        }

        return res.json({ ok: true });
      }

      // Plinko
      if (isPlinkoReward) {
        try {
          const r = await plinkoDrop({
            ownerUserId: ownerRow.user_id,
            playerKey,
            playerName: redeemerUsername || null,
            betAmount,
            currency: "channel_points",
            meta,
          });

          console.log("[kickWebhook] plinko domain result", r);

          if (!r.ok) {
            console.warn("[kickWebhook] plinko enqueue failed", {
              user_id: ownerRow.user_id,
              widget_public_id: r.widgetPublicId || null,
              playerKey,
              betAmount,
              error: r.error,
            });
            return res.json({ ok: true, ignored: r.error || "plinko_failed" });
          }

          await narrateToScrapbot({
            scrapletUserId: ownerRow.user_id,
            channelSlug: meta.channelSlug,
            broadcasterUserId: meta.broadcasterUserId,
            text: `🎯 ${redeemerUsername || "Player"} dropped a Plinko ball (${betAmount}).`,
            dedupeKey: `plinko:start:${r.widgetPublicId || "x"}:${playerKey}:${r.roundId || "x"}`,
          });
        } catch (err) {
          console.error("[kickWebhook] plinko enqueue failed", err);
        }

        return res.json({ ok: true });
      }

      // Roulette
      if (isRouletteReward) {
        try {
          const r = await rouletteSpin({
            ownerUserId: ownerRow.user_id,
            playerKey,
            playerName: redeemerUsername || null,
            betAmount,
            currency: "channel_points",
            betType: "straight",
            meta,
          });

          console.log("[kickWebhook] roulette domain result", r);

          if (!r.ok) {
            console.warn("[kickWebhook] roulette enqueue failed", {
              user_id: ownerRow.user_id,
              widget_public_id: r.widgetPublicId || null,
              playerKey,
              betAmount,
              error: r.error,
            });
            return res.json({ ok: true, ignored: r.error || "roulette_failed" });
          }

          await narrateToScrapbot({
            scrapletUserId: ownerRow.user_id,
            channelSlug: meta.channelSlug,
            broadcasterUserId: meta.broadcasterUserId,
            text: `🎡 ${redeemerUsername || "Player"} spun Roulette (${betAmount}).`,
            dedupeKey: `roulette:start:${r.widgetPublicId || "x"}:${playerKey}:${r.roundId || "x"}`,
          });
        } catch (err) {
          console.error("[kickWebhook] roulette enqueue failed", err);
        }

        return res.json({ ok: true });
      }

      // Blackjack
      if (isBlackjackReward) {
        try {
          const r = await blackjackStartRound({
            ownerUserId: ownerRow.user_id,
            playerKey,
            playerName: redeemerUsername || null,
            betAmount,
            currency: "channel_points",
            meta,
          });

          console.log("[kickWebhook] blackjack domain result", r);

          if (!r.ok) {
            console.warn("[kickWebhook] blackjack start failed", {
              user_id: ownerRow.user_id,
              widget_public_id: r.widgetPublicId || null,
              playerKey,
              betAmount,
              error: r.error,
            });
            return res.json({ ok: true, ignored: r.error || "blackjack_failed" });
          }

          await narrateToScrapbot({
            scrapletUserId: ownerRow.user_id,
            channelSlug: meta.channelSlug,
            broadcasterUserId: meta.broadcasterUserId,
            text: `🃏 ${redeemerUsername || "Player"} started Blackjack (${betAmount}).`,
            dedupeKey: `blackjack:start:${r.widgetPublicId || "x"}:${playerKey}:${r.roundId || "x"}`,
          });
        } catch (err) {
          console.error("[kickWebhook] blackjack start failed", err);
        }

        return res.json({ ok: true });
      }

      return res.json({ ok: true });
    }

    // ── Role derivation from Kick sender.identity.badges ──
    function deriveRoleFromBadges(badges, senderUserId, broadcasterUserId) {
      if (senderUserId && broadcasterUserId &&
        String(senderUserId) === String(broadcasterUserId)) {
        return "broadcaster";
      }
      if (!Array.isArray(badges) || badges.length === 0) return "viewer";
      for (const b of badges) {
        const t = String(b?.type || b || "").toLowerCase();
        if (t === "broadcaster") return "broadcaster";
        if (t === "moderator" || t === "mod") return "mod";
      }
      return "viewer";
    }

    // Chat
    if (eventType === "chat.message.sent") {
      const chain1Id = (req.get("Kick-Event-Id") || req.get("kick-event-id") || Math.random().toString(36).slice(2));
      console.log('[CHAIN-1] chat.message.sent received', chain1Id);
      recordStage('messages', 1, chain1Id);
      // Kick webhook payload may be wrapped as { data: {...} }
      // Normalize once, then read authoritative Kick fields from `k`.
      const k =
        data && typeof data === "object" && data.data && typeof data.data === "object"
          ? data.data
          : data;

      // Authoritative Kick fields
      const messageIdRaw = k?.message_id != null ? String(k.message_id).trim() : null;
      const replyToMessageIdRaw =
        k?.replies_to?.message_id != null ? String(k.replies_to.message_id).trim() : null;

      const messageText = k?.content != null ? String(k.content) : "";
      const msgTs = k?.created_at != null ? String(k.created_at) : tsIso;

      const senderUsername = k?.sender?.username != null ? String(k.sender.username) : null;
      const senderUserId = k?.sender?.user_id != null ? String(k.sender.user_id).trim() : null;

      const senderAvatar =
        k?.sender?.profile_picture != null ? String(k.sender.profile_picture) : null;

      const senderBadges = Array.isArray(k?.sender?.identity?.badges)
        ? k.sender.identity.badges
        : [];

      const channelSlugExact =
        (k?.broadcaster?.channel_slug != null ? String(k.broadcaster.channel_slug).trim() : null) ||
        ownerRow.channel_slug ||
        channelSlug ||
        null;

      const broadcasterUserIdExact =
        (k?.broadcaster?.user_id != null ? String(k.broadcaster.user_id).trim() : null) ||
        (broadcasterUserId != null ? String(broadcasterUserId).trim() : null) ||
        (ownerRow.external_user_id != null ? String(ownerRow.external_user_id).trim() : null) ||
        null;

      const derivedRole = deriveRoleFromBadges(senderBadges, senderUserId, broadcasterUserIdExact);

      console.log("[kickWebhook] role derivation", {
        channelSlug: channelSlugExact,
        senderUserId,
        senderUsername,
        senderBadges,
        derivedRole,
      });

      // Handshake: first valid chat webhook == ingest is active for this channel
      try {
        await markKickIngestActive({
          ownerUserId: ownerRow.user_id,
          channelSlug: channelSlugExact,
          channelRowId: ownerRow.channel_row_id || null,
        });
      } catch (err) {
        console.warn("[kickWebhook][handshake] bot_channel_status update failed (non-fatal)", err?.message || err);
      }


      // Phase 3: Overlay push moved after Scrapbot moderation (see below)
      // Direct push removed to gate through fanOutAfterModeration()

      // Persist chat into chat_messages
      try {
        // Use real Kick message_id as primary id; fall back to webhook event id if missing.
        const stableChatId =
          (messageIdRaw && String(messageIdRaw).trim()) ||
          (eventId && String(eventId).trim()) ||
          null;

        await insertChatMessage({
          platform: "kick",
          messageId: stableChatId,
          tsIso: msgTs || tsIso,
          channelSlug: channelSlugExact,
          broadcasterUserId: broadcasterUserIdExact,
          channelId: null,
          chatroomId: null,
          actorUsername: senderUsername,
          actorUserId: senderUserId,
          text: messageText,
          payload: {
            type: "chat.message.sent",
            message_id: messageIdRaw,
            replies_to_message_id: replyToMessageIdRaw,
            sender: k?.sender || null,
            broadcaster: k?.broadcaster || null,
            emotes: k?.emotes || null,
            raw: VERBOSE_KICK_WEBHOOK ? data : undefined, // store original wrapper for debugging
          },
          ingestSource: "kick_webhook",
        });
      } catch (err) {
        console.error(
          "[kickWebhook][chat] chat_messages insert failed (non-fatal)",
          err?.message || err
        );
      }

      // Crash cashout from chat
      try {
        const text = String(messageText || "").trim();

        const isCashout =
          /^!cashout\b/i.test(text) ||
          /^!crashout\b/i.test(text) ||
          /^!rocketout\b/i.test(text);

        if (isCashout && senderUsername) {
          const playerKey = pickPlayerKey({ senderUserId, senderUsername });

          const r = await cashoutLatestCrashForUser({
            platform: "kick",
            channel_id: String(broadcasterUserIdExact || "").trim() || null,
            player_key: playerKey || null,
            username: senderUsername,
          });

          console.log("[kickWebhook][crash] cashout attempt", {
            username: senderUsername,
            playerKey,
            channelId: String(broadcasterUserIdExact || "").trim() || null,
            ok: r?.ok,
            code: r?.code || null,
            roundId: r?.round?.id || null,
            cashoutAt: r?.round?.cashout_at_multiplier || null,
            payout: r?.round?.payout_chips || null,
          });

          if (r?.ok && r.round) {
            await narrateToScrapbot({
              scrapletUserId: ownerRow.user_id,
              channelSlug: channelSlugExact,
              broadcasterUserId: broadcasterUserIdExact,
              text: `💰 ${senderUsername} cashed out at ${r.round.cashout_at_multiplier}x (${r.round.payout_chips}).`,
              dedupeKey: `crash:cashout:${r.round.id}`,
            });
          }
        }
      } catch (err) {
        console.error("[kickWebhook][crash] cashout handling failed", err);
      }

      // Blackjack actions from chat
      try {
        const action = parseBjActionFromChat(messageText);

        if (action) {
          const playerKey = pickPlayerKey({ senderUserId, senderUsername });

          console.log("[kickWebhook][blackjack] action parsed", {
            messageText,
            action,
            playerKey,
            ownerUserId: ownerRow.user_id,
          });

          if (playerKey) {
            const r = await blackjackAct({
              ownerUserId: ownerRow.user_id,
              playerKey,
              playerName: senderUsername || null,
              action,
            });

            console.log("[kickWebhook][blackjack] action result", r);

            if (r.ok && r.narration?.text) {
              await narrateToScrapbot({
                scrapletUserId: ownerRow.user_id,
                channelSlug: channelSlugExact,
                broadcasterUserId: broadcasterUserIdExact,
                text: r.narration.text,
                dedupeKey: r.narration.dedupeKey || null,
              });
            }
          }
        }
      } catch (err) {
        console.error("[kickWebhook] blackjack action failed", err);
      }

      // Forward chat to Scrapbot (legacy envelope + chat_v1)
      const scrapbotUrl =
        process.env.SCRAPBOT_INGEST_URL || "http://127.0.0.1:3030/api/inbound/kick";

      // Phase 2: Rollback flag for dual payload (default: false = send only chat_v1)
      const KICK_SEND_LEGACY_TO_SCRAPBOT =
        String(process.env.KICK_SEND_LEGACY_TO_SCRAPBOT || "false").toLowerCase() === "true";

      let chat_v1 = null;
      try {
        chat_v1 = buildChatEnvelopeV1FromKick({
          ownerUserId: ownerRow.user_id,
          channelSlug: channelSlugExact,
          platformChannelId: broadcasterUserIdExact,

          // ✅ real Kick message id
          messageId: messageIdRaw || null,

          // ✅ reply context (if present)
          replyToMessageId: replyToMessageIdRaw || null,

          messageText,
          authorUsername: senderUsername || null,
          authorDisplay: senderUsername || null,
          authorPlatformUserId: senderUserId || null,
          role: derivedRole,
          badges: senderBadges,

          ingest: "api",
          supervisorId: "dashboard:kick-forwarder",

          platformPayload: {
            subscription_id: subscriptionId || null,
            event_version: eventVersion || null,
            emotes: k?.emotes || null,
          },

          raw: k, // inner Kick message for authoritative ids
        });
      } catch (e) {
        console.warn(
          "[kickWebhook] chat_v1 build failed (continuing forward):",
          e?.message || e
        );
      }

      // Phase 2: Send only chat_v1 by default (legacy envelope optional via flag)
      let payload;
      if (KICK_SEND_LEGACY_TO_SCRAPBOT) {
        // Rollback mode: include legacy envelope + chat_v1
        const envelope = {
          platform: "kick",
          type: "chat.message.sent",
          scraplet_user_id: ownerRow.user_id,
          broadcaster_user_id: broadcasterUserIdExact,
          channel_slug: channelSlugExact,
          message: {
            message_id: messageIdRaw || null,
            reply_to_message_id: replyToMessageIdRaw || null,
            text: messageText,
            sender_username: senderUsername,
            raw: k,
          },
          meta: {
            subscription_id: subscriptionId || null,
            event_version: eventVersion || null,
            raw_wrapper: VERBOSE_KICK_WEBHOOK ? data : undefined,
          },
          chat_v1,
        };
        payload = envelope;
        console.log("[kickWebhook] Forwarding to Scrapbot with LEGACY + chat_v1 (rollback mode)");
      } else {
        // Canonical mode: send only chat_v1
        payload = { chat_v1 };
        if (VERBOSE_KICK_WEBHOOK) {
          console.log("[kickWebhook] Forwarding to Scrapbot with chat_v1 only (canonical)");
        }
      }

      // Phase 3: Capture Scrapbot moderation decision - REPLACED BY PHASE 4 OUTBOX
      let scrapbotDecision = null;

      // Phase 4: Reliable Delivery via Outbox
      try {
        // Ensure event_id exists (Kick message_id or random UUID)
        const eventId = chat_v1.event_id || crypto.randomUUID();
        chat_v1.event_id = eventId; // Ensure it's in the payload

        // Enqueue to Outbox (public schema)
        await db.query(`
          INSERT INTO public.chat_outbox (event_id, payload)
          VALUES ($1, $2)
          ON CONFLICT (event_id) DO NOTHING
        `, [eventId, { chat_v1 }]);
        console.log('[CHAIN-2] Inserted into chat_outbox', eventId);
        recordStage('messages', 2, eventId);
        console.log('[CHAIN-2] Inserted into chat_outbox', eventId);
        recordStage('messages', 2, eventId);

        console.log("[CHAIN-2] Inserted into chat_outbox", eventId, "text:", chat_v1?.message?.text?.slice(0,30));

      } catch (err) {
        console.error("[kickWebhook] error enqueuing to Outbox", err);
      }

      // Phase 3: Fan-out is handled by chat-outbox-worker after moderation
      // Do NOT fan-out here to avoid double delivery
      return res.json({ ok: true });
    }

    // TELEMETRY FORWARDER (v2.0 Room Intel)
    // For non-chat events that carry room state (viewers, follows, subs) we forward them
    // to Scrapbot so the Pulse Graph can interpolate the data points.
    if (eventType === "livestream.metadata.updated" || eventType.startsWith("channel.subscription") || eventType === "channel.followed") {
      try {
        const telemetryPayload = {
          platform: "kick",
          eventType,
          scraplet_user_id: ownerRow.user_id,
          channelSlug: ownerRow.channel_slug || channelSlug,
          broadcasterUserId: broadcasterUserId || ownerRow.external_user_id || null,
          payload: data
        };

        // Extract viewers from livestream.metadata.updated
        if (eventType === "livestream.metadata.updated" && data.livestream) {
          if (data.livestream.viewer_count !== undefined) {
            telemetryPayload.viewers = data.livestream.viewer_count;
          }
        }

        // Capture game/category from metadata.updated
        if (eventType === "livestream.metadata.updated") {
          updateChannelGame(
            ownerRow.channel_slug || channelSlug,
            data
          ).catch(e => console.warn("[kick] gameContext update failed:", e.message));
        }

        // Forward to Scrapbot's inboundKick endpoint
        const scrapbotUrl = process.env.SCRAPBOT_INGEST_URL || "http://127.0.0.1:3030/api/inbound/kick";
        const token = String(process.env.SCRAPBOT_SHARED_SECRET || "").trim();

        fetch(scrapbotUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-Scrapbot-Secret": token } : {})
          },
          body: JSON.stringify(telemetryPayload)
        }).catch(e => console.warn("[kickWebhook] telemetry forward failed", e?.message));

      } catch (err) {
        console.error("[kickWebhook] telemetry build failed", err);
      }
    }

    // Default response for non-handled events (we log/record above)
    return res.json({ ok: true });
  } catch (err) {
    console.error("[kickWebhook] handler error", err?.message || err);
    return res.status(500).json({ ok: false, error: "kick_webhook_failed" });
  }
}



export async function kickIngestHandler(req, res) {
  try {
    if (!verifySignature(req)) {
      return res.status(401).json({ ok: false, error: "invalid signature" });
    }

    const incoming = req.body || {};

    // Accept BOTH:
    //  A) Canonical envelope (platform/type/channel/actor/payload)
    //  B) Legacy Kick event shape (channel/actor/data)
    const isCanonicalEnvelope =
      incoming &&
      typeof incoming === "object" &&
      (incoming.platform || incoming.type) &&
      incoming.channel &&
      incoming.payload;

    const looksLikeLegacyKickEvent =
      incoming && (incoming.channel || incoming.actor || incoming.data);

    let row;

    if (isCanonicalEnvelope) {
      row = {
        id: incoming.id,
        v: incoming.v ?? 1,
        source: incoming.platform || "kick",
        kind: incoming.type || incoming.kind,
        ts: incoming.ts || new Date().toISOString(),
        channel_slug: incoming.channel?.slug ?? null,
        chatroom_id: incoming.channel?.chatroom_id ?? null,
        channel_id: incoming.channel?.channel_id ?? null,
        actor_id: incoming.actor?.id ?? null,
        actor_username: incoming.actor?.username ?? null,
        payload: incoming.payload || {},
      };
    } else if (looksLikeLegacyKickEvent) {
      const channel = incoming.channel || {};
      const actor = incoming.actor || {};
      const data = incoming.data || {};

      row = {
        id: incoming.id,
        v: incoming.v ?? 1,
        source: incoming.source || "kick",
        kind: incoming.kind,
        ts: incoming.ts || new Date().toISOString(),
        channel_slug: channel.slug ?? data.channel_slug ?? incoming.channel_slug ?? null,
        chatroom_id: channel.chatroom_id ?? data.chatroom_id ?? incoming.chatroom_id ?? null,
        channel_id: data.channel_id ?? incoming.channel_id ?? null,
        actor_id: actor.id ?? incoming.actor_id ?? null,
        actor_username: actor.username ?? incoming.actor_username ?? null,
        payload: data || incoming.payload || {},
      };
    } else {
      // Last resort: already-row-shaped
      row = incoming;
    }

    if (!row?.id || !row?.payload || !row?.kind) {
      return res.status(400).json({ ok: false, error: "bad payload" });
    }

    // This endpoint is Kick ingest for now; enforce slug lookup
    const { rows: chanRows } = await db.query(
      `select ea.user_id
         from channels c
         join external_accounts ea on ea.id = c.account_id
        where c.platform = 'kick' and c.channel_slug = $1
        limit 1`,
      [row.channel_slug]
    );
    const userId = chanRows[0]?.user_id || null;

    let sessionId = null;
    if (row.channel_slug) {
      try {
        const { rows: sRows } = await db.query(
          `SELECT session_id FROM stream_sessions WHERE platform=$1 AND channel_slug=$2 AND ended_at IS NULL LIMIT 1`,
          ["kick", row.channel_slug]
        );
        sessionId = sRows[0]?.session_id || null;
      } catch (e) { }
    }

    await db.query(
      `insert into events (
          id, v, source, kind, ts,
          channel_slug, chatroom_id, channel_id,
          actor_id, actor_username,
          payload, user_id, session_id
        )
        values (
          $1,$2,$3,$4,$5,
          $6,$7,$8,
          $9,$10,
          $11::jsonb,$12,$13
        )
        on conflict (id) do update
          set v = excluded.v,
              source = excluded.source,
              kind = excluded.kind,
              ts = excluded.ts,
              channel_slug = excluded.channel_slug,
              chatroom_id = excluded.chatroom_id,
              channel_id = excluded.channel_id,
              actor_id = excluded.actor_id,
              actor_username = excluded.actor_username,
              payload = excluded.payload,
              user_id = excluded.user_id,
              session_id = excluded.session_id`,
      [
        row.id,
        row.v,
        row.source,
        row.kind,
        row.ts,
        row.channel_slug,
        row.chatroom_id,
        row.channel_id,
        row.actor_id,
        row.actor_username,
        JSON.stringify(row.payload),
        userId,
        sessionId,
      ]
    );

    // Optional: publish into eventbus for that user (good for overlays)
    const bus = global.studioEventBus;
    if (bus && typeof bus.publish === "function" && userId) {
      bus.publish(userId, { ...incoming, resolved_user_id: userId });
    }

    console.log(
      `[kick-ingest] ${row.kind} ${row.channel_slug} ${row.actor_username || "-"} → user_id ${userId || "null"}`
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[kick-ingest] error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
