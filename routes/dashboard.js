// /routes/dashboard.js
import express from "express";
import db from "../db.js";
import requireAuth from "../utils/requireAuth.js";
import { getValidUserAccessToken } from "../services/kickUserTokens.js";
import { widgets, overlays, getWidgetById } from "../utils/mockData.js";
import { calculateMarketability } from "../utils/stats.js";
import { getHandlesForUser } from "../scripts/externalAccounts.js";
import { getStatsForUser } from "../scripts/stats.js";
import { enqueueChatForUser } from "../src/widgets/chat-overlay/ingest.js";
import { mintWidgetToken } from "../utils/widgetTokens.js";
import { SUB_COUNTER_DEFAULTS } from "../src/widgets/sub-counter/defaults.js";
import {
  getOrCreateUserSubCounter,
  updateSubCounterConfig,
} from "../src/widgets/sub-counter/service.js";
import { startTikTokIngest } from "../services/tiktokChatIngest.js";
import { createPaidTTSJob } from "../src/monetisation/tts.js";
import { createOverlayToken } from "../src/alerts/tokenService.js";
import crypto from "crypto";
import { enqueueAlertForUserEvent } from "../src/alerts/engine.js";



import fs from "fs";
import path from "path";

// Chat overlay (DB-backed)
import {
  getOrCreateUserChatOverlay,
  updateUserChatOverlay,
} from "../src/widgets/chat-overlay/service.js";
import { CHAT_OVERLAY_DEFAULTS } from "../src/widgets/chat-overlay/defaults.js";
import { CHAT_OVERLAY_PRESETS } from "../src/widgets/chat-overlay/presets.js";

// Blackjack (chat-only)
import {
  getOrCreateUserBlackjack,
  updateBlackjackConfig,
} from "../src/widgets/blackjack/service.js";
import { BLACKJACK_DEFAULTS } from "../src/widgets/blackjack/defaults.js";

// Plinko (DB-backed)
import {
  getOrCreateUserPlinko,
  updatePlinkoConfig,
} from "../src/widgets/plinko/service.js";
import { PLINKO_DEFAULTS } from "../src/widgets/plinko/defaults.js";

// Roulette (DB-backed)
import {
  getOrCreateUserRoulette,
  updateRouletteConfig,
} from "../src/widgets/roulette/service.js";
import { ROULETTE_DEFAULTS } from "../src/widgets/roulette/defaults.js";

// Crash (DB-backed)
import {
  getOrCreateUserCrash,
  updateCrashConfig,
} from "../src/widgets/crash/service.js";
import { CRASH_DEFAULTS } from "../src/widgets/crash/defaults.js";

const router = express.Router();

