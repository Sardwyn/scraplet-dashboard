// src/alerts/tokenService.js
import crypto from "crypto";
import db from "../../db.js";

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}

function randomTokenRaw() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createOverlayToken({ ownerUserId, scopes = [], label = "Alerts Overlay" }) {
  const raw = randomTokenRaw();
  const tokenHash = sha256Hex(raw);

  const { rows } = await db.query(
    `
    INSERT INTO overlay_tokens (owner_user_id, token_hash, scopes, label)
    VALUES ($1, $2, $3, $4)
    RETURNING id, owner_user_id, token_hash, scopes, label, revoked_at, created_at, last_used_at
    `,
    [ownerUserId, tokenHash, scopes, label]
  );

  return { raw, tokenRow: rows[0] };
}

export async function validateOverlayToken(rawToken, requiredScopes = []) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 10) {
    return { ok: false, reason: "missing_token" };
  }

  const tokenHash = sha256Hex(rawToken);

  const { rows } = await db.query(
    `
    SELECT id, owner_user_id, token_hash, scopes, label, revoked_at, created_at, last_used_at
    FROM overlay_tokens
    WHERE token_hash = $1
    LIMIT 1
    `,
    [tokenHash]
  );

  if (!rows.length) return { ok: false, reason: "invalid_token" };

  const tokenRow = rows[0];
  if (tokenRow.revoked_at) return { ok: false, reason: "revoked" };

  const scopes = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [];
  for (const s of requiredScopes) {
    if (!scopes.includes(s)) return { ok: false, reason: "missing_scope" };
  }

  // best-effort last_used_at (do not block on failure)
  db.query(`UPDATE overlay_tokens SET last_used_at = now() WHERE id = $1`, [tokenRow.id]).catch(() => {});

  return { ok: true, ownerUserId: Number(tokenRow.owner_user_id), tokenRow };
}
