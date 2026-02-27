import db from "../db.js";
import { overlayGate } from "./overlayGate.js";

const ENABLED = String(process.env.PRODUCER_OUTBOX_ENABLED || "true").toLowerCase() === "true";
const POLL_MS = Number(process.env.PRODUCER_OUTBOX_POLL_MS || 250);

// Backoff identical to chatOutboxDeliver.js
function getBackoffSeconds(attempts) {
  if (attempts <= 3) return 2;
  if (attempts <= 6) return 10;
  if (attempts <= 10) return 60;
  return 300;
}

async function deliverOverlayGate(row) {
  const payload = row.payload || {};
  const tenantId = payload.tenantId || row.owner_user_id;
  const packetTemplate = payload.packet;

  if (!packetTemplate || typeof packetTemplate !== "object") {
    throw new Error("payload.packet missing");
  }

  // Broadcast to all overlays for tenant (same model as src/ingest/overlayBridge.js)
  const { rows: overlays } = await db.query(
    `SELECT public_id FROM overlays WHERE user_id = $1`,
    [tenantId]
  );

  if (!overlays.length) return;

  for (const o of overlays) {
    // --- Normalize producer events into overlay-renderer events (V1) ---
    // Producers generally enqueue `producer.card_show`. The overlay renderer should instead
    // receive overlay-scoped events:
    //   - overlay.card.show        (media / rich cards)
    //   - overlay.lower_third.show (text-only)
    // We do this translation here so the ingest side can stay stable.

    const templateHeader = (packetTemplate && packetTemplate.header) || {};
    const templatePayload = (packetTemplate && packetTemplate.payload) || {};
    const templateType = String(templateHeader.type || "producer.card_show");

    let outType = templateType;
    let outPayload = templatePayload;

    // Translate producer.card_show into renderer-friendly overlay events.
    if (templateType === "producer.card_show") {
      const card = templatePayload.card || templatePayload;

      if (card && card.kind === "lower_third") {
        const username = String(card.username || card.display_name || card.user || "").trim();
        const message = String(card.text || card.message || "").trim();
        outType = "overlay.lower_third.show";
        outPayload = {
          username,
          message,
          text: username ? `${username}: ${message}` : message,
          duration_ms: Number(card.duration_ms || 10000),
        };
      } else {
        outType = "overlay.card.show";
        // For cards, pass through the card object if present, otherwise the whole payload.
        outPayload = card || templatePayload;
      }
    }

    const packet = {
      ...packetTemplate,
      header: {
        ...(packetTemplate.header || {}),
        // ensure strict overlayGate requirements
        id: String((packetTemplate.header && packetTemplate.header.id) || row.event_id),
        type: outType,
        ts: Number((packetTemplate.header && packetTemplate.header.ts) || Date.now()),
        producer: (packetTemplate.header && packetTemplate.header.producer) || "dashboard",
        platform: (packetTemplate.header && packetTemplate.header.platform) || "discord",
        scope: {
          tenantId,
          overlayPublicId: o.public_id,
        },
      },
      payload: outPayload || {},
    };

    overlayGate.publish(tenantId, o.public_id, packet);
  }
}

async function deliverStudioController(_row) {
  // Opt-in later. For now, no-op (and we won't enqueue this target until configured).
  return;
}

async function processBatch() {
  const { rows } = await db.query(`
    UPDATE public.producer_outbox
    SET next_attempt_at = now() + interval '5 minutes',
        attempts = attempts + 1
    WHERE id IN (
      SELECT id
      FROM public.producer_outbox
      WHERE delivered_at IS NULL
        AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, event_id, target, payload, attempts, owner_user_id
  `);

  if (!rows.length) return;

  const results = await Promise.allSettled(rows.map(async (row) => {
    try {
      if (row.target === "overlay_gate") await deliverOverlayGate(row);
      else if (row.target === "studio_controller") await deliverStudioController(row);
      else throw new Error(`unknown target: ${row.target}`);
      return { success: true, id: row.id };
    } catch (err) {
      return { success: false, id: row.id, attempts: row.attempts, error: err.message };
    }
  }));

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.success) {
      await db.query(
        `UPDATE public.producer_outbox SET delivered_at = now(), last_error = NULL WHERE id = $1`,
        [r.value.id]
      );
      continue;
    }

    const fail = r.status === "fulfilled"
      ? r.value
      : { id: null, attempts: 0, error: String(r.reason || "") };

    if (!fail.id) continue;

    const backoff = getBackoffSeconds(fail.attempts);
    await db.query(
      `UPDATE public.producer_outbox
       SET last_error = $2,
           next_attempt_at = now() + ($3 * interval '1 second')
       WHERE id = $1`,
      [fail.id, fail.error, backoff]
    );
  }
}

async function loop() {
  try {
    await processBatch();
  } catch (err) {
    console.error("[producerOutboxDeliver] Worker loop error:", err);
  }
  setTimeout(loop, POLL_MS);
}

export function startProducerOutboxWorker() {
  if (!ENABLED) {
    console.log("[producerOutbox] Worker DISABLED via env");
    return;
  }
  console.log(`[producerOutbox] Worker starting (poll=${POLL_MS}ms)`);
  loop();
}
