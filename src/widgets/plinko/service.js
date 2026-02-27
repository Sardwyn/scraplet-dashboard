// src/widgets/plinko/service.js
import db from "../../../db.js";
import { randomId, randomKey } from "../../runtime/crypto.js";
import { PLINKO_DEFAULTS } from "./defaults.js";

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

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function structuredCloneSafe(v) {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

function deepMerge(base, patch) {
  if (!isPlainObject(base)) return structuredCloneSafe(patch);
  if (!isPlainObject(patch)) return structuredCloneSafe(base);

  const out = structuredCloneSafe(base);
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = structuredCloneSafe(v);
  }
  return out;
}

export async function getWidgetByPublicId(publicId) {
  return oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE public_id = $1
     LIMIT 1`,
    [publicId]
  );
}

export async function getOrCreateUserPlinko(ownerUserId) {
  const existing = await oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'plinko'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  if (existing) return existing;

  const publicId = randomId(22);
  const ingestKey = randomKey(24);

  const created = await one(
    `INSERT INTO obs_widgets (owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled)
     VALUES ($1, 'plinko', 'Plinko Board', $2, $3, $4::jsonb, true)
     RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled`,
    [ownerUserId, publicId, ingestKey, JSON.stringify(PLINKO_DEFAULTS)]
  );

  return created;
}

export async function updatePlinkoConfig(ownerUserId, patchConfig) {
  const row = await oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'plinko'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  const base = row?.config_json || PLINKO_DEFAULTS;
  const merged = deepMerge(base, patchConfig || {});

  if (!row) {
    const created = await getOrCreateUserPlinko(ownerUserId);
    // update newly created config immediately
    return one(
      `UPDATE obs_widgets
       SET config_json = $1::jsonb
       WHERE id = $2 AND owner_user_id = $3
       RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled`,
      [JSON.stringify(merged), created.id, ownerUserId]
    );
  }

  return one(
    `UPDATE obs_widgets
     SET config_json = $1::jsonb
     WHERE id = $2 AND owner_user_id = $3
     RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled`,
    [JSON.stringify(merged), row.id, ownerUserId]
  );
}
