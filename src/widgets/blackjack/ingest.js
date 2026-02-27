// src/widgets/blackjack/ingest.js
import { push as pushRing } from "../../runtime/ringBuffer.js";
import { getOrCreateUserBlackjack } from "./service.js";
import { BLACKJACK_DEFAULTS } from "./defaults.js";
import db from "../../../db.js";


const latestStateByPublicId = new Map(); // publicId -> PublicRoundView

export function setBlackjackPublicState(publicId, publicView) {
  if (!publicId) return;
  latestStateByPublicId.set(publicId, publicView || null);
}

export function getBlackjackPublicState(publicId) {
  return latestStateByPublicId.get(publicId) || null;
}

/**
 * Internal helper: enqueue a normalized BJ event for a user (no HTTP).
 * Your session manager can call this after processing rewards/chat.
 */
export async function enqueueBlackjackEventForUser(ownerUserId, event, maxOverride) {
  const w = await getOrCreateUserBlackjack(ownerUserId);
  const publicId = w.public_id;

  const max = maxOverride || w?.config_json?.bufferMax || BLACKJACK_DEFAULTS.bufferMax;

  // keep event payload lean and safe
  const lean = {
    ts: Date.now(),
    ...event,
  };

  await pushRing(publicId, lean, max);
  return { ok: true, publicId };
}
