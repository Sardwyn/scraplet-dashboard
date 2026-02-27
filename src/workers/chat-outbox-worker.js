// src/workers/chat-outbox-worker.js
//
// Reliable Delivery worker for public.chat_outbox.
//
// Responsibilities:
// 1) Pull pending rows from public.chat_outbox (FOR UPDATE SKIP LOCKED)
// 2) Forward payload (expects { chat_v1 }) to Scrapbot ingest
// 3) Read Scrapbot response and extract canonical moderation decision + command outcome
// 4) ONLY AFTER a decision is obtained, push into overlays via fanOutAfterModeration()
// 5) Ack the outbox row (mark delivered_at)
//
// This guarantees: overlays only show messages after moderation.

import "dotenv/config";
import fetch from "node-fetch";

import db from "../../db.js";
import { getOrCreateUserChatOverlay } from "../widgets/chat-overlay/service.js";
import { fanOutAfterModeration } from "../ingest/fanOutAfterModeration.js";

const WORKER_ID = process.env.CHAT_OUTBOX_WORKER_ID || `dash-${process.pid}`;

const POLL_INTERVAL_MS = Number(process.env.CHAT_OUTBOX_POLL_MS || 500);
const BATCH_SIZE = Math.min(50, Math.max(1, Number(process.env.CHAT_OUTBOX_BATCH || 10)));

const SCRAPBOT_INGEST_URL =
  process.env.SCRAPBOT_INGEST_URL || "http://127.0.0.1:3030/api/inbound/kick";

const SCRAPBOT_TIMEOUT_MS = Math.min(
  15_000,
  Math.max(1_000, Number(process.env.SCRAPBOT_TIMEOUT_MS || 5_000))
);

// ✅ Shared secret for dashboard -> scrapbot calls
const SCRAPBOT_SHARED_SECRET = String(process.env.SCRAPBOT_SHARED_SECRET || "").trim();

