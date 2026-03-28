// /routes/dashboardScrapbot.js
import express from "express";
import crypto from "crypto";

import db from "../db.js"; // creator_platform
import scrapbotDb from "../scrapbotDb.js"; // scrapbot_clean
import { ensureKickScrapbotAccountForUser } from "../scripts/scrapbotAccounts.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/auth/login");
  return next();
}

/**
 * Internal key gate for Scrapbot->Dashboard calls.
 * If DASHBOARD_INTERNAL_KEY is set, requests must send:
 *   x-scraplet-internal-key: <DASHBOARD_INTERNAL_KEY>
 */
function requireInternalKey(req, res) {
  const expected = (process.env.DASHBOARD_INTERNAL_KEY || "").trim();
  if (!expected) return true;

  const got = (req.get("x-scraplet-internal-key") || "").trim();
  if (got !== expected) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

function randomKey(bytes = 18) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function safeJson(obj) {
  return obj && typeof obj === "object" ? obj : {};
}

function get(obj, path, fallback) {
  try {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      cur = cur?.[p];
      if (cur === undefined || cur === null) return fallback;
    }
    return cur;
  } catch {
    return fallback;
  }
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const x = Math.floor(v);
  return Math.max(min, Math.min(max, x));
}

function clampFloat(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

async function getActiveDiscordIntegrationForUser(dbClient, ownerUserId) {
  const { rows } = await dbClient.query(
    `
    SELECT guild_id, status
    FROM public.discord_guild_integrations
    WHERE owner_user_id = $1
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [ownerUserId]
  );
  return rows[0] || null;
}


const ROLE_OPTIONS = ["everyone", "subscriber", "moderator", "broadcaster"];

const DEFAULT_TTS_SETTINGS = {
  command: "!tts",
  voice_preset: "uk_male",
  min_role_kick: "everyone",
  max_chars: 144,
  cooldown_user_ms: 30_000,
  cooldown_channel_ms: 7_000,
  template: "${sender} says ${text}",
  volume: 1.0,
  sanitize: {
    strip_links: true,
    strip_numbers: false,
    strip_symbols: false,
    strip_emojis: true,
    collapse_repeats: true,
  },
};

function normalizeTtsSettings(flagsJson) {
  const flags = safeJson(flagsJson);
  const tts = safeJson(flags.tts);

  const sanitize = safeJson(tts.sanitize);

  const out = {
    command: String(tts.command || DEFAULT_TTS_SETTINGS.command).trim() || DEFAULT_TTS_SETTINGS.command,
    voice_preset: String(tts.voice_preset || DEFAULT_TTS_SETTINGS.voice_preset),
    min_role_kick: ROLE_OPTIONS.includes(String(tts.min_role_kick)) ? String(tts.min_role_kick) : DEFAULT_TTS_SETTINGS.min_role_kick,
    max_chars: clampInt(tts.max_chars, 20, 500, DEFAULT_TTS_SETTINGS.max_chars),
    cooldown_user_ms: clampInt(tts.cooldown_user_ms, 0, 300_000, DEFAULT_TTS_SETTINGS.cooldown_user_ms),
    cooldown_channel_ms: clampInt(tts.cooldown_channel_ms, 0, 300_000, DEFAULT_TTS_SETTINGS.cooldown_channel_ms),
    template: String(tts.template || DEFAULT_TTS_SETTINGS.template),
    volume: clampFloat(tts.volume, 0, 1, DEFAULT_TTS_SETTINGS.volume),
    sanitize: {
      strip_links: sanitize.strip_links === undefined ? DEFAULT_TTS_SETTINGS.sanitize.strip_links : !!sanitize.strip_links,
      strip_numbers: sanitize.strip_numbers === undefined ? DEFAULT_TTS_SETTINGS.sanitize.strip_numbers : !!sanitize.strip_numbers,
      strip_symbols: sanitize.strip_symbols === undefined ? DEFAULT_TTS_SETTINGS.sanitize.strip_symbols : !!sanitize.strip_symbols,
      strip_emojis: sanitize.strip_emojis === undefined ? DEFAULT_TTS_SETTINGS.sanitize.strip_emojis : !!sanitize.strip_emojis,
      collapse_repeats: sanitize.collapse_repeats === undefined ? DEFAULT_TTS_SETTINGS.sanitize.collapse_repeats : !!sanitize.collapse_repeats,
    },
  };

  // Guard: command must start with !
  if (!out.command.startsWith("!")) out.command = DEFAULT_TTS_SETTINGS.command;

  return out;
}

async function getOrCreateCreatorFeatures(scrapletUserId) {
  await db.query(
    `
    INSERT INTO creator_features (scraplet_user_id)
    VALUES ($1)
    ON CONFLICT (scraplet_user_id) DO NOTHING
    `,
    [scrapletUserId]
  );

  const out = await db.query(
    `
    SELECT scraplet_user_id, free_tts_enabled, tts_overlay_key, flags_json, updated_at
    FROM creator_features
    WHERE scraplet_user_id = $1
    `,
    [scrapletUserId]
  );

  return out.rows[0] || null;
}

async function ensureOverlayKey(scrapletUserId) {
  const { rows } = await db.query(
    `
    UPDATE creator_features
    SET tts_overlay_key = COALESCE(tts_overlay_key, $2),
        updated_at = now()
    WHERE scraplet_user_id = $1
    RETURNING tts_overlay_key
    `,
    [scrapletUserId, randomKey()]
  );

  if (rows?.length) return rows[0]?.tts_overlay_key || null;

  await getOrCreateCreatorFeatures(scrapletUserId);
  const r2 = await db.query(
    `
    UPDATE creator_features
    SET tts_overlay_key = COALESCE(tts_overlay_key, $2),
        updated_at = now()
    WHERE scraplet_user_id = $1
    RETURNING tts_overlay_key
    `,
    [scrapletUserId, randomKey()]
  );
  return r2.rows[0]?.tts_overlay_key || null;
}

async function rotateOverlayKey(scrapletUserId) {
  const { rows } = await db.query(
    `
    UPDATE creator_features
    SET tts_overlay_key = $2,
        updated_at = now()
    WHERE scraplet_user_id = $1
    RETURNING tts_overlay_key
    `,
    [scrapletUserId, randomKey()]
  );
  return rows[0]?.tts_overlay_key || null;
}

async function setFreeTTSEnabled(scrapletUserId, enabled) {
  await db.query(
    `
    INSERT INTO creator_features (scraplet_user_id, free_tts_enabled, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (scraplet_user_id)
    DO UPDATE SET free_tts_enabled = EXCLUDED.free_tts_enabled, updated_at = now()
    `,
    [scrapletUserId, !!enabled]
  );

  if (enabled) await ensureOverlayKey(scrapletUserId);
}

async function setFreeTTSChatConfirmations(scrapletUserId, enabled) {
  await db.query(
    `
    INSERT INTO creator_features (scraplet_user_id, flags_json, updated_at)
    VALUES (
      $1,
      jsonb_set('{}'::jsonb, '{free_tts_chat_confirmations}', to_jsonb($2::boolean), true),
      now()
    )
    ON CONFLICT (scraplet_user_id)
    DO UPDATE SET
      flags_json = jsonb_set(
        COALESCE(creator_features.flags_json, '{}'::jsonb),
        '{free_tts_chat_confirmations}',
        to_jsonb($2::boolean),
        true
      ),
      updated_at = now()
    `,
    [scrapletUserId, !!enabled]
  );
}

async function setTtsSettings(scrapletUserId, partialTts) {
  // Merge partial onto existing flags_json.tts
  const row = await getOrCreateCreatorFeatures(scrapletUserId);
  const flags = safeJson(row?.flags_json);
  const existingTts = safeJson(flags.tts);

  const merged = {
    ...existingTts,
    ...safeJson(partialTts),
    sanitize: {
      ...safeJson(existingTts.sanitize),
      ...safeJson(partialTts?.sanitize),
    },
  };

  // Normalize final stored settings (keeps it sane)
  const normalized = normalizeTtsSettings({ tts: merged });

  await db.query(
    `
    UPDATE creator_features
    SET flags_json = jsonb_set(
      COALESCE(flags_json, '{}'::jsonb),
      '{tts}',
      $2::jsonb,
      true
    ),
    updated_at = now()
    WHERE scraplet_user_id = $1
    `,
    [scrapletUserId, JSON.stringify(normalized)]
  );
}

async function listBlacklist({ scrapletUserId, platform, channelSlug }) {
  const { rows } = await db.query(
    `
    SELECT id, username, created_at
    FROM tts_blacklist
    WHERE scraplet_user_id = $1
      AND platform = $2
      AND channel_slug = $3
    ORDER BY created_at DESC
    LIMIT 200
    `,
    [scrapletUserId, platform, channelSlug]
  );
  return rows;
}

async function addBlacklist({ scrapletUserId, platform, channelSlug, username }) {
  await db.query(
    `
    INSERT INTO tts_blacklist (scraplet_user_id, platform, channel_slug, username)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (scraplet_user_id, platform, channel_slug, username) DO NOTHING
    `,
    [scrapletUserId, platform, channelSlug, username]
  );
}

async function removeBlacklist({ scrapletUserId, id }) {
  await db.query(
    `
    DELETE FROM tts_blacklist
    WHERE id = $1 AND scraplet_user_id = $2
    `,
    [id, scrapletUserId]
  );
}

// Helper: fetch Scrapbot status (used by /dashboard/scrapbot page)
async function fetchScrapbotStatus() {
  const base = process.env.SCRAPBOT_BASE_URL || "http://127.0.0.1:3030";
  const url = `${base.replace(/\/+$/, "")}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      return {
        online: false,
        checked_at: new Date().toISOString(),
        error: `HTTP_${resp.status}`
      };
    }

    const json = await resp.json();

    return {
      online: json?.ok === true,
      checked_at: json?.time || new Date().toISOString(),
      error: null
    };

  } catch (err) {
    return {
      online: false,
      checked_at: new Date().toISOString(),
      error: "unreachable"
    };
  }
}

// Helper: fetch filtered moderation reviews
async function fetchModerationReviews(channelSlug) {
  if (!channelSlug) return [];
  const base = process.env.SCRAPBOT_BASE_URL || "http://127.0.0.1:3030";
  const url = `${base}/api/metrics/audit?limit=10&channelSlug=${encodeURIComponent(channelSlug)}`;

  try {
    const secret = process.env.SCRAPBOT_SHARED_SECRET;
    const resp = await fetch(url, {
      headers: { "x-scrapbot-secret": secret }
    });
    if (!resp.ok) return [];
    const j = await resp.json();
    return j.items || [];
  } catch (err) {
    return [];
  }
}

async function fetchScrapbotMetrics() {
  const base = process.env.SCRAPBOT_BASE_URL || "http://127.0.0.1:3030";
  const url = `${base}/api/metrics`;
  try {
    const secret = process.env.SCRAPBOT_SHARED_SECRET;
    const resp = await fetch(url, {
      headers: { "x-scrapbot-secret": secret }
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    return null;
  }
}

// Tell Scrapbot to reload commands for this account
async function triggerReloadCommands(accountId) {
  if (!accountId) return;

  const base = process.env.SCRAPBOT_BASE_URL || "http://127.0.0.1:3030";
  const required = process.env.SCRAPBOT_REQUIRED === "1";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const resp = await fetch(`${base}/api/internal/reload-commands`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.SCRAPBOT_SHARED_SECRET,
      },
      body: JSON.stringify({ account_id: accountId }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok && required) {
      console.error("[dashboardScrapbot] Failed to trigger reload-commands: HTTP", resp.status);
    }
  } catch (err) {
    if (required) {
      console.error("[dashboardScrapbot] Failed to trigger reload-commands (unreachable)");
    }
  }
}

// Seed default commands if none exist
async function ensureDefaultCommandsForAccount(scrapbotAccount) {
  if (!scrapbotAccount) return;

  const { rows: existing } = await scrapbotDb.query(
    `SELECT 1 FROM scrapbot_commands WHERE account_id = $1 LIMIT 1`,
    [scrapbotAccount.id]
  );
  if (existing.length) return;

  const defaults = [
    {
      name: "help",
      trigger_pattern: "!help",
      text: "Hey, I am Scrapbot. Configure my commands from your Scraplet Dashboard → Scrapbot.",
    },
    {
      name: "scrapbot",
      trigger_pattern: "!scrapbot",
      text: "Scrapbot is powered by the Scraplet Stream Helper Platform. Manage me at https://scraplet.store/",
    },
    {
      name: "socials",
      trigger_pattern: "!socials",
      text: "Scrapbot is powered by the Scraplet Stream Helper Platform. Check my profile at https://scraplet.store/",
    },
  ];

  for (const def of defaults) {
    await scrapbotDb.query(
      `
      INSERT INTO scrapbot_commands (
        account_id, name, trigger_pattern,
        trigger_type, response_type, response_payload,
        role, cooldown_seconds, enabled
      )
      VALUES ($1,$2,$3,'prefix','text',$4,'everyone',0,true)
      ON CONFLICT (account_id, trigger_pattern) DO NOTHING
      `,
      [scrapbotAccount.id, def.name, def.trigger_pattern, JSON.stringify({ text: def.text })]
    );
  }

  await triggerReloadCommands(scrapbotAccount.id);
}

/**
 * INTERNAL API used by Scrapbot runtime.
 *
 * GET /dashboard/api/internal/features/free-tts?userId=4&platform=kick&channel=scraplet
 *
 * Returns:
 * {
 *   ok, enabled, chatConfirmations,
 *   tts: { ...settings... },
 *   blacklist: ["name1","name2",...]
 * }
 */
router.get("/dashboard/api/internal/features/free-tts", async (req, res) => {
  if (!requireInternalKey(req, res)) return;

  const userId = Number(req.query.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ ok: false, error: "userId required" });
  }

  const platform = String(req.query.platform || "kick").toLowerCase();
  const channelSlug = String(req.query.channel || "").toLowerCase().trim();

  try {
    const row = await getOrCreateCreatorFeatures(userId);
    const enabled = row?.free_tts_enabled === true;
    const chatConfirmations = get(row?.flags_json, "free_tts_chat_confirmations", false) === true;

    const tts = normalizeTtsSettings(row?.flags_json);

    let blacklist = [];
    if (channelSlug) {
      const rows = await listBlacklist({
        scrapletUserId: userId,
        platform,
        channelSlug,
      });
      blacklist = rows.map((r) => String(r.username || "").toLowerCase()).filter(Boolean);
    }

    return res.json({ ok: true, enabled, chatConfirmations, tts, blacklist });
  } catch (err) {
    console.error("[creator_features] get free-tts failed", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/**
 * INTERNAL POST endpoint (Scrapbot uses this for !tts on/off)
 * POST /dashboard/api/internal/features/free-tts  { userId, enabled }
 * (We keep confirmations/settings UI-only for now, but endpoint can evolve.)
 */
router.post(
  "/dashboard/api/internal/features/free-tts",
  express.json({ limit: "8kb" }),
  async (req, res) => {
    if (!requireInternalKey(req, res)) return;

    const userId = Number(req.body?.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: "userId required" });
    }

    const enabledProvided = typeof req.body?.enabled === "boolean";

    try {
      if (enabledProvided) {
        await setFreeTTSEnabled(userId, req.body.enabled === true);
      }

      const row = await getOrCreateCreatorFeatures(userId);
      const enabled = row?.free_tts_enabled === true;
      const chatConfirmations = get(row?.flags_json, "free_tts_chat_confirmations", false) === true;
      const tts = normalizeTtsSettings(row?.flags_json);

      return res.json({ ok: true, enabled, chatConfirmations, tts });
    } catch (err) {
      console.error("[creator_features] set free-tts failed", err?.message || err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  }
);

// Main Scrapbot page
router.get("/dashboard/scrapbot", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;

    // Derive channelSlug (Kick only)
    const { rows: extAcc } = await db.query(
      `
      SELECT c.channel_slug
      FROM public.channels c
      JOIN public.external_accounts a ON a.id = c.account_id
      WHERE a.user_id = $1
        AND a.platform = 'kick'
        AND a.enabled = true
        AND c.platform = 'kick'
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
      LIMIT 1
      `,
      [sessionUser.id]
    );

    const channelSlug = extAcc[0]?.channel_slug || null;

    const discordIntegration = await getActiveDiscordIntegrationForUser(db, sessionUser.id);
    const discordConnected = !!discordIntegration?.guild_id;

    // Collect connected platforms (OAuth platforms require tokens, TikTok just requires a row)
    const { rows: allExtAcc } = await db.query(
      `
      SELECT DISTINCT ea.platform
      FROM public.external_accounts ea
      LEFT JOIN public.external_account_tokens eat ON eat.external_account_id = ea.id
      WHERE ea.user_id = $1
        AND (
          (ea.platform IN ('kick', 'youtube', 'twitch') AND eat.external_account_id IS NOT NULL)
          OR (ea.platform = 'tiktok')
        )
      `,
      [sessionUser.id]
    );

    const connectedPlatforms = {
      kick: false,
      twitch: false,
      youtube: false,
      tiktok: false,
      discord: discordConnected,
    };

    for (const acc of allExtAcc) {
      if (acc.platform === "kick") connectedPlatforms.kick = true;
      if (acc.platform === "twitch") connectedPlatforms.twitch = true;
      if (acc.platform === "youtube") connectedPlatforms.youtube = true;
      if (acc.platform === "tiktok") connectedPlatforms.tiktok = true;
    }

    const scrapbotStatus = {
      online: false,
      ingest_ok: false,
      checked_at: new Date().toISOString(),
      mod_checked_at: null,
      last_event_at: null,
      unique_users_short: 0,
      moderation_mode: "-",
      moderation_note: "Review and adjust settings in Moderation.",
      channel_slug: channelSlug,
      platform: channelSlug ? "kick" : null,
      error: null,
      moderation_recent_count: 0
    };

    let moderationReviews = [];

    // =========================
    // PRIMARY TRUTH = /health endpoint
    // =========================
    const httpStatus = await fetchScrapbotStatus();

    scrapbotStatus.online = httpStatus.online;
    scrapbotStatus.checked_at = httpStatus.checked_at;
    scrapbotStatus.error = httpStatus.error;

    // =========================
    // OPTIONAL: kick_events = ingest health only
    // =========================
    if (channelSlug) {

      const { rows: evRows } = await db.query(
        `
    SELECT created_at
    FROM public.kick_events
    WHERE channel_slug = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
        [channelSlug]
      );

      const lastEventAt = evRows[0]?.created_at || null;
      scrapbotStatus.last_event_at = lastEventAt;

      const ageMs = lastEventAt
        ? (Date.now() - new Date(lastEventAt).getTime())
        : Infinity;

      // Only ingest health now
      scrapbotStatus.ingest_ok = ageMs < 300000;

      // Unique users (optional)
      const { rows: uniqRows } = await db.query(
        `
    SELECT COUNT(DISTINCT
      COALESCE(
        payload->>'senderUserId',
        payload->>'sender_user_id',
        payload#>>'{chat_v1,senderUserId}',
        payload#>>'{sender,id}'
      )
    ) AS unique_users_15m
    FROM public.kick_events
    WHERE channel_slug = $1
      AND created_at > now() - interval '15 minutes'
    `,
        [channelSlug]
      );

      scrapbotStatus.unique_users_short =
        Number(uniqRows[0]?.unique_users_15m || 0);

      // Moderation events still valid
      try {
        let currentSession = null;
        if (channelSlug) {
          const { rows } = await db.query(
            `SELECT session_id, started_at, ended_at, status 
         FROM stream_sessions 
         WHERE platform = 'kick' AND channel_slug = $1 
         ORDER BY started_at DESC LIMIT 1`,
            [channelSlug]
          );
          currentSession = rows[0] || null;
        }

        scrapbotStatus.current_session = currentSession;

        let sessionFilter = `channel_slug = $1`;
        let sessionParams = [channelSlug];
        if (currentSession?.session_id) {
          sessionFilter = `channel_slug = $1 AND session_id = $2`;
          sessionParams = [channelSlug, currentSession.session_id];
        }

        const { rows: modCheckRows } = await scrapbotDb.query(
          `
      SELECT MAX(created_at) AS last_mod_at
      FROM public.scrapbot_moderation_events
      WHERE ${sessionFilter}
      `,
          sessionParams
        );

        scrapbotStatus.mod_checked_at = modCheckRows[0]?.last_mod_at || null;

        const { rows: modReviewRows } = await scrapbotDb.query(
          `
      SELECT
        created_at as ts,
        action,
        rule_value as reason,
        sender_username as "senderUsername",
        message_text as "text_preview"
      FROM public.scrapbot_moderation_events
      WHERE ${sessionFilter}
      ORDER BY created_at DESC
      LIMIT 50
      `,
          sessionParams
        );

        moderationReviews = modReviewRows.map(r => ({
          ts: r.ts,
          moderation: {
            action: r.action,
            reason: r.reason
          },
          senderUsername: r.senderUsername,
          text_preview: r.text_preview
        }));

        const { rows: modCountRows } = await scrapbotDb.query(
          `
      SELECT COUNT(*) AS recent_count
      FROM public.scrapbot_moderation_events
      WHERE ${sessionFilter}
      `,
          sessionParams
        );

        scrapbotStatus.moderation_recent_count = Number(modCountRows[0]?.recent_count || 0);

      } catch (err) {
        console.error("[dashboardScrapbot] moderation fetch failed:", err.message);
      }
    }

    console.log(
      "[dashboardScrapbot]",
      "user=", sessionUser.id,
      "channel=", channelSlug,
      "online=", scrapbotStatus.online,
      "lastEvent=", scrapbotStatus.last_event_at
    );

    const scrapbotAccount =
      await ensureKickScrapbotAccountForUser(sessionUser.id);

    return res.render("dashboard-scrapbot", {
      user: sessionUser,
      scrapbotStatus,
      scrapbotAccount,
      discordConnected,
      connectedPlatforms,
      moderationReviews,
    });

  } catch (err) {
    return next(err);
  }
});

// GET Commands UI
router.get("/dashboard/scrapbot/commands", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const scrapbotAccount = await ensureKickScrapbotAccountForUser(sessionUser.id);

    let commands = [];

    if (scrapbotAccount) {
      await ensureDefaultCommandsForAccount(scrapbotAccount);

      const { rows } = await scrapbotDb.query(
        `
        SELECT
          id, name, trigger_pattern, trigger_type,
          response_type, response_payload, role,
          cooldown_seconds, enabled
        FROM scrapbot_commands
        WHERE account_id = $1
        ORDER BY name ASC
        `,
        [scrapbotAccount.id]
      );

      commands = rows.map((row) => ({
        id: row.id,
        name: row.name,
        triggerType: row.trigger_type,
        triggerPattern: row.trigger_pattern,
        responseType: row.response_type,
        role: row.role || "everyone",
        cooldownSeconds: row.cooldown_seconds || 0,
        enabled: !!row.enabled,
      }));
    }

    const viewAccount = scrapbotAccount
      ? {
        ...scrapbotAccount,
        channel_name:
          scrapbotAccount.channel_name ||
          scrapbotAccount.channel_slug ||
          scrapbotAccount.channel ||
          scrapbotAccount.channel_handle ||
          null,
      }
      : null;

    const features = await getOrCreateCreatorFeatures(sessionUser.id);
    const freeTTSEnabled = features?.free_tts_enabled === true;
    const freeTTSChatConfirmations = get(features?.flags_json, "free_tts_chat_confirmations", false) === true;

    const ttsSettings = normalizeTtsSettings(features?.flags_json);

    let ttsOverlayKey = features?.tts_overlay_key || null;
    if (freeTTSEnabled && !ttsOverlayKey) {
      ttsOverlayKey = await ensureOverlayKey(sessionUser.id);
    }

    const channelSlug = (viewAccount?.channel_slug || viewAccount?.channel_name || "").toString().trim();
    const origin = (process.env.PUBLIC_ORIGIN || "https://scraplet.store").replace(/\/+$/, "");

    const ttsObsUrl =
      freeTTSEnabled && channelSlug && ttsOverlayKey
        ? `${origin}/overlays/tts?platform=kick&channel=${encodeURIComponent(
          channelSlug
        )}&consumer=overlay:tts&key=${encodeURIComponent(ttsOverlayKey)}`
        : null;

    // Blacklist list (only if we have channel slug)
    const blacklistRows =
      freeTTSEnabled && channelSlug
        ? await listBlacklist({ scrapletUserId: sessionUser.id, platform: "kick", channelSlug: channelSlug.toLowerCase() })
        : [];

    // Fix ReferenceError: discordConnected is not defined
    const discordIntegration = await getActiveDiscordIntegrationForUser(db, sessionUser.id);
    const discordConnected = !!discordIntegration?.guild_id;

    return res.render("dashboard-scrapbot-commands", {
      user: sessionUser,
      scrapbotAccount: viewAccount,
      commands,

      freeTTSEnabled,
      freeTTSChatConfirmations,
      ttsOverlayKey,
      ttsObsUrl,

      ttsSettings,
      ttsBlacklist: blacklistRows,
      discordConnected,
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/dashboard/scrapbot/disco", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;

    const discordIntegration = await getActiveDiscordIntegrationForUser(db, sessionUser.id);
    const discordConnected = !!discordIntegration?.guild_id;

    if (!discordConnected) {
      return res.redirect("/dashboard/scrapbot?err=discord_not_connected");
    }

    return res.render("dashboard-scrapbot-disco", {
      user: sessionUser,
      discordConnected,
      guildId: discordIntegration.guild_id,
    });
  } catch (e) {
    return next(e);
  }
});


// POST Toggle Free TTS feature
router.post(
  "/dashboard/scrapbot/commands/free-tts-toggle",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const sessionUser = req.session.user;
    const enabled = req.body?.enabled === "true" || req.body?.enabled === true || req.body?.enabled === "1";

    try {
      await setFreeTTSEnabled(sessionUser.id, enabled);
    } catch (err) {
      console.error("[dashboardScrapbot] free tts toggle failed", err?.message || err);
    }

    return res.redirect("/dashboard/scrapbot/commands");
  }
);

// POST Toggle chat confirmations
router.post(
  "/dashboard/scrapbot/commands/free-tts-confirmations-toggle",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const sessionUser = req.session.user;
    const enabled = req.body?.enabled === "true" || req.body?.enabled === true || req.body?.enabled === "1";

    try {
      await setFreeTTSChatConfirmations(sessionUser.id, enabled);
    } catch (err) {
      console.error("[dashboardScrapbot] confirmations toggle failed", err?.message || err);
    }

    return res.redirect("/dashboard/scrapbot/commands");
  }
);

// POST Rotate overlay key
router.post(
  "/dashboard/scrapbot/commands/tts-overlay-rotate",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const sessionUser = req.session.user;

    try {
      await rotateOverlayKey(sessionUser.id);
    } catch (err) {
      console.error("[dashboardScrapbot] rotate overlay key failed", err?.message || err);
    }

    return res.redirect("/dashboard/scrapbot/commands");
  }
);

// POST Update TTS settings (flags_json.tts)
router.post(
  "/dashboard/scrapbot/commands/tts-settings",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const sessionUser = req.session.user;

    try {
      const command = String(req.body?.tts_command || "").trim();
      const voicePreset = String(req.body?.tts_voice_preset || "uk_male");
      const minRoleKick = String(req.body?.tts_min_role_kick || "everyone");

      const maxChars = clampInt(req.body?.tts_max_chars, 20, 500, DEFAULT_TTS_SETTINGS.max_chars);
      const cooldownUserMs = clampInt(req.body?.tts_cooldown_user_ms, 0, 300_000, DEFAULT_TTS_SETTINGS.cooldown_user_ms);
      const cooldownChannelMs = clampInt(req.body?.tts_cooldown_channel_ms, 0, 300_000, DEFAULT_TTS_SETTINGS.cooldown_channel_ms);

      const template = String(req.body?.tts_template || DEFAULT_TTS_SETTINGS.template);

      const volume = clampFloat(req.body?.tts_volume, 0, 1, DEFAULT_TTS_SETTINGS.volume);

      const sanitize = {
        strip_links: req.body?.sanitize_strip_links === "on",
        strip_numbers: req.body?.sanitize_strip_numbers === "on",
        strip_symbols: req.body?.sanitize_strip_symbols === "on",
        strip_emojis: req.body?.sanitize_strip_emojis === "on",
        collapse_repeats: req.body?.sanitize_collapse_repeats === "on",
      };

      await setTtsSettings(sessionUser.id, {
        command: command || DEFAULT_TTS_SETTINGS.command,
        voice_preset: voicePreset,
        min_role_kick: ROLE_OPTIONS.includes(minRoleKick) ? minRoleKick : DEFAULT_TTS_SETTINGS.min_role_kick,
        max_chars: maxChars,
        cooldown_user_ms: cooldownUserMs,
        cooldown_channel_ms: cooldownChannelMs,
        template,
        volume,
        sanitize,
      });
    } catch (err) {
      console.error("[dashboardScrapbot] set tts settings failed", err?.message || err);
    }

    return res.redirect("/dashboard/scrapbot/commands");
  }
);

// POST Add blacklist username
router.post(
  "/dashboard/scrapbot/commands/tts-blacklist/add",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const sessionUser = req.session.user;
    const username = String(req.body?.blacklist_username || "").trim().toLowerCase();
    const channelSlug = String(req.body?.channel_slug || "").trim().toLowerCase();

    if (!username || !channelSlug) return res.redirect("/dashboard/scrapbot/commands");

    try {
      await addBlacklist({
        scrapletUserId: sessionUser.id,
        platform: "kick",
        channelSlug,
        username,
      });
    } catch (err) {
      console.error("[dashboardScrapbot] add blacklist failed", err?.message || err);
    }

    return res.redirect("/dashboard/scrapbot/commands");
  }
);

// POST Remove blacklist row
router.post(
  "/dashboard/scrapbot/commands/tts-blacklist/remove",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const sessionUser = req.session.user;
    const id = Number(req.body?.blacklist_id);

    if (!Number.isFinite(id) || id <= 0) return res.redirect("/dashboard/scrapbot/commands");

    try {
      await removeBlacklist({ scrapletUserId: sessionUser.id, id });
    } catch (err) {
      console.error("[dashboardScrapbot] remove blacklist failed", err?.message || err);
    }

    return res.redirect("/dashboard/scrapbot/commands");
  }
);

// POST Create Command
router.post("/dashboard/scrapbot/commands", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const scrapbotAccount = await ensureKickScrapbotAccountForUser(sessionUser.id);
    if (!scrapbotAccount) return res.status(400).send("No Scrapbot account available for this user.");

    const { name, trigger_pattern, response_text, role, cooldown_seconds } = req.body || {};
    if (!name || !trigger_pattern || !response_text) {
      return res.status(400).send("Missing required fields");
    }

    const cooldown = Number.isFinite(Number(cooldown_seconds)) ? Number(cooldown_seconds) : 0;

    await scrapbotDb.query(
      `
      INSERT INTO scrapbot_commands (
        account_id, name, trigger_pattern,
        trigger_type, response_type, response_payload,
        role, cooldown_seconds, enabled
      )
      VALUES ($1,$2,$3,'prefix','text',$4,$5,$6,true)
      `,
      [
        scrapbotAccount.id,
        name,
        trigger_pattern,
        JSON.stringify({ text: response_text }),
        role || "everyone",
        cooldown,
      ]
    );

    await triggerReloadCommands(scrapbotAccount.id);
    return res.redirect("/dashboard/scrapbot/commands");
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(400).send("Trigger pattern already exists for this account.");
    }
    return next(err);
  }
});

// POST Toggle Command
router.post("/dashboard/scrapbot/commands/toggle", requireAuth, async (req, res) => {
  const sessionUser = req.session.user;
  const { id, enabled } = req.body || {};
  if (!id) return res.redirect("/dashboard/scrapbot/commands");

  try {
    const scrapbotAccount = await ensureKickScrapbotAccountForUser(sessionUser.id);
    if (!scrapbotAccount) return res.redirect("/dashboard/scrapbot/commands");

    const nextEnabled = enabled === "true" || enabled === true || enabled === "1";

    await scrapbotDb.query(
      `
      UPDATE scrapbot_commands
      SET enabled = $1
      WHERE id = $2 AND account_id = $3
      `,
      [nextEnabled, id, scrapbotAccount.id]
    );

    await triggerReloadCommands(scrapbotAccount.id);
  } catch (err) {
    console.error("[dashboardScrapbot] toggle command failed", err?.message || err);
  }

  return res.redirect("/dashboard/scrapbot/commands");
});

// POST Delete Command
router.post("/dashboard/scrapbot/commands/delete", requireAuth, async (req, res) => {
  const sessionUser = req.session.user;
  const { id } = req.body || {};
  if (!id) return res.redirect("/dashboard/scrapbot/commands");

  try {
    const scrapbotAccount = await ensureKickScrapbotAccountForUser(sessionUser.id);
    if (!scrapbotAccount) return res.redirect("/dashboard/scrapbot/commands");

    await scrapbotDb.query(
      `
      DELETE FROM scrapbot_commands
      WHERE id = $1 AND account_id = $2
      `,
      [id, scrapbotAccount.id]
    );

    await triggerReloadCommands(scrapbotAccount.id);
  } catch (err) {
    console.error("[dashboardScrapbot] delete command failed", err?.message || err);
  }

  return res.redirect("/dashboard/scrapbot/commands");
});

// ─────────────────────────────────────────────
// Disco Scrapbot (UI tab view)
// ─────────────────────────────────────────────
router.get("/dashboard/scrapbot/disco-ui", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;

    // DB truth: the guild bound to this user (multi-tenant safety)
    const { rows: discordRows } = await db.query(
      `
      SELECT guild_id
      FROM public.discord_guild_integrations
      WHERE owner_user_id = $1
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [sessionUser.id]
    );

    const guildId = discordRows[0]?.guild_id || null;

    if (!guildId) {
      return res.redirect("/dashboard/scrapbot?err=discord_not_connected");
    }

    const producerChannels = (
      await db.query(
        `
        SELECT channel_id, enabled, mode, show_ttl_seconds, created_at, updated_at
        FROM public.discord_channel_rules
        WHERE guild_id = $1
        ORDER BY created_at DESC
        `,
        [guildId]
      )
    ).rows;

    const producerRoles = (
      await db.query(
        `
        SELECT role_id, can_react_show, can_slash_control, created_at, updated_at
        FROM public.discord_role_rules
        WHERE guild_id = $1
        ORDER BY created_at DESC
        `,
        [guildId]
      )
    ).rows;

    const reactionMap = (
      await db.query(
        `
        SELECT emoji, action, created_at
        FROM public.discord_reaction_map
        WHERE guild_id = $1
        ORDER BY created_at DESC
        `,
        [guildId]
      )
    ).rows;

    let discord = {
      connected: !!guildId,
      guildId: guildId ? String(guildId) : null,
      state: guildId ? "ok" : "not_linked",
      primaryHref: guildId ? "/dashboard/scrapbot/disco" : "/integrations/discord/connect",
      primaryLabel: guildId ? "Configure" : "Connect",
    };


    return res.render("layout", {
      tabView: "tabs/scrapbot-disco",
      user: sessionUser,
      isPro: false,
      discord,
      guildId,
      producerChannels,
      producerRoles,
      reactionMap,
    });
  } catch (e) {
    console.error("[disco-ui] failed:", e?.message || e);
    return res.status(500).send("Disco Scrapbot error");
  }
});


// ── GET /dashboard/api/scrapbot/status ───────────────────────────────────────
// Used by the showrunner controller to get live Scrapbot + streamer metrics
router.get('/dashboard/api/scrapbot/status', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Fetch streamer context (session stats, platform stats)
    const base = process.env.DASHBOARD_INTERNAL_URL || 'http://127.0.0.1:3000';
    const ctxResp = await fetch(
      `${base}/dashboard/api/streamer/context?days=7&_internal_user_id=${userId}`,
      { signal: AbortSignal.timeout(3000) }
    ).catch(() => null);
    const ctx = ctxResp?.ok ? await ctxResp.json() : null;

    // Fetch scrapbot service health
    const scrapbotBase = process.env.SCRAPBOT_INTERNAL_URL || 'http://127.0.0.1:3030';
    const healthResp = await fetch(`${scrapbotBase}/health`, {
      signal: AbortSignal.timeout(2000)
    }).catch(() => null);
    const health = healthResp?.ok ? await healthResp.json() : null;

    // Recent room intel snapshot (last known MPM, engagement)
    const { rows: intelRows } = await db.query(
      `SELECT platform, channel_slug, mpm, engagement_index, viewer_count, updated_at
       FROM public.roomintel_snapshots
       WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT 5`,
      [userId]
    ).catch(() => ({ rows: [] }));

    // Recent generation jobs
    const { rows: genRows } = await db.query(
      `SELECT job_type, status, created_at
       FROM public.generation_jobs
       WHERE owner_user_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    ).catch(() => ({ rows: [] }));

    return res.json({
      ok: true,
      scrapbot: {
        online: !!health?.ok,
        raffle: health?.orchestration?.raffle || 'unknown',
        mod_probe: health?.orchestration?.mod_probe || 'unknown',
      },
      streamer: ctx?.ok ? {
        platform_stats: ctx.platform_stats || [],
        session_averages: ctx.session_averages || null,
        recent_sessions: (ctx.recent_sessions || []).slice(0, 3),
        top_chatters: (ctx.top_chatters || []).slice(0, 5),
      } : null,
      room_intel: intelRows,
      recent_generations: genRows,
    });
  } catch (err) {
    console.error('[scrapbot/status]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
