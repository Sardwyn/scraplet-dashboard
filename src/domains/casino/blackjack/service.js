// src/domains/casino/blackjack/service.js
//
// Casino domain wrapper for Blackjack.
// - No platform knowledge
// - Calls the blackjack widget engine (session-manager)
//

// Legacy widgets removed
const getOrCreateUserBlackjack = async () => ({ public_id: 'dummy' });
const BLACKJACK_DEFAULTS = {};
const buildBlackjackNarration = () => "Blackjack played.";
const getSession = async () => null;
const createSession = async () => ({});
const updateSession = async () => {};
const startRoundForPlayer = async () => ({ roundId: 'dummy' });
const actForPlayer = async () => ({});

export async function blackjackStartRound({
  ownerUserId,
  playerKey,
  playerName = null,
  betAmount,
  currency = "channel_points",
  meta = {},
}) {
  const w = await getOrCreateUserBlackjack(ownerUserId);
  if (!w || !w.is_enabled) {
    return { ok: false, error: "blackjack-disabled" };
  }

  const cfg = w.config_json || {};
  const table = { ...BLACKJACK_DEFAULTS, ...(cfg.table || {}) };

  const state = await startRoundForPlayer({
    publicId: w.public_id,
    ownerUserId,
    playerKey,
    playerName,
    betAmount,
    currency,
    table,
    meta,
  });

  return {
    ok: true,
    widgetPublicId: w.public_id,
    publicId: w.public_id,
    roundId: state?.roundId || null,
    state,
  };
}

export async function blackjackAct({
  ownerUserId,
  playerKey,
  playerName = null,
  action, // HIT | STAND | DOUBLE
}) {
  const w = await getOrCreateUserBlackjack(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "blackjack-disabled" };

  const updated = await actForPlayer({
    ownerUserId,
    playerKey,
    action,
  });

  if (!updated) return { ok: false, error: "no_active_round" };

  const narration = buildBlackjackNarration({
    state: updated,
    playerName,
    playerKey,
    action,
    publicId: w.public_id,
  });

  return {
    ok: true,
    publicId: w.public_id,
    widgetPublicId: w.public_id,
    state: updated,
    narration,
  };
}
