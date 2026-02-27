import { query as q } from '../../db.js';

export async function createOrder({
  creatorUserId,
  viewerUserId,
  totalCents,
  paymentProvider,
  paymentIntentId
}) {
  const { rows } = await q(
    `
    INSERT INTO orders
      (creator_user_id, viewer_user_id, total_cents, payment_provider, payment_intent_id, status)
    VALUES
      ($1, $2, $3, $4, $5, 'paid')
    RETURNING *
    `,
    [creatorUserId, viewerUserId, totalCents, paymentProvider, paymentIntentId]
  );

  return rows[0];
}
