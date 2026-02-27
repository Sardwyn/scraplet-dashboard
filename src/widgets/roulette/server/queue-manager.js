// src/widgets/roulette/server/queue-manager.js
import db from "../../../../db.js";
import { randomId } from "../../../runtime/crypto.js";
import { getOrCreateUserRoulette, getWidgetByPublicId } from "../service.js";
import { ROULETTE_DEFAULTS } from "../defaults.js";
import { enqueueRouletteEventForUser, setRoulettePublicState } from "../ingest.js";
import { createRouletteOutcome, normalizeBet } from "./engine.js";
import { buildRouletteNarration } from "../narrator.js";

const runtimeByPublicId = new Map();
const cooldownByKey = new Map();

let reconcilerStarted = false;

function nowMs() { return Date.now(); }

function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
}

function safeCfg(configJson) {
  const cfg = configJson || {};
  const g = cfg.gameplay || {};
  const bets = cfg.bets || {};
  return {
    gameplay: {
      wheel: String(g.wheel ?? ROULETTE_DEFAULTS.gameplay.wheel),
      maxConcurrentSpins: clampInt(g.maxConcurrentSpins ?? ROULETTE_DEFAULTS.gameplay.maxConcurrentSpins, 1, 3),
      maxQueueLength: clampInt(g.maxQueueLength ?? ROULETTE_DEFAULTS.gameplay.maxQueueLength, 1, 200),
      perUserQueueLimit: clampInt(g.perUserQueueLimit ?? ROULETTE_DEFAULTS.gameplay.perUserQueueLimit, 1, 20),
      cooldownMs: clampInt(g.cooldownMs ?? ROULETTE_DEFAULTS.gameplay.cooldownMs, 0, 120000),
      allowedBets: g.allowedBets || ROULETTE_DEFAULTS.gameplay.allowedBets,
    },
    bets: {
      min: clampInt(bets.min ?? ROULETTE_DEFAULTS.bets.min, 1, 1000000),
      max: clampInt(bets.max ?? ROULETTE_DEFAULTS.bets.max, 1, 1000000),
      step: clampInt(bets.step ?? ROULETTE_DEFAULTS.bets.step, 1, 1000000),
      default: clampInt(bets.default ?? ROULETTE_DEFAULTS.bets.default, 1, 1000000),
    },
    visuals: cfg.visuals || ROULETTE_DEFAULTS.visuals,
    narration: cfg.narration || ROULETTE_DEFAULTS.narration,
    bufferMax: clampInt(cfg.bufferMax ?? ROULETTE_DEFAULTS.bufferMax, 50, 2000),
  };
}

function computeAnimationBudgetMs(cfg) {
  const w = cfg.visuals?.wheel || {};
  const a = clampInt(w.spinMsMin ?? 2800, 800, 12000);
  const b = clampInt(w.spinMsMax ?? 4200, 800, 12000);
  return Math.max(a, b) + 500;
}

function ensureRuntime(publicId) {
  let rt = runtimeByPublicId.get(publicId);
  if (rt) return rt;

  rt = {
    pending: [],
    inFlight: new Map(), // laneIndex -> envelope
    timeouts: new Map(), // roundId -> timeout handle
    hydratedAtMs: 0,
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
      betType: r.betType,
      betValue: r.betValue,
      laneIndex,
      wheel: r.wheel,
      resultNumber: r.resultNumber,
      resultColor: r.resultColor,
      multiplier: r.multiplier,
      payoutAmount: r.payoutAmount,
      seed: r.seed,
      startedAtMs: r.startedAtMs || null,
    });
  }

  const queuePreview = rt.pending.slice(0, 8).map((q) => ({
    roundId: q.roundId,
    playerName: q.playerName || null,
    playerKey: q.playerKey,
    betAmount: q.betAmount,
    betType: q.betType,
    betValue: q.betValue,
  }));

  inFlight.sort((a, b) => (a.laneIndex ?? 0) - (b.laneIndex ?? 0));

  return { publicId, inFlight, queuePreview, queueLength: rt.pending.length };
}

async function emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt }) {
  const snap = publicSnapshotFromRuntime(publicId, rt);
  // no-op now (DB truth), but keep call for backward compat + any old code paths
  setRoulettePublicState(publicId, snap);

  await enqueueRouletteEventForUser(
    ownerUserId,
    {
      type: "ROULETTE_QUEUE_UPDATE",
      publicId,
      queueLength: snap.queueLength,
      queuePreview: snap.queuePreview,
      inFlightCount: snap.inFlight.length,
      maxConcurrentSpins: cfg.gameplay.maxConcurrentSpins,
    },
    cfg.bufferMax
  );
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
    const drop = cooldownByKey.size - 3500;
    let i = 0;
    for (const kk of cooldownByKey.keys()) {
      cooldownByKey.delete(kk);
      if (++i >= drop) break;
    }
  }
  return true;
}

