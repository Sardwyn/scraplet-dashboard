// routes/integrations/youtube.js
// Dashboard-first YouTube OAuth connect flow
// Writes ONLY to: external_accounts, external_account_tokens, channels

import express from "express";
import crypto from "crypto";
import db from "../../db.js";
import requireAuth from "../../utils/requireAuth.js";

const router = express.Router();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.upload",
  "openid",
  "email",
  "profile",
];


function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeChannelSlug(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // strip full URLs
  s = s.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");

  // normalize common prefixes
  s = s.replace(/^c\//i, "@");
  s = s.replace(/^channel\//i, "");

  // if it's not already a handle or UC id, treat it like a handle/title
  if (!s.startsWith("@") && !s.startsWith("UC")) s = "@" + s;

  s = s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_@-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!s) return null;
  return s.slice(0, 64);
}

async function exchangeCodeForTokens(code) {
  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = mustEnv("YOUTUBE_OAUTH_REDIRECT_URI");

  const body = new URLSearchParams({
    code: String(code),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j ? JSON.stringify(j) : `HTTP ${r.status}`;
    throw new Error(`Google token exchange failed: ${msg}`);
  }

  return j;
}

async function fetchMyYouTubeChannel(accessToken) {
  const qs = new URLSearchParams({
    part: "snippet",
    mine: "true",
    maxResults: "1",
  });

  const r = await fetch(`${YT_CHANNELS_URL}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j ? JSON.stringify(j) : `HTTP ${r.status}`;
    throw new Error(`YouTube channel lookup failed: ${msg}`);
  }

  const item = j?.items?.[0];
  if (!item?.id) throw new Error("YouTube channel lookup returned no channel id");

  const channelId = String(item.id);
  const title = item?.snippet?.title ? String(item.snippet.title) : null;
  const customUrl = item?.snippet?.customUrl ? String(item.snippet.customUrl) : null;

  return { channelId, title, customUrl };
}

// GET /integrations/youtube/connect
router.get("/integrations/youtube/connect", requireAuth, (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res
      .status(500)
      .send(
        "YouTube integration is not configured (missing GOOGLE_CLIENT_ID / YOUTUBE_OAUTH_REDIRECT_URI)"
      );
  }

  const state = randomState();
  req.session.youtubeOAuthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YT_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// GET /integrations/youtube/callback
router.get("/integrations/youtube/callback", requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { code, state, error } = req.query;

  if (error) return res.status(400).send(`YouTube OAuth error: ${String(error)}`);
  if (!code || !state) return res.status(400).send("Missing OAuth code/state");

  const expectedState = req.session.youtubeOAuthState;
  req.session.youtubeOAuthState = null;

  if (!expectedState || String(state) !== String(expectedState)) {
    return res.status(400).send("Invalid OAuth state");
  }

  const tokenJson = await exchangeCodeForTokens(code);

  const accessToken = tokenJson.access_token;
  const refreshToken = tokenJson.refresh_token || null;
  const tokenType = tokenJson.token_type || "Bearer";
  const expiresIn = Number(tokenJson.expires_in || 0);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  if (!accessToken) return res.status(400).send("OAuth succeeded but returned no access_token");

  const { channelId, title, customUrl } = await fetchMyYouTubeChannel(accessToken);

  const channelSlug =
    normalizeChannelSlug(customUrl) ||
    normalizeChannelSlug(title) ||
    normalizeChannelSlug(channelId) ||
    channelId;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // UPSERT external_accounts by (user_id, platform='youtube') — upgrades legacy row
    const ext = await client.query(
      `
      INSERT INTO public.external_accounts (user_id, platform, username, external_user_id, updated_at)
      VALUES ($1, 'youtube', $2, $3, NOW())
      ON CONFLICT (user_id, platform)
      DO UPDATE SET
        username = EXCLUDED.username,
        external_user_id = EXCLUDED.external_user_id,
        updated_at = NOW()
      RETURNING id
      `,
      [userId, title || channelSlug, channelId]
    );

    const externalAccountId = ext.rows[0].id;

    // UPSERT external_account_tokens by external_account_id (preserve refresh_token if missing)
    await client.query(
      `
      INSERT INTO public.external_account_tokens
        (external_account_id, access_token, refresh_token, scopes, expires_at, token_type, provider_meta, updated_at)
      VALUES
        ($1, $2, $3, $4::text[], $5, $6, $7::jsonb, NOW())
      ON CONFLICT (external_account_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, public.external_account_tokens.refresh_token),
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        token_type = EXCLUDED.token_type,
        provider_meta = EXCLUDED.provider_meta,
        updated_at = NOW()
      `,
      [externalAccountId, accessToken, refreshToken, YT_SCOPES, expiresAt, tokenType, tokenJson]
    );

    // ENSURE channels row exists (platform, external_user_id)
    await client.query(
      `
      INSERT INTO public.channels (platform, channel_slug, external_user_id, account_id, created_at, updated_at)
      VALUES ('youtube', $1, $2, $3, NOW(), NOW())
      ON CONFLICT (platform, external_user_id)
      DO UPDATE SET
        channel_slug = EXCLUDED.channel_slug,
        account_id = EXCLUDED.account_id,
        updated_at = NOW()
      `,
      [channelSlug, channelId, externalAccountId]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[youtube] callback failed:", e);
    return res.status(500).send("YouTube connect failed (see server logs)");
  } finally {
    client.release();
  }

  return res.redirect("/dashboard");
});

export default router;