function getPublicBaseUrl(req) {
  const env = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;

  const host = (req.get("host") || "").trim();
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = xfProto || req.protocol || "http";

  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

// ─────────────────────────────────────────────
// Playground Helpers / Admin Gate (hardcoded for now)
// ─────────────────────────────────────────────
function requireAdmin(req, res, next) {
  try {
    const uid = req?.session?.user?.id;
    if (uid === 4) return next();
    return res.status(403).json({ ok: false, error: "forbidden" });
  } catch {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
}

function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function refreshYouTubeAccessToken(dbClient, externalAccountId, refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET for YouTube refresh");
  }
  if (!refreshToken) throw new Error("No refresh_token available for YouTube refresh");

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

  // Keep existing refresh_token if Google doesn't return one (common)
  await dbClient.query(
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

async function getActiveDiscordIntegrationForUser(ownerUserId) {
  const { rows } = await db.query(
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


async function getYouTubeLiveBadge(accessToken) {
  // "LIVE" check (active broadcasts). If you're offline, it should return empty.
  const url =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all";

  const r = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Don't break dashboard rendering for live badge failures
    return { ok: false, isLive: false, liveChatId: null, httpStatus: r.status };
  }

  const item = Array.isArray(data.items) && data.items.length ? data.items[0] : null;
  const liveChatId = item?.snippet?.liveChatId || null;

  return { ok: true, isLive: !!item, liveChatId };
}


function buildFallbackPageLayout(page) {
  const p = String(page || "").trim().toLowerCase() || "unknown";

  const base = {
    v: 1,
    page: p,
    name: p,
    global: { layout: "grid3", density: "balanced" },
    palette: {
      layouts: [
        { key: "grid3", name: "3 Column" },
        { key: "grid2", name: "2 Column" },
        { key: "hybrid", name: "Hybrid" },
      ],
      panels: [],
    },
    panels: [],
  };

  // Safe starter so Playground never 404s “unknown page”
  if (p === "stats") {
    base.name = "Dashboard Stats";
    base.palette.panels = [
      {
        type: "stats_overview",
        title: "Overview",
        desc: "Totals, grade, last updated",
        defaultSpan: 1,
      },
      {
        type: "stats_sparklines",
        title: "Sparklines",
        desc: "Platform follower lines",
        defaultSpan: 1,
      },
      {
        type: "stats_engagement",
        title: "Engagement",
        desc: "Profile views windowed trend",
        defaultSpan: 1,
      },
      {
        type: "stats_audience_growth",
        title: "Audience Growth",
        desc: "Total followers over time",
        defaultSpan: 2,
      },
      { type: "notes", title: "Notes", desc: "Scratchpad / TODO", defaultSpan: 1 },
      { type: "log", title: "Log", desc: "Recent events/debug", defaultSpan: 1 },
    ];

    base.panels = [
      { id: "p_overview", type: "stats_overview", title: "Overview", span: 1 },
      { id: "p_spark", type: "stats_sparklines", title: "Sparklines", span: 1 },
      { id: "p_engage", type: "stats_engagement", title: "Engagement", span: 1 },
      { id: "p_growth", type: "stats_audience_growth", title: "Audience Growth", span: 3 },
    ];
  }

  return base;
}

/**
 * YouTube integration status (normalized, recoverable-aware)
 *
 * Rules:
 * - not_linked  → no external account row
 * - reauth      → external account exists BUT no refresh_token (cannot recover)
 * - ok          → refresh_token exists (recoverable), regardless of access_token expiry
 *
 * This function is DB-only. No network calls.
 */
async function getYouTubeIntegrationStatus(dbClient, userId) {
  const r = await dbClient.query(
    `
    SELECT
      ea.id                AS external_account_id,
      ea.username,
      ea.external_user_id,
      t.access_token,
      t.refresh_token,
      t.expires_at
    FROM external_accounts ea
    LEFT JOIN external_account_tokens t
      ON t.external_account_id = ea.id
    WHERE ea.user_id = $1
      AND ea.platform = 'youtube'
    LIMIT 1
    `,
    [userId]
  );

  const row = r.rows[0] || null;

  // ─────────────────────────────────────────────
  // Not linked at all
  // ─────────────────────────────────────────────
  if (!row) {
    return {
      status: "not_linked",
      connected: false,
      needsReauth: false,
      username: null,

      // token fields (explicitly null)
      externalAccountId: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    };
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const hasValidExpires =
    !!expiresAt && !Number.isNaN(expiresAt.getTime());

  const isExpired =
    hasValidExpires ? expiresAt <= new Date() : false;

  // ─────────────────────────────────────────────
  // Linked but NOT recoverable → reauth required
  // (no refresh token)
  // ─────────────────────────────────────────────
  if (!row.refresh_token) {
    return {
      status: "reauth",
      connected: false,
      needsReauth: true,
      username: row.username || null,

      externalAccountId: row.external_account_id,
      accessToken: row.access_token || null,
      refreshToken: null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  // ─────────────────────────────────────────────
  // Linked AND recoverable → OK
  // Access token expiry does NOT break connection
  // ─────────────────────────────────────────────
  return {
    status: "ok",
    connected: true,
    needsReauth: false,
    username: row.username || null,

    externalAccountId: row.external_account_id,
    accessToken: row.access_token || null,
    refreshToken: row.refresh_token || null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,

    // Optional flags (useful for debugging / UI if you want later)
    isExpired,
  };
}


function getDefaultPageLayout(page) {
  const p = String(page || "").trim().toLowerCase();
  if (!p) return null;

  const baseDir = path.join(process.cwd(), "config", "page-layouts");
  const fp = path.join(baseDir, `${p}.default.json`);
  const j = readJsonSafe(fp, null);

  return j || buildFallbackPageLayout(p);
}

function getUserLayoutPath(userId, page) {
  const base = path.join(process.cwd(), "config", "user-layouts", String(userId));
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, `${page}.json`);
}

function getEffectivePageLayout(userId, page) {
  const def = getDefaultPageLayout(page);
  const userFp = getUserLayoutPath(userId, String(page || "").trim().toLowerCase());
  const usr = readJsonSafe(userFp, null);
  return usr || def;
}

/**
 * Helper: is Pro user?
 * Keep tolerant (your app uses multiple plan labels).
 */
function isProUser(sessionUser) {
  if (!sessionUser) return false;
  const plan = sessionUser.plan || sessionUser.subscription_plan || "";
  return plan === "pro" || plan === "PRO" || plan === "Premium";
}

function asBool(v) {
  return v === "1" || v === "true" || v === true;
}
function asInt(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
function asFloat(v, fallback) {
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}
function asStr(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s.length ? s : fallback;
}

/**
 * Admin helper (hardcoded for now; you can replace later)
 */
function isAdminUser4(req) {
  const id = Number(req?.session?.user?.id);
  return Number.isFinite(id) && id === 4;
}

// ─────────────────────────────────────────────
// Studio Playground + Page Layout API (TOP LEVEL)
// ─────────────────────────────────────────────

/**
 * GET /dashboard/studio/playground
 * (admin-only)
 */
router.get("/studio/playground", requireAuth, (req, res) => {
  if (!isAdminUser4(req)) return res.status(403).send("Forbidden");

  const presets = [
    { key: "grid3", name: "Control Room (3-col)", layout: "grid3", notes: "Live ops density pressure test." },
    { key: "grid2", name: "Focus Mode (2-col)", layout: "grid2", notes: "Build/config: dominant center panel." },
    { key: "hybrid", name: "Hybrid (2x2 + wide)", layout: "hybrid", notes: "Two key panels + wide timeline/log." },
  ];

  return res.render("layout", {
    tabView: "studio/playground",
    pageTitle: "Studio Playground",
    user: req.session.user,
    isPro: isProUser(req.session.user),
    presets,
  });
});

/**
 * POST /dashboard/api/monetisation/tts/test
 * Admin-only (uid=4 for now).
 *
 * Body:
 * {
 *   "channelSlug": "scraplet",
 *   "text": "Hello chat",
 *   "voiceId": "en_GB-alba-medium",
 *   "creatorUserId": 4            // optional; defaults to session user id
 * }
 */
router.post(
  "/api/monetisation/tts/test",
  requireAuth,
  requireAdmin,
  express.json({ limit: "32kb" }),
  async (req, res) => {
    try {
      const sessionUserId = Number(req?.session?.user?.id);

      const creatorUserIdRaw = req.body?.creatorUserId;
      const creatorUserId = Number.isFinite(Number(creatorUserIdRaw))
        ? Number(creatorUserIdRaw)
        : sessionUserId;

      const channelSlug = String(req.body?.channelSlug || "").trim();
      const text = String(req.body?.text || "").trim();
      const voiceId = String(req.body?.voiceId || "en_GB-alba-medium").trim();

      if (!Number.isFinite(creatorUserId) || creatorUserId <= 0) {
        return res.status(400).json({ ok: false, error: "creatorUserId required" });
      }
      if (!channelSlug) {
        return res.status(400).json({ ok: false, error: "channelSlug required" });
      }
      if (!text) {
        return res.status(400).json({ ok: false, error: "text required" });
      }
      if (text.length > 500) {
        return res.status(400).json({ ok: false, error: "text too long (max 500)" });
      }

      const paymentIntentId = `internal_test_${Date.now()}`;

      const out = await createPaidTTSJob({
        creatorUserId,
        viewerUserId: null,
        text,
        voiceId,
        platform: "kick",
        channelSlug,
        paymentIntentId,
      });

      return res.json({
        ok: true,
        orderId: out.order.id,
        entitlementId: out.entitlement.id,
        ttsJobId: out.ttsJob.id,
        source: out.ttsJob.source,
        priority: out.ttsJob.priority,
      });
    } catch (err) {
      console.error("[monetisation/tts/test] failed:", err?.message || err);
      return res.status(500).json({
        ok: false,
        error: err?.message || String(err),
      });
    }
  }
);

/**
 * GET /dashboard/api/studio/pages
 * admin-only
 */
router.get("/api/studio/pages", requireAuth, requireAdmin, (req, res) => {
  try {
    const baseDir = path.join(process.cwd(), "config", "page-layouts");
    let pages = [];

    if (fs.existsSync(baseDir)) {
      const files = fs.readdirSync(baseDir).filter((f) => f.endsWith(".default.json"));
      pages = files
        .map((f) => {
          const key = f.replace(".default.json", "");
          const fp = path.join(baseDir, f);
          const j = readJsonSafe(fp, null);
          const name =
            (j && (j.name || j.title || (j.global && (j.global.name || j.global.title)))) ||
            key;
          return { key, name };
        })
        .sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }

    if (!pages.length) pages = [{ key: "stats", name: "Dashboard Stats" }];

    return res.json({ ok: true, pages });
  } catch (e) {
    console.warn("[studio/pages] failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "failed" });
  }
});

/**
 * GET /dashboard/api/studio/page-layout?page=stats
 * Optional: &default=1
 */
router.get("/api/studio/page-layout", requireAuth, requireAdmin, (req, res) => {
  const userId = req.session.user.id;
  const page = String(req.query.page || "").trim().toLowerCase();
  if (!page) return res.status(400).json({ ok: false, error: "missing page" });

  const def = getDefaultPageLayout(page);
  const effective = getEffectivePageLayout(userId, page);

  const wantsDefault = asBool(req.query.default);
  const layout = wantsDefault ? (def || effective) : (effective || def);

  if (!layout) return res.status(404).json({ ok: false, error: "unknown page" });

  return res.json({
    ok: true,
    page,
    layout,
    defaultLayout: def || null,
    effectiveLayout: effective || null,
  });
});

/**
 * POST /dashboard/api/studio/page-layout?page=stats
 * body: { layout: <json> }
 */
router.post(
  "/api/studio/page-layout",
  requireAuth,
  requireAdmin,
  express.json({ limit: "1mb" }),
  (req, res) => {
    const userId = req.session.user.id;
    const page = String(req.query.page || "").trim().toLowerCase();
    if (!page) return res.status(400).json({ ok: false, error: "missing page" });

    const incoming = req.body?.layout;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ ok: false, error: "missing layout" });
    }

    incoming.page = page;
    incoming.v = incoming.v || 1;

    const fp = getUserLayoutPath(userId, page);
    fs.writeFileSync(fp, JSON.stringify(incoming, null, 2), "utf8");
    return res.json({ ok: true });
  }
);

// ─────────────────────────────────────────────
// Studio Controller (static Vite build, auth-gated)
// URL: /dashboard/studio/
// FS:  /var/www/scraplet/studio-controller/dist
// ─────────────────────────────────────────────
router.use(
  "/studio",
  requireAuth,
  express.static("/var/www/scraplet/studio-controller/dist", { index: "index.html" })
);

router.get(/^\/studio\/.*$/, requireAuth, (req, res) => {
  res.sendFile("/var/www/scraplet/studio-controller/dist/index.html");
});

// GET /dashboard/widgets/sub-counter/configure
router.get("/widgets/sub-counter/configure", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const row = await getOrCreateUserSubCounter(sessionUser.id);

    // token for /w/:token
    const token = mintWidgetToken({
      userId: String(sessionUser.id),
      widgetId: "sub-counter",
      ttlSec: 60 * 60 * 24, // keep for now; we'll fix non-expiring tokens next
    });

    const host = req.get("host") || "scraplet.store";
    const proto =
      (req.headers["x-forwarded-proto"] || req.protocol || "https")
        .toString()
        .split(",")[0]
        .trim() || "https";

    const overlayUrl = `${proto}://${host}/w/${token}`;

    const flash = {
      success: req.query.ok ? "Saved." : "",
      error: req.query.err ? "Save failed. Check logs." : "",
    };

    return res.render("layout", {
      tabView: "tabs/sub-counter",
      user: sessionUser,
      isPro: isProUser(sessionUser),
      widget: row,
      cfg: row.config_json || SUB_COUNTER_DEFAULTS,
      overlayUrl,
      token,
      flash,
    });
  } catch (e) {
    console.error("[dashboard/sub-counter/configure] failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

// POST /dashboard/widgets/sub-counter/save
router.post("/widgets/sub-counter/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const action = String(req.body?._action || "save");

    if (action === "reset") {
      await updateSubCounterConfig(sessionUser.id, SUB_COUNTER_DEFAULTS);
      return res.redirect("/dashboard/widgets/sub-counter/configure?ok=1");
    }

    const patch = {
      label: String(req.body.label || "SUB GOAL").slice(0, 60),
      goal: Number(req.body.goal || 25),
      cap: Number(req.body.cap || 50),
      overfill: !!req.body.overfill,
      showNumbers: !!req.body.showNumbers,
      showPercent: !!req.body.showPercent,
      decimals: Number(req.body.decimals || 0),
    };

    await updateSubCounterConfig(sessionUser.id, patch);
    return res.redirect("/dashboard/widgets/sub-counter/configure?ok=1");
  } catch (e) {
    console.error("[dashboard/sub-counter/save] failed:", e?.message || e);
    return res.redirect("/dashboard/widgets/sub-counter/configure?err=1");
  }
});

// ─────────────────────────────────────────────
// ALERTS V1 (publicId OBS URL, SSE) + V2.1 multi-rule config
// ─────────────────────────────────────────────

function makeAlertsPublicId() {
  return crypto.randomBytes(12).toString("hex");
}

async function ensureDefaultAlertsRuleset(ownerUserId) {
  const { rows: rsRows } = await db.query(
    `
    SELECT id
    FROM public.alert_rulesets
    WHERE owner_user_id = $1
    LIMIT 1
    `,
    [ownerUserId]
  );

  let rulesetId = rsRows[0]?.id || null;

  if (!rulesetId) {
    const { rows: created } = await db.query(
      `
      INSERT INTO public.alert_rulesets (owner_user_id, name, is_active)
      VALUES ($1, 'Default', true)
      RETURNING id
      `,
      [ownerUserId]
    );
    rulesetId = created[0].id;
  }

  // Ensure at least one rule exists (enabled by default)
  const { rows: anyRule } = await db.query(
    `
    SELECT id
    FROM public.alert_rules
    WHERE ruleset_id = $1
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    `,
    [rulesetId]
  );

  if (!anyRule[0]) {
    await db.query(
      `
      INSERT INTO public.alert_rules (
        ruleset_id, name, enabled, priority,
        cooldown_seconds, dedupe_window_seconds,
        event_types, conditions_json,
        duration_ms, text_template, visual_json, audio_json,
        actions_json
      ) VALUES (
        $1, 'Default All Events', true, 50,
        0, 60,
        ARRAY['follow','subscription','gifted_subscription','raid','host','tip','cheer','custom','test']::text[],
        '{}'::jsonb,
        6500,
        '{actor.display} triggered an alert!',
        '{"layout":"card","theme":"scraplet_neo","accent":"kick_green","show_avatar":true}'::jsonb,
        '{"enabled":false,"volume":0.6}'::jsonb,
        '{}'::jsonb
      )
      `,
      [rulesetId]
    );
  }

  return rulesetId;
}

async function ensureAlertsPublicOverlay(ownerUserId) {
  const { rows } = await db.query(
    `
    SELECT public_id
    FROM public.alert_public_overlays
    WHERE owner_user_id = $1 AND revoked_at IS NULL
    LIMIT 1
    `,
    [ownerUserId]
  );

  if (rows[0]?.public_id) return rows[0].public_id;

  const publicId = makeAlertsPublicId();
  await db.query(
    `
    INSERT INTO public.alert_public_overlays (owner_user_id, public_id)
    VALUES ($1, $2)
    `,
    [ownerUserId, publicId]
  );

  return publicId;
}

async function regenerateAlertsPublicOverlay(ownerUserId) {
  await db.query(
    `
    UPDATE public.alert_public_overlays
    SET revoked_at = now()
    WHERE owner_user_id = $1 AND revoked_at IS NULL
    `,
    [ownerUserId]
  );

  const publicId = makeAlertsPublicId();
  await db.query(
    `
    INSERT INTO public.alert_public_overlays (owner_user_id, public_id)
    VALUES ($1, $2)
    `,
    [ownerUserId, publicId]
  );

  return publicId;
}

function normalizeTextArray(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (v === undefined || v === null) return [];
  return [String(v).trim()].filter(Boolean);
}

function safeJsonParseOrNull(raw, maxLen = 8000) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const clipped = s.length > maxLen ? s.slice(0, maxLen) : s;
  try {
    return JSON.parse(clipped);
  } catch {
    return { _parse_error: true, raw: clipped };
  }
}

// GET /dashboard/widgets/alerts/configure
router.get("/widgets/alerts/configure", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const ownerUserId = sessionUser?.id;
    if (!ownerUserId) return res.status(401).redirect("/account/");

    const rulesetId = await ensureDefaultAlertsRuleset(ownerUserId);
    const publicId = await ensureAlertsPublicOverlay(ownerUserId);

    const { rows: rules } = await db.query(
      `
      SELECT *
      FROM public.alert_rules
      WHERE ruleset_id = $1
      ORDER BY priority DESC, created_at ASC
      `,
      [rulesetId]
    );

    const requestedRuleId = String(req.query?.rule_id || "").trim();
    const selected =
      (requestedRuleId && rules.find((r) => String(r.id) === requestedRuleId)) ||
      rules[0] ||
      null;

    const rule = selected;
    const visual = rule?.visual_json || {};
    const audio = rule?.audio_json || {};
    const conditions = rule?.conditions_json || {};
    const actions = rule?.actions_json || {};

    const host = req.get("host") || "scraplet.store";
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
      .split(",")[0]
      .trim() || "https";

    const overlayUrl = `${proto}://${host}/a/${encodeURIComponent(publicId)}`;

    return res.status(200).render("layout", {
      user: sessionUser,
      tabView: "tabs/widgets-alerts",
      publicId,
      overlayUrl,

      rules, // NEW
      rule, // selected
      visual,
      audio,
      conditions,
      actions,

      flash: null,
    });
  } catch (e) {
    console.error("[dashboard/widgets/alerts/configure] failed:", e);
    return res.status(500).render("500");
  }
});

// POST /dashboard/widgets/alerts/rules/create
router.post("/widgets/alerts/rules/create", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.session?.user?.id);
    if (!ownerUserId) return res.status(401).redirect("/account/");

    const rulesetId = await ensureDefaultAlertsRuleset(ownerUserId);

    const { rows } = await db.query(
      `
      INSERT INTO public.alert_rules (
        ruleset_id, name, enabled, priority,
        cooldown_seconds, dedupe_window_seconds,
        event_types, conditions_json,
        duration_ms, text_template, visual_json, audio_json,
        actions_json
      ) VALUES (
        $1, 'New Rule', true, 50,
        0, 60,
        ARRAY['test']::text[],
        '{"platforms":["kick"],"actor":{"mode":"any","value":null},"amount":{"min":null,"max":null,"currency":"USD"},"count":{"min":null,"max":null},"advanced_json":null}'::jsonb,
        6500,
        '{actor.display} triggered an alert!',
        '{"layout":"card","theme":"scraplet_neo","accent":"kick_green","show_avatar":true,"position":"bottom","safe_padding":48,"scale":1}'::jsonb,
        '{"enabled":false,"url":null,"volume":0.6}'::jsonb,
        '{"queue":{"mode":"stack","burst_max":5,"burst_window_s":10},"cooldowns":{"global_s":0},"advanced_json":null}'::jsonb
      )
      RETURNING id
      `,
      [rulesetId]
    );

    const newId = rows[0]?.id;
    return res.redirect(`/dashboard/widgets/alerts/configure?rule_id=${encodeURIComponent(newId)}`);
  } catch (e) {
    console.error("[alerts rules/create] failed:", e?.message || e);
    return res.status(500).send("Failed to create rule.");
  }
});

