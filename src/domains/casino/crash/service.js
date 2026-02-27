// src/domains/casino/crash/service.js
// Deterministic, DB-backed Crash domain logic.
// Dashboard is truth; widgets render only.

import db from "../../../../db.js";

const GAME_KEY = "crash";

// Tunables (safe V2 defaults)
const HOUSE_EDGE = 0.05;
const MIN_MULT = 1.01;
const MAX_MULT = 1000.0;
const MAX_DURATION_SEC = 60.0;

/**
 * Convert a raw casino_rounds row to the canonical renderer snapshot "round" shape.
 * Renderer contract: timestamps + deterministic outcomes only.
 */
export function crashRowToSnapshotRound(row) {
  if (!row) return null;

  // helper: normalize timestamps to ISO or null
  const iso = (v) => (v ? new Date(v).toISOString() : null);

  // NOTE:
  // - DB column is likely `id`; renderer wants `round_id`
  // - `settled_at` might not exist for crash; set null
  // - include extra fields safely; renderer ignores unknowns
  return {
    // identity / routing
    round_id: row.round_id || row.id || null,
    game_key: row.game_key || GAME_KEY,
    platform: row.platform || null,
    channel_id: row.channel_id || null,
    channel_slug: row.channel_slug || null,
    widget_public_id: row.widget_public_id || null,
    owner_user_id: row.owner_user_id ?? null,

    // player identity (best-effort)
    username: row.username || null,
    player_key:
      row.meta_json && typeof row.meta_json === "object"
        ? row.meta_json.playerKey || row.meta_json.player_key || null
        : null,

    // phase/truth
    status: row.status || null,

    // timestamps
    created_at: iso(row.created_at),
    started_at: iso(row.started_at),
    ends_at: iso(row.ends_at),
    settled_at: iso(row.settled_at), // if column exists; otherwise undefined -> null below

    // crash truth/outcomes
    crash_multiplier:
      row.crash_multiplier != null ? Number(row.crash_multiplier) : null,

    // cashout truth (only when cashed)
    cashout_at_multiplier:
      row.cashout_at_multiplier != null ? Number(row.cashout_at_multiplier) : null,

    // wager/payout (chips)
    chip_wager: row.chip_wager != null ? Number(row.chip_wager) : null,
    payout_chips: row.payout_chips != null ? Number(row.payout_chips) : null,

    // raw meta (kept read-only; renderer should not rely on it)
    meta_json: row.meta_json || null,
  };
}

/**
 * Cash out the latest active crash round for a user
 * Identity can be via username OR meta_json.playerKey
 */
export async function cashoutLatestCrashForUser({
  platform,
  channel_id,
  username,
  player_key = null,
}) {
  platform = String(platform || "").trim().toLowerCase();
  channel_id = String(channel_id || "").trim();

  const u = String(username || "").trim().toLowerCase();
  const pk = player_key ? String(player_key).trim() : "";

  if (!platform || !channel_id || (!u && !pk)) {
    return { ok: false, code: "missing_identity" };
  }

  // Mark expired actives as exploded first
  await reconcileExpiredCrashRounds({ platform, channel_id });

  // 1) Try active round
  const active = await db.query(
    `
    SELECT *
      FROM casino_rounds
     WHERE game_key = $1
       AND platform = $2
       AND channel_id = $3
       AND status = 'active'
       AND (
            ($4 <> '' AND meta_json->>'playerKey' = $4)
         OR ($5 <> '' AND lower(username) = $5)
       )
     ORDER BY started_at DESC
     LIMIT 1
    `,
    [GAME_KEY, platform, channel_id, pk, u]
  );

  if (active.rows.length) {
    return cashoutCrashRound({ round_id: active.rows[0].id });
  }

  // 2) If no active, check very recent explosion (UX clarity)
  const recent = await db.query(
    `
    SELECT *
      FROM casino_rounds
     WHERE game_key = $1
       AND platform = $2
       AND channel_id = $3
       AND status = 'exploded'
       AND started_at >= now() - interval '90 seconds'
       AND (
            ($4 <> '' AND meta_json->>'playerKey' = $4)
         OR ($5 <> '' AND lower(username) = $5)
       )
     ORDER BY started_at DESC
     LIMIT 1
    `,
    [GAME_KEY, platform, channel_id, pk, u]
  );

  if (recent.rows.length) {
    return { ok: false, code: "too_late", round: recent.rows[0] };
  }

  return { ok: false, code: "no_active_round" };
}

// ─────────────────────────────────────────────
// Math / timing helpers
// ─────────────────────────────────────────────

