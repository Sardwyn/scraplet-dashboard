// src/widgets/chat-overlay/service.js
import db from "../../../db.js";
import { randomId, randomKey } from "../../runtime/crypto.js";
import { CHAT_OVERLAY_DEFAULTS } from "./defaults.js";

async function oneOrNone(sql, params) {
  const r = await db.query(sql, params);
  return r.rows?.[0] || null;
}

async function one(sql, params) {
  const r = await db.query(sql, params);
  const row = r.rows?.[0];
  if (!row) throw new Error("Expected 1 row, got 0");
  return row;
}

export async function getWidgetByPublicId(publicId) {
  return oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE public_id = $1 AND type = 'chat_overlay'
     LIMIT 1`,
    [publicId]
  );
}

export async function getOrCreateUserChatOverlay(ownerUserId) {
  const existing = await oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'chat_overlay'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  if (existing) return existing;

  const publicId = randomId(22);
  const ingestKey = randomKey(24);

  const created = await one(
    `INSERT INTO obs_widgets (owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled)
     VALUES ($1, 'chat_overlay', 'Chat Overlay', $2, $3, $4::jsonb, true)
     RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled`,
    [ownerUserId, publicId, ingestKey, JSON.stringify(CHAT_OVERLAY_DEFAULTS)]
  );

  return created;
}

export async function updateUserChatOverlay(ownerUserId, patchConfig) {
  const row = await getOrCreateUserChatOverlay(ownerUserId);

  function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function deepMerge(base, patch) {
    const out = { ...(base || {}) };

    for (const [k, v] of Object.entries(patch || {})) {
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = deepMerge(out[k], v);
      } else {
        out[k] = v;
      }
    }

    return out;
  }

  const merged = deepMerge(row.config_json || {}, patchConfig || {});

  return one(
    `UPDATE obs_widgets
     SET config_json = $1::jsonb
     WHERE id = $2 AND owner_user_id = $3
     RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled`,
    [JSON.stringify(merged), row.id, ownerUserId]
  );
}