// POST /dashboard/widgets/alerts/rules/duplicate
router.post(
  "/widgets/alerts/rules/duplicate",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const ownerUserId = Number(req.session?.user?.id);
      if (!ownerUserId) return res.status(401).redirect("/account/");

      const rulesetId = await ensureDefaultAlertsRuleset(ownerUserId);
      const ruleId = String(req.body?.rule_id || "").trim();
      if (!ruleId) return res.redirect("/dashboard/widgets/alerts/configure");

      const { rows: srcRows } = await db.query(
        `
      SELECT *
      FROM public.alert_rules
      WHERE id = $1 AND ruleset_id = $2
      LIMIT 1
      `,
        [ruleId, rulesetId]
      );

      const src = srcRows[0];
      if (!src) return res.redirect("/dashboard/widgets/alerts/configure");

      const { rows: created } = await db.query(
        `
      INSERT INTO public.alert_rules (
        ruleset_id, name, enabled, priority,
        cooldown_seconds, dedupe_window_seconds,
        event_types, conditions_json,
        duration_ms, text_template,
        visual_json, audio_json, actions_json
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7::text[], $8::jsonb,
        $9, $10,
        $11::jsonb, $12::jsonb, $13::jsonb
      )
      RETURNING id
      `,
        [
          rulesetId,
          `${String(src.name || "Rule").slice(0, 120)} (copy)`,
          src.enabled !== false,
          Number(src.priority ?? 50),
          Number(src.cooldown_seconds ?? 0),
          Number(src.dedupe_window_seconds ?? 60),
          src.event_types || [],
          JSON.stringify(src.conditions_json || {}),
          Number(src.duration_ms ?? 6500),
          String(src.text_template || "{actor.display} triggered an alert!"),
          JSON.stringify(src.visual_json || {}),
          JSON.stringify(src.audio_json || {}),
          JSON.stringify(src.actions_json || {}),
        ]
      );

      const newId = created[0]?.id;
      return res.redirect(`/dashboard/widgets/alerts/configure?rule_id=${encodeURIComponent(newId)}`);
    } catch (e) {
      console.error("[alerts rules/duplicate] failed:", e?.message || e);
      return res.status(500).send("Failed to duplicate rule.");
    }
  }
);

// POST /dashboard/widgets/alerts/rules/delete
router.post(
  "/widgets/alerts/rules/delete",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const ownerUserId = Number(req.session?.user?.id);
      if (!ownerUserId) return res.status(401).redirect("/account/");

      const rulesetId = await ensureDefaultAlertsRuleset(ownerUserId);
      const ruleId = String(req.body?.rule_id || "").trim();
      if (!ruleId) return res.redirect("/dashboard/widgets/alerts/configure");

      // prevent deleting last rule (keeps widget sane)
      const { rows: countRows } = await db.query(
        `SELECT COUNT(*)::int AS c FROM public.alert_rules WHERE ruleset_id = $1`,
        [rulesetId]
      );
      const c = Number(countRows[0]?.c || 0);
      if (c <= 1)
        return res.redirect(
          `/dashboard/widgets/alerts/configure?rule_id=${encodeURIComponent(ruleId)}`
        );

      await db.query(
        `
      DELETE FROM public.alert_rules
      WHERE id = $1 AND ruleset_id = $2
      `,
        [ruleId, rulesetId]
      );

      return res.redirect("/dashboard/widgets/alerts/configure");
    } catch (e) {
      console.error("[alerts rules/delete] failed:", e?.message || e);
      return res.status(500).send("Failed to delete rule.");
    }
  }
);

// POST /dashboard/widgets/alerts/rules/move
router.post(
  "/widgets/alerts/rules/move",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const client = await db.connect();
    try {
      const ownerUserId = Number(req.session?.user?.id);
      if (!ownerUserId) return res.status(401).redirect("/account/");

      const rulesetId = await ensureDefaultAlertsRuleset(ownerUserId);
      const ruleId = String(req.body?.rule_id || "").trim();
      const dir = String(req.body?.dir || "").trim().toLowerCase(); // up|down
      if (!ruleId || (dir !== "up" && dir !== "down"))
        return res.redirect("/dashboard/widgets/alerts/configure");

      await client.query("BEGIN");

      const { rows: rules } = await client.query(
        `
      SELECT id, priority, created_at
      FROM public.alert_rules
      WHERE ruleset_id = $1
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE
      `,
        [rulesetId]
      );

      const idx = rules.findIndex((r) => String(r.id) === ruleId);
      if (idx === -1) {
        await client.query("ROLLBACK");
        return res.redirect("/dashboard/widgets/alerts/configure");
      }

      const swapWith = dir === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= rules.length) {
        await client.query("ROLLBACK");
        return res.redirect(
          `/dashboard/widgets/alerts/configure?rule_id=${encodeURIComponent(ruleId)}`
        );
      }

      const a = rules[idx];
      const b = rules[swapWith];

      // swap priorities (stable ordering falls back to created_at)
      await client.query(
        `UPDATE public.alert_rules SET priority = $1 WHERE id = $2 AND ruleset_id = $3`,
        [Number(b.priority), a.id, rulesetId]
      );
      await client.query(
        `UPDATE public.alert_rules SET priority = $1 WHERE id = $2 AND ruleset_id = $3`,
        [Number(a.priority), b.id, rulesetId]
      );

      await client.query("COMMIT");
      return res.redirect(
        `/dashboard/widgets/alerts/configure?rule_id=${encodeURIComponent(ruleId)}`
      );
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch { }
      console.error("[alerts rules/move] failed:", e?.message || e);
      return res.status(500).send("Failed to move rule.");
    } finally {
      client.release();
    }
  }
);

// POST /dashboard/widgets/alerts/save
router.post(
  "/widgets/alerts/save",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const sessionUser = req.session?.user;
      const ownerUserId = sessionUser?.id;
      if (!ownerUserId) return res.status(401).redirect("/account/");

      const rulesetId = await ensureDefaultAlertsRuleset(ownerUserId);
      const ruleId = String(req.body?.rule_id || "").trim();
      if (!ruleId) return res.redirect("/dashboard/widgets/alerts/configure");

      const name = String(req.body?.name || "Rule").trim().slice(0, 140) || "Rule";
      const enabled = !!req.body?.enabled;

      const rawTypes = req.body["event_types[]"] ?? req.body.event_types ?? [];
      const eventTypes = normalizeTextArray(rawTypes);

      const priority = Math.max(1, Math.min(100, Number(req.body?.priority ?? 50) || 50));
      const durationMs = Math.max(500, Number(req.body?.duration_ms ?? 6500) || 6500);
      const cooldownSeconds = Math.max(0, Number(req.body?.cooldown_seconds ?? 0) || 0);
      const dedupeWindowSeconds = Math.max(0, Number(req.body?.dedupe_window_seconds ?? 60) || 60);
      const textTemplate = String(req.body?.text_template || "{actor.display} triggered an alert!").slice(
        0,
        500
      );

      const conditions = {
        platforms: (() => {
          const raw = req.body["platforms[]"] ?? req.body.platforms ?? [];
          const arr = normalizeTextArray(raw);
          return arr.length ? arr : ["kick"];
        })(),
        actor: {
          mode: String(req.body?.actor_mode || "any"),
          value: String(req.body?.actor_value || "").trim().slice(0, 80) || null,
        },
        amount: {
          min:
            req.body?.amount_min !== undefined && String(req.body.amount_min).trim() !== ""
              ? Number(req.body.amount_min)
              : null,
          max:
            req.body?.amount_max !== undefined && String(req.body.amount_max).trim() !== ""
              ? Number(req.body.amount_max)
              : null,
          currency: String(req.body?.amount_currency || "USD").trim().slice(0, 8) || "USD",
        },
        count: {
          min:
            req.body?.count_min !== undefined && String(req.body.count_min).trim() !== ""
              ? Math.max(0, Math.floor(Number(req.body.count_min)))
              : null,
          max:
            req.body?.count_max !== undefined && String(req.body.count_max).trim() !== ""
              ? Math.max(0, Math.floor(Number(req.body.count_max)))
              : null,
        },
        advanced_json: safeJsonParseOrNull(req.body?.conditions_advanced_json),
      };

      const actions = {
        queue: {
          mode: String(req.body?.queue_mode || "stack"),
          burst_max: Math.max(1, Math.floor(Number(req.body?.burst_max ?? 5) || 5)),
          burst_window_s: Math.max(1, Math.floor(Number(req.body?.burst_window_s ?? 10) || 10)),
        },
        cooldowns: {
          global_s: Math.max(0, Math.floor(Number(req.body?.global_cooldown_s ?? 0) || 0)),
        },
        advanced_json: safeJsonParseOrNull(req.body?.actions_advanced_json),
      };

      const visual = {
        theme: String(req.body?.visual_theme || "scraplet_neo"),
        layout: String(req.body?.visual_layout || "card"),
        accent: String(req.body?.visual_accent || "kick_green"),
        show_avatar: !!req.body?.visual_show_avatar,
        image_url: String(req.body?.visual_image_url || "").trim() || null,
        image_fit: "contain",

        position: String(req.body?.visual_position || "bottom"),
        safe_padding: Math.max(0, Math.floor(Number(req.body?.visual_safe_padding ?? 48) || 48)),
        scale: Math.max(0.5, Math.min(2, Number(req.body?.visual_scale ?? 1) || 1)),
      };

      const audio = {
        enabled: !!req.body?.audio_enabled,
        url: String(req.body?.audio_url || "").trim() || null,
        volume: Math.max(0, Math.min(1, Number(req.body?.audio_volume ?? 0.6) || 0.6)),
      };

      await db.query(
        `
      UPDATE public.alert_rules
      SET
        name = $1,
        enabled = $2,
        event_types = $3::text[],
        priority = $4,
        duration_ms = $5,
        cooldown_seconds = $6,
        dedupe_window_seconds = $7,
        text_template = $8,
        visual_json = $9::jsonb,
        audio_json = $10::jsonb,
        conditions_json = $11::jsonb,
        actions_json = $12::jsonb
      WHERE id = $13 AND ruleset_id = $14
      `,
        [
          name,
          enabled,
          eventTypes,
          priority,
          durationMs,
          cooldownSeconds,
          dedupeWindowSeconds,
          textTemplate,
          JSON.stringify(visual),
          JSON.stringify(audio),
          JSON.stringify(conditions),
          JSON.stringify(actions),
          ruleId,
          rulesetId,
        ]
      );

      return res.redirect(`/dashboard/widgets/alerts/configure?rule_id=${encodeURIComponent(ruleId)}`);
    } catch (e) {
      console.error("[dashboard/widgets/alerts/save] failed:", e);
      return res.status(500).send("Failed to save alerts config.");
    }
  }
);

// POST /dashboard/widgets/alerts/regenerate
router.post("/widgets/alerts/regenerate", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const ownerUserId = Number(sessionUser.id);
    await regenerateAlertsPublicOverlay(ownerUserId);
    return res.redirect("/dashboard/widgets/alerts/configure");
  } catch (e) {
    console.error("[dashboard/widgets/alerts/regenerate] failed:", e?.message || e);
    return res.status(500).send("Failed to regenerate alerts URL.");
  }
});

