// src/widgets/roulette/service.js
import db from "../../../db.js";
import { randomId, randomKey } from "../../runtime/crypto.js";
import { ROULETTE_DEFAULTS } from "./defaults.js";

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

export async function getOrCreateUserRoulette(ownerUserId) {
  const existing = await oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'roulette'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  if (existing) return existing;

  const publicId = randomId(22);
  const ingestKey = randomKey(24);

  return one(
    `INSERT INTO obs_widgets (owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled)
     VALUES ($1, 'roulette', 'Roulette Wheel', $2, $3, $4::jsonb, true)
     RETURNING id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled`,
    [ownerUserId, publicId, ingestKey, JSON.stringify(ROULETTE_DEFAULTS)]
  );
}

export async function updateRouletteConfig(ownerUserId, patchConfig) {
  const row = await oneOrNone(
    `SELECT id, owner_user_id, type, name, public_id, ingest_key, config_json, is_enabled
     FROM obs_widgets
     WHERE owner_user_id = $1 AND type = 'roulette'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerUserId]
  );

  const base = row?.config_json || ROULETTE_DEFAULTS;
  const merged = deepMerge(base, patchConfig || {});

  if (!row) {
    const created = await getOrCreateUserRoulette(ownerUserId);
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

/**
 * DB-backed public state (authoritative).
 * - inFlight = status='started' (ordered by lane_index)
 * - queuePreview = earliest status='queued' (ordered by created_at)
 * - queueLength = count queued
 */
export async function getRoulettePublicStateFromDb(publicId) {
  if (!publicId) return null;

  const startedRes = await db.query(
    `
    SELECT
      round_id,
      player_key,
      player_name,
      bet_amount,
      bet_type,
      bet_value,
      wheel,
      result_number,
      result_color,
      multiplier,
      payout_amount,
      seed,
      lane_index,
      started_at
    FROM casino_roulette_rounds
    WHERE widget_public_id = $1
      AND status = 'started'
    ORDER BY lane_index ASC NULLS LAST, started_at DESC NULLS LAST
    `,
    [publicId]
  );

  const queuedPreviewRes = await db.query(
    `
    SELECT
      round_id,
      player_key,
      player_name,
      bet_amount,
      bet_type,
      bet_value
    FROM casino_roulette_rounds
    WHERE widget_public_id = $1
      AND status = 'queued'
    ORDER BY created_at ASC, round_id ASC
    LIMIT 8
    `,
    [publicId]
  );

  const queuedCountRes = await db.query(
    `
    SELECT COUNT(*)::int AS n
    FROM casino_roulette_rounds
    WHERE widget_public_id = $1
      AND status = 'queued'
    `,
    [publicId]
  );

  const inFlight = (startedRes.rows || []).map((r) => ({
    roundId: r.round_id,
    playerName: r.player_name || null,
    playerKey: r.player_key,
    betAmount: Number(r.bet_amount || 0),
    betType: r.bet_type,
    betValue: r.bet_value,
    laneIndex: r.lane_index != null ? Number(r.lane_index) : null,
    wheel: r.wheel,
    resultNumber: r.result_number != null ? Number(r.result_number) : null,
    resultColor: r.result_color || null,
    multiplier: r.multiplier != null ? Number(r.multiplier) : null,
    payoutAmount: r.payout_amount != null ? Number(r.payout_amount) : null,
    seed: r.seed || null,
    startedAtMs: r.started_at ? Date.parse(r.started_at) : null,
  }));

  const queuePreview = (queuedPreviewRes.rows || []).map((q) => ({
    roundId: q.round_id,
    playerName: q.player_name || null,
    playerKey: q.player_key,
    betAmount: Number(q.bet_amount || 0),
    betType: q.bet_type,
    betValue: q.bet_value,
  }));

  const queueLength = queuedCountRes.rows?.[0]?.n ?? 0;

  return { publicId, inFlight, queuePreview, queueLength };
}