function firstFreeLane(rt, maxConcurrent) {
  for (let i = 0; i < maxConcurrent; i++) {
    if (!rt.inFlight.has(i)) return i;
  }
  return null;
}

function rowToEnv(row) {
  return {
    roundId: row.round_id,
    ownerUserId: row.owner_user_id,
    publicId: row.widget_public_id,
    widgetPublicId: row.widget_public_id,

    platform: row.platform || "kick",
    channelSlug: row.channel_slug || null,
    broadcasterUserId: row.broadcaster_user_id || null,

    playerKey: row.player_key,
    playerName: row.player_name || null,

    currency: row.currency || "channel_points",
    betAmount: Number(row.bet_amount || 0),
    wheel: row.wheel || "european",
    betType: row.bet_type,
    betValue: row.bet_value,

    seed: row.seed,
    resultNumber: row.result_number != null ? Number(row.result_number) : null,
    resultColor: row.result_color || null,
    multiplier: row.multiplier != null ? Number(row.multiplier) : null,
    payoutAmount: row.payout_amount != null ? Number(row.payout_amount) : null,

    laneIndex: row.lane_index != null ? Number(row.lane_index) : null,
    status: row.status,
    startedAtMs: row.started_at ? Date.parse(row.started_at) : null,
  };
}

async function hydrateRuntimeFromDbIfNeeded(publicId, rt) {
  const now = nowMs();
  if (rt.hydratedAtMs && now - rt.hydratedAtMs < 10_000) return;

  // Only hydrate if runtime is empty (typical restart case)
  if (rt.pending.length !== 0 || rt.inFlight.size !== 0) return;

  // Load started rounds (in flight)
  const started = await db.query(
    `
    SELECT *
    FROM casino_roulette_rounds
    WHERE widget_public_id = $1
      AND status = 'started'
    ORDER BY lane_index ASC NULLS LAST, started_at DESC NULLS LAST
    `,
    [publicId]
  );

  for (const row of (started.rows || [])) {
    const env = rowToEnv(row);
    if (env.laneIndex == null) continue;
    rt.inFlight.set(env.laneIndex, env);
  }

  // Load queued rounds
  const queued = await db.query(
    `
    SELECT *
    FROM casino_roulette_rounds
    WHERE widget_public_id = $1
      AND status = 'queued'
    ORDER BY created_at ASC, round_id ASC
    `,
    [publicId]
  );

  rt.pending = (queued.rows || []).map(rowToEnv);

  rt.hydratedAtMs = now;
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
  await db.query(`UPDATE casino_roulette_rounds SET ${sets.join(", ")} WHERE round_id = $${i}`, vals);
}

async function insertRoundRow(env) {
  await db.query(
    `
    INSERT INTO casino_roulette_rounds (
      round_id, owner_user_id, widget_public_id,
      platform, channel_slug, broadcaster_user_id,
      player_key, player_name,
      bet_amount, currency,
      wheel, bet_type, bet_value,
      seed, result_number, result_color, multiplier, payout_amount,
      lane_index, status
    )
    VALUES (
      $1,$2,$3,
      $4,$5,$6,
      $7,$8,
      $9,$10,
      $11,$12,$13,
      $14,$15,$16,$17,$18,
      $19,$20
    )
    ON CONFLICT (round_id) DO NOTHING
    `,
    [
      env.roundId,
      env.ownerUserId,
      env.widgetPublicId,
      env.platform || "kick",
      env.channelSlug || null,
      env.broadcasterUserId ? String(env.broadcasterUserId) : null,
      env.playerKey,
      env.playerName || null,
      env.betAmount,
      env.currency || "channel_points",
      env.wheel || "european",
      env.betType,
      env.betValue,
      env.seed,
      env.resultNumber,
      env.resultColor,
      String(env.multiplier),
      env.payoutAmount,
      env.laneIndex != null ? Number(env.laneIndex) : null,
      env.status || "queued",
    ]
  );
}

/**
 * DB-driven settle (restart safe).
 * - reads round row
 * - if started -> sets settled
 * - emits settle + narration
 */
