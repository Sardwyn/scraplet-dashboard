// /root/scrapletdashboard/src/widgets/plinko/ingest.js
import { push as pushRing } from "../../runtime/ringBuffer.js";
import { getOrCreateUserPlinko } from "./service.js";
import { PLINKO_DEFAULTS } from "./defaults.js";
import db from "../../../db.js";


// publicId -> overlay snapshot
const latestStateByPublicId = new Map();

// publicId -> Set(roundId) that the overlay has confirmed finished animating
const finishedRoundsByPublicId = new Map();

function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
}

function trimFinishedSet(set, maxSize = 500, keepSize = 300) {
  if (!set || set.size <= maxSize) return set;
  // Set preserves insertion order
  const keep = [];
  for (const id of set) keep.push(id);
  return new Set(keep.slice(-keepSize));
}

export function setPlinkoPublicState(publicId, publicView) {
  if (!publicId) return;
  latestStateByPublicId.set(publicId, publicView || null);
}

export function getPlinkoPublicState(publicId) {
  return latestStateByPublicId.get(publicId) || null;
}

/**
 * Server-side enqueue helper.
 * Used by queue-manager.js to push events into the overlay durable event log.
 *
 * Signature MUST match your queue-manager usage:
 * enqueuePlinkoEventForUser(ownerUserId, event, cfg.bufferMax)
 */
export async function enqueuePlinkoEventForUser(ownerUserId, event, bufferMaxOverride) {
  const w = await getOrCreateUserPlinko(ownerUserId);
  if (!w) throw new Error("plinko_widget_missing");

  const publicId = w.public_id;

  const max = clampInt(
    bufferMaxOverride ?? w?.config_json?.bufferMax ?? PLINKO_DEFAULTS.bufferMax,
    50,
    5000
  );

  const lean = {
    ts: Date.now(),
    ...event,
  };

  await pushRing(publicId, lean, max);
  return { ok: true, publicId };
}

/**
 * Called by /api/obs/plinko/:publicId/finished
 * This is OPTIONAL for gameplay (timeouts still settle rounds),
 * but good for future "only settle when overlay confirms done" logic.
 */
export async function markPlinkoRoundFinished(publicId, roundId) {
  if (!publicId || !roundId) return;

  let set = finishedRoundsByPublicId.get(publicId);
  if (!set) {
    set = new Set();
    finishedRoundsByPublicId.set(publicId, set);
  }

  set.add(String(roundId));
  finishedRoundsByPublicId.set(publicId, trimFinishedSet(set));
}

export function isPlinkoRoundFinished(publicId, roundId) {
  const set = finishedRoundsByPublicId.get(publicId);
  return !!set && set.has(String(roundId));
}