// POST /dashboard/widgets/alerts/test (AJAX)
router.post(
  "/widgets/alerts/test",
  requireAuth,
  [express.json({ limit: "64kb" }), express.urlencoded({ extended: true, limit: "64kb" })],
  async (req, res) => {
    try {
      const ownerUserId = Number(req.session.user.id);
      await ensureDefaultAlertsRuleset(ownerUserId);

      const platform = String(req.body?.platform || "scraplet").trim().slice(0, 24);
      const type = String(req.body?.type || "test").trim().slice(0, 40);

      const actorName = String(req.body?.actor || "Scraplet").slice(0, 64);
      const text = String(req.body?.text || "").slice(0, 240);

      const countRaw = req.body?.count;
      const amountValRaw = req.body?.amount_value ?? req.body?.amount;
      const amountCurrencyRaw = req.body?.amount_currency ?? null;

      const count =
        countRaw !== undefined && String(countRaw).trim() !== ""
          ? Math.max(0, Math.floor(Number(countRaw) || 0))
          : null;

      const amountValue =
        amountValRaw !== undefined && String(amountValRaw).trim() !== ""
          ? Number(amountValRaw)
          : null;

      const amountCurrency = amountCurrencyRaw
        ? String(amountCurrencyRaw).trim().slice(0, 8)
        : platform === "kick"
          ? "KICKS"
          : "USD";

      const event = {
        v: 1,
        id: `evt_${Date.now()}`,
        ts: new Date().toISOString(),
        platform,
        type,
        actor: { display: actorName, username: actorName, id: null, avatar_url: null },
        message: { text: text || null },
        ...(count !== null ? { count } : {}),
        ...(amountValue !== null ? { amount: { value: amountValue, currency: amountCurrency } } : {}),
        meta: { source: "dashboard_test" },
      };

      // keep renderer contract: resolved_json.alert.text.resolved
      const resolved = {
        v: 1,
        event,
        alert: {
          name: "Test Alert",
          duration_ms: 6500,
          text: {
            template: "{actor.display} triggered an alert!",
            resolved: text ? text : `${actorName} triggered a test alert`,
          },
        },
      };

      const { rows } = await db.query(
        `
        INSERT INTO public.alert_queue
          (owner_user_id, status, priority, available_at, event_json, resolved_json)
        VALUES
          ($1, 'queued', 50, now(), $2::jsonb, $3::jsonb)
        RETURNING id
        `,
        [ownerUserId, JSON.stringify(event), JSON.stringify(resolved)]
      );

      return res.json({ ok: true, queued_id: rows[0]?.id || null });
    } catch (e) {
      console.error("[dashboard/widgets/alerts/test] failed:", e?.message || e);
      return res.status(500).json({ ok: false, reason: "enqueue_failed" });
    }
  }
);

/*
 * GET /dashboard
 */
router.get("/", requireAuth, async (req, res) => {
  // ─────────────────────────────────────────────
  // HARD GUARD: Dashboard must NEVER render in iframe
  // ─────────────────────────────────────────────
  const isIframe =
    req.headers["sec-fetch-dest"] === "iframe" ||
    req.headers["sec-fetch-site"] === "cross-site";

  if (isIframe) {
    return res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Redirecting…</title>
        </head>
        <body>
          <script>
            // Break out of iframe and load dashboard normally
            window.top.location.href = '/dashboard';
          </script>
        </body>
      </html>
    `);
  }

  // ─────────────────────────────────────────────
  // ORIGINAL ROUTE CONTINUES UNCHANGED
  // ─────────────────────────────────────────────

  const sessionUser = req.session.user;

  const host = req.get("host") || "scraplet.store";
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto?.split(",")[0] || req.protocol || "https";
  const profileUrl = `${protocol}://${host}/u/${sessionUser.username}`;

  // ─────────────────────────────────────────────
  // Kick connection state (DB truth; no refresh)
  // ─────────────────────────────────────────────
  let kick = {
    connected: false,
    username: null,
    needsReauth: false,

    // NEW (tile helpers, optional for views)
    state: "disconnected", // ok | reauth | disconnected
    primaryHref: "/auth/kick/start",
    primaryLabel: "Connect",
  };

  try {
    const { rows: acctRows } = await db.query(
      `
      SELECT username
      FROM public.external_accounts
      WHERE platform = 'kick' AND user_id = $1
      LIMIT 1
      `,
      [sessionUser.id]
    );

    const hasExternal = !!acctRows[0];
    if (acctRows[0]?.username) kick.username = acctRows[0].username;

    const { rows: tokenRows } = await db.query(
      `
      SELECT eat.refresh_token, eat.access_token, eat.expires_at
      FROM public.external_account_tokens eat
      JOIN public.external_accounts ea ON ea.id = eat.external_account_id
      WHERE ea.platform = 'kick' AND ea.user_id = $1
      LIMIT 1
      `,
      [sessionUser.id]
    );

    const t = tokenRows[0] || null;

    kick.connected = !!t?.refresh_token || !!t?.access_token;
    kick.needsReauth = hasExternal && !kick.connected;

    // Normalize tile state
    if (kick.connected) {
      kick.state = "ok";
      kick.primaryHref = null;
      kick.primaryLabel = null;
    } else if (kick.needsReauth) {
      kick.state = "reauth";
      kick.primaryHref = "/auth/kick/start";
      kick.primaryLabel = "Reconnect";
    } else {
      kick.state = "disconnected";
      kick.primaryHref = "/auth/kick/start";
      kick.primaryLabel = "Connect";
    }
  } catch (err) {
    console.warn("[dashboard] kick connection check failed:", err?.message || err);
    kick.connected = false;
    kick.needsReauth = false;
    kick.state = "disconnected";
    kick.primaryHref = "/auth/kick/start";
    kick.primaryLabel = "Connect";
  }

  // ─────────────────────────────────────────────
  // YouTube connection state (DB truth; expires-aware)
  // ─────────────────────────────────────────────
  let youtube = {
    connected: false,
    username: null,
    needsReauth: false,

    // NEW (tile helpers, optional for views)
    state: "not_linked", // ok | reauth | not_linked
    primaryHref: "/integrations/youtube/connect",
    primaryLabel: "Connect",
  };

  try {
    const yt = await getYouTubeIntegrationStatus(db, sessionUser.id);

    youtube.connected = !!yt.connected;
    youtube.username = yt.username || null;
    youtube.needsReauth = !!yt.needsReauth;
    youtube.state = yt.status;

    if (youtube.state === "ok") {
      youtube.primaryHref = null;
      youtube.primaryLabel = null;
    } else if (youtube.state === "reauth") {
      youtube.primaryHref = "/integrations/youtube/connect";
      youtube.primaryLabel = "Reconnect";
    } else {
      youtube.primaryHref = "/integrations/youtube/connect";
      youtube.primaryLabel = "Connect";
    }
  } catch (err) {
    console.warn("[dashboard] youtube connection check failed:", err?.message || err);
    youtube.connected = false;
    youtube.needsReauth = false;
    youtube.state = "not_linked";
    youtube.primaryHref = "/integrations/youtube/connect";
    youtube.primaryLabel = "Connect";
  }

  // ─────────────────────────────────────────────
  // YouTube LIVE badge (network; best-effort)
  // Shows LIVE / OFFLINE without affecting connected state
  // ─────────────────────────────────────────────
  try {
    // Only attempt when linked + recoverable
    if (youtube?.state === "ok") {
      const yt = await getYouTubeIntegrationStatus(db, sessionUser.id);

      // Prefer existing access token, refresh if missing/expired
      let accessToken = yt.accessToken || null;

      if (!accessToken || yt.isExpired) {
        try {
          const refreshed = await refreshYouTubeAccessToken(
            db,
            yt.externalAccountId,
            yt.refreshToken
          );
          accessToken = refreshed.accessToken;
        } catch (e) {
          // Stay stable; don't flip auth state because badge refresh failed
          accessToken = null;
        }
      }

      if (accessToken) {
        const live = await getYouTubeLiveBadge(accessToken);

        youtube.liveBadge = live?.ok
          ? { text: live.isLive ? "LIVE" : "OFFLINE", tone: live.isLive ? "good" : "neutral" }
          : { text: "STATUS UNKNOWN", tone: "neutral" };
      } else {
        // Connected (recoverable) but no usable token right now
        youtube.liveBadge = { text: "OFFLINE", tone: "neutral" };
      }
    }
  } catch (e) {
    // Never break dashboard render for badge issues
    youtube.liveBadge = null;
  }

  // ─────────────────────────────────────────────
  // Discord connection state (DB truth; no network)
  // ─────────────────────────────────────────────
  let discord = {
    connected: false,
    guildId: null,
    state: "not_linked", // ok | not_linked
    primaryHref: "/integrations/discord/connect",
    primaryLabel: "Connect",
  };

  try {
    const di = await getActiveDiscordIntegrationForUser(sessionUser.id);
    if (di?.guild_id) {
      discord.connected = true;
      discord.guildId = String(di.guild_id);
      discord.state = "ok";
      discord.primaryHref = "/dashboard/scrapbot/disco";
      discord.primaryLabel = "Configure";
    }
  } catch (e) {
    console.warn("[dashboard] discord integration check failed:", e?.message || e);
  }


  // ─────────────────────────────────────────────
  // Casino widgets
  // ─────────────────────────────────────────────
  let casino = null;
  try {
    const bj = await getOrCreateUserBlackjack(sessionUser.id);
    const pl = await getOrCreateUserPlinko(sessionUser.id);
    const ro = await getOrCreateUserRoulette(sessionUser.id);

    casino = {
      blackjack: {
        enabled: bj.is_enabled !== false,
        publicId: bj.public_id,
        config: bj.config_json || {},
      },
      plinko: {
        enabled: pl.is_enabled !== false,
        publicId: pl.public_id,
        config: pl.config_json || {},
      },
      roulette: {
        enabled: ro.is_enabled !== false,
        publicId: ro.public_id,
        config: ro.config_json || {},
      },
    };
  } catch (e) {
    console.warn("[dashboard] casino status load failed:", e?.message || e);
  }

  // ─────────────────────────────────────────────
  // Scrapbot status
  // ─────────────────────────────────────────────
  let scrapbotChannels = [];
  let scrapbotChannelsError = null;

  try {
    if (kick?.connected) {
      const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
      const url = `${base}/api/status/channels?platform=kick&owner_user_id=${encodeURIComponent(
        sessionUser.id
      )}`;

      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 1500);

      let r;
      try {
        r = await fetch(url, { signal: ac.signal });
      } finally {
        clearTimeout(t);
      }

      const j = await r.json().catch(() => null);

      if (r.ok && j?.ok && Array.isArray(j.channels)) {
        scrapbotChannels = j.channels;
      } else {
        scrapbotChannelsError = j?.error || `HTTP ${r.status}`;
      }
    }
  } catch (e) {
    scrapbotChannelsError = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
    console.warn("[dashboard] scrapbot status load failed:", scrapbotChannelsError);
  }

  // Fetch TikTok Status
  const { rows: tiktokRows } = await db.query(
    `SELECT * FROM external_accounts WHERE user_id = $1 AND platform = 'tiktok' LIMIT 1`,
    [sessionUser.id]
  );
  const tiktok = tiktokRows[0] || null;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  res.render("layout", {
    tabView: "dashboard",
    user: sessionUser,
    widgets,
    overlays,
    profileUrl,
    kick,
    youtube,
    discord,
    casino,
    baseUrl: getPublicBaseUrl(req),
    isPro: isProUser(sessionUser),
    scrapbotChannels,
    scrapbotChannelsError,
    tiktok, // Pass to view
  });
});

// (everything below here remains your existing file unchanged)
router.get("/api/stats/sparkline", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const { rows } = await db.query(
      `
      SELECT platform, followers, snapshot_date
      FROM public.user_stats_history
      WHERE user_id = $1
      ORDER BY snapshot_date ASC
      `,
      [userId]
    );

    const data = {};
    for (const r of rows) {
      const platform = String(r.platform || "unknown");
      const date = new Date(r.snapshot_date).toISOString().slice(0, 10);
      const followers = Number(r.followers ?? 0);

      if (!data[platform]) data[platform] = [];
      data[platform].push({ date, followers });
    }

    const MAX_POINTS = 90;
    for (const p of Object.keys(data)) {
      if (data[p].length > MAX_POINTS) data[p] = data[p].slice(-MAX_POINTS);
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[api/stats/sparkline] error:", err);
    return res.status(500).json({ success: false });
  }
});

