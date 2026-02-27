// src/widgets/plinko/server/queue-manager.js
import db from "../../../../db.js";
import { randomId } from "../../../runtime/crypto.js";
import { getOrCreateUserPlinko } from "../service.js";
import { PLINKO_DEFAULTS } from "../defaults.js";
import { enqueuePlinkoEventForUser, setPlinkoPublicState } from "../ingest.js";
import { createPlinkoOutcome } from "./engine.js";
import { buildPlinkoNarration } from "../narrator.js";

// publicId -> runtime queue state
const runtimeByPublicId = new Map();

// per publicId + playerKey -> last enqueue ts
const cooldownByKey = new Map();

function nowMs() {
  return Date.now();
}

function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
}

function safeCfg(configJson) {
  const cfg = configJson || {};
  const g = cfg.gameplay || {};
  const bets = cfg.bets || {};
  const visuals = cfg.visuals || {};
  return {
    gameplay: {
      rows: clampInt(g.rows ?? PLINKO_DEFAULTS.gameplay.rows, 4, 18),
      multipliers: Array.isArray(g.multipliers) ? g.multipliers : PLINKO_DEFAULTS.gameplay.multipliers,
      maxConcurrentBalls: clampInt(g.maxConcurrentBalls ?? PLINKO_DEFAULTS.gameplay.maxConcurrentBalls, 1, 6),
      maxQueueLength: clampInt(g.maxQueueLength ?? PLINKO_DEFAULTS.gameplay.maxQueueLength, 1, 200),
      perUserQueueLimit: clampInt(g.perUserQueueLimit ?? PLINKO_DEFAULTS.gameplay.perUserQueueLimit, 1, 20),
      cooldownMs: clampInt(g.cooldownMs ?? PLINKO_DEFAULTS.gameplay.cooldownMs, 0, 120000),
      perRowMs: clampInt(g.perRowMs ?? PLINKO_DEFAULTS.gameplay.perRowMs, 80, 1000),
      padMs: clampInt(g.padMs ?? PLINKO_DEFAULTS.gameplay.padMs, 0, 5000),
    },
    bets: {
      min: clampInt(bets.min ?? PLINKO_DEFAULTS.bets.min, 1, 1000000),
      max: clampInt(bets.max ?? PLINKO_DEFAULTS.bets.max, 1, 1000000),
      step: clampInt(bets.step ?? PLINKO_DEFAULTS.bets.step, 1, 1000000),
      default: clampInt(bets.default ?? PLINKO_DEFAULTS.bets.default, 1, 1000000),
    },
    visuals,
    narration: cfg.narration || PLINKO_DEFAULTS.narration,
    bufferMax: clampInt(cfg.bufferMax ?? PLINKO_DEFAULTS.bufferMax, 50, 2000),
  };
}

function ensureRuntime(publicId) {
  let rt = runtimeByPublicId.get(publicId);
  if (rt) return rt;

  rt = {
    pending: [], // array of queued round envelopes
    inFlight: new Map(), // laneIndex -> round envelope
    timeouts: new Map(), // roundId -> timeout handle
  };

  runtimeByPublicId.set(publicId, rt);
  return rt;
}

function publicSnapshotFromRuntime(publicId, rt) {
  const inFlight = [];
  for (const [laneIndex, r] of rt.inFlight.entries()) {
    inFlight.push({
      roundId: r.roundId,
      playerName: r.playerName || null,
      playerKey: r.playerKey,
      betAmount: r.betAmount,
      rows: r.rows,
      laneIndex,
      finalSlot: r.finalSlot,
      multiplier: r.multiplier,
      payoutAmount: r.payoutAmount,
      startedAtMs: r.startedAtMs || null,
      seed: r.seed,
      path: r.path,
    });
  }

  const queuePreview = rt.pending.slice(0, 8).map((q) => ({
    roundId: q.roundId,
    playerName: q.playerName || null,
    playerKey: q.playerKey,
    betAmount: q.betAmount,
  }));

  // stable sort by lane for nicer overlay usage
  inFlight.sort((a, b) => (a.laneIndex ?? 0) - (b.laneIndex ?? 0));

  return {
    publicId,
    inFlight,
    queuePreview,
    queueLength: rt.pending.length,
  };
}