async function settleRouletteRoundDb({ ownerUserId, publicId, roundId, reason = "overlay", cfgForBuffer = null }) {
  const r = await db.query(
    `SELECT * FROM casino_roulette_rounds WHERE round_id = $1 AND widget_public_id = $2 LIMIT 1`,
    [roundId, publicId]
  );
  const row = r.rows?.[0];
  if (!row) return { ok: true, ignored: "missing" };

  if (row.status === "settled") return { ok: true, ignored: "already_settled" };
  if (row.status !== "started") return { ok: true, ignored: "not_started" };

  await updateRoundStatus(roundId, {
    status: "settled",
    settled_at: new Date().toISOString(),
  });

  const env = rowToEnv({ ...row, status: "settled" });

  const bufferMax = cfgForBuffer?.bufferMax;

  await enqueueRouletteEventForUser(
    ownerUserId,
    {
      type: "ROULETTE_ROUND_SETTLED",
      publicId,
      roundId,
      laneIndex: env.laneIndex,
      playerName: env.playerName,
      playerKey: env.playerKey,
      betAmount: env.betAmount,
      wheel: env.wheel,
      betType: env.betType,
      betValue: env.betValue,
      resultNumber: env.resultNumber,
      resultColor: env.resultColor,
      multiplier: env.multiplier,
      payoutAmount: env.payoutAmount,
      reason,
    },
    bufferMax
  );

  try {
    const w = await getOrCreateUserRoulette(ownerUserId);
    const cfg = safeCfg(w?.config_json || {});
    const n = buildRouletteNarration({
      widgetConfig: w.config_json,
      kind: "SETTLED",
      round: env,
      publicId,
    });

    if (n?.text) {
      await enqueueRouletteEventForUser(
        ownerUserId,
        {
          type: "ROULETTE_NARRATE",
          publicId,
          text: n.text,
          dedupeKey: n.dedupeKey,
          channelSlug: env.channelSlug || null,
          broadcasterUserId: env.broadcasterUserId ? String(env.broadcasterUserId) : null,
        },
        cfg.bufferMax
      );
    }
  } catch (e) {
    console.error("[roulette] narrator failed", e?.message || e);
  }

  // Best-effort runtime cleanup
  const rt = runtimeByPublicId.get(publicId);
  if (rt) {
    const h = rt.timeouts.get(roundId);
    if (h) clearTimeout(h);
    rt.timeouts.delete(roundId);

    for (const [lane, rr] of rt.inFlight.entries()) {
      if (rr.roundId === roundId) rt.inFlight.delete(lane);
    }
  }

  return { ok: true };
}

/**
 * Periodic reconciliation:
 * After restart, timeouts are gone; rounds can remain 'started' forever.
 * This loop scans DB for overdue started rounds and settles them.
 */
export function startRouletteReconciler() {
  if (reconcilerStarted) return;
  reconcilerStarted = true;

  setInterval(async () => {
    try {
      // find started rounds that might be overdue
      const started = await db.query(
        `
        SELECT round_id, owner_user_id, widget_public_id, started_at
        FROM casino_roulette_rounds
        WHERE status = 'started'
          AND started_at IS NOT NULL
          AND started_at < (NOW() - INTERVAL '3 seconds')
        ORDER BY started_at ASC
        LIMIT 50
        `
      );

      for (const row of (started.rows || [])) {
        const publicId = row.widget_public_id;
        const ownerUserId = row.owner_user_id;
        const roundId = row.round_id;

        // Compute budget from widget config
        const w = await getWidgetByPublicId(publicId);
        const cfg = safeCfg(w?.config_json || {});
        const budgetMs = computeAnimationBudgetMs(cfg);

        const startedAtMs = row.started_at ? Date.parse(row.started_at) : 0;
        const elapsed = startedAtMs ? (nowMs() - startedAtMs) : budgetMs + 1;

        if (elapsed >= budgetMs) {
          await settleRouletteRoundDb({
            ownerUserId,
            publicId,
            roundId,
            reason: "reconciler",
            cfgForBuffer: cfg,
          });
        }
      }
    } catch (e) {
      console.error("[roulette] reconciler error", e?.message || e);
    }
  }, 15000);
}