const RETRY_SECONDS = Math.min(
  300,
  Math.max(2, Number(process.env.CHAT_OUTBOX_RETRY_SECONDS || 10))
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

function extractDecisionFromScrapbotResponse(data) {
  if (data && typeof data === "object") {
    if (data.decision && typeof data.decision === "object" && data.decision.action) {
      return { decision: data.decision, command: data.command || null, raw: data };
    }
    if (data.action) {
      return { decision: { action: String(data.action) }, command: data.command || null, raw: data };
    }
  }
  return { decision: null, command: null, raw: data };
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), SCRAPBOT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function detectOutboxColumns() {
  const { rows } = await db.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_outbox'
    `
  );

  const cols = new Set(rows.map((r) => String(r.column_name)));

  return {
    cols,
    hasCreatedAt: cols.has("created_at"),
    hasAttempts: cols.has("attempts"),
    hasNextAttemptAt: cols.has("next_attempt_at"),
    hasLastError: cols.has("last_error"),
    hasDeliveredAt: cols.has("delivered_at"),
    hasLockedAt: cols.has("locked_at"),
    hasLockedBy: cols.has("locked_by"),
  };
}

async function lockBatch(meta) {
  const where = [];

  // ✅ do not reprocess already delivered rows
  if (meta.hasDeliveredAt) where.push("delivered_at IS NULL");

  if (meta.hasNextAttemptAt) where.push("(next_attempt_at IS NULL OR next_attempt_at <= now())");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = meta.hasCreatedAt ? "ORDER BY created_at ASC" : "ORDER BY event_id ASC";
  const useExplicitLockCols = meta.hasLockedAt && meta.hasLockedBy;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT event_id, payload
      FROM public.chat_outbox
      ${whereSql}
      ${orderBy}
      LIMIT $1
      FOR UPDATE SKIP LOCKED
      `,
      [BATCH_SIZE]
    );

    if (rows.length && useExplicitLockCols) {
      const ids = rows.map((r) => r.event_id);
      await client.query(
        `
        UPDATE public.chat_outbox
        SET locked_at = now(), locked_by = $2
        WHERE event_id = ANY($1)
        `,
        [ids, WORKER_ID]
      );
    }

    await client.query("COMMIT");

    return rows.map((r) => ({
      event_id: String(r.event_id),
      payload: typeof r.payload === "object" ? r.payload : safeJsonParse(r.payload),
    }));
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function markFailure(meta, eventId, errMsg) {
  const msg = String(errMsg || "unknown_error").slice(0, 800);

  const sets = [];
  const params = [];
  let i = 1;

  if (meta.hasAttempts) sets.push(`attempts = COALESCE(attempts, 0) + 1`);
  if (meta.hasNextAttemptAt) {
    sets.push(`next_attempt_at = now() + ($${i++}::int || ' seconds')::interval`);
    params.push(RETRY_SECONDS);
  }
  if (meta.hasLastError) {
    sets.push(`last_error = $${i++}`);
    params.push(msg);
  }

  if (meta.hasLockedAt) sets.push(`locked_at = NULL`);
  if (meta.hasLockedBy) sets.push(`locked_by = NULL`);

  params.push(eventId);

  await db.query(
    `
    UPDATE public.chat_outbox
    SET ${sets.join(", ")}
    WHERE event_id = $${i++}
    `,
    params
  );
}

async function markSuccess(meta, eventId) {
  if (meta.hasDeliveredAt) {
    await db.query(
      `
      UPDATE public.chat_outbox
      SET delivered_at = now()
      WHERE event_id = $1
      `,
      [eventId]
    );
    return;
  }

  // fallback (shouldn’t be needed in your schema)
  await db.query(
    `
    DELETE FROM public.chat_outbox
    WHERE event_id = $1
    `,
    [eventId]
  );
}

async function processOne(meta, row) {
  const payload = row.payload || null;
  const chat_v1 = payload?.chat_v1 || null;

  if (!chat_v1 || typeof chat_v1 !== "object") {
    await markFailure(meta, row.event_id, "missing_chat_v1");
    return { ok: false, reason: "missing_chat_v1" };
  }

  const ownerUserId = Number(chat_v1.scraplet_user_id || 0) || null;
  if (!ownerUserId) {
    await markFailure(meta, row.event_id, "missing_owner_user");
    return { ok: false, reason: "missing_owner_user" };
  }

  // 1) Ask Scrapbot for moderation decision / command handling
  let scrapbotData = null;

  try {
    const resp = await fetchWithTimeout(SCRAPBOT_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SCRAPBOT_SHARED_SECRET ? { "X-Scraplet-Secret": SCRAPBOT_SHARED_SECRET } : {}),
        ...(SCRAPBOT_SHARED_SECRET ? { "X-Scrapbot-Secret": SCRAPBOT_SHARED_SECRET } : {}),
      },
      body: JSON.stringify(payload),
    });

    const rawText = await resp.text().catch(() => "");

    if (!resp.ok) {
      await markFailure(meta, row.event_id, `scrapbot_http_${resp.status}`);
      return { ok: false, reason: "scrapbot_http", status: resp.status, body: rawText.slice(0, 200) };
    }

    scrapbotData = safeJsonParse(rawText) || { raw: rawText };
  } catch (err) {
    await markFailure(meta, row.event_id, `scrapbot_error:${err?.message || String(err)}`);
    return { ok: false, reason: "scrapbot_error", error: err?.message || String(err) };
  }

  const extracted = extractDecisionFromScrapbotResponse(scrapbotData);
  const decision = extracted.decision;

  // 2) Fan-out ONLY after decision
  try {
    const overlay = await getOrCreateUserChatOverlay(ownerUserId);
    const publicId = overlay?.public_id || null;

    if (publicId) {
      fanOutAfterModeration({
        chat_v1,
        decision,
        publicId,
        ownerUserId,
      });
    }
  } catch (err) {
    console.error("[chat-outbox-worker] overlay fan-out failed", {
      event_id: row.event_id,
      ownerUserId,
      err: err?.message || err,
    });
  }

  // 3) Ack row
  await markSuccess(meta, row.event_id);

  return { ok: true, action: decision?.action || null };
}

async function main() {
  console.log("[chat-outbox-worker] starting", {
    WORKER_ID,
    POLL_INTERVAL_MS,
    BATCH_SIZE,
    SCRAPBOT_INGEST_URL,
    SCRAPBOT_TIMEOUT_MS,
  });

  let meta;
  try {
    meta = await detectOutboxColumns();
    console.log("[chat-outbox-worker] outbox schema", { cols: Array.from(meta.cols).sort() });
  } catch (err) {
    console.error("[chat-outbox-worker] failed to introspect chat_outbox schema", err);
    process.exit(1);
  }

  for (;;) {
    try {
      const batch = await lockBatch(meta);
      if (!batch.length) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      for (const row of batch) {
        await processOne(meta, row);
      }
    } catch (err) {
      console.error("[chat-outbox-worker] loop error", err?.message || err);
      await sleep(1_000);
    }
  }
}

main().catch((err) => {
  console.error("[chat-outbox-worker] fatal", err);
  process.exit(1);
});