router.get("/api/stats/engagement", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const requestedWindow = parseInt(req.query.window || "7", 10);
    const windowDays = [7, 30, 60].includes(requestedWindow) ? requestedWindow : 7;

    // Pull a chunk of visits (schema-agnostic) and do the time filtering in JS.
    // This avoids hard-coding a column like created_at/visited_at that might differ.
    const { rows: raw } = await db.query(
      `
      SELECT *
      FROM public.profile_visits
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT 5000
      `,
      [userId]
    );

    const now = Date.now();
    const dayMs = 86400000;

    const windowStart = now - windowDays * dayMs;
    const prevStart = now - windowDays * 2 * dayMs;

    const getTs = (r) => {
      const t = r.timestamp || r.visited_at || r.viewed_at || r.created_at || r.updated_at || null;
      const ms = t ? new Date(t).getTime() : NaN;
      return Number.isFinite(ms) ? ms : null;
    };

    // bucket counts per day for current window
    const byDay = new Map();
    let totalViews = 0;
    let prevTotal = 0;

    for (const r of raw) {
      const ts = getTs(r);
      if (!ts) continue;

      if (ts >= windowStart) {
        totalViews++;
        const d = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
        byDay.set(d, (byDay.get(d) || 0) + 1);
      } else if (ts >= prevStart && ts < windowStart) {
        prevTotal++;
      } else {
        // keep safe; do nothing
      }
    }

    // generate labels for every day in window (so chart always has consistent width)
    const labels = [];
    const values = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(now - i * dayMs).toISOString().slice(0, 10);
      labels.push(d);
      values.push(byDay.get(d) || 0);
    }

    const percentChange = prevTotal > 0 ? ((totalViews - prevTotal) / prevTotal) * 100 : 0;

    return res.json({
      ok: true,
      windowDays,
      totalViews,
      prevTotalViews: prevTotal,
      percentChange,
      labels,
      values,
    });
  } catch (err) {
    console.error("[stats/engagement] error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.get("/api/discord/guild-structure", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;

    const { rows } = await db.query(
      `
      SELECT guild_id
      FROM public.discord_guild_integrations
      WHERE owner_user_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [ownerUserId]
    );

    if (!rows[0]?.guild_id) {
      return res.json({ ok: false, error: "no_guild" });
    }

    const guildId = rows[0].guild_id;

    const r = await fetch(
      `http://localhost:3025/internal/guild/${guildId}/structure`
    ).catch(() => null);

    const j = await (r ? r.json().catch(() => null) : null);

    if (!r || !r.ok || !j) {
      return res.status(500).json({ ok: false, error: j?.error || "bot_offline" });
    }

    return res.json({ ok: true, channels: j.channels, roles: j.roles });

  } catch (e) {
    console.error("[discord guild-structure] failed:", e);
    return res.status(500).json({ ok: false });
  }
});

router.get("/api/discord/mode-b/state", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;

    const { rows: guildRows } = await db.query(
      `
      SELECT guild_id
      FROM public.discord_guild_integrations
      WHERE owner_user_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [ownerUserId]
    );

    if (!guildRows[0]) {
      return res.json({ ok: true, channel: null, roles: [], recent: [] });
    }

    const guildId = guildRows[0].guild_id;

    const { rows: channelRows } = await db.query(
      `
      SELECT channel_id
      FROM public.discord_channel_rules
      WHERE guild_id = $1 AND enabled = true
      LIMIT 1
      `,
      [guildId]
    );

    const { rows: roleRows } = await db.query(
      `
      SELECT role_id
      FROM public.discord_role_rules
      WHERE guild_id = $1 AND can_react_show = true
      `,
      [guildId]
    );

    const { rows: recentRows } = await db.query(
      `
      SELECT payload, created_at
      FROM public.producer_outbox
      WHERE owner_user_id = $1
        AND target = 'overlay_gate'
      ORDER BY created_at DESC
      LIMIT 25
      `,
      [ownerUserId]
    );

    return res.json({
      ok: true,
      channel: channelRows[0]?.channel_id || null,
      roles: roleRows.map(r => r.role_id),
      recent: recentRows.map(r => ({
        ts: r.created_at,
        payload: r.payload
      }))
    });

  } catch (e) {
    console.error("[discord mode-b state] failed:", e);
    return res.status(500).json({ ok: false });
  }
});

router.post("/api/discord/mode-b/channel", requireAuth, express.json(), async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;
    const channelId = String(req.body?.channelId || "").trim();
    if (!channelId) return res.status(400).json({ ok: false });

    const { rows } = await db.query(
      `
      SELECT guild_id
      FROM public.discord_guild_integrations
      WHERE owner_user_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [ownerUserId]
    );

    if (!rows[0]) return res.status(400).json({ ok: false });

    const guildId = rows[0].guild_id;

    await db.query(
      `DELETE FROM public.discord_channel_rules WHERE guild_id = $1`,
      [guildId]
    );

    await db.query(
      `
      INSERT INTO public.discord_channel_rules
      (guild_id, channel_id, enabled, mode, show_ttl_seconds)
      VALUES ($1, $2, true, 'producer', 12)
      `,
      [guildId, channelId]
    );

    return res.json({ ok: true });

  } catch (e) {
    console.error("[mode-b set channel] failed:", e);
    return res.status(500).json({ ok: false });
  }
});

router.post("/api/discord/mode-b/role", requireAuth, express.json(), async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;
    const roleId = String(req.body?.roleId || "").trim();
    if (!roleId) return res.status(400).json({ ok: false });

    const { rows } = await db.query(
      `
      SELECT guild_id
      FROM public.discord_guild_integrations
      WHERE owner_user_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [ownerUserId]
    );

    if (!rows[0]) return res.status(400).json({ ok: false });

    const guildId = rows[0].guild_id;

    await db.query(
      `
      INSERT INTO public.discord_role_rules
      (guild_id, role_id, can_react_show, can_slash_control)
      VALUES ($1, $2, true, false)
      ON CONFLICT DO NOTHING
      `,
      [guildId, roleId]
    );

    return res.json({ ok: true });

  } catch (e) {
    console.error("[mode-b add role] failed:", e);
    return res.status(500).json({ ok: false });
  }
});

router.delete("/api/discord/mode-b/role/:roleId", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;
    const roleId = String(req.params.roleId || "").trim();

    const { rows } = await db.query(
      `
      SELECT guild_id
      FROM public.discord_guild_integrations
      WHERE owner_user_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [ownerUserId]
    );

    if (!rows[0]) return res.status(400).json({ ok: false });

    const guildId = rows[0].guild_id;

    await db.query(
      `
      DELETE FROM public.discord_role_rules
      WHERE guild_id = $1 AND role_id = $2
      `,
      [guildId, roleId]
    );

    return res.json({ ok: true });

  } catch (e) {
    console.error("[mode-b remove role] failed:", e);
    return res.status(500).json({ ok: false });
  }
});

// GET /dashboard/api/discord/config
router.get("/api/discord/config", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;

    const integration = await getActiveDiscordIntegrationForUser(ownerUserId);
    if (!integration?.guild_id) {
      return res.json({ ok: false, error: "no_active_guild" });
    }

    const guildId = String(integration.guild_id);

    const { rows: channelRows } = await db.query(
      `
      SELECT channel_id
      FROM public.discord_channel_rules
      WHERE guild_id = $1
        AND enabled = true
      LIMIT 1
      `,
      [guildId]
    );

    const { rows: roleRows } = await db.query(
      `
      SELECT role_id
      FROM public.discord_role_rules
      WHERE guild_id = $1
        AND can_react_show = true
      `,
      [guildId]
    );

    return res.json({
      ok: true,
      guildId,
      channelId: channelRows[0]?.channel_id || null,
      roleIds: roleRows.map(r => r.role_id),
    });

  } catch (err) {
    console.error("[discord/config GET] failed:", err);
    return res.status(500).json({ ok: false });
  }
});

// POST /dashboard/api/discord/config
router.post(
  "/api/discord/config",
  requireAuth,
  express.json({ limit: "32kb" }),
  async (req, res) => {
    const client = await db.connect();

    try {
      const ownerUserId = req.session.user.id;
      const { channelId, roleIds } = req.body || {};

      if (!channelId) {
        return res.status(400).json({ ok: false, error: "channel_required" });
      }

      const integration = await getActiveDiscordIntegrationForUser(ownerUserId);
      if (!integration?.guild_id) {
        return res.status(400).json({ ok: false, error: "no_active_guild" });
      }

      const guildId = String(integration.guild_id);
      const roles = Array.isArray(roleIds)
        ? roleIds.map(String)
        : [];

      await client.query("BEGIN");

      // 1️⃣ Upsert single producer channel
      await client.query(
        `
        DELETE FROM public.discord_channel_rules
        WHERE guild_id = $1
        `,
        [guildId]
      );

      await client.query(
        `
        INSERT INTO public.discord_channel_rules
          (guild_id, channel_id, enabled, mode, show_ttl_seconds)
        VALUES
          ($1, $2, true, 'producer', 12)
        `,
        [guildId, String(channelId)]
      );

      // 2️⃣ Replace role rules
      await client.query(
        `
        DELETE FROM public.discord_role_rules
        WHERE guild_id = $1
        `,
        [guildId]
      );

      if (roles.length) {
        const values = roles.map((_, i) => `($1, $${i + 2}, true, false)`).join(",");

        await client.query(
          `
          INSERT INTO public.discord_role_rules
            (guild_id, role_id, can_react_show, can_slash_control)
          VALUES ${values}
          `,
          [guildId, ...roles]
        );
      }

      await client.query("COMMIT");

      return res.json({ ok: true });

    } catch (err) {
      await client.query("ROLLBACK").catch(() => null);
      console.error("[discord/config POST] failed:", err);
      return res.status(500).json({ ok: false });
    } finally {
      client.release();
    }
  }
);


// GET /dashboard/api/discord/producer-log
router.get("/api/discord/producer-log", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;

    const { rows } = await db.query(
      `
      SELECT event_id, payload, created_at
      FROM public.producer_outbox
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [ownerUserId]
    );

    return res.json({
      ok: true,
      items: rows,
    });

  } catch (err) {
    console.error("[discord/producer-log] failed:", err);
    return res.status(500).json({ ok: false });
  }
});

function normalizeGuildStructure(j) {
  // supports:
  // 1) { ok:true, channels:[], roles:[] }   (dashboard api)
  // 2) { channels:[], roles:[] }           (internal)
  // 3) { ok:true, data:{ channels:[], roles:[] } } (some wrappers)
  const src = (j && (j.data || j.structure || j)) || {};
  const channels = Array.isArray(src.channels) ? src.channels : [];
  const roles = Array.isArray(src.roles) ? src.roles : [];
  return { channels, roles };
}

async function loadGuildStructure() {
  const r = await fetch("/dashboard/api/discord/guild-structure", {
    headers: { "accept": "application/json" }
  });
  const j = await r.json().catch(() => ({}));

  const { channels, roles } = normalizeGuildStructure(j);

  console.log("[disco] guild-structure raw:", j);
  console.log("[disco] channels:", channels.length, "roles:", roles.length);

  // if these log 0/0, you’re still pointing at the wrong endpoint
  // OR you’re failing auth and getting HTML/redirect instead of JSON.
}


// GET /dashboard/api/discord/guild-structure
router.get("/api/discord/guild-structure", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;

    const integration = await getActiveDiscordIntegrationForUser(ownerUserId);
    if (!integration?.guild_id) {
      return res.json({ ok: false, error: "no_active_guild" });
    }

    const guildId = String(integration.guild_id);

    const r = await fetch(
      `http://127.0.0.1:3025/internal/guild/${guildId}/structure`
    ).catch(() => null);

    if (!r || !r.ok) {
      return res.status(500).json({ ok: false, error: "bot_offline" });
    }

    const data = await r.json();

    return res.json({
      ok: true,
      structure: data,
    });

  } catch (err) {
    console.error("[discord/guild-structure] failed:", err);
    return res.status(500).json({ ok: false });
  }
});




router.get("/api/stats/audience-growth", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const requestedDays = parseInt(req.query.days || "30", 10);
    const days = [14, 30, 60, 90].includes(requestedDays) ? requestedDays : 30;

    const { rows } = await db.query(
      `
      SELECT platform, followers, snapshot_date
      FROM public.user_stats_history
      WHERE user_id = $1
      ORDER BY snapshot_date ASC
      `,
      [userId]
    );

    // Pivot by date → totals
    const totalsByDate = new Map(); // date -> total followers
    for (const r of rows) {
      const date = new Date(r.snapshot_date).toISOString().slice(0, 10);
      const followers = Number(r.followers ?? 0);
      totalsByDate.set(date, (totalsByDate.get(date) || 0) + followers);
    }

    const labelsAll = Array.from(totalsByDate.keys()).sort();
    const labels = labelsAll.slice(Math.max(0, labelsAll.length - days));
    const values = labels.map((d) => totalsByDate.get(d) || 0);

    return res.json({
      success: true,
      labels,
      values,
      days,
    });
  } catch (err) {
    console.error("[api/stats/audience-growth] error:", err);
    return res.status(500).json({ success: false });
  }
});

