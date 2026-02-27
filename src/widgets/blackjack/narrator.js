// src/widgets/blackjack/narrator.js
// Blackjack narration builder (chat-only, centrally editable).
//
// Features:
// - Config-driven: narration.enabled / verbosity / cooldownMs / style / showTotals
// - Variety via template banks
// - Smarter moments:
//    * dealer reveal (holeHidden true -> false)
//    * danger-zone commentary (12-16) on hit
// - Anti-repeat: avoid sending same line twice in a row per player/round
// - Local cooldown + dedupeKey output (Scrapbot also dedupes/rate-limits)

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

function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
}

// Deterministic-ish hash (fast, good enough for picking variants)
function hash32(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant(list, seed) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const h = hash32(seed);
  return list[h % list.length];
}

function tokenReplace(tpl, vars) {
  return String(tpl || "").replace(/\{([a-z0-9_]+)\}/gi, (_, k) => {
    const v = vars?.[k];
    return v == null ? "" : String(v);
  });
}

function fmtAction(a) {
  const x = String(a || "").toUpperCase();
  if (x === "HIT") return "hit";
  if (x === "STAND") return "stand";
  if (x === "DOUBLE") return "double";
  return x.toLowerCase();
}

function fmtOutcome(outcome) {
  const o = String(outcome || "").toUpperCase();
  if (o === "PLAYER_BLACKJACK") return "BLACKJACK! 🎉";
  if (o === "PLAYER_WIN") return "WIN ✅";
  if (o === "DEALER_WIN") return "LOSS ❌";
  if (o === "PUSH") return "PUSH 🤝";
  return o || "RESULT";
}

function fmtReason(reason) {
  const r = String(reason || "").toLowerCase().trim();
  if (!r) return null;

  if (r === "player_blackjack") return "natural blackjack";
  if (r === "dealer_blackjack") return "dealer blackjack";
  if (r === "both_blackjack") return "both blackjack";
  if (r === "player_bust") return "bust";
  if (r === "player_bust_after_double") return "bust after double";
  if (r === "dealer_bust") return "dealer bust";
  if (r === "higher_total") return "higher total";
  if (r === "equal_total") return "equal total";

  return r.replaceAll("_", " ");
}

// -----------------------------
// Local memory (chat-side)
// -----------------------------

// key -> lastSentMs (cooldown)
const lastSentByKey = new Map();

// playerRoundKey -> lastText (anti-repeat)
const lastTextByPlayerRound = new Map();

// playerRoundKey -> lastHoleHidden (dealer reveal detection)
const lastHoleHiddenByPlayerRound = new Map();

// Cleanup to prevent unbounded growth
function trimMap(map, max = 500) {
  if (map.size <= max) return;
  // naive: drop oldest insertion order
  const drop = map.size - max;
  let i = 0;
  for (const k of map.keys()) {
    map.delete(k);
    i++;
    if (i >= drop) break;
  }
}

function allowCooldown(dedupeKey, cooldownMs) {
  const now = Date.now();
  const last = lastSentByKey.get(dedupeKey) || 0;
  if (now - last < cooldownMs) return false;
  lastSentByKey.set(dedupeKey, now);
  trimMap(lastSentByKey, 1200);
  return true;
}

function allowNoRepeat(playerRoundKey, text) {
  const prev = lastTextByPlayerRound.get(playerRoundKey) || null;
  if (prev && prev === text) return false;
  lastTextByPlayerRound.set(playerRoundKey, text);
  trimMap(lastTextByPlayerRound, 800);
  return true;
}

// -----------------------------
// Template banks (central copy)
// -----------------------------

