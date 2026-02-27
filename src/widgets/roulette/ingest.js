// src/widgets/roulette/ingest.js
import { push as pushRing } from "../../runtime/ringBuffer.js";
import { getOrCreateUserRoulette } from "./service.js";
import { ROULETTE_DEFAULTS } from "./defaults.js";
import db from "../../../db.js";


/**
 * IMPORTANT:
 * DB is the source of truth for roulette "state".
 * Ring buffer is an optimization for event delivery.
 *
 * These are kept for backwards-compatibility with existing call sites,
 * but get/set public state are intentionally no-ops now.
 */

function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
}

export function setRoulettePublicState(_publicId, _publicView) {
  // No-op by design: DB truth only.
}

export function getRoulettePublicState(_publicId) {
  // No-op by design: DB truth only.
  return null;
}

export async function enqueueRouletteEventForUser(ownerUserId, event, bufferMaxOverride) {
  const w = await getOrCreateUserRoulette(ownerUserId);
  if (!w) throw new Error("roulette_widget_missing");

  const publicId = w.public_id;
  const max = clampInt(
    bufferMaxOverride ?? w?.config_json?.bufferMax ?? ROULETTE_DEFAULTS.bufferMax,
    50,
    5000
  );

  const lean = { ts: Date.now(), ...event };
  await pushRing(publicId, lean, max);
  return { ok: true, publicId };
}
