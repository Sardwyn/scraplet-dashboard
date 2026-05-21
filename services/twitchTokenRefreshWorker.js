// services/twitchTokenRefreshWorker.js
// Background worker: proactively refreshes expiring Twitch user tokens.
// Mirrors kickTokenRefreshWorker — same single-authority pattern on external_account_tokens.

import db from "../db.js";
import fetch from "node-fetch";
import {
  getTokenRowByExternalAccountId,
  upsertExternalAccountToken,
} from "./externalAccountTokens.js";

const INTERVAL_MS = Number(process.env.TWITCH_TOKEN_REFRESH_INTERVAL_MS || 300_000); // 5 min
const LOOKAHEAD_MIN = 15; // Twitch tokens can expire fast — refresh 15 min ahead

let running = false;

function cleanEnv(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}

async function refreshTwitchToken({ refreshToken }) {
  const clientId = cleanEnv(process.env.TWITCH_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.TWITCH_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error("Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Twitch refresh failed: ${resp.status} ${data?.message || data?.error || ""}`.trim()
    );
  }

  if (!data.access_token) {
    throw new Error("Twitch refresh response missing access_token");
  }

  const expiresAt =
    data.expires_in && Number(data.expires_in) > 0
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // Twitch rotates refresh tokens
    expires_at: expiresAt,
    scope: data.scope || null,
    token_type: data.token_type || "Bearer",
  };
}

async function tick() {
  if (running) return;
  running = true;

  const label = "[twitchTokenRefresh]";
  let refreshed = 0;
  let failed = 0;

  try {
    const { rows } = await db.query(`
      SELECT ea.user_id   AS dashboard_user_id,
             ea.id         AS external_account_id,
             eat.expires_at,
             eat.refresh_ok_at
        FROM external_accounts ea
        JOIN external_account_tokens eat ON eat.external_account_id = ea.id
       WHERE ea.platform = 'twitch'
         AND eat.refresh_token IS NOT NULL
         AND eat.refresh_failed_at IS NULL
         AND (
           eat.expires_at IS NULL
           OR eat.expires_at < now() + interval '${LOOKAHEAD_MIN} minutes'
           OR eat.refresh_ok_at IS NULL
           OR eat.refresh_ok_at < now() - interval '12 hours'
         )
       ORDER BY eat.expires_at ASC NULLS FIRST
    `);

    if (!rows.length) return;

    console.log(`${label} ${rows.length} candidate(s) need refresh`);

    for (const row of rows) {
      try {
        const tokenRow = await getTokenRowByExternalAccountId(row.external_account_id);
        if (!tokenRow?.refresh_token) {
          console.warn(`${label} no refresh_token for external_account_id=${row.external_account_id} — skipping`);
          continue;
        }

        const refreshed_tokens = await refreshTwitchToken({ refreshToken: tokenRow.refresh_token });

        await upsertExternalAccountToken({
          externalAccountId: row.external_account_id,
          accessToken: refreshed_tokens.access_token,
          refreshToken: refreshed_tokens.refresh_token,
          expiresAt: refreshed_tokens.expires_at,
          scopes: refreshed_tokens.scope
            ? (Array.isArray(refreshed_tokens.scope)
                ? refreshed_tokens.scope
                : String(refreshed_tokens.scope).split(" "))
            : [],
          tokenType: refreshed_tokens.token_type,
          providerMeta: { twitch_refresh: { at: new Date().toISOString() } },
        });

        refreshed++;
        console.log(`${label} refreshed`, {
          dashboard_user_id: row.dashboard_user_id,
          external_account_id: row.external_account_id,
          expires_at: refreshed_tokens.expires_at,
        });
      } catch (err) {
        failed++;
        console.warn(`${label} failed`, {
          dashboard_user_id: row.dashboard_user_id,
          external_account_id: row.external_account_id,
          error: err?.message || String(err),
        });
      }
    }

    console.log(`${label} done`, { candidates: rows.length, refreshed, failed });
  } catch (err) {
    console.error(`${label} tick error`, err?.message || err);
  } finally {
    running = false;
  }
}

export function startTwitchTokenRefreshWorker() {
  console.log("[twitchTokenRefresh] starting", {
    intervalMs: INTERVAL_MS,
    lookaheadMin: LOOKAHEAD_MIN,
  });

  // First tick after a short delay so server is fully booted
  setTimeout(() => tick().catch(() => {}), 8_000);
  setInterval(() => tick().catch(() => {}), INTERVAL_MS);
}