async function emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt }) {
  const snap = publicSnapshotFromRuntime(publicId, rt);
  setPlinkoPublicState(publicId, snap);

  await enqueuePlinkoEventForUser(
    ownerUserId,
    {
      type: "PLINKO_QUEUE_UPDATE",
      publicId,
      queueLength: snap.queueLength,
      queuePreview: snap.queuePreview,
      inFlightCount: snap.inFlight.length,
      maxConcurrentBalls: cfg.gameplay.maxConcurrentBalls,
    },
    cfg.bufferMax
  );
}

function computeAnimationBudgetMs(cfg) {
  return (cfg.gameplay.rows * cfg.gameplay.perRowMs) + cfg.gameplay.padMs;
}

function countPendingForPlayer(rt, playerKey) {
  let n = 0;
  for (const q of rt.pending) if (q.playerKey === playerKey) n++;
  for (const r of rt.inFlight.values()) if (r.playerKey === playerKey) n++;
  return n;
}

function checkCooldown(publicId, playerKey, cooldownMs) {
  const k = `${publicId}:${playerKey}`;
  const last = cooldownByKey.get(k) || 0;
  const now = nowMs();
  if (cooldownMs > 0 && now - last < cooldownMs) return false;
  cooldownByKey.set(k, now);
  if (cooldownByKey.size > 4000) {
    // trim oldest-ish (in insertion order)
    const drop = cooldownByKey.size - 3500;
    let i = 0;
    for (const kk of cooldownByKey.keys()) {
      cooldownByKey.delete(kk);
      i++;
      if (i >= drop) break;
    }
  }
  return true;
}

async function insertRoundRow({
  roundId,
  ownerUserId,
  widgetPublicId,
  platform,
  channelSlug,
  broadcasterUserId,
  playerKey,
  playerName,
  betAmount,
  currency,
  rows,
  multipliers,
  seed,
  path,
  finalSlot,
  multiplier,
  payoutAmount,
  laneIndex,
  status,
}) {
  await db.query(
    `
    INSERT INTO casino_plinko_rounds (
      round_id, owner_user_id, widget_public_id,
      platform, channel_slug, broadcaster_user_id,
      player_key, player_name,
      bet_amount, currency,
      rows, multipliers, seed, path, final_slot, multiplier, payout_amount,
      lane_index, status
    )
    VALUES (
      $1,$2,$3,
      $4,$5,$6,
      $7,$8,
      $9,$10,
      $11,$12::jsonb,$13,$14::jsonb,$15,$16,$17,
      $18,$19
    )
    ON CONFLICT (round_id) DO NOTHING
    `,
    [
      roundId,
      ownerUserId,
      widgetPublicId,
      platform || "kick",
      channelSlug || null,
      broadcasterUserId ? String(broadcasterUserId) : null,
      playerKey,
      playerName || null,
      betAmount,
      currency || "channel_points",
      rows,
      JSON.stringify(multipliers || []),
      seed,
      JSON.stringify(path || []),
      finalSlot,
      String(multiplier),
      payoutAmount,
      laneIndex != null ? Number(laneIndex) : null,
      status || "queued",
    ]
  );
}

async function updateRoundStatus(roundId, patch) {
  const sets = [];
  const vals = [];
  let i = 1;

  for (const [k, v] of Object.entries(patch || {})) {
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }

  vals.push(roundId);

  await db.query(
    `UPDATE casino_plinko_rounds SET ${sets.join(", ")} WHERE round_id = $${i}`,
    vals
  );
}

function firstFreeLane(rt, maxConcurrent) {
  for (let i = 0; i < maxConcurrent; i++) {
    if (!rt.inFlight.has(i)) return i;
  }
  return null;
}

