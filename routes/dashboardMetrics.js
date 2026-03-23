// /root/scrapletdashboard/routes/dashboardMetrics.js
import express from "express";
import { mintWidgetToken } from "../utils/widgetTokens.js";
import db from "../db.js";

const router = express.Router();

const ADMIN_USER_ID = 4;

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/auth/login");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/auth/login");
  if (Number(req.session.user.id) !== ADMIN_USER_ID) return res.status(403).send("Forbidden");
  next();
}

function getBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https")
    .toString()
    .split(",")[0]
    .trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "")
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

async function fetchJson(url, { headers = {}, timeoutMs = 2500 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { headers, signal: ctrl.signal });
    const text = await resp.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: `HTTP ${resp.status}`,
        raw: (text || "").slice(0, 500),
        status: resp.status,
      };
    }

    return json ?? { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

function scrapbotHeaders() {
  const h = {};
  const secret = process.env.SCRAPBOT_SHARED_SECRET;
  if (secret) h["x-scrapbot-secret"] = secret;
  return h;
}

async function fetchScrapbotStatus() {
  const url =
    process.env.SCRAPBOT_STATUS_URL || "http://127.0.0.1:3030/api/debug/status";
  return fetchJson(url, { headers: scrapbotHeaders(), timeoutMs: 2500 });
}

async function fetchScrapbotMetricsSnapshot() {
  const url =
    process.env.SCRAPBOT_METRICS_URL || "http://127.0.0.1:3030/api/metrics";
  return fetchJson(url, { headers: scrapbotHeaders(), timeoutMs: 2500 });
}

async function fetchScrapbotMetricsRecent({ limit = 100 } = {}) {
  const base =
    process.env.SCRAPBOT_METRICS_RECENT_URL ||
    "http://127.0.0.1:3030/api/metrics/recent";
  const url = `${base}?limit=${encodeURIComponent(limit)}&order=newest`;
  return fetchJson(url, { headers: scrapbotHeaders(), timeoutMs: 2500 });
}

function buildDashboardMetrics() {
  return {
    scrapers: [],
    followers: [],
    api: [],
    tests: { passed: 0, failed: 0, lastRun: null },
    layout: [],
    activity: { requestsTotal: 0, viewsTotal: 0, lastRequest: null, byUser: [] },
  };
}

router.get("/dashboard/metrics", requireAdmin, async (req, res, next) => {
  try {
    const [scrapbotStatus, scrapbotMetrics, scrapbotRecent] = await Promise.all([
      fetchScrapbotStatus(),
      fetchScrapbotMetricsSnapshot(),
      fetchScrapbotMetricsRecent({ limit: 100 }),
    ]);

    const metrics = buildDashboardMetrics();
    const tokenConfigured = !!process.env.ADMIN_METRICS_TOKEN;

    res.render("dashboard-metrics", {
      metrics,
      scrapbotStatus,
      scrapbotMetrics,
      scrapbotRecent,
      tokenConfigured,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

// JSON tap for client polling (kept behind dashboard auth)
router.get("/dashboard/metrics/data", requireAdmin, async (req, res) => {
  const [scrapbotStatus, scrapbotMetrics, scrapbotRecent] = await Promise.all([
    fetchScrapbotStatus(),
    fetchScrapbotMetricsSnapshot(),
    fetchScrapbotMetricsRecent({ limit: 100 }),
  ]);

  res.json({
    ok: true,
    now: new Date().toISOString(),
    scrapbotStatus,
    scrapbotMetrics,
    scrapbotRecent,
  });
});

// (kept from your existing file — used by the event console tool)
router.post(
  "/dashboard/metrics/tools/event-console",
  requireAuth,
  async (req, res, next) => {
    try {
      const baseUrl = getBaseUrl(req);
      const token = mintWidgetToken({
        userId: String(req.session.user.id),
        widgetId: "event-console",
        config: {},
      });

      res.json({
        ok: true,
        url: `${baseUrl}/w/${token}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Test Lab proxy routes ────────────────────────────────
// Proxy Scrapbot test endpoints through the dashboard (secret injected server-side)

router.get("/dashboard/metrics/tests", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
  const data = await fetchJson(`${base}/api/metrics/tests`, {
    headers: scrapbotHeaders(),
    timeoutMs: 3000,
  });
  res.json(data);
});

router.post("/dashboard/metrics/tests/run", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${base}/api/metrics/tests/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...scrapbotHeaders(),
      },
      body: JSON.stringify(req.body || {}),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({ ok: false, error: "bad json" }));
    res.json(j);
  } catch (err) {
    res.json({ ok: false, error: String(err?.message || err) });
  } finally {
    clearTimeout(t);
  }
});

// ── Command Lab Proxy Routes ──────────────────────────

router.get("/dashboard/metrics/tests/commands", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
  const data = await fetchJson(`${base}/api/metrics/tests/commands`, {
    headers: scrapbotHeaders(),
    timeoutMs: 3000,
  });
  res.json(data);
});

router.post("/dashboard/metrics/tests/commands/run", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${base}/api/metrics/tests/commands/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...scrapbotHeaders(),
      },
      body: JSON.stringify(req.body || {}),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({ ok: false, error: "bad json" }));
    res.json(j);
  } catch (err) {
    res.json({ ok: false, error: String(err?.message || err) });
  } finally {
    clearTimeout(t);
  }
});

router.get("/dashboard/metrics/tests/commands/traces", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
  const limit = Number(req.query.limit || 20) || 20;
  const data = await fetchJson(`${base}/api/metrics/tests/commands/traces?limit=${limit}`, {
    headers: scrapbotHeaders(),
    timeoutMs: 3000,
  });
  res.json(data);
});

router.get("/dashboard/metrics/audit", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
  const limit = Number(req.query.limit || 50) || 50;
  const data = await fetchJson(
    `${base}/api/metrics/audit?limit=${encodeURIComponent(limit)}`,
    { headers: scrapbotHeaders(), timeoutMs: 3000 }
  );
  res.json(data);
});

router.get("/metrics", requireAuth, async (req, res) => {
  let scrapbotMetrics = null;
  let scrapbotMetricsError = null;

  try {
    const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";
    const r = await fetch(`${base}/api/metrics`);
    scrapbotMetrics = await r.json();
  } catch (e) {
    scrapbotMetricsError = e.message;
  }

  res.render("layout", {
    tabView: "dashboard-metrics",
    user: req.session.user,
    isPro: isProUser(req.session.user),
    scrapbotMetrics,
    scrapbotMetricsError,
  });
});


// (kept from your existing file)
router.get(
  "/dashboard/integrations/kick/events",
  requireAuth,
  async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `
        select id, created_at, event_type, channel_slug, payload
        from kick_events
        where scraplet_user_id = $1
        order by created_at desc
        limit 200
      `,
        [req.session.user.id]
      );

      res.render("kick-events", {
        user: req.session.user,
        events: rows,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ?? Bot Health Routes ?????????????????????????????????????????????????????????

// GET /dashboard/metrics/bot-health
// Returns Kick bot token status + Discord bot status
router.get("/dashboard/metrics/bot-health", requireAuth, async (req, res) => {
  const base = process.env.SCRAPBOT_INTERNAL_URL || "http://127.0.0.1:3030";

  const [kickBot, discordBot] = await Promise.all([
    fetchJson(`${base}/admin/bot/kick/status`, { headers: scrapbotHeaders(), timeoutMs: 3000 }),
    fetchJson("http://[::1]:3025/internal/guild/ping", { timeoutMs: 2000 })
      .catch(() => ({ ok: false, error: "discord_bot_unreachable" })),
  ]);

  // Determine kick token health
  let kickHealth = "unknown";
  if (kickBot?.hasTokens) {
    const exp = kickBot.expires_at ? new Date(kickBot.expires_at) : null;
    const msLeft = exp ? exp.getTime() - Date.now() : null;
    if (msLeft !== null && msLeft < 0) kickHealth = "expired";
    else if (msLeft !== null && msLeft < 10 * 60 * 1000) kickHealth = "expiring_soon";
    else kickHealth = "ok";
  } else if (kickBot?.hasTokens === false) {
    kickHealth = "no_tokens";
  }

  res.json({
    ok: true,
    kick: {
      health: kickHealth,
      hasTokens: kickBot?.hasTokens ?? false,
      expires_at: kickBot?.expires_at ?? null,
      updated_at: kickBot?.updated_at ?? null,
      scope: kickBot?.scope ?? null,
      reAuthUrl: "https://scrapbot.scraplet.store/admin/bot/kick/start",
    },
    discord: {
      online: discordBot?.ok !== false && !discordBot?.error,
    },
  });
});

// POST /dashboard/metrics/bot-health/alert
// Sends a test/manual alert to Discord via webhook
router.post("/dashboard/metrics/bot-health/alert", requireAuth, async (req, res) => {
  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.json({ ok: false, error: "DISCORD_ALERT_WEBHOOK_URL not configured" });
  }

  const message = String(req.body?.message || "").slice(0, 1000) ||
    "?? Manual alert from Scraplet Dashboard";

  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.json({ ok: false, error: `Discord webhook ${r.status}: ${t.slice(0, 200)}` });
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;