const BANKS = {
  minimal: {
    roundStart: [
      "🃏 {p} — bet {bet}. hit / stand{dbl}.",
      "🃏 {p} {bet}. hit / stand{dbl}.",
    ],
    actionHit: ["🃏 hit.", "🃏 hit — {pt}{soft}."],
    actionStand: ["🃏 stand — dealer plays.", "🃏 stand."],
    actionDouble: ["🃏 double to {bet2}.", "🃏 double."],
    reveal: ["🃏 Dealer reveals.", "🃏 Hole card flips."],
    dangerHit: ["🃏 Risky hit.", "🃏 That's a spicy hit."],
    settledGeneric: ["🃏 {p}: {out}.", "🃏 {out} for {p}."],
    settledBlackjack: ["🃏 {out}.", "🃏 blackjack."],
    settledBust: ["🃏 bust.", "🃏 {p} busts."],
  },

  dealer: {
    roundStart: [
      "🃏 New hand for {p} — bet {bet}. Commands: hit / stand{dbl}.",
      "🃏 Cards out for {p} ({bet}). Your move: hit / stand{dbl}.",
      "🃏 {p} buys in for {bet}. Type: hit / stand{dbl}.",
    ],
    actionHit: [
      "🃏 {p} hits — now {pt}{soft}.",
      "🃏 Card for {p}. Total {pt}{soft}.",
      "🃏 Hit confirmed. {p} at {pt}{soft}.",
    ],
    actionStand: [
      "🃏 {p} stands on {pt}{soft}. Dealer plays.",
      "🃏 Stand on {pt}{soft}. Dealer to act.",
      "🃏 {p} holds {pt}{soft}. Dealer's turn.",
    ],
    actionDouble: [
      "🃏 Double down to {bet2} — one card, then dealer.",
      "🃏 {p} doubles to {bet2}. One card only.",
      "🃏 Double confirmed ({bet2}). Dealer plays after the draw.",
    ],
    reveal: [
      "🃏 Dealer reveals the hole card…",
      "🃏 Hole card flips — dealer shows the full hand.",
      "🃏 Dealer turns it over. Here we go.",
    ],
    dangerHit: [
      "🃏 That's a tight total — risky hit territory.",
      "🃏 Danger zone. A hit here can get ugly.",
      "🃏 Living on the edge with that hit.",
    ],
    settledGeneric: [
      "🃏 {p}: {out} — {pt} vs {dt}{why}. Payout {pay}.",
      "🃏 Hand over for {p}: {out}. {pt} vs {dt}{why}. Payout {pay}.",
      "🃏 Result for {p}: {out}. {pt}–{dt}{why}. Payout {pay}.",
    ],
    settledBlackjack: [
      "🃏 {out} for {p}! {pt} vs {dt}. Payout {pay}.",
      "🃏 Natural — {out}. {pt} vs {dt}. Payout {pay}.",
    ],
    settledBust: [
      "🃏 {p} busts on {pt}. {out}.",
      "🃏 Oof — {p} busts ({pt}). {out}.",
    ],
  },

  hype: {
    roundStart: [
      "🃏 {p} sits down with {bet}. Let's go: hit / stand{dbl}!",
      "🃏 Fresh hand! {p} in for {bet}. hit / stand{dbl}!",
      "🃏 {p} drops {bet} on the felt. hit / stand{dbl}!",
    ],
    actionHit: [
      "🃏 {p} hits — we ride! Now {pt}{soft}.",
      "🃏 Another card! {p} to {pt}{soft}.",
      "🃏 Hit! {pt}{soft} — spicy.",
    ],
    actionStand: [
      "🃏 {p} stands on {pt}{soft}. Dealer, your move.",
      "🃏 Stand! Lock it in — dealer plays.",
      "🃏 {p} holds {pt}{soft}. Let’s see it, dealer.",
    ],
    actionDouble: [
      "🃏 DOUBLE! {p} bumps it to {bet2}. One card only 😈",
      "🃏 Double down — {bet2} on the line. Big moment.",
      "🃏 {p} doubles to {bet2}. This is either genius or pain.",
    ],
    reveal: [
      "🃏 Dealer flips the hole card… drumroll.",
      "🃏 Reveal time — dealer shows the other card!",
      "🃏 Hole card turns… chat, brace yourselves.",
    ],
    dangerHit: [
      "🃏 That hit is *greedy* 😅",
      "🃏 YO that's danger-zone behavior.",
      "🃏 Risky business. Respect.",
    ],
    settledGeneric: [
      "🃏 {p}: {out} — {pt} vs {dt}{why}. Payout {pay}.",
      "🃏 It’s over! {p}: {out}. {pt} vs {dt}{why}. Payout {pay}.",
      "🃏 Final: {p} {out}. {pt}–{dt}{why}. Payout {pay}.",
    ],
    settledBlackjack: [
      "🃏 {p} hits {out} — pay the legend {pay}.",
      "🃏 {out}!!! {p} gets {pay}.",
    ],
    settledBust: [
      "🃏 NOOO — {p} busts on {pt}. {out}.",
      "🃏 Bust city ({pt}). {p} takes the L.",
    ],
  },
};

// -----------------------------
// Public API
// -----------------------------