/**
 * GET /dashboard/stats
 */
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const pageLayout = getEffectivePageLayout(userId, "stats");

    // -----------------------------
    // Window selector (7 / 30 / 60)
    // -----------------------------
    const requestedWindow = parseInt(req.query.window || "7", 10);
    const selectedWindow = [7, 30, 60].includes(requestedWindow) ? requestedWindow : 7;

    // -----------------------------
    // Warm stats (best effort)
    // -----------------------------
    try {
      const handles = await getHandlesForUser(userId);
      await getStatsForUser({
        userId,
        youtube: handles.youtube ?? null,
        twitch: handles.twitch ?? null,
        kick: handles.kick ?? null,
        instagram: handles.instagram ?? null,
        tiktok: handles.tiktok ?? null,
        x: handles.x ?? null,
        facebook: handles.facebook ?? null,
      });
    } catch (e) {
      console.warn("[dashboard/stats] warmup failed:", e.message);
    }

    // -----------------------------
    // Core platform stats
    // -----------------------------
    const { rows } = await db.query(
      `
      SELECT followers, ccv, engagement, marketability, last_updated
      FROM public.user_stats
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    let stats = [];
    let marketabilityGrade = "F";
    let lastUpdated = null;

    if (rows.length) {
      const row = rows[0];
      const followers = row.followers || {};
      const ccv = row.ccv || {};
      const engagement = row.engagement || {};

      const platforms = new Set([
        ...Object.keys(followers),
        ...Object.keys(ccv),
        ...Object.keys(engagement),
      ]);

      stats = Array.from(platforms).map((platform) => ({
        platform,
        followers: Number(followers[platform] ?? 0),
        ccv: Number(ccv[platform] ?? 0),
        engagement: Number(engagement[platform] ?? 0),
        last_updated: row.last_updated,
      }));

      marketabilityGrade =
        row.marketability ||
        calculateMarketability(
          stats.map((s) => ({
            followers: s.followers,
            ccv: s.ccv,
            last_updated: s.last_updated,
          }))
        );

      lastUpdated = row.last_updated;
    }

    // -----------------------------
    // Trends (already implemented)
    // -----------------------------
    const { rows: historyRows } = await db.query(
      `
      SELECT platform, followers, snapshot_date
      FROM public.user_stats_history
      WHERE user_id = $1
      ORDER BY snapshot_date ASC
      `,
      [userId]
    );

    const weeklyTrends = historyRows.length ? [] : [];

    // -----------------------------
    // PROFILE ANALYTICS (real data)
    // -----------------------------
    let profileAnalytics = { views: 0 };
    let referrerStats = [];
    let clickBuckets = [];
    let clickDetails = [];
    let heatmapPoints = [];
    let profileEngagementTrend = { percentChange: 0, dailyViews: [] };

    try {
      // Total views in selected window
      const { rows: viewRows } = await db.query(
        `SELECT COUNT(*) AS total,
                COUNT(DISTINCT ip_hash) AS unique_visitors
         FROM public.profile_views
         WHERE user_id = $1
           AND visited_at >= NOW() - ($2 || ' days')::interval`,
        [userId, selectedWindow]
      );
      profileAnalytics = {
        views: parseInt(viewRows[0]?.total || 0),
        uniqueVisitors: parseInt(viewRows[0]?.unique_visitors || 0),
      };

      // Daily views for trend
      const { rows: dailyRows } = await db.query(
        `SELECT DATE(visited_at) AS day, COUNT(*) AS views
         FROM public.profile_views
         WHERE user_id = $1
           AND visited_at >= NOW() - ($2 || ' days')::interval
         GROUP BY day ORDER BY day ASC`,
        [userId, selectedWindow]
      );
      const dailyViews = dailyRows.map(r => ({ date: r.day, views: parseInt(r.views) }));

      // Trend: compare last half vs first half of window
      const half = Math.floor(dailyViews.length / 2);
      const firstHalf = dailyViews.slice(0, half).reduce((s, r) => s + r.views, 0);
      const secondHalf = dailyViews.slice(half).reduce((s, r) => s + r.views, 0);
      const pctChange = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;
      profileEngagementTrend = { percentChange: pctChange, dailyViews };

      // Top referrers
      const { rows: refRows } = await db.query(
        `SELECT referrer, COUNT(*) AS count
         FROM public.profile_views
         WHERE user_id = $1
           AND visited_at >= NOW() - ($2 || ' days')::interval
           AND referrer IS NOT NULL AND referrer != ''
         GROUP BY referrer ORDER BY count DESC LIMIT 10`,
        [userId, selectedWindow]
      );
      referrerStats = refRows.map(r => ({ referrer: r.referrer, count: parseInt(r.count) }));

      // Click buckets by element type
      const { rows: bucketRows } = await db.query(
        `SELECT element_type, COUNT(*) AS count
         FROM public.profile_clicks
         WHERE user_id = $1
           AND clicked_at >= NOW() - ($2 || ' days')::interval
         GROUP BY element_type ORDER BY count DESC`,
        [userId, selectedWindow]
      );
      clickBuckets = bucketRows.map(r => ({ type: r.element_type, count: parseInt(r.count) }));

      // Click details (top clicked elements)
      const { rows: detailRows } = await db.query(
        `SELECT element_type, element_label, COUNT(*) AS count
         FROM public.profile_clicks
         WHERE user_id = $1
           AND clicked_at >= NOW() - ($2 || ' days')::interval
         GROUP BY element_type, element_label ORDER BY count DESC LIMIT 20`,
        [userId, selectedWindow]
      );
      clickDetails = detailRows.map(r => ({
        type: r.element_type,
        label: r.element_label,
        count: parseInt(r.count)
      }));

      // Heatmap points from click data
      heatmapPoints = detailRows.map((r, i) => ({
        type: r.element_type,
        label: r.element_label,
        clicks: parseInt(r.count),
        x: r.element_type === 'button' ? 50 + (i % 3) * 20 : r.element_type === 'social' ? 20 + i * 15 : 50,
        y: r.element_type === 'button' ? 60 + Math.floor(i / 3) * 15 : r.element_type === 'social' ? 40 : 70 + i * 10,
        intensity: Math.min(1, parseInt(r.count) / 10),
      }));
    } catch (analyticsErr) {
      console.warn('[dashboard/stats] profile analytics query failed:', analyticsErr.message);
    }

    // -----------------------------
    // Render
    // -----------------------------
    res.render("layout", {
      tabView: "dashboard-stats",
      user: sessionUser,
      isPro: isProUser(sessionUser),
      pageLayout,

      stats,
      weeklyTrends,
      marketabilityGrade,
      lastUpdated,

      selectedWindow,

      // profile analytics
      profileAnalytics,
      referrerStats,
      clickBuckets,
      clickDetails,
      heatmapPoints,
      profileEngagementTrend,
    });
  } catch (err) {
    console.error("[dashboard/stats] fatal:", err);
    res.status(500).render("500");
  }
});

/**
 * GET /dashboard/metrics
 */
router.get("/metrics", requireAuth, (req, res) => {
  res.render("layout", {
    tabView: "dashboard-metrics",
    user: req.session.user,
    isPro: isProUser(req.session.user),
  });
});

/**
 * GET /dashboard/email
 */
router.get("/email", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const pro = isProUser(sessionUser);

    // Filters for subscribers table (keep it simple + safe)
    const subscribersStatus = String(req.query.status || "").toLowerCase(); // "active" | "unsubscribed" | ""
    const subscribersSearch = String(req.query.search || "").trim();

    // Subscribers list (up to 500, like the UI copy says)
    const subsWhere = [`user_id = $1`];
    const subsArgs = [userId];
    let argi = subsArgs.length;

    if (subscribersStatus === "active") {
      subsWhere.push(`unsubscribed = FALSE`);
    } else if (subscribersStatus === "unsubscribed") {
      subsWhere.push(`unsubscribed = TRUE`);
    }

    if (subscribersSearch) {
      subsArgs.push(`%${subscribersSearch}%`);
      argi = subsArgs.length;
      subsWhere.push(`email ILIKE $${argi}`);
    }

    const subscribersQuery = `
      SELECT
        id,
        email,
        created_at,
        updated_at,
        unsubscribed,
        source_slug
      FROM public.email_subscribers
      WHERE ${subsWhere.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 500
    `;

    const [
      // Overview counts
      { rows: subRows },
      { rows: sendRows },

      // Settings row
      { rows: settingsRows },

      // Template counts
      { rows: templateCountRows },

      // Campaign counts
      { rows: campaignCountRows },

      // Templates (system + user)
      { rows: templatesRows },

      // Campaigns (pro only, else empty)
      { rows: campaignsRows },

      // Subscribers list
      { rows: subscribersRows },
    ] = await Promise.all([
      db.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE unsubscribed = false) AS active_count,
          COUNT(*) AS total_count,
          COALESCE(MAX(updated_at), MAX(created_at)) AS last_subscribed_at
        FROM public.email_subscribers
        WHERE user_id = $1
        `,
        [userId]
      ),
      db.query(
        `
        SELECT
          COUNT(*) AS total_emails_sent,
          MAX(sent_at) AS last_send_at
        FROM public.email_sends
        WHERE user_id = $1
        `,
        [userId]
      ),

      db.query(
        `
        SELECT
          go_live_email_kick_enabled,
          go_live_template_id,
          last_go_live_email_at
        FROM public.email_settings
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId]
      ),

      db.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE user_id IS NULL) AS system_templates,
          COUNT(*) FILTER (WHERE user_id = $1)   AS user_templates
        FROM public.email_templates
        WHERE (user_id IS NULL OR user_id = $1)
        `,
        [userId]
      ),

      db.query(
        `
        SELECT
          COUNT(*) AS total_campaigns,
          COUNT(*) FILTER (WHERE status = 'draft')     AS draft_campaigns,
          COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled_campaigns,
          COUNT(*) FILTER (WHERE status = 'sent')      AS sent_campaigns
        FROM public.email_campaigns
        WHERE user_id = $1
        `,
        [userId]
      ),

      db.query(
        `
        SELECT
          id,
          user_id,
          name,
          kind,
          subject,
          description,
          created_at,
          updated_at
        FROM public.email_templates
        WHERE (user_id IS NULL OR user_id = $1)
        ORDER BY
          CASE WHEN user_id IS NULL THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST,
          created_at DESC
        LIMIT 200
        `,
        [userId]
      ),

      pro
        ? db.query(
          `
            SELECT
              c.id,
              c.user_id,
              c.name,
              c.template_id,
              c.status,
              c.scheduled_at,
              c.created_at,
              c.updated_at,
              COALESCE(MAX(es.sent_at), NULL)      AS last_sent_at,
              COALESCE(SUM(es.recipients), 0)     AS total_recipients
            FROM public.email_campaigns c
            LEFT JOIN public.email_sends es
              ON es.campaign_id = c.id
            WHERE c.user_id = $1
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT 50
            `,
          [userId]
        )
        : Promise.resolve({ rows: [] }),

      db.query(subscribersQuery, subsArgs),
    ]);

    const sub = subRows[0] || {};
    const send = sendRows[0] || {};

    const overview = {
      totalSubscribers: Number(sub.total_count || 0),
      activeSubscribers: Number(sub.active_count || 0),
      lastSubscribedAt: sub.last_subscribed_at || null,
      totalEmailsSent: Number(send.total_emails_sent || 0),
      lastSendAt: send.last_send_at || null,

      // UI references this in places — keep it defined (we can make it “real” later)
      goLiveThisMonth: 0,
    };

    const emailSettings = settingsRows[0]
      ? {
        go_live_email_kick_enabled: !!settingsRows[0].go_live_email_kick_enabled,
        go_live_template_id: settingsRows[0].go_live_template_id,
        last_go_live_email_at: settingsRows[0].last_go_live_email_at,
      }
      : {
        go_live_email_kick_enabled: false,
        go_live_template_id: null,
        last_go_live_email_at: null,
      };

    const tcr = templateCountRows[0] || {};
    const emailTemplateCounts = {
      systemTemplates: Number(tcr.system_templates || 0),
      userTemplates: Number(tcr.user_templates || 0),
    };

    const ccr = campaignCountRows[0] || {};
    const emailCampaignCounts = {
      totalCampaigns: Number(ccr.total_campaigns || 0),
      draftCampaigns: Number(ccr.draft_campaigns || 0),
      scheduledCampaigns: Number(ccr.scheduled_campaigns || 0),
      sentCampaigns: Number(ccr.sent_campaigns || 0),
    };

    const systemTemplates = (templatesRows || []).filter((t) => t.user_id == null);
    const userTemplates = (templatesRows || []).filter((t) => t.user_id === userId);

    const emailCampaigns = campaignsRows || [];
    const emailSubscribers = subscribersRows || [];

    return res.render("layout", {
      tabView: "tabs/email",
      user: sessionUser,
      isPro: pro,

      emailOverview: overview,
      emailSettings,

      emailTemplateCounts,
      emailCampaignCounts,

      systemTemplates,
      userTemplates,
      emailCampaigns,

      emailSubscribers,
      subscribersStatus,
      subscribersSearch,
    });
  } catch (err) {
    console.error("Error loading email dashboard:", err);
    return res.status(500).render("500");
  }
});