export async function enqueueRouletteSpin({
  ownerUserId,
  playerKey,
  playerName,
  betAmount,
  betType,
  betValue,
  currency = "channel_points",
  meta = {},
}) {
  const w = await getOrCreateUserRoulette(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "roulette_disabled" };

  const publicId = w.public_id;
  const cfg = safeCfg(w.config_json);

  // validate bet amount
  let bet = Number(betAmount || 0) || 0;
  if (bet < cfg.bets.min) bet = cfg.bets.min;
  if (bet > cfg.bets.max) bet = cfg.bets.max;

  // cooldown
  if (!checkCooldown(publicId, playerKey, cfg.gameplay.cooldownMs)) {
    return { ok: false, error: "cooldown" };
  }

  // normalize bet
  const norm = normalizeBet({ betType, betValue, wheel: cfg.gameplay.wheel });
  if (!norm.ok) return { ok: false, error: norm.error };

  // allowed bets gate
  const allowed = cfg.gameplay.allowedBets || {};
  if (norm.betType === "color" && allowed.color === false) return { ok: false, error: "bet_disabled" };
  if (norm.betType === "straight" && allowed.straight === false) return { ok: false, error: "bet_disabled" };

  const rt = ensureRuntime(publicId);
  await hydrateRuntimeFromDbIfNeeded(publicId, rt);

  if (rt.pending.length >= cfg.gameplay.maxQueueLength) return { ok: false, error: "queue_full" };
  if (countPendingForPlayer(rt, playerKey) >= cfg.gameplay.perUserQueueLimit) return { ok: false, error: "per_user_limit" };

  const roundId = randomId(22);
  const seed = `${publicId}:${roundId}:${playerKey}`;

  const outcome = createRouletteOutcome({
    seed,
    betAmount: bet,
    betType: norm.betType,
    betValue: norm.betValue,
    wheel: norm.wheel,
  });

  const env = {
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
    wheel: outcome.wheel,
    betType: norm.betType,
    betValue: norm.betValue,

    seed: outcome.seed,
    resultNumber: outcome.resultNumber,
    resultColor: outcome.resultColor,
    multiplier: outcome.multiplier,
    payoutAmount: outcome.payoutAmount,

    status: "queued",
  };

  rt.pending.push(env);

  await insertRoundRow({
    ...env,
    laneIndex: null,
    status: "queued",
  });

  await emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt });
  await tickRouletteQueue({ ownerUserId, publicId });

  return { ok: true, publicId, roundId };
}

export async function tickRouletteQueue({ ownerUserId, publicId }) {
  const w = await getOrCreateUserRoulette(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "roulette_disabled" };

  const cfg = safeCfg(w.config_json);
  const rt = ensureRuntime(publicId);

  await hydrateRuntimeFromDbIfNeeded(publicId, rt);

  let started = 0;

  while (rt.pending.length > 0) {
    const laneIndex = firstFreeLane(rt, cfg.gameplay.maxConcurrentSpins);
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

    await enqueueRouletteEventForUser(
      ownerUserId,
      {
        type: "ROULETTE_ROUND_START",
        publicId,
        roundId: next.roundId,
        laneIndex,
        playerName: next.playerName,
        playerKey: next.playerKey,
        betAmount: next.betAmount,
        wheel: next.wheel,
        betType: next.betType,
        betValue: next.betValue,
        seed: next.seed,
        resultNumber: next.resultNumber,
        resultColor: next.resultColor,
        multiplier: next.multiplier,
        payoutAmount: next.payoutAmount,
      },
      cfg.bufferMax
    );

    const budgetMs = computeAnimationBudgetMs(cfg);

    const t = setTimeout(async () => {
      try {
        await settleRouletteRound({
          ownerUserId,
          publicId,
          roundId: next.roundId,
          reason: "timeout",
        });
      } catch (e) {
        console.error("[roulette] settle timeout failed", e?.message || e);
      }
    }, budgetMs);

    rt.timeouts.set(next.roundId, t);
    started++;
  }

  await emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt });
  return { ok: true, started };
}

export async function settleRouletteRound({ ownerUserId, publicId, roundId, reason = "overlay" }) {
  const w = await getOrCreateUserRoulette(ownerUserId);
  if (!w || !w.is_enabled) return { ok: false, error: "roulette_disabled" };

  const cfg = safeCfg(w.config_json);
  const rt = ensureRuntime(publicId);

  // Best-effort runtime cleanup
  const h = rt.timeouts.get(roundId);
  if (h) clearTimeout(h);
  rt.timeouts.delete(roundId);

  for (const [lane, r] of rt.inFlight.entries()) {
    if (r.roundId === roundId) rt.inFlight.delete(lane);
  }

  const settled = await settleRouletteRoundDb({
    ownerUserId,
    publicId,
    roundId,
    reason,
    cfgForBuffer: cfg,
  });

  await emitStateAndQueueEvent({ ownerUserId, publicId, cfg, rt });
  await tickRouletteQueue({ ownerUserId, publicId });

  return settled;
}
