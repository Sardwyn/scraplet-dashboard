import { query as q } from '../../db.js';

export async function issueEntitlement({
  orderId,
  productId,
  creatorUserId,
  viewerUserId,
  metadata = {}
}) {
  const { rows } = await q(
    `
    INSERT INTO entitlements
      (order_id, product_id, creator_user_id, viewer_user_id, metadata_json)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [orderId, productId, creatorUserId, viewerUserId, metadata]
  );

  return rows[0];
}

export async function fulfillEntitlement(entitlementId) {
  await q(
    `UPDATE entitlements SET status = 'fulfilled' WHERE id = $1`,
    [entitlementId]
  );
}
