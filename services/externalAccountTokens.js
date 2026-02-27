// services/externalAccountTokens.js
import db from "../db.js";

export async function getExternalAccountForUserPlatform(userId, platform) {
  const { rows } = await db.query(
    `
    SELECT id, platform, external_user_id, username, user_id
    FROM external_accounts
    WHERE user_id = $1 AND platform = $2
    LIMIT 1
    `,
    [userId, String(platform)]
  );
  return rows[0] || null;
}

export async function upsertExternalAccountToken({
  externalAccountId,
  accessToken,
  refreshToken = null,
  expiresAt = null,
  scopes = [],
  tokenType = "Bearer",
  providerMeta = {},
}) {
  const { rows } = await db.query(
    `
    INSERT INTO external_account_tokens (
      external_account_id,
      access_token,
      refresh_token,
      expires_at,
      scopes,
      token_type,
      provider_meta,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5::text[], $6, $7::jsonb, now())
    ON CONFLICT (external_account_id) DO UPDATE SET
      access_token  = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, external_account_tokens.refresh_token),
      expires_at    = EXCLUDED.expires_at,
      scopes        = EXCLUDED.scopes,
      token_type    = EXCLUDED.token_type,
      provider_meta = external_account_tokens.provider_meta || EXCLUDED.provider_meta,
      updated_at    = now()
    RETURNING *
    `,
    [
      externalAccountId,
      String(accessToken || ""),
      refreshToken ? String(refreshToken) : null,
      expiresAt ? new Date(expiresAt).toISOString() : null,
      Array.isArray(scopes) ? scopes.map(String) : [],
      tokenType ? String(tokenType) : null,
      JSON.stringify(providerMeta || {}),
    ]
  );
  return rows[0] || null;
}

export async function getTokenRowByExternalAccountId(externalAccountId) {
  const { rows } = await db.query(
    `
    SELECT external_account_id, access_token, refresh_token, expires_at, scopes, token_type, provider_meta, updated_at
    FROM external_account_tokens
    WHERE external_account_id = $1
    LIMIT 1
    `,
    [externalAccountId]
  );
  return rows[0] || null;
}

export async function deleteTokenRowByExternalAccountId(externalAccountId) {
  await db.query(`DELETE FROM external_account_tokens WHERE external_account_id = $1`, [
    externalAccountId,
  ]);
}