// =====================================
// WIDGETS (chat overlay is special-cased)
// =====================================

/**
 * GET /dashboard/widgets and /dashboard/account
 */
router.get(["/widgets", "/account"], requireAuth, (req, res) => {
  const tab = req.path.replace(/^\//, "");
  res.render("layout", {
    tabView: `tabs/${tab}`,
    user: req.session.user,
    isPro: isProUser(req.session.user),
  });
});

/**
 * Bridge: /dashboard/widgets/chat -> configure
 */
router.get("/widgets/:id", requireAuth, (req, res) => {
  const widgetId = String(req.params.id || "").toLowerCase();
  if (widgetId === "chat") return res.redirect("/dashboard/widgets/chat/configure");
  return res.redirect(`/dashboard/widgets/${encodeURIComponent(widgetId)}/configure`);
});

/**
 * Widget preview:
 * - chat: redirect to the real OBS renderer (/obs/chat/:publicId)
 */
router.get("/widgets/preview/:id", requireAuth, async (req, res) => {
  const widgetId = String(req.params.id || "").toLowerCase();

  if (widgetId === "chat") {
    const sessionUser = req.session.user;
    const row = await getOrCreateUserChatOverlay(sessionUser.id);
    return res.redirect(`/obs/chat/${encodeURIComponent(row.public_id)}`);
  }

  // fallback for other widgets
  const config = global.widgetConfigs?.[widgetId] || {};
  return res.render(`widgets/${widgetId}`, { config });
});

/**
 * Chat overlay configure (renders INSIDE dashboard layout theme)
 * GET /dashboard/widgets/chat/configure
 */
router.get("/widgets/chat/configure", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const row = await getOrCreateUserChatOverlay(sessionUser.id);

    const host = req.get("host") || "scraplet.store";
    const proto =
      (req.headers["x-forwarded-proto"] || req.protocol || "https")
        .toString()
        .split(",")[0]
        .trim() || "https";

    const publicId = row.public_id;
    const obsPathOnly = `/obs/chat/${encodeURIComponent(publicId)}`;
    const obsUrl = `${proto}://${host}${obsPathOnly}`;

    const flash = {
      success: req.query.ok ? "Saved." : "",
      error: req.query.err ? "Save failed. Check logs." : "",
    };

    // IMPORTANT: render through layout to get header/footer/theme
    return res.render("layout", {
      tabView: "tabs/chat-overlay",
      user: sessionUser,
      isPro: isProUser(sessionUser),
      widget: row,
      cfg: row.config_json || {},
      obsUrl,
      obsPathOnly,
      flash,
      presets: CHAT_OVERLAY_PRESETS,
    });
  } catch (e) {
    console.error("[dashboard] chat overlay configure failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

/**
 * Chat overlay save (DB-backed)
 * POST /dashboard/widgets/chat/save
 *
 * NOTE: dashboard router is mounted at /dashboard already,
 * so the route path here MUST be "/widgets/chat/save"
 */
router.post("/widgets/chat/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user; // match configure route style
    const ownerUserId = sessionUser.id;

    const action = String(req.body?._action || "").trim();

    // ---- robust body value readers (handles duplicate keys / arrays) ----

    const norm = (v) => {
      // Express can give string OR array when same field name appears multiple times.
      if (Array.isArray(v)) return v.map((x) => String(x ?? "")).filter(Boolean);
      if (v == null) return [];
      return [String(v)];
    };

    const isTruthyToken = (s) => {
      const t = String(s ?? "").toLowerCase().trim();
      return t === "1" || t === "true" || t === "on" || t === "yes";
    };

    const truthy = (v) => {
      // If any submitted token is truthy -> true.
      // This makes hidden+checkbox patterns reliable across parsers.
      const tokens = norm(v);
      return tokens.some(isTruthyToken);
    };

    const firstScalar = (v, fallback = "") => {
      const tokens = norm(v);
      return tokens.length ? tokens[tokens.length - 1] : fallback;
      // ^ last token is usually the user-facing one, but even if parser collapses,
      // this still works because tokens would be length 1.
    };

    const intOr = (v, fallback) => {
      const s = firstScalar(v, "");
      const n = Number.parseInt(s, 10);
      return Number.isFinite(n) ? n : fallback;
    };

    const floatOr = (v, fallback) => {
      const s = firstScalar(v, "");
      const n = Number.parseFloat(s);
      return Number.isFinite(n) ? n : fallback;
    };

    // ---- reset ----
    if (action === "reset") {
      await updateUserChatOverlay(ownerUserId, CHAT_OVERLAY_DEFAULTS);
      return res.redirect("/dashboard/widgets/chat/configure");
    }

    // ---- build patch ----
    const patch = {
      fontFamily: firstScalar(req.body.fontFamily, CHAT_OVERLAY_DEFAULTS.fontFamily),
      fontSizePx: intOr(req.body.fontSizePx, CHAT_OVERLAY_DEFAULTS.fontSizePx),
      lineHeight: floatOr(req.body.lineHeight, CHAT_OVERLAY_DEFAULTS.lineHeight),
      messageGapPx: intOr(req.body.messageGapPx, CHAT_OVERLAY_DEFAULTS.messageGapPx),

      showAvatars: truthy(req.body.showAvatars),
      showPlatformIcon: truthy(req.body.showPlatformIcon),
      shadow: truthy(req.body.shadow),

      usernameColorMode: firstScalar(
        req.body.usernameColorMode,
        CHAT_OVERLAY_DEFAULTS.usernameColorMode
      ),
      nameColor: firstScalar(req.body.nameColor, CHAT_OVERLAY_DEFAULTS.nameColor),
      messageColor: firstScalar(req.body.messageColor, CHAT_OVERLAY_DEFAULTS.messageColor),

      emoteSizePx: intOr(req.body.emoteSizePx, 28),
      hideCommands: truthy(req.body.hideCommands),

      animation: firstScalar(req.body.animation, "fade"),
      maxMessageWidthPx: intOr(req.body.maxMessageWidthPx, 0),
      platformAccentMode: firstScalar(req.body.platformAccentMode, "bar"),

      transform: {
        enabled: truthy(req.body.transformEnabled),
        perspectivePx: intOr(req.body.transformPerspectivePx, 1000),
        x: intOr(req.body.transformX, 0),
        y: intOr(req.body.transformY, 0),
        scale: floatOr(req.body.transformScale, 1),
        rotateZ: floatOr(req.body.transformRotateZ, 0),
        tiltX: floatOr(req.body.transformTiltX, 0),
        tiltY: floatOr(req.body.transformTiltY, 0),
      },


      // Layout / ticker
      layoutOrientation: firstScalar(
        req.body.layoutOrientation,
        CHAT_OVERLAY_DEFAULTS.layoutOrientation || "vertical"
      ),
      horizontalMode: firstScalar(
        req.body.horizontalMode,
        CHAT_OVERLAY_DEFAULTS.horizontalMode || "ticker"
      ),
      stripHeightPx: intOr(req.body.stripHeightPx, CHAT_OVERLAY_DEFAULTS.stripHeightPx || 240),
      tickerPps: intOr(req.body.tickerPps, CHAT_OVERLAY_DEFAULTS.tickerPps || 140),
      tickerGapPx: intOr(req.body.tickerGapPx, CHAT_OVERLAY_DEFAULTS.tickerGapPx || 12),
      carouselHoldMs: intOr(req.body.carouselHoldMs, CHAT_OVERLAY_DEFAULTS.carouselHoldMs || 3500),




      bubble: {
        enabled: truthy(req.body.bubbleEnabled),
        radiusPx: intOr(req.body.bubbleRadiusPx, CHAT_OVERLAY_DEFAULTS.bubble.radiusPx),
        bg: firstScalar(req.body.bubbleBg, CHAT_OVERLAY_DEFAULTS.bubble.bg),
        border: firstScalar(req.body.bubbleBorder, CHAT_OVERLAY_DEFAULTS.bubble.border),
      },

      outline: {
        enabled: truthy(req.body.outlineEnabled),
        px: intOr(req.body.outlinePx, CHAT_OVERLAY_DEFAULTS.outline.px),
        color: firstScalar(req.body.outlineColor, CHAT_OVERLAY_DEFAULTS.outline.color),
      },

      limits: {
        maxMessages: intOr(req.body.maxMessages, CHAT_OVERLAY_DEFAULTS.limits.maxMessages),
        fadeMs: intOr(req.body.fadeMs, CHAT_OVERLAY_DEFAULTS.limits.fadeMs),
      },

      pinned: {
        enabled: truthy(req.body.pinnedEnabled),
        text: firstScalar(req.body.pinnedText, ""),
        style: firstScalar(req.body.pinnedStyle, "bubble"),
      },

      smoothing: {
        enabled: truthy(req.body.smoothingEnabled),
        rateLimitPerSec: intOr(req.body.smoothingRateLimitPerSec, 12),
        dedupeEnabled: truthy(req.body.smoothingDedupeEnabled),
        dedupeWindowMs: intOr(req.body.smoothingDedupeWindowMs, 2500),
      },
    };

    console.log("[chat save] raw showAvatars=", req.body.showAvatars, " bubbleEnabled=", req.body.bubbleEnabled);
    console.log("[chat save] parsed showAvatars=", patch.showAvatars, " bubble.enabled=", patch.bubble.enabled, " shadow=", patch.shadow);


    await updateUserChatOverlay(ownerUserId, patch);

    // Autosave fetch expects 200; full submit redirects
    const wantsJson =
      String(req.headers["accept"] || "").includes("application/json") ||
      String(req.headers["x-requested-with"] || "").toLowerCase() === "fetch";

    if (wantsJson) return res.json({ ok: true });
    return res.redirect("/dashboard/widgets/chat/configure?ok=1");
  } catch (err) {
    console.error("[chatOverlay save] error:", err);
    return res.status(500).json({ ok: false });
  }
});


// POST /dashboard/widgets/chat/test
// NOTE: router mounted at /dashboard -> path must be "/widgets/chat/test"
router.post("/widgets/chat/test", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const ownerUserId = sessionUser.id;

    const platform = String(req.body?.platform || "kick").slice(0, 32);
    const name = String(req.body?.name || "Scraplet").slice(0, 64);
    const avatar = String(req.body?.avatar || "").slice(0, 500);
    const text = String(req.body?.text || "HELLO FROM TEST ✅").slice(0, 400);

    const msg = {
      id: `test_${Date.now()}`,
      platform,
      channel: null,
      user: { name, avatar },
      badges: [],
      text,
      ts: Date.now(),
    };

    const out = await enqueueChatForUser(ownerUserId, msg);
    return res.json({ ok: !!out?.ok });
  } catch (err) {
    console.error("[chatOverlay test] error:", err);
    return res.status(500).json({ ok: false });
  }
});




/**
 * Save widget config:
 * - chat: DB-backed route
 * - others: keep existing in-memory behavior
 */
