// src/widgets/blackjack/server/session-manager.js
import { createBjEngine } from "../../../lib/bj/index.js";
import { enqueueBlackjackEventForUser, setBlackjackPublicState } from "../ingest.js";
import { BLACKJACK_DEFAULTS } from "../defaults.js";

/**
 * sessions are scoped by:
 *   publicId + playerKey
 *
 * key format:
 *   `${publicId}:${playerKey}`
 */
const sessions = new Map();

function sessionKey(publicId, playerKey) {
  return `${publicId}:${playerKey}`;
}

function getSession(publicId, playerKey) {
  return sessions.get(sessionKey(publicId, playerKey)) || null;
}

function setSession(publicId, playerKey, session) {
  sessions.set(sessionKey(publicId, playerKey), session);
}

function deleteSession(publicId, playerKey) {
  sessions.delete(sessionKey(publicId, playerKey));
}

function nowMs() {
  return Date.now();
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function computeTurnEndsAtMs(phase, timeoutMs) {
  if (phase !== "PLAYER_TURN") return null;
  return nowMs() + clampInt(timeoutMs, 3000, 120000, 15000);
}

function clearTimeoutSafe(h) {
  try {
    if (h) clearTimeout(h);
  } catch {}
}

async function publish(ownerUserId, publicId, engine, state, meta) {
  const view = engine.toPublicView(state);

  // ✅ Spread the view into enriched
  const enriched = {
    ...view,
    meta: {
      playerKey: meta?.playerKey || null,
      playerName: meta?.playerName || null,
    },
    serverNowMs: nowMs(),
    turnEndsAtMs: meta?.turnEndsAtMs || null,
  };

  // Snapshot for overlay polling (even if you don't use overlay right now)
  setBlackjackPublicState(publicId, enriched);

  // Ring buffer snapshot (for recovery / future animation)
  await enqueueBlackjackEventForUser(ownerUserId, {
    type: "STATE_SNAPSHOT",
    roundId: enriched.roundId,
    phase: enriched.phase,
    bet: enriched.bet,
    player: enriched.player,
    dealer: enriched.dealer,
    legalActions: enriched.legalActions,
    result: enriched.result,
    meta: enriched.meta,
    serverNowMs: enriched.serverNowMs,
    turnEndsAtMs: enriched.turnEndsAtMs,
  });

  return enriched;
}

function scheduleAutoStand(publicId, playerKey) {
  const session = getSession(publicId, playerKey);
  if (!session) return;

  clearTimeoutSafe(session.turnTimerHandle);
  session.turnTimerHandle = null;

  if (session.state?.phase !== "PLAYER_TURN") return;

  const ends = session.turnEndsAtMs;
  if (!ends) return;

  const delay = Math.max(0, ends - nowMs());
  const token = (session.turnTimerToken = (session.turnTimerToken || 0) + 1);

  session.turnTimerHandle = setTimeout(async () => {
    const s = getSession(publicId, playerKey);
    if (!s) return;

    if (s.turnTimerToken !== token) return;
    if (s.state?.phase !== "PLAYER_TURN") return;

    try {
      await actForPlayer({
        ownerUserId: s.ownerUserId,
        publicId,
        playerKey,
        action: "STAND",
        _isAuto: true,
      });
    } catch (e) {
      console.error("[blackjack] auto-stand failed", e);
    }
  }, delay);
}

function scheduleAutoHideAfterSettled(publicId, playerKey) {
  const session = getSession(publicId, playerKey);
  if (!session) return;

  clearTimeoutSafe(session.hideHandle);
  session.hideHandle = null;

  if (session.state?.phase !== "SETTLED") return;

  const showOutcomeMs = clampInt(
    session.showOutcomeMs,
    0,
    60000,
    BLACKJACK_DEFAULTS?.visuals?.showOutcomeMs ?? 6000
  );

  const token = (session.hideToken = (session.hideToken || 0) + 1);

  session.hideHandle = setTimeout(() => {
    const s = getSession(publicId, playerKey);
    if (!s) return;
    if (s.hideToken !== token) return;

    // Hide overlay completely: clear snapshot
    setBlackjackPublicState(publicId, null);

    // Cleanup session
    clearTimeoutSafe(s.turnTimerHandle);
    clearTimeoutSafe(s.hideHandle);
    deleteSession(publicId, playerKey);
  }, showOutcomeMs);
}

/**
 * REAL entry point (Kick webhook + later Scrapbot hosting)
 */
export async function startRoundForPlayer({
  ownerUserId,
  publicId,
  playerKey,
  playerName = null,
  betAmount,
  turnTimeoutMs = BLACKJACK_DEFAULTS?.gameplay?.turnTimeoutMs ?? 15000,
  showOutcomeMs = BLACKJACK_DEFAULTS?.visuals?.showOutcomeMs ?? 6000,
}) {
  const prev = getSession(publicId, playerKey);
  if (prev) {
    clearTimeoutSafe(prev.turnTimerHandle);
    clearTimeoutSafe(prev.hideHandle);
  }

  const engine = createBjEngine();
  const roundId = `bj_${Date.now()}`;

  const created = engine.createRound({
    roundId,
    betAmount,
    currency: "channel_points",
  });

  if (!created?.state) throw new Error("Failed to create round");

  const started = engine.startRound(created.state);
  const state = started.state;

  const turnEndsAtMs = computeTurnEndsAtMs(state.phase, turnTimeoutMs);

  setSession(publicId, playerKey, {
    engine,
    state,
    ownerUserId,
    playerKey,
    playerName,
    turnTimeoutMs,
    showOutcomeMs,
    turnEndsAtMs,
    turnTimerHandle: null,
    turnTimerToken: 0,
    hideHandle: null,
    hideToken: 0,
  });

  const view = await publish(ownerUserId, publicId, engine, state, {
    playerKey,
    playerName,
    turnEndsAtMs,
  });

  scheduleAutoStand(publicId, playerKey);
  scheduleAutoHideAfterSettled(publicId, playerKey);

  return view;
}

/**
 * REAL entry point (Kick webhook + later Scrapbot hosting)
 * Returns null if there is no active round for that playerKey.
 */
export async function actForPlayer({
  ownerUserId,
  publicId,
  playerKey,
  action,
  _isAuto = false,
}) {
  const session = getSession(publicId, playerKey);
  if (!session) return null;

  if (session.state?.phase === "SETTLED") return null;

  clearTimeoutSafe(session.hideHandle);
  session.hideHandle = null;

  const result = session.engine.act(session.state, action);
  session.state = result.state;

  session.turnEndsAtMs = computeTurnEndsAtMs(session.state.phase, session.turnTimeoutMs);

  const view = await publish(ownerUserId, publicId, session.engine, session.state, {
    playerKey: session.playerKey,
    playerName: session.playerName,
    turnEndsAtMs: session.turnEndsAtMs,
  });

  scheduleAutoStand(publicId, playerKey);
  scheduleAutoHideAfterSettled(publicId, playerKey);

  if (_isAuto) {
    console.log("[blackjack] auto-stand applied", {
      publicId,
      playerKey,
      roundId: view.roundId,
      phase: view.phase,
    });
  }

  return view;
}

// DEV wrappers (keep your workflow working)
export async function startDevRound({ publicId, ownerUserId, betAmount = 100 }) {
  return startRoundForPlayer({
    ownerUserId,
    publicId,
    playerKey: "__dev__",
    playerName: "DEV",
    betAmount,
  });
}

export async function actDevRound({ publicId, ownerUserId, action }) {
  return actForPlayer({
    ownerUserId,
    publicId,
    playerKey: "__dev__",
    action,
  });
}
