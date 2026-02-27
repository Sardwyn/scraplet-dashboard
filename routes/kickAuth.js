// routes/kickAuth.js – Dashboard-owned USER Kick OAuth (PKCE + identity + channels)

import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import db from "../db.js";
import { ensureChatEventsSubscriptionForUser } from "../services/kickEvents.js";
import { upsertExternalAccountToken } from "../services/externalAccountTokens.js";

const router = express.Router();

// Optional debug logging for Kick routes
router.use((req, _res, next) => {
  console.debug(`[KickAuth] ${req.method} ${req.originalUrl}`);
  next();
});

// ─────────────────────────────────────────────
// Config helpers – read env at runtime (SANITIZED)
// ─────────────────────────────────────────────

function cleanEnv(v) {
  // Critical: strip CRs so they don't become %0D in URLs.
  return String(v ?? "")
    .replace(/\r/g, "")
    .trim();
}

function getDashKickConfig() {
  return {
    clientId: cleanEnv(process.env.KICK_DASH_CLIENT_ID),
    clientSecret: cleanEnv(process.env.KICK_DASH_CLIENT_SECRET),
    redirectUri:
      cleanEnv(process.env.KICK_DASH_REDIRECT_URI) ||
      "https://scraplet.store/auth/kick/callback",
    authUrl:
      cleanEnv(process.env.KICK_DASH_AUTH_URL) || "https://id.kick.com/oauth/authorize",
    tokenUrl:
      cleanEnv(process.env.KICK_DASH_TOKEN_URL) || "https://id.kick.com/oauth/token",
    scope:
      cleanEnv(process.env.KICK_DASH_SCOPE) ||
      // includes user:read + channel:read + chat scopes for future use
      "user:read channel:read chat:read chat:write channel_subscriptions:read events:subscribe",
  };
}

// Kick public API endpoints (override via env if needed)
const KICK_API_USERS_URL =
  process.env.KICK_API_USERS_URL || "https://api.kick.com/public/v1/users";
const KICK_API_CHANNELS_URL =
  process.env.KICK_API_CHANNELS_URL || "https://api.kick.com/public/v1/channels";

// ─────────────────────────────────────────────
// PKCE store with auto-expiry (state -> { verifier, createdAt })
// ─────────────────────────────────────────────

const kickPkceStore = {
  data: new Map(),
  set(state, payload) {
    this.data.set(state, payload);
    // Auto-expire after 10 minutes
    setTimeout(() => {
      this.data.delete(state);
    }, 10 * 60 * 1000);
  },
  get(state) {
    return this.data.get(state);
  },
  delete(state) {
    return this.data.delete(state);
  },
};

// ─────────────────────────────────────────────
// Helpers – state signing + PKCE helpers
// ─────────────────────────────────────────────

function signKickState(payload) {
  const secret =
    process.env.DASHBOARD_STATE_SECRET || process.env.SESSION_SECRET || "change-me";
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(json).digest("hex");
  return Buffer.from(JSON.stringify({ json, sig })).toString("base64url");
}

