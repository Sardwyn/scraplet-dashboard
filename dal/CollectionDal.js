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
        COALESCE(
          (SELECT COUNT(*) FROM overlay_collection_items WHERE collection_id = c.id AND item_type = 'overlay'), 0
        ) as overlay_count,
        COALESCE(
          (SELECT COUNT(*) FROM overlay_collection_items WHERE collection_id = c.id AND item_type = 'component'), 0
        ) as component_count,
        COALESCE(
          (SELECT ARRAY_AGG(overlay_id ORDER BY sort_order ASC, added_at ASC) 
           FROM overlay_collection_items 
           WHERE collection_id = c.id AND item_type = 'overlay'), ARRAY[]::integer[]
        ) as overlay_ids,
        COALESCE(
          (SELECT ARRAY_AGG(component_id ORDER BY sort_order ASC, added_at ASC) 
           FROM overlay_collection_items 
           WHERE collection_id = c.id AND item_type = 'component'), ARRAY[]::integer[]
        ) as component_ids
      FROM overlay_collections c
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
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', o.id,
              'name', o.name,
              'slug', o.slug,
              'public_id', o.public_id,
              'thumbnail_url', o.thumbnail_url,
              'created_at', o.created_at,
              'updated_at', o.updated_at,
              'sort_order', oci.sort_order,
              'added_at', oci.added_at,
              'item_type', 'overlay'
            ) ORDER BY oci.sort_order ASC, oci.added_at ASC
          ) FROM overlay_collection_items oci
          JOIN overlays o ON o.id = oci.overlay_id
          WHERE oci.collection_id = c.id AND oci.item_type = 'overlay'), '[]'::json
        ) as overlays,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', comp.id,
              'name', comp.name,
              'public_id', comp.public_id,
              'schema_version', comp.schema_version,
              'created_at', comp.created_at,
              'updated_at', comp.updated_at,
              'sort_order', oci.sort_order,
              'added_at', oci.added_at,
              'item_type', 'component'
            ) ORDER BY oci.sort_order ASC, oci.added_at ASC
          ) FROM overlay_collection_items oci
          JOIN overlay_components comp ON comp.id = oci.component_id
          WHERE oci.collection_id = c.id AND oci.item_type = 'component'), '[]'::json
        ) as components
      FROM overlay_collections c
      WHERE c.id = $1 AND c.user_id = $2
    `, [collectionId, this.userId]);
    return rows[0] || null;
  }

  async addOverlayToCollection(collectionId, overlayId, sortOrder = 0) {
    return this.addItemToCollection(collectionId, 'overlay', overlayId, sortOrder);
  }

  async addItemToCollection(collectionId, itemType, itemId, sortOrder = 0) {
    if (itemType === 'overlay') {
      const { rows } = await this.db.query(`
        INSERT INTO overlay_collection_items (collection_id, overlay_id, item_type, sort_order)
        VALUES ($1, $2, 'overlay', $3)
        ON CONFLICT (collection_id, overlay_id) WHERE (item_type = 'overlay')
        DO UPDATE SET sort_order = $3, added_at = NOW()
        RETURNING *
      `, [collectionId, itemId, sortOrder]);
      
      // Also update overlay's collection_id
      await this.db.query(
        'UPDATE overlays SET collection_id = $1 WHERE id = $2 AND user_id = $3',
        [collectionId, itemId, this.userId]
      );
      return rows[0];
    } else if (itemType === 'component') {
      const { rows } = await this.db.query(`
        INSERT INTO overlay_collection_items (collection_id, component_id, item_type, sort_order)
        VALUES ($1, $2, 'component', $3)
        ON CONFLICT (collection_id, component_id) WHERE (item_type = 'component')
        DO UPDATE SET sort_order = $3, added_at = NOW()
        RETURNING *
      `, [collectionId, itemId, sortOrder]);
      return rows[0];
    }
    throw new Error('Invalid itemType: ' + itemType);
  }

  async removeOverlayFromCollection(collectionId, overlayId) {
    return this.removeItemFromCollection(collectionId, 'overlay', overlayId);
  }

  async removeItemFromCollection(collectionId, itemType, itemId) {
    if (itemType === 'overlay') {
      const { rows } = await this.db.query(`
        DELETE FROM overlay_collection_items 
        WHERE collection_id = $1 AND overlay_id = $2 AND item_type = 'overlay'
        RETURNING *
      `, [collectionId, itemId]);
      
      if (rows.length > 0) {
        await this.db.query(
          'UPDATE overlays SET collection_id = NULL WHERE id = $1 AND user_id = $2',
          [itemId, this.userId]
        );
        return true;
      }
    } else if (itemType === 'component') {
      const { rows } = await this.db.query(`
        DELETE FROM overlay_collection_items 
        WHERE collection_id = $1 AND component_id = $2 AND item_type = 'component'
        RETURNING *
      `, [collectionId, itemId]);
      return rows.length > 0;
    }
    return false;
  }

  async reorderOverlays(collectionId, overlayIds) {
    return this.reorderItems(collectionId, 'overlay', overlayIds);
  }

  async reorderItems(collectionId, itemType, itemIds) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      const idColumn = itemType === 'overlay' ? 'overlay_id' : 'component_id';
      for (let i = 0; i < itemIds.length; i++) {
        await client.query(`
          UPDATE overlay_collection_items 
          SET sort_order = $1 
          WHERE collection_id = $2 AND ${idColumn} = $3 AND item_type = $4
        `, [i, collectionId, itemIds[i], itemType]);
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