function easeOutCubic(x) {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

function durationForCrashMultiplier(m) {
  const sec = 5.0 + 7.0 * Math.log(m + 0.5) + 0.25 * (m - 1);
  return Math.min(MAX_DURATION_SEC, Math.max(8.0, sec));
}

// P(M >= x) ≈ (1 - edge) / x
function sampleCrashMultiplier() {
  if (Math.random() < 0.01) return 1.01;

  const u = Math.max(1e-9, Math.random());
  let m = (1 - HOUSE_EDGE) / u;

  if (!Number.isFinite(m)) m = MAX_MULT;
  m = Math.max(MIN_MULT, Math.min(MAX_MULT, m));

  return Math.floor(m * 100) / 100;
}

function multiplierAtElapsed(elapsedSec, crashMultiplier, durationSec) {
  const p = elapsedSec / durationSec;
  const e = easeOutCubic(p);
  const m = 1 + (crashMultiplier - 1) * e;
  return Math.max(1.0, Math.min(crashMultiplier, Math.floor(m * 100) / 100));
}

function normUsername(username) {
  return String(username || "").trim().toLowerCase();
}

// ─────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────

export async function reconcileExpiredCrashRounds({ platform, channel_id }) {
  platform = String(platform || "").trim().toLowerCase();
  channel_id = String(channel_id || "").trim();
  if (!platform || !channel_id) return;

  await db.query(
    `
    UPDATE casino_rounds
       SET status = 'exploded'
     WHERE game_key = $1
       AND platform = $2
       AND channel_id = $3
       AND status = 'active'
       AND ends_at <= now()
    `,
    [GAME_KEY, platform, channel_id]
  );
}

// ─────────────────────────────────────────────
// Start round
// ─────────────────────────────────────────────

export async function startCrashRound({
  platform,
  channel_id,
  username,
  chip_wager,
  meta_json = {},
}) {
  platform = String(platform || "").trim().toLowerCase();
  channel_id = String(channel_id || "").trim();
  username = normUsername(username);

  if (!platform || !channel_id || !username) {
    throw new Error("platform, channel_id and username are required");
  }

  const wager = Math.max(0, parseInt(chip_wager ?? 0, 10) || 0);

  meta_json = meta_json && typeof meta_json === "object" ? meta_json : {};
  const pk = meta_json.playerKey ? String(meta_json.playerKey).trim() : "";

  // Prevent stacking
  const existing = await db.query(
    `
    SELECT *
      FROM casino_rounds
     WHERE game_key = $1
       AND platform = $2
       AND channel_id = $3
       AND status = 'active'
       AND (
            lower(username) = $4
         OR ($5 <> '' AND meta_json->>'playerKey' = $5)
       )
     ORDER BY started_at DESC
     LIMIT 1
    `,
    [GAME_KEY, platform, channel_id, username, pk]
  );

  if (existing.rows.length) {
    return existing.rows[0];
  }

  const crash_multiplier = sampleCrashMultiplier();
  const durationSec = durationForCrashMultiplier(crash_multiplier);

  const insert = await db.query(
    `
    INSERT INTO casino_rounds
      (game_key, platform, channel_id, username,
       chip_wager, crash_multiplier,
       status, started_at, ends_at, meta_json)
    VALUES
      ($1, $2, $3, $4,
       $5, $6,
       'active', now(), now() + ($7 || ' seconds')::interval, $8::jsonb)
    RETURNING *
    `,
    [
      GAME_KEY,
      platform,
      channel_id,
      username,
      wager,
      crash_multiplier,
      durationSec,
      JSON.stringify(meta_json || {}),
    ]
  );

  return insert.rows[0];
}

// ─────────────────────────────────────────────
// State fetch (widgets / recovery)
// ─────────────────────────────────────────────

export async function getLatestCrashState({ platform, channel_id, username }) {
  platform = String(platform || "").trim().toLowerCase();
  channel_id = String(channel_id || "").trim();
  const u = username ? normUsername(username) : null;

  if (!platform || !channel_id) {
    throw new Error("platform and channel_id are required");
  }

  await reconcileExpiredCrashRounds({ platform, channel_id });

  const params = [GAME_KEY, platform, channel_id];
  let userClause = "";

  if (u) {
    params.push(u);
    userClause = `AND username = $4`;
  }

  const res = await db.query(
    `
    SELECT *
      FROM casino_rounds
     WHERE game_key = $1
       AND platform = $2
       AND channel_id = $3
       ${userClause}
     ORDER BY started_at DESC
     LIMIT 1
    `,
    params
  );

  return res.rows[0] || null;
}

// ─────────────────────────────────────────────
// Cashout
// ─────────────────────────────────────────────

export async function cashoutCrashRound({ round_id }) {
  if (!round_id) return { ok: false, code: "round_id_required" };

  const r = await db.query(`SELECT * FROM casino_rounds WHERE id = $1`, [
    round_id,
  ]);
  const round = r.rows[0];
  if (!round) return { ok: false, code: "not_found" };

  if (round.status === "active" && new Date(round.ends_at) <= new Date()) {
    const exploded = await db.query(
      `UPDATE casino_rounds SET status = 'exploded' WHERE id = $1 RETURNING *`,
      [round_id]
    );
    return { ok: false, code: "too_late", round: exploded.rows[0] };
  }

  if (round.status !== "active") {
    return { ok: false, code: "not_active", round };
  }

  const timing = await db.query(
    `
    SELECT
      EXTRACT(EPOCH FROM (now() - started_at)) AS elapsed,
      EXTRACT(EPOCH FROM (ends_at - started_at)) AS duration
    FROM casino_rounds
    WHERE id = $1
    `,
    [round_id]
  );

  const elapsed = Number(timing.rows[0]?.elapsed ?? 0);
  const duration = Number(timing.rows[0]?.duration ?? 1);

  const cashoutMult = multiplierAtElapsed(
    elapsed,
    Number(round.crash_multiplier),
    duration
  );

  const payout = Math.max(
    0,
    Math.floor((round.chip_wager || 0) * cashoutMult)
  );

  const update = await db.query(
    `
    UPDATE casino_rounds
       SET status = 'cashed_out',
           cashout_at_multiplier = $2,
           payout_chips = $3
     WHERE id = $1
       AND status = 'active'
     RETURNING *
    `,
    [round_id, cashoutMult, payout]
  );

  if (!update.rows.length) {
    return { ok: false, code: "race_lost" };
  }

  return { ok: true, round: update.rows[0] };
}
