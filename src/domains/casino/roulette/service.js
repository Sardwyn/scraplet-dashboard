// src/domains/casino/roulette/service.js
//
// Domain wrapper for Roulette.
// Platform brains call this.
// This module has NO platform knowledge; it delegates to the widget engine,
// which is responsible for DB truth + ring buffer emission.
//
// Key behavior: reward redemptions have no bet selection, so if betType is
// "straight" and betValue is missing/invalid, we auto-pick a valid number
// ("0".."36") rather than sending an invalid placeholder like "random".

import crypto from "crypto";
import { enqueueRouletteSpin } from "../../../widgets/roulette/server/queue-manager.js";
import { getOrCreateUserRoulette } from "../../../widgets/roulette/service.js";

function randomStraightValue(wheel = "european") {
  // Your DB schema uses result_number as integer, so we stick to numeric values.
  // European: 0..36
  // (If you later add american with 00, you’ll need a different representation.)
  const max = 36;
  const n = crypto.randomInt(0, max + 1);
  return String(n);
}

function normalizeDefaults({ betType, betValue, wheel }) {
  const t = String(betType || "").trim().toLowerCase();
  const v = betValue == null ? "" : String(betValue).trim();

  // Reward path uses straight bet with no selection -> pick valid number.
  if (t === "straight") {
    if (!v || v.toLowerCase() === "random") {
      return { betType: "straight", betValue: randomStraightValue(wheel) };
    }
    // must be 0..36
    if (!/^\d+$/.test(v)) return { betType: "straight", betValue: null };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 36) return { betType: "straight", betValue: null };
    return { betType: "straight", betValue: String(n) };
  }

  // For any other bet types, we leave values untouched (engine validates).
  return { betType: betType, betValue: betValue };
}

export async function rouletteSpin({
  ownerUserId,
  playerKey,
  playerName = null,
  betAmount,
  currency = "channel_points",
  betType = "straight",
  betValue = null,
  meta = {},
}) {
  const w = await getOrCreateUserRoulette(ownerUserId);
  if (!w || !w.is_enabled) {
    return { ok: false, error: "roulette-disabled" };
  }

  const wheel = w?.config_json?.wheel || "european";
  const normalized = normalizeDefaults({ betType, betValue, wheel });

  if (String(normalized.betType || "").toLowerCase() === "straight" && !normalized.betValue) {
    return {
      ok: false,
      error: "bad_bet_value",
      widgetPublicId: w.public_id,
      publicId: w.public_id,
      roundId: null,
      raw: { ok: false, error: "bad_bet_value" },
    };
  }

  const r = await enqueueRouletteSpin({
    ownerUserId,
    publicId: w.public_id,
    playerKey,
    playerName,
    betAmount,
    currency,
    betType: normalized.betType,
    betValue: normalized.betValue,
    meta,
  });

  if (!r?.ok || !r?.roundId) {
    return {
      ok: false,
      error: r?.error || "roulette_enqueue_failed",
      widgetPublicId: w.public_id,
      publicId: w.public_id,
      roundId: r?.roundId || null,
      raw: r || null,
    };
  }

  return {
    ok: true,
    error: null,
    widgetPublicId: w.public_id,
    publicId: w.public_id,
    roundId: r.roundId,
    raw: r,
  };
}
