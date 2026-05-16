// dal/CollectionDal.js
import { BaseDal } from "./BaseDal.js";

export class CollectionDal extends BaseDal {
  constructor(userId) {
    super(userId, "overlay_collections");
  }

  async getUserCollections() {
    const { rows } = await this.db.query(`
      SELECT 
        c.*,
        COUNT(oci.overlay_id) as overlay_count,
        ARRAY_AGG(oci.overlay_id ORDER BY oci.sort_order ASC, oci.added_at ASC) FILTER (WHERE oci.overlay_id IS NOT NULL) as overlay_ids
      FROM overlay_collections c
      LEFT JOIN overlay_collection_items oci ON oci.collection_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [this.userId]);
    return rows;
  }

  async findBySlug(slug) {
    const { rows } = await this.db.query(
      'SELECT id FROM overlay_collections WHERE user_id = $1 AND slug = $2',
      [this.userId, slug]
    );
    return rows[0] || null;
  }

  async getCollectionWithOverlays(collectionId) {
    const { rows } = await this.db.query(`
      SELECT 
        c.*,
        json_agg(
          json_build_object(
            'id', o.id,
            'name', o.name,
            'slug', o.slug,
            'public_id', o.public_id,
            'thumbnail_url', o.thumbnail_url,
            'created_at', o.created_at,
            'updated_at', o.updated_at,
            'sort_order', oci.sort_order,
            'added_at', oci.added_at
          ) ORDER BY oci.sort_order ASC, oci.added_at ASC
        ) FILTER (WHERE o.id IS NOT NULL) as overlays
      FROM overlay_collections c
      LEFT JOIN overlay_collection_items oci ON oci.collection_id = c.id
      LEFT JOIN overlays o ON o.id = oci.overlay_id
      WHERE c.id = $1 AND c.user_id = $2
      GROUP BY c.id
    `, [collectionId, this.userId]);
    return rows[0] || null;
  }

  async addOverlayToCollection(collectionId, overlayId, sortOrder = 0) {
    const { rows } = await this.db.query(`
      INSERT INTO overlay_collection_items (collection_id, overlay_id, sort_order)
      VALUES ($1, $2, $3)
      ON CONFLICT (collection_id, overlay_id) 
      DO UPDATE SET sort_order = $3, added_at = NOW()
      RETURNING *
    `, [collectionId, overlayId, sortOrder]);
    
    // Also update overlay's collection_id
    await this.db.query(
      'UPDATE overlays SET collection_id = $1 WHERE id = $2 AND user_id = $3',
      [collectionId, overlayId, this.userId]
    );
    return rows[0];
  }

  async removeOverlayFromCollection(collectionId, overlayId) {
    const { rows } = await this.db.query(`
      DELETE FROM overlay_collection_items 
      WHERE collection_id = $1 AND overlay_id = $2
      RETURNING *
    `, [collectionId, overlayId]);
    
    if (rows.length > 0) {
      await this.db.query(
        'UPDATE overlays SET collection_id = NULL WHERE id = $1 AND user_id = $2',
        [overlayId, this.userId]
      );
      return true;
    }
    return false;
  }

  async reorderOverlays(collectionId, overlayIds) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < overlayIds.length; i++) {
        await client.query(`
          UPDATE overlay_collection_items 
          SET sort_order = $1 
          WHERE collection_id = $2 AND overlay_id = $3
        `, [i, collectionId, overlayIds[i]]);
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
