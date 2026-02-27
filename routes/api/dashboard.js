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
import { mintWidgetToken } from "../utils/widgetTokens.js";
import { SUB_COUNTER_DEFAULTS } from "../src/widgets/sub-counter/defaults.js";
import { getOrCreateUserSubCounter, updateSubCounterConfig } from "../src/widgets/sub-counter/service.js";


import fs from "fs";
import path from "path";

// Chat overlay (DB-backed)
import {
  getOrCreateUserChatOverlay,
  updateUserChatOverlay,
} from "../src/widgets/chat-overlay/service.js";
import { CHAT_OVERLAY_DEFAULTS } from "../src/widgets/chat-overlay/defaults.js";

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

const router = express.Router();

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
      { type: "stats_overview", title: "Overview", desc: "Totals, grade, last updated", defaultSpan: 1 },
      { type: "stats_sparklines", title: "Sparklines", desc: "Platform follower lines", defaultSpan: 1 },
      { type: "stats_engagement", title: "Engagement", desc: "Profile views windowed trend", defaultSpan: 1 },
      { type: "stats_audience_growth", title: "Audience Growth", desc: "Total followers over time", defaultSpan: 2 },
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
  } catch (err) {
    console.warn("[dashboard] kick connection check failed:", err?.message || err);
    kick.connected = false;
    kick.needsReauth = false;
  }

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
      const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https")
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
      const url = `${base}/api/status/channels?platform=kick&owner_user_id=${encodeURIComponent(sessionUser.id)}`;

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
    scrapbotChannelsError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    console.warn("[dashboard] scrapbot status load failed:", scrapbotChannelsError);
  }

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
    casino,
    isPro: isProUser(sessionUser),
    scrapbotChannels,
    scrapbotChannelsError,
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
    const prevStart = now - (windowDays * 2) * dayMs;

    const getTs = (r) => {
      const t =
        r.timestamp ||
        r.visited_at ||
        r.viewed_at ||
        r.created_at ||
        r.updated_at ||
        null;
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
        // since rows are DESC, once we're older than prevStart we can stop
        // BUT only if the table is truly ordered by time. We'll keep it safe:
        // do nothing.
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
    const selectedWindow = [7, 30, 60].includes(requestedWindow)
      ? requestedWindow
      : 7;

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
    // SAFE DEFAULTS (critical)
    // -----------------------------
    const profileAnalytics = {
      views: 0,
    };

    const referrerStats = [];
    const clickBuckets = [];
    const clickDetails = [];
    const heatmapPoints = [];

    const profileEngagementTrend = {
      percentChange: 0,
      dailyViews: [],
    };

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

    const emailSettings =
      settingsRows[0]
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
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https")
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
    });
  } catch (e) {
    console.error("[dashboard] chat overlay configure failed:", e?.message || e);
    return res.status(500).render("500");
  }
});

/**
 * Chat overlay save (DB-backed)
 * POST /dashboard/widgets/chat/save
 */
router.post("/widgets/chat/save", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;

    const next = {
      ...CHAT_OVERLAY_DEFAULTS,
      ...(req.body || {}),
    };

    // Normalize a few expected types
    next.enabled = asBool(next.enabled);
    next.rateLimitPerSec = asFloat(next.rateLimitPerSec, CHAT_OVERLAY_DEFAULTS.rateLimitPerSec);
    next.maxLines = asInt(next.maxLines, CHAT_OVERLAY_DEFAULTS.maxLines);
    next.showAvatars = asBool(next.showAvatars);
    next.showBadges = asBool(next.showBadges);
    next.fontSize = asInt(next.fontSize, CHAT_OVERLAY_DEFAULTS.fontSize);
    next.theme = asStr(next.theme, CHAT_OVERLAY_DEFAULTS.theme);

    await updateUserChatOverlay(sessionUser.id, next);

    return res.redirect("/dashboard/widgets/chat/configure?ok=1");
  } catch (e) {
    console.error("[dashboard/widgets/chat/save] failed:", e?.message || e);
    return res.redirect("/dashboard/widgets/chat/configure?err=1");
  }
});

// POST /dashboard/widgets/chat/test
router.post("/widgets/chat/test", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const text = String(req.body?.text || "Test message").slice(0, 300);
    const username = String(req.body?.username || "Scraplet").slice(0, 50);

    const msg = {
      platform: "kick",
      text,
      user: {
        name: username,
        avatar: "https://files.kick.com/images/user/default.webp",
      },
    };

    // ✅ Correct ingestion path
    await enqueueChatForUser(userId, msg);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[chat test] failed", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
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

    const enabled =
      req.body.enabled === "true" ||
      req.body.enabled === "on" ||
      req.body.enabled === "1";

    const narrationEnabled =
      req.body.narrationEnabled === "true" ||
      req.body.narrationEnabled === "on" ||
      req.body.narrationEnabled === "1";

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
      user: req.user,
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
    next.narrationVerbosity = asInt(
      next.narrationVerbosity,
      BLACKJACK_DEFAULTS.narrationVerbosity ?? 2
    );

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
        maxConcurrentBalls: asInt(
          req.body.maxConcurrentBalls,
          PLINKO_DEFAULTS.gameplay.maxConcurrentBalls
        ),
        maxQueueLength: asInt(
          req.body.maxQueueLength,
          PLINKO_DEFAULTS.gameplay.maxQueueLength
        ),
        perUserQueueLimit: asInt(
          req.body.perUserQueueLimit,
          PLINKO_DEFAULTS.gameplay.perUserQueueLimit
        ),
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




export default router;
