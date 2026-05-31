// routes/collections.js
import express from 'express';
import requireAuth from '../utils/requireAuth.js';
import db from '../db.js';
import { CollectionDal } from '../dal/CollectionDal.js';

const router = express.Router();

// GET /dashboard/api/collections - List user's collections
router.get('/dashboard/api/collections', requireAuth, async (req, res) => {
  try {
    const dal = new CollectionDal(req.session.user.id);
    const collections = await dal.getUserCollections();
    res.json(collections);
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

// GET /dashboard/api/collections/:id - Get collection details with overlays and components
router.get('/dashboard/api/collections/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);

    const dal = new CollectionDal(userId);
    const collection = await dal.getCollectionWithOverlays(collectionId, userId);

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(collection);
  } catch (err) {
    console.error('[Collections] Get details error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// LEGACY BACKWARDS-COMPATIBLE OVERLAYS WRAPPERS
// ==========================================

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

    const dal = new CollectionDal(userId);
    const item = await dal.addItemToCollection(collectionId, 'overlay', overlayId, sortOrder || 0);
    res.json(item);
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

    const dal = new CollectionDal(userId);
    const success = await dal.removeItemFromCollection(collectionId, 'overlay', overlayId);
    if (!success) {
      return res.status(404).json({ error: 'Overlay not in collection' });
    }

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
    const { overlayIds } = req.body;

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

    const dal = new CollectionDal(userId);
    await dal.reorderItems(collectionId, 'overlay', overlayIds);
    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Reorder error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// COMPONENT-SPECIFIC WRAPPERS (DESIGN ATOMS)
// ==========================================

// POST /dashboard/api/collections/:id/components - Add component/atom to collection
router.post('/dashboard/api/collections/:id/components', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { componentId, sortOrder } = req.body;

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Verify component ownership
    const { rows: componentRows } = await db.query(
      'SELECT id FROM overlay_components WHERE id = $1 AND user_id = $2',
      [componentId, userId]
    );
    if (componentRows.length === 0) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const dal = new CollectionDal(userId);
    const item = await dal.addItemToCollection(collectionId, 'component', componentId, sortOrder || 0);
    res.json(item);
  } catch (err) {
    console.error('[Collections] Add component error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /dashboard/api/collections/:id/components/:componentId - Remove component from collection
router.delete('/dashboard/api/collections/:id/components/:componentId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const componentId = Number(req.params.componentId);

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const dal = new CollectionDal(userId);
    const success = await dal.removeItemFromCollection(collectionId, 'component', componentId);
    if (!success) {
      return res.status(404).json({ error: 'Component not in collection' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Remove component error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /dashboard/api/collections/:id/components/reorder - Reorder components in collection
router.put('/dashboard/api/collections/:id/components/reorder', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { componentIds } = req.body;

    if (!Array.isArray(componentIds)) {
      return res.status(400).json({ error: 'componentIds must be an array' });
    }

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const dal = new CollectionDal(userId);
    await dal.reorderItems(collectionId, 'component', componentIds);
    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Reorder components error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// UNIFIED POLYMORPHIC ITEMS ENDPOINTS (OPTION 1)
// ==========================================

// POST /dashboard/api/collections/:id/items - Add polymorphic item (overlay or component)
router.post('/dashboard/api/collections/:id/items', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { itemType, itemId, sortOrder } = req.body;

    if (!['overlay', 'component'].includes(itemType)) {
      return res.status(400).json({ error: 'itemType must be "overlay" or "component"' });
    }
    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Verify item ownership
    if (itemType === 'overlay') {
      const { rows: overlayRows } = await db.query(
        'SELECT id FROM overlays WHERE id = $1 AND user_id = $2',
        [itemId, userId]
      );
      if (overlayRows.length === 0) {
        return res.status(404).json({ error: 'Overlay not found' });
      }
    } else {
      const { rows: componentRows } = await db.query(
        'SELECT id FROM overlay_components WHERE id = $1 AND user_id = $2',
        [itemId, userId]
      );
      if (componentRows.length === 0) {
        return res.status(404).json({ error: 'Component not found' });
      }
    }

    const dal = new CollectionDal(userId);
    const item = await dal.addItemToCollection(collectionId, itemType, itemId, sortOrder || 0);
    res.json(item);
  } catch (err) {
    console.error('[Collections] Add polymorphic item error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /dashboard/api/collections/:id/items/:itemId - Remove polymorphic item from collection
router.delete('/dashboard/api/collections/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { itemType } = req.query;

    if (!['overlay', 'component'].includes(itemType)) {
      return res.status(400).json({ error: 'itemType query param must be "overlay" or "component"' });
    }

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const dal = new CollectionDal(userId);
    const success = await dal.removeItemFromCollection(collectionId, itemType, itemId);
    if (!success) {
      return res.status(404).json({ error: `${itemType} not in collection` });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Remove polymorphic item error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /dashboard/api/collections/:id/items/reorder - Reorder polymorphic items
router.put('/dashboard/api/collections/:id/items/reorder', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.id);
    const { itemType, itemIds } = req.body;

    if (!['overlay', 'component'].includes(itemType)) {
      return res.status(400).json({ error: 'itemType must be "overlay" or "component"' });
    }
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds must be an array' });
    }

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT id FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const dal = new CollectionDal(userId);
    await dal.reorderItems(collectionId, itemType, itemIds);
    res.json({ success: true });
  } catch (err) {
    console.error('[Collections] Reorder polymorphic items error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;