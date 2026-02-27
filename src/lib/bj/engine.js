// src/lib/bj/engine.js
import { normalizeRules } from "./rules.js";
import { handFromCards, scoreHand } from "./hand.js";
import { createShoe, drawCard } from "./shoe.js";

function nowMs() {
  return Date.now();
}

function defaultRng() {
  return Math.random();
}

function safeInt(n, fallback = 0) {
  const x = parseInt(String(n), 10);
  return Number.isFinite(x) ? x : fallback;
}

export function createBjEngine(options = {}) {
  const rules = normalizeRules(options.rules || {});
  const rng = typeof options.rng === "function" ? options.rng : defaultRng;
  const timeNow = typeof options.now === "function" ? options.now : nowMs;

  function emit(type, payload) {
    return { type, ...(payload || {}) };
  }

  function createRound(input) {
    const roundId = String(input?.roundId || "");
    if (!roundId) {
      return {
        state: null,
        events: [emit("ERROR", { code: "MISSING_ROUND_ID", message: "roundId required" })],
      };
    }

    const betAmount = safeInt(input?.betAmount, 0);
    if (betAmount < rules.minBet) {
      return {
        state: null,
        events: [emit("ERROR", { code: "BET_TOO_SMALL", message: `minBet=${rules.minBet}` })],
      };
    }

    const shoeId = String(input?.shoeId || `shoe_${roundId}`);
    const startedAt = Number.isFinite(input?.startedAt) ? input.startedAt : timeNow();

    const shoe = createShoe({ shoeId, decks: rules.decks, rng });

    const state = {
      version: 1,
      roundId,
      shoeId,
      rules,
      bet: { amount: betAmount, currency: input?.currency || "channel_points" },

      phase: "IDLE",

      player: {
        hand: handFromCards([]),
        canHit: false,
        canStand: false,
        canDouble: false,
        hasDoubled: false,
      },

      dealer: {
        hand: handFromCards([]),
        holeCardHidden: true,
      },

      dealtCount: 0,
      startedAt,

      _internal: {
        shoe, // private shoe for v1
        dealerHoleCardId: null,
      },
    };

    return { state, events: [emit("ROUND_CREATED", { roundId, bet: state.bet, rules })] };
  }

  function startRound(state) {
    if (!state || state.phase !== "IDLE") {
      return fail(state, "INVALID_PHASE", "startRound requires phase=IDLE");
    }

    const events = [];
    state.phase = "DEALING";

    // initial deal order (player, dealer, player, dealer)
    const p1 = dealTo(state, "player", events);
    const d1 = dealTo(state, "dealer", events);
    const p2 = dealTo(state, "player", events);
    const d2 = dealTo(state, "dealer", events);

    // mark dealer hole card hidden (the 2nd dealer card)
    state.dealer.holeCardHidden = true;
    state._internal.dealerHoleCardId = d2?.id || null;

    // Re-emit a combined dealt event for clients that want initial animation batching.
    events.push(
      emit("CARDS_DEALT", {
        roundId: state.roundId,
        to: "dealer",
        cards: [d1, { ...d2, hidden: true }],
        dealerHoleHidden: true,
      })
    );

    // Evaluate immediate blackjack cases
    const pScore = scoreHand(state.player.hand.cards);
    const dScore = scoreHand(state.dealer.hand.cards);

    // If dealer has blackjack, it should be settled immediately (hole revealed for settlement).
    if (pScore.isBlackjack || dScore.isBlackjack) {
      // Reveal for correctness in settlement (overlay can still choose to animate reveal)
      state.dealer.holeCardHidden = false;
      events.push(emit("DEALER_REVEAL", { roundId: state.roundId, holeCard: d2 }));

      if (pScore.isBlackjack && dScore.isBlackjack) {
        settle(state, events, {
          outcome: "PUSH",
          reason: "both_blackjack",
          payoutMultiplier: 0,
        });
        return { state, events };
      }

      if (pScore.isBlackjack && !dScore.isBlackjack) {
        settle(state, events, {
          outcome: "PLAYER_BLACKJACK",
          reason: "player_blackjack",
          payoutMultiplier: state.rules.blackjackPayout,
        });
        return { state, events };
      }

      // dealer blackjack only
      settle(state, events, {
        outcome: "DEALER_WIN",
        reason: "dealer_blackjack",
        payoutMultiplier: 0,
      });
      return { state, events };
    }

    // Normal player turn
    state.phase = "PLAYER_TURN";
    recomputeLegals(state);

    return { state, events };
  }

  function act(state, action) {
    if (!state || state.phase !== "PLAYER_TURN") {
      return fail(state, "INVALID_PHASE", "act requires phase=PLAYER_TURN");
    }

    const a = String(action || "").toUpperCase();
    const legal = getLegalActions(state);
    if (!legal.includes(a)) {
      return fail(state, "ILLEGAL_ACTION", `Illegal action: ${a}`);
    }

    const events = [];

    if (a === "HIT") {
      const c = dealTo(state, "player", events);
      events.push(emit("PLAYER_ACTION", { roundId: state.roundId, action: "HIT", card: c }));

      const s = scoreHand(state.player.hand.cards);
      if (s.isBust) {
        events.push(emit("PLAYER_BUST", { roundId: state.roundId, total: s.bestTotal }));
        settle(state, events, {
          outcome: "DEALER_WIN",
          reason: "player_bust",
          payoutMultiplier: 0,
        });
        return { state, events };
      }

      // after hit, double may be disabled (v1 default)
      recomputeLegals(state);
      return { state, events };
    }

    if (a === "DOUBLE") {
      state.player.hasDoubled = true;
      state.bet.amount = state.bet.amount * 2;

      const c = dealTo(state, "player", events);
      events.push(emit("PLAYER_ACTION", { roundId: state.roundId, action: "DOUBLE", card: c }));

      const s = scoreHand(state.player.hand.cards);
      if (s.isBust) {
        events.push(emit("PLAYER_BUST", { roundId: state.roundId, total: s.bestTotal }));
        settle(state, events, {
          outcome: "DEALER_WIN",
          reason: "player_bust_after_double",
          payoutMultiplier: 0,
        });
        return { state, events };
      }

      // forced stand
      return dealerTurn(state, events);
    }

    // STAND
    events.push(emit("PLAYER_ACTION", { roundId: state.roundId, action: "STAND" }));
    return dealerTurn(state, events);
  }

  function dealerTurn(state, events) {
    state.phase = "DEALER_TURN";

    // reveal hole card
    if (state.dealer.holeCardHidden) {
      state.dealer.holeCardHidden = false;
      const hole = findCardById(state.dealer.hand.cards, state._internal.dealerHoleCardId);
      if (hole) events.push(emit("DEALER_REVEAL", { roundId: state.roundId, holeCard: hole }));
    }

    const playerScore = scoreHand(state.player.hand.cards);

    // dealer draws until stop
    while (true) {
      const dScore = scoreHand(state.dealer.hand.cards);

      if (dScore.isBust) {
        settle(state, events, {
          outcome: "PLAYER_WIN",
          reason: "dealer_bust",
          payoutMultiplier: 1,
        });
        return { state, events };
      }

      // Dealer stopping rules
      if (shouldDealerStand(state.rules, dScore)) {
        // compare totals
        const dt = dScore.bestTotal;
        const pt = playerScore.bestTotal;

        if (dt > pt) {
          settle(state, events, { outcome: "DEALER_WIN", reason: "higher_total", payoutMultiplier: 0 });
          return { state, events };
        }
        if (dt < pt) {
          settle(state, events, { outcome: "PLAYER_WIN", reason: "higher_total", payoutMultiplier: 1 });
          return { state, events };
        }

        settle(state, events, { outcome: "PUSH", reason: "equal_total", payoutMultiplier: 0 });
        return { state, events };
      }

      // draw one
      const c = dealTo(state, "dealer", events);
      const next = scoreHand(state.dealer.hand.cards);
      events.push(
        emit("DEALER_DRAW", {
          roundId: state.roundId,
          card: c,
          total: next.bestTotal,
          isSoft: next.isSoft,
        })
      );
    }
  }

  function getLegalActions(state) {
    if (!state || state.phase !== "PLAYER_TURN") return [];
    const out = [];
    if (state.player.canHit) out.push("HIT");
    if (state.player.canStand) out.push("STAND");
    if (state.player.canDouble) out.push("DOUBLE");
    return out;
  }

  function toPublicView(state) {
    if (!state) return null;

    const dealerCards = state.dealer.hand.cards.map((c) => {
      if (state.dealer.holeCardHidden && c.id === state._internal.dealerHoleCardId) {
        return { hidden: true };
      }
      return c;
    });

    const visibleDealerCards = dealerCards.filter((c) => !c?.hidden);
    const dealerShownScore = scoreHand(visibleDealerCards);

    return {
      roundId: state.roundId,
      phase: state.phase,
      bet: state.bet,
      rules: {
        dealerStandsOnSoft17: state.rules.dealerStandsOnSoft17,
        blackjackPayout: state.rules.blackjackPayout,
        allowDouble: state.rules.allowDouble,
        allowDoubleAfterHit: state.rules.allowDoubleAfterHit,
      },
      player: {
        cards: state.player.hand.cards,
        bestTotal: scoreHand(state.player.hand.cards).bestTotal,
        isSoft: scoreHand(state.player.hand.cards).isSoft,
        isBust: scoreHand(state.player.hand.cards).isBust,
        isBlackjack: scoreHand(state.player.hand.cards).isBlackjack,
        hasDoubled: state.player.hasDoubled,
      },
      dealer: {
        cards: dealerCards,
        shownTotal: dealerShownScore.bestTotal,
        holeHidden: state.dealer.holeCardHidden,
      },
      legalActions: getLegalActions(state),
      result: state.result || null,
    };
  }

  function snapshot(state) {
    // structuredClone is fine if present; fallback JSON
    if (typeof structuredClone === "function") return structuredClone(state);
    return JSON.parse(JSON.stringify(state));
  }

  // ---------- helpers ----------

  function fail(state, code, message) {
    return { state, events: [{ type: "ERROR", roundId: state?.roundId, code, message }] };
  }

  function dealTo(state, who, events) {
    const c = drawCard(state._internal.shoe);
    state.dealtCount += 1;

    if (who === "player") {
      state.player.hand = handFromCards([...(state.player.hand.cards || []), c]);
      // keep can* flags updated later
      events.push(emit("CARDS_DEALT", { roundId: state.roundId, to: "player", cards: [c], dealerHoleHidden: state.dealer.holeCardHidden }));
      return c;
    }

    state.dealer.hand = handFromCards([...(state.dealer.hand.cards || []), c]);
    // For dealer, we might be dealing a hidden hole card during initial deal; renderer decides visibility via toPublicView().
    events.push(emit("CARDS_DEALT", { roundId: state.roundId, to: "dealer", cards: [c], dealerHoleHidden: state.dealer.holeCardHidden }));
    return c;
  }

  function recomputeLegals(state) {
    const pc = state.player.hand.cards || [];
    const score = scoreHand(pc);

    state.player.canHit = !score.isBust && pc.length < state.rules.maxPlayerCards;
    state.player.canStand = !score.isBust;

    const isExactlyTwo = pc.length === 2;
    const hasHit = pc.length > 2;

    let canDouble = state.rules.allowDouble && !score.isBust && !state.player.hasDoubled;
    if (canDouble) {
      if (!isExactlyTwo && !(state.rules.allowDoubleAfterHit && hasHit)) {
        canDouble = false;
      }
    }

    state.player.canDouble = canDouble;
  }

  function shouldDealerStand(rules, dealerScore) {
    const t = dealerScore.bestTotal;

    if (t > 17) return true;
    if (t < 17) return false;

    // t === 17
    if (!dealerScore.isSoft) return true;
    return !!rules.dealerStandsOnSoft17;
  }

  function settle(state, events, { outcome, reason, payoutMultiplier }) {
    state.phase = "SETTLED";
    state.settledAt = nowMs();

    const p = scoreHand(state.player.hand.cards);
    const d = scoreHand(state.dealer.hand.cards);

    const payoutAmount = Math.floor(state.bet.amount * payoutMultiplier);

    state.result = {
      outcome,
      playerTotal: p.bestTotal,
      dealerTotal: d.bestTotal,
      payoutMultiplier,
      payoutAmount,
      reason: String(reason || ""),
    };

    events.push(emit("ROUND_SETTLED", { roundId: state.roundId, result: state.result }));
  }

  function findCardById(cards, id) {
    if (!id) return null;
    return (cards || []).find((c) => c && c.id === id) || null;
  }

  return {
    createRound,
    startRound,
    act,
    getLegalActions,
    toPublicView,
    snapshot,
  };
}
