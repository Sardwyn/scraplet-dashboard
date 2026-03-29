// src/stakeMonitor/insertStakeEvent.js
// Persists a validated StakePayload to stake_session_events.
// Computes server-side session_pnl and publishes SSE event via studioEventBus.

import db from '../../db.js';

/**
 * Insert a validated stake event and broadcast via SSE.
 * @param {import('./validateBeaconPayload.js').StakePayload} payload
 * @param {number|null} userId
 * @param {string|null} sessionId
 */
export async function insertStakeEvent(payload, userId, sessionId) {
  // Look up start balance for session P&L computation
  let startBalance = null;
  if (sessionId) {
    try {
      const { rows } = await db.query(
        `SELECT current_balance FROM public.stake_session_events
         WHERE session_id = $1
         ORDER BY received_at ASC LIMIT 1`,
        [sessionId]
      );
      startBalance = rows[0]?.current_balance ?? null;
    } catch { /* non-fatal */ }
  }

  const sessionPnl =
    payload.currentBalance !== null &&
    payload.currentBalance !== undefined &&
    startBalance !== null
      ? payload.currentBalance - startBalance
      : null;

  await db.query(
    `INSERT INTO public.stake_session_events
       (session_id, user_id, game_name, current_balance, last_win, bet_size, multiplier, session_pnl, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      sessionId || null,
      userId || null,
      payload.gameName,
      payload.currentBalance,
      payload.lastWin,
      payload.betSize,
      payload.multiplier,
      sessionPnl,
      JSON.stringify(payload),
    ]
  );

  // Broadcast SSE via global studioEventBus
  try {
    if (global.studioEventBus && userId) {
      global.studioEventBus.publish(userId, {
        type: 'stake.update',
        sessionId,
        gameName: payload.gameName,
        currentBalance: payload.currentBalance,
        lastWin: payload.lastWin,
        betSize: payload.betSize,
        multiplier: payload.multiplier,
        sessionPnl,
        ts: payload.timestamp ?? payload.ts ?? Date.now(),
      });
    }
  } catch { /* non-fatal - SSE broadcast failure should not fail the insert */ }
}