/**
 * Enqueue a plinko drop (server authoritative).
 *
 * This is the Plinko equivalent of BJ's startRoundForPlayer,
 * except it queues and can run multi-ball.
 */
export async function enqueuePlinkoDrop({
  ownerUserId,
  playerKey,
  playerName,
  betAmount,
  currency = "channel_points",
  meta = {},
}) {
  const w = await getOrCreateUserPlinko(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "plinko_disabled" };

  const publicId = w.public_id;
  const cfg = safeCfg(w.config_json);

  // Validate config integrity
  const rows = cfg.gameplay.rows;
  const slotCount = rows + 1;
  const multipliers = Array.isArray(cfg.gameplay.multipliers) ? cfg.gameplay.multipliers.slice(0, slotCount) : [];
  while (multipliers.length < slotCount) multipliers.push(0);

  // Validate bet
  let bet = Number(betAmount || 0) || 0;
  if (bet < cfg.bets.min) bet = cfg.bets.min;
  if (bet > cfg.bets.max) bet = cfg.bets.max;

  // Cooldown
  if (!checkCooldown(publicId, playerKey, cfg.gameplay.cooldownMs)) {
    return { ok: false, error: "cooldown" };
  }

  const rt = ensureRuntime(publicId);

  // Queue caps
  if (rt.pending.length >= cfg.gameplay.maxQueueLength) {
    return { ok: false, error: "queue_full" };
  }

  const perUserCount = countPendingForPlayer(rt, playerKey);
  if (perUserCount >= cfg.gameplay.perUserQueueLimit) {
    return { ok: false, error: "per_user_limit" };
  }

  const roundId = randomId(22);
  const seed = `${publicId}:${roundId}:${playerKey}`;

  // Precompute authoritative outcome now (so it’s logged even if the overlay dies)
  const outcome = createPlinkoOutcome({
    seed,
    rows,
    multipliers,
    betAmount: bet,
  });

  const envelope = {
    roundId,
    ownerUserId,
    publicId,
    widgetPublicId: publicId,

    platform: meta?.platform || "kick",
    channelSlug: meta?.channelSlug || meta?.channel_slug || null,
    broadcasterUserId: meta?.broadcasterUserId || meta?.broadcaster_user_id || null,

    playerKey,
    playerName: playerName || null,

    currency,
    betAmount: bet,

    rows,
    multipliers,

    seed,
    path: outcome.path,
    finalSlot: outcome.finalSlot,
    multiplier: outcome.multiplier,
    payoutAmount: outcome.payoutAmount,

    meta,
    status: "queued",
  };

  rt.pending.push(envelope);

  await insertRoundRow({
    roundId,
    ownerUserId,
    widgetPublicId: publicId,
    platform: envelope.platform,
    channelSlug: envelope.channelSlug,
    broadcasterUserId: envelope.broadcasterUserId,
    playerKey,
    playerName,
    betAmount: bet,
    currency,
    rows,
    multipliers,
    seed,
    path: envelope.path,
    finalSlot: envelope.finalSlot,
    multiplier: envelope.multiplier,
    payoutAmount: envelope.payoutAmount,
    laneIndex: null,
    status: "queued",
  });

  await emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt });

  // Try start immediately
  await tickPlinkoQueue({ ownerUserId, publicId });

  return { ok: true, publicId, roundId };
}

/**
 * Progress the queue: start as many rounds as there are free lanes.
 */