function verifyKickState(b64) {
  const secret =
    process.env.DASHBOARD_STATE_SECRET || process.env.SESSION_SECRET || "change-me";

  const decoded = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  const { json, sig } = decoded;

  const expected = crypto.createHmac("sha256", secret).update(json).digest("hex");

  if (
    !crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
  ) {
    throw new Error("invalid kick state signature");
  }

  return JSON.parse(json);
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function newVerifier() {
  return b64url(crypto.randomBytes(32));
}

function challengeFromVerifier(verifier) {
  return b64url(crypto.createHash("sha256").update(verifier).digest());
}

// ─────────────────────────────────────────────
// Routes – mounted under /auth
//   /auth/kick/start
//   /auth/kick/callback
// ─────────────────────────────────────────────

// GET /auth/kick/start – start USER OAuth on the DASHBOARD
router.get("/kick/start", async (req, res, _next) => {
  const { clientId, redirectUri, authUrl, scope } = getDashKickConfig();

  console.log(
    "[auth:kick/start] hit",
    "session user =",
    req.session?.user?.id || null
  );
  console.log("[auth:kick/start] env KICK_DASH_CLIENT_ID =", process.env.KICK_DASH_CLIENT_ID);
  console.log(
    "[auth:kick/start] env KICK_DASH_REDIRECT_URI =",
    process.env.KICK_DASH_REDIRECT_URI
  );

  const user = req.session?.user;

  if (!user?.id) {
    console.log("[auth:kick/start] no user in session – redirecting to /auth/login");
    return res.redirect("/auth/login");
  }

  if (!clientId || !redirectUri) {
    console.error("[auth:kick/start] Missing KICK_DASH_CLIENT_ID or KICK_DASH_REDIRECT_URI");
    return res.status(500).send("Kick OAuth not configured on dashboard");
  }

  // Refuse localhost redirect URIs outside local/dev environments
  const isProd =
    process.env.NODE_ENV === "production" || process.env.APP_MODE === "production";
  if (isProd && /localhost|127\.0\.0\.1/i.test(redirectUri)) {
    console.error("[auth:kick/start] REFUSING localhost redirectUri in production", {
      redirectUri,
    });
    return res.status(500).send("Kick OAuth misconfigured (redirect URI)");
  }

  const now = Date.now();

  // Build signed state tying this flow to the dashboard user
  const statePayload = {
    user_id: user.id,
    exp: now + 10 * 60 * 1000, // 10 minutes from now
  };
  const state = signKickState(statePayload);

  // PKCE verifier + challenge
  const verifier = newVerifier();
  const chall = challengeFromVerifier(verifier);

  // Store PKCE data in memory keyed by state
  kickPkceStore.set(state, {
    verifier,
    createdAt: now,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: chall,
    code_challenge_method: "S256",
  });

  const url = `${authUrl}?${params.toString()}`;
  console.log("[auth:kick/start] redirecting to", url);
  return res.redirect(url);
});

// GET /auth/kick/callback – finish OAuth, store tokens, link identity + channels
router.get("/kick/callback", async (req, res) => {
  console.log(
    "[auth:kick/callback] ENTRY",
    "code present =",
    !!req.query.code,
    "state present =",
    !!req.query.state
  );

  const { clientId, clientSecret, redirectUri, tokenUrl } = getDashKickConfig();

  const { code, state, error, error_description } = req.query || {};

  // Provider error?
  if (error) {
    console.error(
      "[auth:kick/callback] error from provider:",
      error,
      error_description || ""
    );
    return res.status(400).send(`Kick OAuth error: ${error}`);
  }

  if (!code || !state) {
    console.error("[auth:kick/callback] missing code or state:", req.query);
    return res.status(400).send("Kick OAuth callback missing code or state");
  }

  const stateString = state.toString();

  // Verify signed state and expiry
  let decoded;
  try {
    decoded = verifyKickState(stateString);
    if (!decoded?.user_id) {
      throw new Error("state missing user_id");
    }
    if (decoded.exp && decoded.exp < Date.now()) {
      throw new Error("state has expired");
    }
  } catch (err) {
    console.error("[auth:kick/callback] bad state", err);
    return res.status(400).send("Invalid or expired state");
  }

  // Retrieve PKCE verifier for this state
  const pkce = kickPkceStore.get(stateString);
  if (!pkce) {
    console.error("[auth:kick/callback] no PKCE data for state", stateString);
    return res.status(400).send("Missing PKCE verifier");
  }
  kickPkceStore.delete(stateString);

  try {
    // ── 1) Exchange code for tokens ──────────────────────────────
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
      code: code.toString(),
    });

    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[auth:kick/callback] token exchange failed", resp.status, text);
      return res.status(502).send("Failed to exchange code for token");
    }

    const tokenData = await resp.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in || 0);

    if (!accessToken || !refreshToken || !expiresIn) {
      console.error("[auth:kick/callback] bad token payload from Kick", tokenData);
      return res.status(502).send("Invalid token response from Kick");
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // ── 2) (deprecated – kick_tokens_user removed, single authority is external_account_tokens) ──
    console.log("[auth:kick/callback] tokens obtained for dashboard_user_id", decoded.user_id);

    // ── 3) Fetch Kick identity using the USER access token ───────
    let identity = null;

    try {
      const meResp = await fetch(KICK_API_USERS_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!meResp.ok) {
        const txt = await meResp.text();
        console.warn("[auth:kick/callback] failed to fetch identity", meResp.status, txt);
      } else {
        const json = await meResp.json();
        identity = Array.isArray(json?.data) ? json.data[0] : null;
      }
    } catch (err) {
      console.error("[auth:kick/callback] identity fetch error", err);
    }

    if (!identity || !identity.user_id) {
      console.warn(
        "[auth:kick/callback] identity missing user_id; skipping account/channel linking"
      );
      await hydrateSessionUser(decoded.user_id, req);
      return res.redirect("/dashboard?kick=connected");
    }

    const kickUserId = String(identity.user_id); // canonical user/broadcaster id
    const kickDisplayName = identity.name || null;

    console.log("[auth:kick/callback] identity:", kickUserId, kickDisplayName);

    // ── 4) Fetch channel info via public/v1/channels ─────────────
    let channelSlug = null;
    let broadcasterUserId = kickUserId;

    try {
      const chUrl = `${KICK_API_CHANNELS_URL}`;
      const chResp = await fetch(chUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!chResp.ok) {
        const txt = await chResp.text();
        console.warn("[auth:kick/callback] failed to fetch channel info", chResp.status, txt);
      } else {
        const chJson = await chResp.json();
        const ch = Array.isArray(chJson?.data) ? chJson.data[0] : null;

        if (ch) {
          broadcasterUserId = String(ch.broadcaster_user_id || kickUserId);
          channelSlug = (ch.slug || "").toLowerCase() || null;
        }
      }
    } catch (err) {
      console.error("[auth:kick/callback] channel fetch error", err);
    }

    // ── 5) Upsert external_accounts row ──────────────────────────
    // Use broadcaster_user_id as external_user_id; that's what chat/webhooks key off.
    const { rows: accRows } = await db.query(
      `
      INSERT INTO external_accounts (platform, external_user_id, username, user_id)
      VALUES ('kick', $1, $2, $3)
      ON CONFLICT (platform, external_user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        user_id  = EXCLUDED.user_id,
        updated_at = now()
      RETURNING id
      `,
      [broadcasterUserId, kickDisplayName || `user-${broadcasterUserId}`, decoded.user_id]
    );

    const accountId = accRows[0].id;

    // ── 5b) Upsert external_account_tokens (SINGLE AUTHORITY) ────
    await upsertExternalAccountToken({
      externalAccountId: accountId,
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      scopes: tokenData.scope ? String(tokenData.scope).split(" ") : [],
      tokenType: tokenData.token_type || "Bearer",
      providerMeta: { source: "oauth_callback", ts: new Date().toISOString() },
    });
    console.log("[auth:kick/callback] upserted external_account_tokens", {
      external_account_id: accountId,
      dashboard_user_id: decoded.user_id,
      expires_at: expiresAt.toISOString(),
    });

    // ── 6) Upsert channels row (slug + broadcaster_user_id) ──────
    if (channelSlug && accountId) {
      await db.query(
        `
        INSERT INTO channels (platform, channel_slug, chatroom_id, external_user_id, account_id)
        VALUES ('kick', $1, $2, $3, $4)
        ON CONFLICT (platform, channel_slug) DO UPDATE SET
          chatroom_id      = EXCLUDED.chatroom_id,
          external_user_id = EXCLUDED.external_user_id,
          account_id       = EXCLUDED.account_id,
          updated_at       = now()
        `,
        [
          channelSlug,
          null, // chatroom_id – not exposed in public API
          broadcasterUserId, // store broadcaster_user_id here
          accountId,
        ]
      );

      console.log(
        "[auth:kick/callback] channels upserted for",
        channelSlug,
        "broadcaster_user_id=",
        broadcasterUserId
      );
    } else {
      console.warn("[auth:kick/callback] no channel slug resolved; skipping channels upsert");
    }

    // ── 7) Ensure session.user is hydrated ───────────────────────
    await hydrateSessionUser(decoded.user_id, req);

    // ── 8) Ensure chat.message.sent events subscription ──────────
    try {
      await ensureChatEventsSubscriptionForUser(decoded.user_id, broadcasterUserId, accessToken);
    } catch (err) {
      console.error("[auth:kick/callback] failed to ensure chat events subscription", err);
      // Non-fatal: user stays connected, we just won't get chat webhooks
    }

    // ── 9) Redirect to dashboard ─────────────────────────────────
    return res.redirect("/dashboard?kick=connected");
  } catch (err) {
    console.error("[auth:kick/callback] error", err);
    return res.status(500).send("Kick OAuth callback failed");
  }
});

// ─────────────────────────────────────────────
// Helper to hydrate req.session.user
// ─────────────────────────────────────────────

async function hydrateSessionUser(userId, req) {
  try {
    const { rows } = await db.query(
      `
      SELECT id, username, email, avatar_url, bio, tags
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (!rows.length) return;

    const u = rows[0];

    req.session.user = {
      id: u.id,
      username: u.username,
      email: u.email || null,
      avatar_url: u.avatar_url || null,
      bio: u.bio || null,
      tags: u.tags || [],
    };
  } catch (err) {
    console.error("[hydrateSessionUser] error", err);
  }
}

export default router;