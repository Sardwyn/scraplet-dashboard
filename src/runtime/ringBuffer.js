// src/runtime/ringBuffer.js
//
// Durable widget event log (DB-backed).
// - Same API as the old in-memory ring buffer: push(), poll()
// - Authoritative storage is Postgres (survives restarts)
// - Optional in-memory cache can be added later for perf, but not required for correctness.

import db from "../../db.js";

/**
 * Ensure the public_id has a row in widget_event_seq.
 */
async function ensureSeqRow(publicId) {
  await db.query(
    `
    INSERT INTO widget_event_seq (public_id, last_seq)
    VALUES ($1, 0)
    ON CONFLICT (public_id) DO NOTHING
    `,
    [String(publicId)],
  );
}

/**
 * Push an event into the durable log.
 * Returns the new seq.
 */
export async function push(publicId, msg, max = 120) {
  const pid = String(publicId);

  // Transaction: increment seq + insert log row + trim old rows
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO widget_event_seq (public_id, last_seq)
      VALUES ($1, 0)
      ON CONFLICT (public_id) DO NOTHING
      `,
      [pid],
    );

    const {
      rows: [seqRow],
    } = await client.query(
      `
      UPDATE widget_event_seq
      SET last_seq = last_seq + 1
      WHERE public_id = $1
      RETURNING last_seq
      `,
      [pid],
    );

    const seq = Number(seqRow.last_seq);

    const payload = {
      ts: Date.now(), // keep old semantics too
      ...msg,
    };

    await client.query(
      `
      INSERT INTO widget_event_log (public_id, seq, payload)
      VALUES ($1, $2, $3::jsonb)
      `,
      [pid, seq, JSON.stringify(payload)],
    );

    // Trim to last N rows for this public_id
    // Keep it simple and safe: delete anything older than the newest max rows
    await client.query(
      `
      DELETE FROM widget_event_log
      WHERE public_id = $1
        AND seq <= (
          SELECT COALESCE(MAX(seq), 0) - $2
          FROM widget_event_log
          WHERE public_id = $1
        )
      `,
      [pid, Math.max(1, Number(max) || 120)],
    );

    await client.query("COMMIT");
    return seq;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Poll events since a given seq (exclusive).
 * Returns { seq, items } where seq is the current latest seq.
 */
export async function poll(publicId, sinceSeq = 0, limit = 200) {
  const pid = String(publicId);
  const since = Number.isFinite(+sinceSeq) ? +sinceSeq : 0;
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));

  // Ensure seq row exists so seq is defined even before first push
  await ensureSeqRow(pid);

  const { rows: seqRows } = await db.query(
    `SELECT last_seq FROM widget_event_seq WHERE public_id = $1`,
    [pid],
  );
  const seq = seqRows?.[0]?.last_seq ? Number(seqRows[0].last_seq) : 0;

  const { rows } = await db.query(
    `
    SELECT seq, payload
    FROM widget_event_log
    WHERE public_id = $1
      AND seq > $2
    ORDER BY seq ASC
    LIMIT $3
    `,
    [pid, since, lim],
  );

  const items = rows.map((r) => ({
    seq: Number(r.seq),
    ...(r.payload || {}),
  }));

  return { seq, items };
}
