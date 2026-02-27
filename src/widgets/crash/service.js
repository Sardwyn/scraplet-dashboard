// src/widgets/crash/service.js
import db from "../../../db.js";
import { randomId, randomKey } from "../../runtime/crypto.js";
import { CRASH_DEFAULTS, getCrashDefaults } from "./defaults.js";

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

function crashBaseDefaults() {
  // Prefer named const if present; fall back to function for safety
  if (CRASH_DEFAULTS && typeof CRASH_DEFAULTS === "object") return CRASH_DEFAULTS;
  if (typeof getCrashDefaults === "function") return getCrashDefaults();
  return {
    skin_key: "neon-v1",
    variant: "horizontal",
    scale: 1,
    hud: { align: "top" },
  };
}

const SELECT_COLS =
  "id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled";

export async function getWidgetByPublicId(publicId) {
  return oneOrNone(
    `SELECT ${SELECT_COLS}
     FROM obs_widgets
     WHERE public_id = $1
     LIMIT 1`,
    [publicId]
  );
}

/**
 * Canonical: mirrors Plinko/Roulette
 */
export async function getOrCreateUserCrash(ownerUserId) {
  const existing = await oneOrNone(
    `SELECT ${SELECT_COLS}
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'crash'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  if (existing) return existing;

  const publicId = randomId(22);
  const ingestKey = randomKey(24);

  return one(
    `INSERT INTO obs_widgets (owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled)
     VALUES ($1, 'crash', 'Crash', $2, $3, $4::jsonb, true)
     RETURNING ${SELECT_COLS}`,
    [ownerUserId, publicId, ingestKey, JSON.stringify(crashBaseDefaults())]
  );
}

/**
 * Canonical: mirrors Plinko/Roulette
 */
export async function updateCrashConfig(ownerUserId, patchConfig) {
  const row = await oneOrNone(
    `SELECT ${SELECT_COLS}
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'crash'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  const base = row?.config_json || crashBaseDefaults();
  const merged = deepMerge(base, patchConfig || {});

  if (!row) {
    const created = await getOrCreateUserCrash(ownerUserId);
    return one(
      `UPDATE obs_widgets
       SET config_json = $1::jsonb
       WHERE id = $2 AND owner_user_id = $3
       RETURNING ${SELECT_COLS}`,
      [JSON.stringify(merged), created.id, ownerUserId]
    );
  }

  return one(
    `UPDATE obs_widgets
     SET config_json = $1::jsonb
     WHERE id = $2 AND owner_user_id = $3
     RETURNING ${SELECT_COLS}`,
    [JSON.stringify(merged), row.id, ownerUserId]
  );
}

/* ─────────────────────────────────────────────
   Back-compat exports (so older imports keep working)
   ───────────────────────────────────────────── */

export async function getOrCreateUserCrashWidget(ownerUserId) {
  return getOrCreateUserCrash(ownerUserId);
}

export async function updateUserCrashWidgetConfig(ownerUserId, patch = {}) {
  return updateCrashConfig(ownerUserId, patch);
}
