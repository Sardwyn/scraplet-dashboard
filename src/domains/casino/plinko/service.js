// src/domains/casino/plinko/service.js
//
// Casino domain wrapper for Plinko.
// - No platform knowledge
// - Calls the plinko widget engine (queue-manager) which handles DB truth + ring events
//

import { enqueuePlinkoDrop } from "../../../widgets/plinko/server/queue-manager.js";
import { getOrCreateUserPlinko } from "../../../widgets/plinko/service.js";

export async function plinkoDrop({
  ownerUserId,
  playerKey,
  playerName = null,
  betAmount,
  currency = "channel_points",
  meta = {},
}) {
  const w = await getOrCreateUserPlinko(ownerUserId);
  if (!w || !w.is_enabled) {
    return { ok: false, error: "plinko-disabled" };
  }

  const r = await enqueuePlinkoDrop({
    ownerUserId,
    playerKey,
    playerName,
    betAmount,
    currency,
    meta,
  });

  return {
    ok: !!r?.ok,
    error: r?.error || null,
    widgetPublicId: w.public_id,
    roundId: r?.roundId || null,
    publicId: w.public_id,
    raw: r,
  };
}
