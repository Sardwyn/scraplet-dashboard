import db from "../../../db.js";
import { randomId, randomKey } from "../../runtime/crypto.js";
import { SUB_COUNTER_DEFAULTS } from "./defaults.js";

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

function clone(v) {
  if (v === null || v === undefined) return v;
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

function deepMerge(base, patch) {
  if (!isPlainObject(base)) return clone(patch);
  if (!isPlainObject(patch)) return clone(base);

  const out = clone(base);
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

// Create or load the user's Sub Counter widget row from public.obs_widgets
export async function getOrCreateUserSubCounter(ownerUserId) {
  const row = await oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled, created_at, updated_at
       FROM obs_widgets
      WHERE owner_user_id = $1 AND type = 'sub-counter'
      LIMIT 1`,
    [ownerUserId]
  );
  if (row) return row;

  const publicId = randomId();   // short public identifier
  const ingestKey = randomKey(); // secret-ish key (used by ingest endpoints / auth if needed)
  const defaults = SUB_COUNTER_DEFAULTS || {};

  const created = await one(
    `INSERT INTO obs_widgets (owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled)
     VALUES ($1, 'sub-counter', 'Sub Counter', $2, $3, $4::jsonb, true)
     RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled, created_at, updated_at`,
    [ownerUserId, publicId, ingestKey, JSON.stringify(defaults)]
  );

  return created;
}

// Merge config patch into existing config_json (do NOT replace)
export async function updateSubCounterConfig(ownerUserId, patchConfig) {
  const row = await getOrCreateUserSubCounter(ownerUserId);

  const base = row?.config_json || SUB_COUNTER_DEFAULTS || {};
  const patch = (patchConfig && typeof patchConfig === "object") ? patchConfig : {};
  const merged = deepMerge(base, patch);

  const updated = await one(
    `UPDATE obs_widgets
        SET config_json = $1::jsonb
      WHERE owner_user_id = $2 AND type = 'sub-counter'
      RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled, created_at, updated_at`,
    [JSON.stringify(merged), ownerUserId]
  );

  return updated;
}