export async function tickPlinkoQueue({ ownerUserId, publicId }) {
  const w = await getOrCreateUserPlinko(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "plinko_disabled" };

  const cfg = safeCfg(w.config_json);
  const rt = ensureRuntime(publicId);

  let started = 0;

  while (rt.pending.length > 0) {
    const laneIndex = firstFreeLane(rt, cfg.gameplay.maxConcurrentBalls);
    if (laneIndex == null) break;

    const next = rt.pending.shift();
    if (!next) break;

    next.laneIndex = laneIndex;
    next.status = "started";
    next.startedAtMs = nowMs();

    rt.inFlight.set(laneIndex, next);

    await updateRoundStatus(next.roundId, {
      status: "started",
      lane_index: laneIndex,
      started_at: new Date().toISOString(),
    });

    // Emit start event (overlay animates this deterministically from path)
    await enqueuePlinkoEventForUser(
      ownerUserId,
      {
        type: "PLINKO_ROUND_START",
        publicId,
        roundId: next.roundId,
        laneIndex,
        playerName: next.playerName,
        playerKey: next.playerKey,
        betAmount: next.betAmount,
        rows: next.rows,
        seed: next.seed,
        path: next.path,
        finalSlot: next.finalSlot,
        multiplier: next.multiplier,
        payoutAmount: next.payoutAmount,
      },
      cfg.bufferMax
    );

    // Server-side timeout to ensure queue never jams
    const budgetMs = computeAnimationBudgetMs(cfg);

    const t = setTimeout(async () => {
      try {
        await settlePlinkoRound({
          ownerUserId,
          publicId,
          roundId: next.roundId,
          reason: "timeout",
        });
      } catch (e) {
        console.error("[plinko] settle timeout failed", e?.message || e);
      }
    }, budgetMs);

    rt.timeouts.set(next.roundId, t);

    started++;
  }

  await emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt });

  return { ok: true, started };
}

/**
 * Called by overlay (optional) OR by server timeout (guaranteed).
 */
export async function settlePlinkoRound({ ownerUserId, publicId, roundId, reason = "overlay" }) {
  const w = await getOrCreateUserPlinko(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "plinko_disabled" };

  const cfg = safeCfg(w.config_json);
  const rt = ensureRuntime(publicId);

  // Find it in-flight
  let laneIndex = null;
  let round = null;

  for (const [lane, r] of rt.inFlight.entries()) {
    if (r.roundId === roundId) {
      laneIndex = lane;
      round = r;
      break;
    }
  }

  if (!round) {
    // already settled or unknown
    return { ok: true, ignored: "not_in_flight" };
  }

  // clear timeout
  const h = rt.timeouts.get(roundId);
  if (h) clearTimeout(h);
  rt.timeouts.delete(roundId);

  rt.inFlight.delete(laneIndex);

  // TODO (future): integrate points ledger here (debit bet on start, credit payout on settle).
  await updateRoundStatus(roundId, {
    status: "settled",
    settled_at: new Date().toISOString(),
  });

  await enqueuePlinkoEventForUser(
    ownerUserId,
    {
      type: "PLINKO_ROUND_SETTLED",
      publicId,
      roundId,
      laneIndex,
      playerName: round.playerName,
      playerKey: round.playerKey,
      betAmount: round.betAmount,
      finalSlot: round.finalSlot,
      multiplier: round.multiplier,
      payoutAmount: round.payoutAmount,
      reason,
    },
    cfg.bufferMax
  );

  // Narration (gate inside narrator)
  try {
    const n = buildPlinkoNarration({
      plinkoDefaults: PLINKO_DEFAULTS,
      widgetConfig: w.config_json,
      kind: "SETTLED",
      round,
      publicId,
    });

    if (n?.text) {
      // We do NOT call Scrapbot here directly (to keep widgets decoupled).
      // Instead, emit an event that kickWebhook.js (or a central dispatcher) can forward.
      // If you prefer direct calls like BJ, wire it in kickWebhook.js.
      await enqueuePlinkoEventForUser(
        ownerUserId,
        {
          type: "PLINKO_NARRATE",
          publicId,
          text: n.text,
          dedupeKey: n.dedupeKey,
          channelSlug: round.channelSlug || null,
          broadcasterUserId: round.broadcasterUserId ? String(round.broadcasterUserId) : null,
        },
        cfg.bufferMax
      );
    }
  } catch (e) {
    console.error("[plinko] narrator failed", e?.message || e);
  }

  await emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt });

  // Start next queued items if lanes free
  await tickPlinkoQueue({ ownerUserId, publicId });

  return { ok: true };
}
