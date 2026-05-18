// routes/twitchAuth.js – Dashboard-owned USER Twitch OAuth
import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import Redis from "ioredis";
import db from "../db.js";
import { upsertExternalAccountToken } from "../services/externalAccountTokens.js";

const router = express.Router();
const redisClient = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

// Optional debug logging for Twitch routes
router.use((req, _res, next) => {
  console.debug(`[TwitchAuth] ${req.method} ${req.originalUrl}`);
  next();
});

// ─────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────
function cleanEnv(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}

function getDashTwitchConfig() {
  return {
    clientId: cleanEnv(process.env.TWITCH_CLIENT_ID),
    clientSecret: cleanEnv(process.env.TWITCH_CLIENT_SECRET),
    redirectUri:
      cleanEnv(process.env.TWITCH_REDIRECT_URI) ||
      "http://localhost:3000/auth/twitch/callback",
    authUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scope:
      cleanEnv(process.env.TWITCH_SCOPE) ||
      "user:read:email channel:read:subscriptions chat:read chat:edit",
  };
}

const TWITCH_API_USERS_URL = "https://api.twitch.tv/helix/users";

// ─────────────────────────────────────────────
// Helpers – state signing
// ─────────────────────────────────────────────
function signTwitchState(payload) {
  const secret = process.env.DASHBOARD_STATE_SECRET || process.env.SESSION_SECRET || "change-me";
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(json).digest("hex");
  return Buffer.from(JSON.stringify({ json, sig })).toString("base64url");
}

function verifyTwitchState(b64) {
  const secret = process.env.DASHBOARD_STATE_SECRET || process.env.SESSION_SECRET || "change-me";
  const decoded = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  const { json, sig } = decoded;
  const expected = crypto.createHmac("sha256", secret).update(json).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
    throw new Error("invalid twitch state signature");
  }

  return JSON.parse(json);
}

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

// GET /auth/twitch/start – start USER OAuth on the DASHBOARD
router.get("/twitch/start", async (req, res, _next) => {
  const { clientId, redirectUri, authUrl, scope } = getDashTwitchConfig();

  const user = req.session?.user;
  if (!user?.id) {
    return res.redirect("/auth/login");
  }

  if (!clientId || !redirectUri) {
    console.error("[auth:twitch/start] Missing TWITCH_CLIENT_ID or TWITCH_REDIRECT_URI");
    return res.status(500).send("Twitch OAuth not configured on dashboard");
  }

  const now = Date.now();
  const statePayload = {
    user_id: user.id,
    exp: now + 10 * 60 * 1000, // 10 mins
  };
  const state = signTwitchState(statePayload);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  const url = `${authUrl}?${params.toString()}`;
  return res.redirect(url);
});

