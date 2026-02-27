import { query as q } from '../../db.js';

export async function getProductBySlug(slug) {
  const { rows } = await q(
    `SELECT * FROM products WHERE slug = $1 AND status = 'active'`,
    [slug]
  );
  return rows[0] || null;
}
