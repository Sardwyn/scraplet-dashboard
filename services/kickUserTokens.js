// services/kickUserTokens.js
// SINGLE AUTHORITY: all Kick user tokens live in external_account_tokens.
// kick_tokens_user is DEPRECATED and no longer read or written.
import fetch from "node-fetch";

import {
  getExternalAccountForUserPlatform,
  getTokenRowByExternalAccountId,
  upsertExternalAccountToken,
} from "./externalAccountTokens.js";

// How early to refresh before expiry
const REFRESH_SKEW_MS = 60_000;

function nowMs() {
  return Date.now();
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return true;
  const ms = new Date(expiresAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return true;
  return ms - nowMs() < REFRESH_SKEW_MS;
}

async function refreshKickToken({ refreshToken }) {
  const url = process.env.KICK_TOKEN_URL || "https://id.kick.com/oauth/token";
  const clientId = String(process.env.KICK_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.KICK_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing KICK_CLIENT_ID / KICK_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: String(refreshToken || ""),
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Kick refresh failed: ${resp.status} ${(data && data.error) || ""}`.trim());
  }

  if (!data.access_token) {
    throw new Error("Kick refresh response missing access_token");
  }

  const expiresAt =
    data.expires_in && Number(data.expires_in) > 0
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: expiresAt,
    scope: data.scope || null,
    token_type: data.token_type || "Bearer",
    raw: data,
  };
}

/**
 * Returns a valid access_token for the user's Kick account.
 * SINGLE AUTHORITY: reads only from external_account_tokens.
 * If no token row exists, throws — user must re-authenticate.
 */
export async function getKickUserAccessToken(dashboardUserId) {
  const userId = Number(dashboardUserId);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const ea = await getExternalAccountForUserPlatform(userId, "kick");
  if (!ea?.id) {
    throw new Error(
      `kick_token_missing_external_account: no external_accounts row for dashboard_user_id=${userId} platform=kick – reauth required`
    );
  }

  const row = await getTokenRowByExternalAccountId(ea.id);
  if (!row) {
    throw new Error(
      `kick_token_missing_external_account_tokens: no token row for external_account_id=${ea.id} dashboard_user_id=${userId} – reauth required`
    );
  }

  // Valid token — return immediately
  if (row.access_token && !isExpiringSoon(row.expires_at)) {
    console.log("[kickUserTokens] token valid", {
      token_source: "external_account_tokens",
      dashboard_user_id: userId,
      external_account_id: ea.id,
      expires_at: row.expires_at,
    });
    return row.access_token;
  }

  // Needs refresh
  if (!row.refresh_token) {
    throw new Error(
      `kick_token_expired_no_refresh: external_account_id=${ea.id} dashboard_user_id=${userId} – reauth required`
    );
  }

  console.log("[kickUserTokens] refreshing token", {
    token_source: "external_account_tokens",
    dashboard_user_id: userId,
    external_account_id: ea.id,
    expires_at: row.expires_at,
  });

  const refreshed = await refreshKickToken({ refreshToken: row.refresh_token });

  await upsertExternalAccountToken({
    externalAccountId: ea.id,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: refreshed.expires_at,
    scopes: refreshed.scope ? String(refreshed.scope).split(" ") : [],
    tokenType: refreshed.token_type,
    providerMeta: { kick_refresh: { at: new Date().toISOString() } },
  });

  console.log("[kickUserTokens] token refreshed and stored", {
    token_source: "external_account_tokens",
    dashboard_user_id: userId,
    external_account_id: ea.id,
    expires_at: refreshed.expires_at,
  });

  return refreshed.access_token;
}

// Backwards-compat alias.
export async function getValidUserAccessToken(dashboardUserId) {
  return getKickUserAccessToken(dashboardUserId);
}

export async function deleteKickUserTokens(dashboardUserId) {
  const userId = Number(dashboardUserId);
  if (!Number.isFinite(userId) || userId <= 0) return;

  // Delete from single authority
  const ea = await getExternalAccountForUserPlatform(userId, "kick");
  if (ea?.id) {
    const { deleteTokenRowByExternalAccountId } = await import("./externalAccountTokens.js");
    await deleteTokenRowByExternalAccountId(ea.id);
  }
}