// GET /auth/twitch/callback – finish OAuth, store tokens
router.get("/twitch/callback", async (req, res) => {
  const { clientId, clientSecret, redirectUri, tokenUrl } = getDashTwitchConfig();
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error("[auth:twitch/callback] error from provider:", error, error_description);
    return res.status(400).send(`Twitch OAuth error: ${error}`);
  }

  if (!code || !state) {
    return res.status(400).send("Twitch OAuth callback missing code or state");
  }

  const stateString = state.toString();

  let decoded;
  try {
    decoded = verifyTwitchState(stateString);
    if (!decoded?.user_id) throw new Error("state missing user_id");
    if (decoded.exp && decoded.exp < Date.now()) throw new Error("state has expired");
  } catch (err) {
    console.error("[auth:twitch/callback] bad state", err);
    return res.status(400).send("Invalid or expired state");
  }

  try {
    // 1) Exchange code for tokens
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: code.toString(),
    });

    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[auth:twitch/callback] token exchange failed", resp.status, text);
      return res.status(502).send("Failed to exchange code for token");
    }

    const tokenData = await resp.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in || 0);

    if (!accessToken || !expiresIn) {
      return res.status(502).send("Invalid token response from Twitch");
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 2) Fetch Twitch identity
    let identity = null;
    try {
      const meResp = await fetch(TWITCH_API_USERS_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": clientId,
          Accept: "application/json",
        },
      });

      if (!meResp.ok) {
        const txt = await meResp.text();
        console.warn("[auth:twitch/callback] failed to fetch identity", meResp.status, txt);
      } else {
        const json = await meResp.json();
        identity = Array.isArray(json?.data) ? json.data[0] : null;
      }
    } catch (err) {
      console.error("[auth:twitch/callback] identity fetch error", err);
    }

    if (!identity || !identity.id) {
      console.warn("[auth:twitch/callback] identity missing id");
      await hydrateSessionUser(decoded.user_id, req);
      return res.redirect("/dashboard?twitch=error");
    }

    const twitchUserId = String(identity.id);
    const twitchDisplayName = identity.display_name || identity.login || null;
    const channelSlug = identity.login ? identity.login.toLowerCase() : null;

    // 3) Upsert external_accounts row
    // The table has two unique constraints: (platform, external_user_id) AND (user_id, platform).
    // We update the existing row for this dashboard user+platform first, then insert if missing.
    let accountId;
    const { rows: existingRows } = await db.query(
      `SELECT id FROM external_accounts WHERE user_id = $1 AND platform = 'twitch' LIMIT 1`,
      [decoded.user_id]
    );

    if (existingRows.length > 0) {
      // Update the existing row in-place (handles Twitch account swaps too)
      await db.query(
        `UPDATE external_accounts
         SET external_user_id = $1, username = $2, updated_at = now()
         WHERE id = $3`,
        [twitchUserId, twitchDisplayName || `user-${twitchUserId}`, existingRows[0].id]
      );
      accountId = existingRows[0].id;
    } else {
      // First-time connect — plain insert (no conflict possible for this user+platform)
      const { rows: accRows } = await db.query(
        `INSERT INTO external_accounts (platform, external_user_id, username, user_id)
         VALUES ('twitch', $1, $2, $3)
         ON CONFLICT (platform, external_user_id)
         DO UPDATE SET username = EXCLUDED.username, user_id = EXCLUDED.user_id, updated_at = now()
         RETURNING id`,
        [twitchUserId, twitchDisplayName || `user-${twitchUserId}`, decoded.user_id]
      );
      accountId = accRows[0].id;
    }

    // 4) Upsert external_account_tokens
    await upsertExternalAccountToken({
      externalAccountId: accountId,
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      scopes: tokenData.scope ? (Array.isArray(tokenData.scope) ? tokenData.scope : [tokenData.scope]) : [],
      tokenType: tokenData.token_type || "Bearer",
      providerMeta: { source: "oauth_callback", ts: new Date().toISOString() },
    });

    // 5) Upsert channels row
    if (channelSlug && accountId) {
      await db.query(
        `
        INSERT INTO channels (platform, channel_slug, chatroom_id, external_user_id, account_id)
        VALUES ('twitch', $1, $2, $3, $4)
        ON CONFLICT (platform, channel_slug) DO UPDATE SET
          chatroom_id      = EXCLUDED.chatroom_id,
          external_user_id = EXCLUDED.external_user_id,
          account_id       = EXCLUDED.account_id,
          updated_at       = now()
        `,
        [channelSlug, twitchUserId, twitchUserId, accountId]
      );
    }

    // 6) Ensure session.user is hydrated
    await hydrateSessionUser(decoded.user_id, req);

    return res.redirect("/dashboard?twitch=connected");
  } catch (err) {
    console.error("[auth:twitch/callback] error", err);
    return res.status(500).send("Twitch OAuth callback failed");
  }
});

async function hydrateSessionUser(userId, req) {
  try {
    const { rows } = await db.query(
      `SELECT id, username, email, avatar_url, bio, tags FROM users WHERE id = $1`,
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
