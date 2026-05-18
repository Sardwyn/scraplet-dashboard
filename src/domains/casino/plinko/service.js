// src/domains/casino/plinko/service.js
//
// Casino domain wrapper for Plinko.
// - No platform knowledge
// - Calls the plinko widget engine (queue-manager) which handles DB truth + ring events
//

// Legacy widgets removed
const enqueuePlinkoDrop = async () => {};
const getOrCreateUserPlinko = async () => ({ public_id: 'dummy' });

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