function getConfig(blackjackDefaults, widgetConfig) {
  return deepMerge(blackjackDefaults || {}, widgetConfig || {});
}

/**
 * Returns: { text, dedupeKey } OR null
 */
export function buildBlackjackNarration({
  blackjackDefaults,
  widgetConfig,
  kind, // "ROUND_START" | "ACTION"
  state, // PublicRoundView enriched
  playerName,
  playerKey,
  action, // HIT/STAND/DOUBLE when kind=ACTION
  betAmount, // number when kind=ROUND_START (or from state.bet.amount)
  publicId,
}) {
  const cfg = getConfig(blackjackDefaults, widgetConfig);
  const narr = cfg?.narration || {};

  if (narr.enabled === false) return null;

  const verbosity = String(narr.verbosity || "normal").toLowerCase(); // low|normal|spicy
  const cooldownMs = clampInt(narr.cooldownMs ?? 2500, 0, 60000);

  const style = String(narr.style || "dealer").toLowerCase(); // dealer|hype|minimal
  const bank = BANKS[style] || BANKS.dealer;

  const showTotals = narr.showTotals !== false; // default true
  const p = String(playerName || state?.meta?.playerName || "Player");
  const roundId = state?.roundId || "unknown";
  const playerRoundKey = `${publicId || ""}:${playerKey || ""}:${roundId}`;

  // Shared vars
  const ptNum = state?.player?.bestTotal;
  const pt = ptNum != null ? String(ptNum) : "—";
  const soft = state?.player?.isSoft ? " (soft)" : "";
  const bet = betAmount != null ? String(betAmount) : String(state?.bet?.amount ?? "—");
  const bet2 =
    state?.bet?.amount != null
      ? String(state.bet.amount)
      : String((Number(betAmount || 0) * 2) || "—");

  // Dealer totals (use settled totals if present)
  const dtShown = state?.dealer?.shownTotal != null ? String(state.dealer.shownTotal) : "—";

  // ------------------------------------
  // Dealer reveal detection
  // ------------------------------------
  // Track holeHidden per player/round. If it flips to false, emit a reveal line once.
  const holeHiddenNow = !!state?.dealer?.holeHidden;
  const holeHiddenPrev = lastHoleHiddenByPlayerRound.get(playerRoundKey);

  if (holeHiddenPrev === undefined) {
    // initialize memory
    lastHoleHiddenByPlayerRound.set(playerRoundKey, holeHiddenNow);
    trimMap(lastHoleHiddenByPlayerRound, 900);
  } else {
    lastHoleHiddenByPlayerRound.set(playerRoundKey, holeHiddenNow);
    trimMap(lastHoleHiddenByPlayerRound, 900);

    const revealHappened = holeHiddenPrev === true && holeHiddenNow === false;

    // Only narrate reveal when we're in dealer play or settling (but before settled wrap-up if caller is "ACTION")
    if (revealHappened && !state?.result) {
      const seed = `${playerRoundKey}:REVEAL`;
      const tpl = pickVariant(bank.reveal, seed);
      const text = tokenReplace(tpl, { p });

      const dedupeKey = `bj:narr:reveal:${publicId}:${playerKey}:${roundId}`;
      if (!allowCooldown(dedupeKey, cooldownMs)) return null;
      if (!allowNoRepeat(playerRoundKey, text)) return null;

      return { text, dedupeKey };
    }
  }

  // ------------------------------------
  // Settled wrap-up (preferred over action spam)
  // ------------------------------------
  const isSettled = !!state?.result;
  if (kind === "ACTION" && isSettled) {
    const out = fmtOutcome(state.result.outcome);
    const why0 = fmtReason(state.result.reason);
    const why = why0 ? ` (${why0})` : "";
    const pay = state.result.payoutAmount != null ? String(state.result.payoutAmount) : "0";

    // bust
    if (state?.player?.isBust) {
      const seed = `${playerRoundKey}:SETTLED_BUST`;
      const tpl = pickVariant(bank.settledBust, seed);
      const text = tokenReplace(tpl, { p, pt, out });

      const dedupeKey = `bj:narr:settled:bust:${publicId}:${playerKey}:${roundId}`;
      if (!allowCooldown(dedupeKey, cooldownMs)) return null;
      if (!allowNoRepeat(playerRoundKey, text)) return null;

      return { text, dedupeKey };
    }

    // blackjack
    if (String(state?.result?.outcome || "").toUpperCase() === "PLAYER_BLACKJACK") {
      const seed = `${playerRoundKey}:SETTLED_BJ`;
      const tpl = pickVariant(bank.settledBlackjack, seed);
      const dt = state.result.dealerTotal != null ? String(state.result.dealerTotal) : dtShown;

      const text = tokenReplace(tpl, {
        p,
        out,
        pt: String(state.result.playerTotal ?? pt),
        dt,
        pay,
      });

      const dedupeKey = `bj:narr:settled:bj:${publicId}:${playerKey}:${roundId}`;
      if (!allowCooldown(dedupeKey, cooldownMs)) return null;
      if (!allowNoRepeat(playerRoundKey, text)) return null;

      return { text, dedupeKey };
    }

    // generic
    const seed = `${playerRoundKey}:SETTLED`;
    const tpl = pickVariant(bank.settledGeneric, seed);
    const dt = state.result.dealerTotal != null ? String(state.result.dealerTotal) : dtShown;

    const text = tokenReplace(tpl, {
      p,
      out,
      pt: String(state.result.playerTotal ?? pt),
      dt,
      why,
      pay,
    });

    const dedupeKey = `bj:narr:settled:${publicId}:${playerKey}:${roundId}`;
    if (!allowCooldown(dedupeKey, cooldownMs)) return null;
    if (!allowNoRepeat(playerRoundKey, text)) return null;

    return { text, dedupeKey };
  }

  // ------------------------------------
  // Round start
  // ------------------------------------
  if (kind === "ROUND_START") {
    const allowDouble = Array.isArray(state?.legalActions)
      ? state.legalActions.includes("DOUBLE")
      : cfg?.gameplay?.allowDouble === true;

    const dbl = allowDouble ? " / double" : "";
    const seed = `${playerRoundKey}:START`;
    const tpl = pickVariant(bank.roundStart, seed);

    // minimal + low verbosity collapse to a short canonical line
    const text0 =
      verbosity === "low"
        ? `🃏 ${p} — bet ${bet}. hit / stand${allowDouble ? " / double" : ""}.`
        : tokenReplace(tpl, { p, bet, dbl });

    const text = text0.trim();

    const dedupeKey = `bj:narr:start:${publicId}:${playerKey}:${roundId}`;
    if (!allowCooldown(dedupeKey, cooldownMs)) return null;
    if (!allowNoRepeat(playerRoundKey, text)) return null;

    return { text, dedupeKey };
  }

  // ------------------------------------
  // Actions
  // ------------------------------------
  if (kind === "ACTION") {
    const a = String(action || "").toUpperCase();

    // In low verbosity, don't narrate HIT spam. Only stand/double + settle.
    if (verbosity === "low" && a === "HIT") return null;

    const dedupeKey = `bj:narr:act:${publicId}:${playerKey}:${roundId}:${a}`;
    const seed = `${playerRoundKey}:ACT:${a}`;

    // Danger zone commentary on HIT (12-16) — but only normal/spicy
    if (a === "HIT" && (verbosity === "normal" || verbosity === "spicy")) {
      const danger = ptNum != null && ptNum >= 12 && ptNum <= 16 && !state?.player?.isSoft;
      if (danger) {
        const tpl = pickVariant(bank.dangerHit, `${seed}:DANGER`);
        const text = tokenReplace(tpl, { p });

        const dk = `bj:narr:danger:${publicId}:${playerKey}:${roundId}:${ptNum}`;
        if (allowCooldown(dk, cooldownMs) && allowNoRepeat(playerRoundKey, text)) {
          // This is a “commentary” line; let it stand alone.
          return { text, dedupeKey: dk };
        }
      }
    }

    let tpl = null;

    if (a === "HIT") tpl = pickVariant(bank.actionHit, seed);
    else if (a === "STAND") tpl = pickVariant(bank.actionStand, seed);
    else if (a === "DOUBLE") tpl = pickVariant(bank.actionDouble, seed);
    else tpl = "🃏 {p} chose {a}.";

    const totalsPart = showTotals ? `{pt}{soft}` : "";
    const text = tokenReplace(tpl, {
      p,
      a: fmtAction(a),
      pt: totalsPart ? pt : "",
      soft: totalsPart ? soft : "",
      bet2,
    })
      .replace(/\s+/g, " ")
      .trim();

    if (!allowCooldown(dedupeKey, cooldownMs)) return null;
    if (!allowNoRepeat(playerRoundKey, text)) return null;

    return { text, dedupeKey };
  }

  return null;
}
