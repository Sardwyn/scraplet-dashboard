// src/alerts/queueService.js
import db from "../../db.js";

export async function fetchAndMarkNextPlay(ownerUserId) {
  const { rows } = await db.query(
    `
    WITH next_row AS (
      SELECT id
      FROM alert_queue
      WHERE owner_user_id = $1
        AND status = 'queued'
        AND available_at <= now()
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE alert_queue q
    SET status = 'sent', sent_at = now()
    FROM next_row
    WHERE q.id = next_row.id
    RETURNING q.*
    `,
    [ownerUserId]
  );

  return rows[0] || null;
}

export async function ackPlay({ ownerUserId, playId, status, error = null }) {
  const allowed = new Set(["started", "ended", "error"]);
  if (!allowed.has(status)) throw new Error(`Invalid status: ${status}`);

  let sql = "";
  let params = [];

  if (status === "started") {
    sql = `
      UPDATE alert_queue
      SET status = 'started',
          started_at = COALESCE(started_at, now()),
          last_error = NULL
      WHERE id = $1 AND owner_user_id = $2
      RETURNING *
    `;
    params = [playId, ownerUserId];
  } else if (status === "ended") {
    sql = `
      UPDATE alert_queue
      SET status = 'ended',
          ended_at = COALESCE(ended_at, now()),
          last_error = NULL
      WHERE id = $1 AND owner_user_id = $2
      RETURNING *
    `;
    params = [playId, ownerUserId];
  } else {
    sql = `
      UPDATE alert_queue
      SET status = 'error',
          last_error = $3
      WHERE id = $1 AND owner_user_id = $2
      RETURNING *
    `;
    params = [playId, ownerUserId, error || "overlay_error"];
  }

  const { rows } = await db.query(sql, params);
  return rows[0] || null;
}