router.post("/widgets/:id/save", requireAuth, async (req, res) => {
  const widgetId = String(req.params.id || "").toLowerCase();

  // Blackjack config save (in-memory for now)
  if (widgetId === "blackjack") {
    const action = String(req.body?._action || "").toLowerCase();

    global.widgetConfigs = global.widgetConfigs || {};

    if (action === "reset") {
      delete global.widgetConfigs.blackjack;
      return res.redirect("/dashboard/widgets/blackjack/configure");
    }

    const enabled = req.body.enabled === "true" || req.body.enabled === "on" || req.body.enabled === "1";

    const narrationEnabled =
      req.body.narrationEnabled === "true" || req.body.narrationEnabled === "on" || req.body.narrationEnabled === "1";

    const verbosityRaw = parseInt(req.body.narrationVerbosity || "2", 10);
    const narrationVerbosity = [1, 2, 3].includes(verbosityRaw) ? verbosityRaw : 2;

    global.widgetConfigs.blackjack = {
      enabled,
      narrationEnabled,
      narrationVerbosity,
    };

    return res.redirect("/dashboard/widgets/blackjack/configure");
  }

  // Chat is DB-backed
  if (widgetId === "chat") {
    return res.redirect(307, "/dashboard/widgets/chat/save");
  }

  const config = req.body;

  if (!widgetId || !config || typeof config !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }

  global.widgetConfigs = global.widgetConfigs || {};
  global.widgetConfigs[widgetId] = config;

  return res.redirect(`/dashboard/widgets/${encodeURIComponent(widgetId)}/configure`);
});

// =====================================================
// SCRAPBOT CASINO (side games hub)
// =====================================================

/**
 * GET /dashboard/casino
 * Hidden from nav; linked from premium button + dashboard card.
 */
router.get("/casino", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const isPro = isProUser(sessionUser);

    const bj = await getOrCreateUserBlackjack(sessionUser.id);
    const pl = await getOrCreateUserPlinko(sessionUser.id);
    const ro = await getOrCreateUserRoulette(sessionUser.id);
    const cr = await getOrCreateUserCrash(sessionUser.id);

    return res.render("layout", {
      tabView: "tabs/casino",
      user: sessionUser,
      isPro,
      casino: {
        blackjack: {
          enabled: bj.is_enabled !== false,
          publicId: bj.public_id,
          config: bj.config_json || {},
        },
        plinko: {
          enabled: pl.is_enabled !== false,
          publicId: pl.public_id,
          config: pl.config_json || {},
        },
        roulette: {
          enabled: ro.is_enabled !== false,
          publicId: ro.public_id,
          config: ro.config_json || {},
        },
        crash: {
          enabled: cr.is_enabled !== false,
          publicId: cr.public_id,
          config: cr.config_json || {},
        },
      },
    });
  } catch (e) {
    console.error("[dashboard/casino] failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

/**
 * GET /dashboard/widgets/blackjack/configure
 */
router.get("/widgets/blackjack/configure", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const row = await getOrCreateUserBlackjack(sessionUser.id);

    const flash = {
      success: req.query.ok ? "Saved." : "",
      error: req.query.err ? "Save failed. Check logs." : "",
    };

    return res.render("layout", {
      tabView: "tabs/blackjack",
      user: sessionUser,
      isPro: isProUser(sessionUser),
      widget: row,
      cfg: row.config_json || {},
      defaults: BLACKJACK_DEFAULTS,
      flash,
    });
  } catch (e) {
    console.error("[dashboard/blackjack/configure] failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

// GET /dashboard/widgets/plinko/configure
router.get("/widgets/plinko/configure", requireAuth, async (req, res) => {
  try {
    const { PLINKO_DEFAULTS } = await import("../src/widgets/plinko/defaults.js");

    return res.render("layout", {
      user: req.session.user,
      tabView: "widgets/plinko-configure",
      defaults: PLINKO_DEFAULTS,
      ok: req.query.ok ? 1 : 0,
      err: req.query.err ? 1 : 0,
    });
  } catch (e) {
    return res.status(500).send("Failed to load plinko configure: " + e.message);
  }
});

router.get("/widgets/roulette/configure", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const row = await getOrCreateUserRoulette(sessionUser.id);

    const flash = {
      success: req.query.ok ? "Saved." : "",
      error: req.query.err ? "Save failed. Check logs." : "",
    };

    return res.render("layout", {
      tabView: "tabs/roulette",
      user: sessionUser,
      isPro: isProUser(sessionUser),
      widget: row,
      cfg: row.config_json || {},
      defaults: ROULETTE_DEFAULTS,
      flash,
    });
  } catch (e) {
    console.error("[dashboard/roulette/configure] failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

/**
 * POST /dashboard/widgets/roulette/save
 * Accepts raw JSON config edit (fast + consistent with DB-backed widgets)
 */
router.post("/widgets/roulette/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const action = String(req.body?._action || "");

    if (action === "reset") {
      await updateRouletteConfig(sessionUser.id, ROULETTE_DEFAULTS);
      return res.redirect("/dashboard/widgets/roulette/configure?ok=1");
    }

    const raw = String(req.body?.config_json || "").trim();
    const nextCfg = raw ? JSON.parse(raw) : {};
    await updateRouletteConfig(sessionUser.id, nextCfg);

    return res.redirect("/dashboard/widgets/roulette/configure?ok=1");
  } catch (e) {
    console.error("[dashboard/roulette/save] failed:", e?.message || e);
    return res.redirect("/dashboard/widgets/roulette/configure?err=1");
  }
});

/**
 * POST /dashboard/widgets/blackjack/save
 */
router.post("/widgets/blackjack/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const action = String(req.body?._action || "save");

    if (action === "reset") {
      await updateBlackjackConfig(sessionUser.id, BLACKJACK_DEFAULTS);
      return res.redirect("/dashboard/widgets/blackjack/configure?ok=1");
    }

    // Merge defaults -> submitted (keep tolerant)
    const next = {
      ...BLACKJACK_DEFAULTS,
      ...(req.body || {}),
    };

    // Normalize the few fields we expect
    next.enabled = asBool(next.enabled);
    next.narrationEnabled = asBool(next.narrationEnabled);
    next.narrationVerbosity = asInt(next.narrationVerbosity, BLACKJACK_DEFAULTS.narrationVerbosity ?? 2);

    await updateBlackjackConfig(sessionUser.id, next);

    return res.redirect("/dashboard/widgets/blackjack/configure?ok=1");
  } catch (e) {
    console.error("[dashboard/widgets/blackjack/save] failed:", e?.message || e);
    return res.redirect("/dashboard/widgets/blackjack/configure?err=1");
  }
});

/**
 * POST /dashboard/widgets/plinko/save
 */
router.post("/widgets/plinko/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const action = String(req.body?._action || "save");

    if (action === "reset") {
      await updatePlinkoConfig(sessionUser.id, PLINKO_DEFAULTS);
      return res.redirect("/dashboard/widgets/plinko/configure?ok=1");
    }

    // ---- Parse + normalize ----
    const rows = asInt(req.body.rows, PLINKO_DEFAULTS.gameplay.rows);

    const multipliers = String(req.body.multipliers || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v));

    const patch = {
      enabled: asBool(req.body.enabled),

      gameplay: {
        rows,
        multipliers,
        maxConcurrentBalls: asInt(req.body.maxConcurrentBalls, PLINKO_DEFAULTS.gameplay.maxConcurrentBalls),
        maxQueueLength: asInt(req.body.maxQueueLength, PLINKO_DEFAULTS.gameplay.maxQueueLength),
        perUserQueueLimit: asInt(req.body.perUserQueueLimit, PLINKO_DEFAULTS.gameplay.perUserQueueLimit),
      },

      visuals: {
        ball: {
          size: asInt(req.body.ballSize, PLINKO_DEFAULTS.visuals.ball.size),
          curveMin: asFloat(req.body.curveMin, PLINKO_DEFAULTS.visuals.ball.curveMin),
          curveMax: asFloat(req.body.curveMax, PLINKO_DEFAULTS.visuals.ball.curveMax),
          controlLift: asFloat(req.body.controlLift, PLINKO_DEFAULTS.visuals.ball.controlLift),
          xLag: asFloat(req.body.xLag, PLINKO_DEFAULTS.visuals.ball.xLag),
          spinMin: asFloat(req.body.spinMin, PLINKO_DEFAULTS.visuals.ball.spinMin),
          spinMax: asFloat(req.body.spinMax, PLINKO_DEFAULTS.visuals.ball.spinMax),
        },
      },
    };

    await updatePlinkoConfig(sessionUser.id, patch);

    return res.redirect("/dashboard/widgets/plinko/configure?ok=1");
  } catch (e) {
    console.error("[dashboard/widgets/plinko/save] failed:", e?.message || e);
    return res.redirect("/dashboard/widgets/plinko/configure?err=1");
  }
});

// GET /dashboard/widgets/crash/configure
router.get("/widgets/crash/configure", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const row = await getOrCreateUserCrash(sessionUser.id);

    const flash = {
      success: req.query.ok ? "Saved." : "",
      error: req.query.err ? "Save failed. Check logs." : "",
    };

    return res.render("layout", {
      tabView: "tabs/crash",
      user: sessionUser,
      isPro: isProUser(sessionUser),
      widget: row,
      cfg: row.config_json || {},
      defaults: CRASH_DEFAULTS,
      flash,
    });
  } catch (e) {
    console.error("[dashboard/crash/configure] failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

// POST /dashboard/widgets/crash/save
router.post("/widgets/crash/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const action = String(req.body?._action || "");

    if (action === "reset") {
      await updateCrashConfig(sessionUser.id, CRASH_DEFAULTS);
      return res.redirect("/dashboard/widgets/crash/configure?ok=1");
    }

    const raw = String(req.body?.config_json || "").trim();
    const nextCfg = raw ? JSON.parse(raw) : {};
    await updateCrashConfig(sessionUser.id, nextCfg);

    return res.redirect("/dashboard/widgets/crash/configure?ok=1");
  } catch (e) {
    console.error("[dashboard/crash/save] failed:", e?.message || e);
    return res.redirect("/dashboard/widgets/crash/configure?err=1");
  }
});

/**
 * Non-chat widget configure page
 * GET /dashboard/widgets/:id/configure
 */
router.get("/widgets/:id/configure", requireAuth, async (req, res) => {
  const widgetId = String(req.params.id || "").toLowerCase();

  // DB-backed widgets must not use mock registry
  if (widgetId === "chat") return res.redirect("/dashboard/widgets/chat/configure");
  if (widgetId === "plinko") return res.redirect("/dashboard/widgets/plinko/configure");
  if (widgetId === "roulette") return res.redirect("/dashboard/widgets/roulette/configure");
  if (widgetId === "sub-counter") return res.redirect("/dashboard/widgets/sub-counter/configure");
  if (widgetId === "crash") return res.redirect("/dashboard/widgets/crash/configure");

  // Everything else uses the static widget registry
  const widget = getWidgetById(widgetId);
  if (!widget) return res.status(404).send("Widget not found");

  const user = req.session.user;

  // Raffle needs a token + overlay url (so you can test without OBS)
  let token = "";
  let overlayUrl = "";
  let defaultChannelSlug = "";

  if (widgetId === "raffle" || widgetId === "sub-counter") {
    token = mintWidgetToken({ userId: user.id, widgetId });
    const origin = `${req.protocol}://${req.get("host")}`;
    overlayUrl = `${origin}/w/${token}`;
    defaultChannelSlug = String(req.query.channel || "");
  }

  return res.render("layout", {
    tabView: widget.configureView,
    user,
    isPro: isProUser(user),
    widget,
    token,
    overlayUrl,
    defaultChannelSlug,
    flash: {
      success: req.query.ok ? "Saved." : "",
      error: req.query.err ? "Save failed." : "",
    },
  });
});


// GET /dashboard/api/discord/ai-config
router.get("/api/discord/ai-config", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { rows } = await db.query(
      `SELECT ai_enabled FROM public.discord_guild_integrations
       WHERE owner_user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.json({ ok: true, ai_enabled: false });
    res.json({ ok: true, ai_enabled: Boolean(rows[0].ai_enabled) });
  } catch (err) {
    console.error("[discord/ai-config GET] failed:", err);
    res.status(500).json({ ok: false });
  }
});

// POST /dashboard/api/discord/ai-config
router.post("/api/discord/ai-config", requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const ai_enabled = Boolean(req.body?.ai_enabled);
    const { rowCount } = await db.query(
      `UPDATE public.discord_guild_integrations
       SET ai_enabled = $1, updated_at = now()
       WHERE owner_user_id = $2 AND status = 'active'`,
      [ai_enabled, userId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "no_guild" });
    res.json({ ok: true, ai_enabled });
  } catch (err) {
    console.error("[discord/ai-config POST] failed:", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
