// routes/collections.js
import express from 'express';
import crypto from 'crypto';
import requireAuth from '../utils/requireAuth.js';
import db from '../db.js';

const router = express.Router();

// GET /dashboard/api/collections - List user's collections
router.get('/dashboard/api/collections', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const { rows } = await db.query(`
      SELECT 
        c.*,
        COUNT(oci.overlay_id) as overlay_count,
        ARRAY_AGG(oci.overlay_id ORDER BY oci.sort_order ASC, oci.added_at ASC) FILTER (WHERE oci.overlay_id IS NOT NULL) as overlay_ids
      FROM overlay_collections c
      LEFT JOIN overlay_collection_items oci ON oci.collection_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [userId]);

    res.json(rows);
  } catch (err) {
    console.error('[Collections] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /dashboard/api/collections - Create new collection
router.post('/dashboard/api/collections', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, description } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    // Generate unique slug
    const baseSlug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const { rows } = await db.query(
        'SELECT id FROM overlay_collections WHERE user_id = $1 AND slug = $2',
        [userId, slug]
      );
      if (rows.length === 0) break;
      slug = `${baseSlug}-${counter++}`;
    }

    const { rows } = await db.query(`
      INSERT INTO overlay_collections (user_id, name, slug, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userId, name.trim(), slug, description?.trim() || null]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[Collections] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /dashboard/api/collections/:id - Update collection
router.put('/dashboard/api/collections/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    const { rows } = await db.query(`
      UPDATE overlay_collections 
      SET name = $3, description = $4, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [collectionId, userId, name.trim(), description?.trim() || null]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[Collections] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /dashboard/api/collections/:id - Delete collection
router.delete('/dashboard/api/collections/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);

    const { rows } = await db.query(`
      DELETE FROM overlay_collections 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [collectionId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /dashboard/api/collections/:id/overlays - Add overlay to collection
router.post('/dashboard/api/collections/:id/overlays', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { overlayId, sortOrder } = req.body;

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Verify overlay ownership
    const { rows: overlayRows } = await db.query(
      'SELECT id FROM overlays WHERE id = $1 AND user_id = $2',
      [overlayId, userId]
    );
    
    if (overlayRows.length === 0) {
      return res.status(404).json({ error: 'Overlay not found' });
    }

    // Add to collection
    const { rows } = await db.query(`
      INSERT INTO overlay_collection_items (collection_id, overlay_id, sort_order)
      VALUES ($1, $2, $3)
      ON CONFLICT (collection_id, overlay_id) 
      DO UPDATE SET sort_order = $3, added_at = NOW()
      RETURNING *
    `, [collectionId, overlayId, sortOrder || 0]);

    // Update overlay's collection_id for quick reference
    await db.query(
      'UPDATE overlays SET collection_id = $1 WHERE id = $2',
      [collectionId, overlayId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('[Collections] Add overlay error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /dashboard/api/collections/:id/overlays/:overlayId - Remove overlay from collection
router.delete('/dashboard/api/collections/:id/overlays/:overlayId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const overlayId = Number(req.params.overlayId);

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Remove from collection
    const { rows } = await db.query(`
      DELETE FROM overlay_collection_items 
      WHERE collection_id = $1 AND overlay_id = $2
      RETURNING *
    `, [collectionId, overlayId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Overlay not in collection' });
    }

    // Clear overlay's collection_id
    await db.query(
      'UPDATE overlays SET collection_id = NULL WHERE id = $1',
      [overlayId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Remove overlay error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /dashboard/api/collections/:id/overlays/reorder - Reorder overlays in collection
router.put('/dashboard/api/collections/:id/overlays/reorder', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { overlayIds } = req.body; // Array of overlay IDs in new order

    if (!Array.isArray(overlayIds)) {
      return res.status(400).json({ error: 'overlayIds must be an array' });
    }

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Update sort orders
    const client = await db.connect();
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

    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Reorder error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /dashboard/api/collections/:id - Get collection details with overlays
router.get('/dashboard/api/collections/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);

    const { rows } = await db.query(`
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
    `, [collectionId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[Collections] Get details error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;