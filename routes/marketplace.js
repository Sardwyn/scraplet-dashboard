// routes/marketplace.js
import express from 'express';
import crypto from 'crypto';
import requireAuth from '../utils/requireAuth.js';
import db from '../db.js';

const router = express.Router();

// GET /marketplace — public browse page
router.get('/dashboard/marketplace', async (req, res, next) => {
  try {
    // Get both individual overlays, collections, and individual components
    const { rows: overlayListings } = await db.query(`
      SELECT m.id, m.title, m.description, m.price_cents, m.published_at,
             u.username as creator_username,
             o.public_id as overlay_public_id,
             o.thumbnail_url,
             'overlay' as listing_type,
             m.featured,
             m.category,
             m.platform_tags,
             m.install_count,
             m.avg_rating
      FROM marketplace_overlays m
      JOIN users u ON u.id = m.user_id
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.status = 'published'
    `).catch(() => ({ rows: [] }));

    const { rows: collectionListings } = await db.query(`
      SELECT 
        mc.id, 
        mc.title, 
        mc.description, 
        mc.price_cents, 
        mc.published_at,
        u.username as creator_username,
        c.slug as collection_slug,
        c.thumbnail_url,
        'collection' as listing_type,
        (SELECT COUNT(*) FROM overlay_collection_items WHERE collection_id = c.id) as overlay_count,
        (
          SELECT o.public_id 
          FROM overlay_collection_items oci
          JOIN overlays o ON o.id = oci.overlay_id
          WHERE oci.collection_id = c.id AND oci.item_type = 'overlay'
          ORDER BY oci.sort_order ASC, oci.added_at ASC
          LIMIT 1
        ) as first_overlay_public_id,
        false as featured,
        null as category,
        null::text[] as platform_tags,
        0 as install_count,
        0.0 as avg_rating
      FROM marketplace_collections mc
      JOIN users u ON u.id = mc.user_id
      JOIN overlay_collections c ON c.id = mc.collection_id
      WHERE mc.status = 'published'
    `).catch((err) => {
      console.error('[marketplace] Failed to fetch collections:', err);
      return { rows: [] };
    });

    const { rows: componentListings } = await db.query(`
      SELECT m.id, m.title, m.description, m.price_cents, m.published_at,
             u.username as creator_username,
             c.public_id as component_public_id,
             null as thumbnail_url,
             'component' as listing_type,
             false as featured,
             null as category,
             null::text[] as platform_tags,
             m.install_count,
             m.avg_rating
      FROM marketplace_components m
      JOIN users u ON u.id = m.user_id
      JOIN overlay_components c ON c.id = m.component_id
      WHERE m.status = 'published'
    `).catch(() => ({ rows: [] }));

    const listings = [...overlayListings, ...collectionListings, ...componentListings]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 100);

    res.render('layout', {
      tabView: 'marketplace',
      currentPage: "marketplace",
      user: req.session?.user || null,
      listings,
    });
  } catch (err) { next(err); }
});

// POST /dashboard/api/marketplace/publish-collection/:collectionId
// Publish a collection to the marketplace
router.post('/dashboard/api/marketplace/publish-collection/:collectionId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const collectionId = Number(req.params.collectionId);
    const { title, description, price_cents = 0 } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Verify collection ownership
    const { rows: collectionRows } = await db.query(
      'SELECT * FROM overlay_collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    
    if (collectionRows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const collection = collectionRows[0];

    // Get collection overlays for snapshot
    const { rows: overlays } = await db.query(`
      SELECT o.id, o.name, o.slug, o.public_id, o.config_json
      FROM overlay_collection_items oci
      JOIN overlays o ON o.id = oci.overlay_id
      WHERE oci.collection_id = $1 AND oci.item_type = 'overlay'
      ORDER BY oci.sort_order ASC, oci.added_at ASC
    `, [collectionId]);

    // Get collection components for snapshot
    const { rows: components } = await db.query(`
      SELECT c.id, c.name, c.public_id, c.component_json, c.schema_version
      FROM overlay_collection_items oci
      JOIN overlay_components c ON c.id = oci.component_id
      WHERE oci.collection_id = $1 AND oci.item_type = 'component'
      ORDER BY oci.sort_order ASC, oci.added_at ASC
    `, [collectionId]);

    if (overlays.length === 0 && components.length === 0) {
      return res.status(400).json({ error: 'Cannot publish empty collection' });
    }

    // Create marketplace listing
    const { rows } = await db.query(`
      INSERT INTO marketplace_collections (
        user_id, collection_id, title, description, price_cents, 
        snapshot_overlays, snapshot_components, status, published_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', NOW())
      ON CONFLICT (collection_id) 
      DO UPDATE SET 
        title = $3, description = $4, price_cents = $5,
        snapshot_overlays = $6, snapshot_components = $7, status = 'published', published_at = NOW()
      RETURNING *
    `, [
      userId, 
      collectionId, 
      title.trim(), 
      description?.trim() || null, 
      price_cents, 
      JSON.stringify(overlays), 
      JSON.stringify(components)
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[marketplace] publish collection error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /dashboard/api/marketplace/acquire-collection/:listingId
// Clone a collection into the buyer's account
router.post('/dashboard/api/marketplace/acquire-collection/:listingId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const listingId = Number(req.params.listingId);

    const { rows: [listing] } = await db.query(`
      SELECT mc.*, c.name as collection_name
      FROM marketplace_collections mc
      JOIN overlay_collections c ON c.id = mc.collection_id
      WHERE mc.id = $1 AND mc.status = 'published'
    `, [listingId]);

    if (!listing) return res.status(404).json({ ok: false, error: 'Collection not found' });
    if (listing.price_cents > 0) return res.status(402).json({ ok: false, error: 'Paid collections require checkout' });

    const overlays = listing.snapshot_overlays || [];
    const components = listing.snapshot_components || [];
    if (overlays.length === 0 && components.length === 0) {
      return res.status(400).json({ ok: false, error: 'Collection is empty' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Create new collection
      const collectionSlug = 'marketplace-' + listing.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
      const collectionName = listing.title + ' (from marketplace)';
      
      const { rows: [newCollection] } = await client.query(`
        INSERT INTO overlay_collections (user_id, name, slug, description)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [userId, collectionName, collectionSlug, listing.description]);

      const newCollectionId = newCollection.id;
      const clonedOverlays = [];
      const clonedComponents = [];

      // Clone each overlay in the collection
      for (let i = 0; i < overlays.length; i++) {
        const overlay = overlays[i];
        const publicId = crypto.randomBytes(12).toString('hex');
        const slug = 'marketplace-' + overlay.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36) + '-' + i;
        const name = overlay.name + ' (from marketplace)';

        const { rows: [newOverlay] } = await client.query(`
          INSERT INTO overlays (user_id, slug, name, public_id, config_json, scene_type, collection_id)
          VALUES ($1, $2, $3, $4, $5, 'overlay', $6)
          RETURNING id, public_id
        `, [userId, slug, name, publicId, JSON.stringify(overlay.config_json), newCollectionId]);

        // Add to collection
        await client.query(`
          INSERT INTO overlay_collection_items (collection_id, overlay_id, item_type, sort_order)
          VALUES ($1, $2, 'overlay', $3)
        `, [newCollectionId, newOverlay.id, i]);

        clonedOverlays.push(newOverlay);
      }

      // Clone each component in the collection
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        const publicId = 'comp_' + crypto.randomBytes(6).toString('hex');
        const name = component.name + ' (from marketplace)';

        const { rows: [newComp] } = await client.query(`
          INSERT INTO overlay_components (user_id, public_id, name, schema_version, component_json)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, public_id
        `, [userId, publicId, name, component.schema_version || 1, JSON.stringify(component.component_json)]);

        // Add to collection
        await client.query(`
          INSERT INTO overlay_collection_items (collection_id, component_id, item_type, sort_order)
          VALUES ($1, $2, 'component', $3)
        `, [newCollectionId, newComp.id, i]);

        clonedComponents.push(newComp);
      }

      await client.query('COMMIT');

      res.json({ 
        ok: true, 
        collectionId: newCollectionId,
        overlays: clonedOverlays,
        components: clonedComponents,
        editUrl: '/dashboard/overlays'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[marketplace] acquire collection error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /dashboard/api/marketplace/acquire/:listingId
// Clone a free overlay into the buyer's account
router.post('/dashboard/api/marketplace/acquire/:listingId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const listingId = Number(req.params.listingId);

    const { rows: [listing] } = await db.query(`
      SELECT m.*, o.name as overlay_name
      FROM marketplace_overlays m
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [listingId]);

    if (!listing) return res.status(404).json({ ok: false, error: 'Listing not found' });
    if (listing.price_cents > 0) return res.status(402).json({ ok: false, error: 'Paid overlays require checkout' });

    // Clone overlay into buyer's account
    const publicId = crypto.randomBytes(12).toString('hex');
    const slug = 'marketplace-' + listing.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
    const name = listing.title + ' (from marketplace)';
    const config = listing.snapshot_config || {};

    const { rows: [newOverlay] } = await db.query(`
      INSERT INTO overlays (user_id, slug, name, public_id, config_json, scene_type)
      VALUES ($1, $2, $3, $4, $5, 'overlay')
      RETURNING id, public_id
    `, [userId, slug, name, publicId, JSON.stringify(config)]);

    // Increment install_count
    await db.query(`
      UPDATE marketplace_overlays
      SET install_count = COALESCE(install_count, 0) + 1
      WHERE id = $1
    `, [listingId]);

    res.json({ ok: true, overlayId: newOverlay.id, publicId: newOverlay.public_id, editUrl: '/dashboard/overlays/' + newOverlay.id + '/edit' });
  } catch (err) {
    console.error('[marketplace] acquire error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /dashboard/api/marketplace/acquire-component/:listingId
// Clone a free component/atom into the buyer's overlay_components library
router.post('/dashboard/api/marketplace/acquire-component/:listingId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const listingId = Number(req.params.listingId);

    const { rows: [listing] } = await db.query(`
      SELECT m.*, c.name as component_name
      FROM marketplace_components m
      JOIN overlay_components c ON c.id = m.component_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [listingId]);

    if (!listing) return res.status(404).json({ ok: false, error: 'Component listing not found' });
    if (listing.price_cents > 0) return res.status(402).json({ ok: false, error: 'Paid components require checkout' });

    // Clone component into buyer's account
    const publicId = 'comp_' + crypto.randomBytes(6).toString('hex');
    const name = listing.title + ' (from marketplace)';
    const config = listing.snapshot_config || {};

    const { rows: [newComp] } = await db.query(`
      INSERT INTO overlay_components (user_id, public_id, name, schema_version, component_json)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, public_id
    `, [userId, publicId, name, 1, JSON.stringify(config)]);

    // Increment install_count
    await db.query(`
      UPDATE marketplace_components
      SET install_count = COALESCE(install_count, 0) + 1
      WHERE id = $1
    `, [listingId]);

    res.json({ 
      ok: true, 
      componentId: newComp.id, 
      publicId: newComp.public_id, 
      editUrl: '/dashboard/overlay-components' 
    });
  } catch (err) {
    console.error('[marketplace] acquire component error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /marketplace/:id/install — install overlay and increment install_count (legacy)
router.post('/marketplace/:id/install', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const listingId = Number(req.params.id);

    const { rows: [listing] } = await db.query(`
      SELECT m.*, o.name as overlay_name
      FROM marketplace_overlays m
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [listingId]);

    if (!listing) return res.status(404).json({ ok: false, error: 'Listing not found' });
    if (listing.price_cents > 0) return res.status(402).json({ ok: false, error: 'Paid overlays require checkout' });

    // Clone overlay into buyer's account
    const publicId = crypto.randomBytes(12).toString('hex');
    const slug = 'marketplace-' + listing.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
    const name = listing.title + ' (from marketplace)';
    const config = listing.snapshot_config || {};

    const { rows: [newOverlay] } = await db.query(`
      INSERT INTO overlays (user_id, slug, name, public_id, config_json, scene_type)
      VALUES ($1, $2, $3, $4, $5, 'overlay')
      RETURNING id, public_id
    `, [userId, slug, name, publicId, JSON.stringify(config)]);

    // Increment install_count
    await db.query(`
      UPDATE marketplace_overlays
      SET install_count = COALESCE(install_count, 0) + 1
      WHERE id = $1
    `, [listingId]);

    res.json({ ok: true, overlayId: newOverlay.id, publicId: newOverlay.public_id, editUrl: '/dashboard/overlays/' + newOverlay.id + '/edit' });
  } catch (err) { next(err); }
});

// GET /marketplace/:listingId — public listing landing page
router.get('/marketplace/:listingId', async (req, res, next) => {
  try {
    const { rows: [listing] } = await db.query(`
      SELECT m.*, u.username as creator_username, o.public_id as overlay_public_id
      FROM marketplace_overlays m
      JOIN users u ON u.id = m.user_id
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [Number(req.params.listingId)]);

    if (!listing) return res.status(404).render('404', { user: req.session?.user || null });

    // Extract widget type names from snapshot_config
    const widgets = listing.snapshot_config?.elements || [];
    listing.widget_list = [...new Set(widgets.map(e => e.type).filter(Boolean))];

    res.render('marketplace-listing', {
      listing,
      user: req.session?.user || null,
      req,
    });
  } catch (err) { next(err); }
});

// GET /marketplace/component/:listingId — public listing landing page for components
router.get('/marketplace/component/:listingId', async (req, res, next) => {
  try {
    const { rows: [listing] } = await db.query(`
      SELECT m.*, u.username as creator_username, c.public_id as component_public_id
      FROM marketplace_components m
      JOIN users u ON u.id = m.user_id
      JOIN overlay_components c ON c.id = m.component_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [Number(req.params.listingId)]);

    if (!listing) return res.status(404).render('404', { user: req.session?.user || null });

    listing.widget_list = ['component'];

    res.render('marketplace-listing', {
      listing,
      user: req.session?.user || null,
      req,
    });
  } catch (err) { next(err); }
});

export default router;

// ===== Marketplace Reviews =====

router.post('/marketplace/:id/review', async (req, res, next) => {
  try {
    if (!req.session?.user) return res.status(401).json({ error: 'Login required' });
    const userId = req.session.user.id;
    const listingId = Number(req.params.id);
    const { rating, review_text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating 1-5 required' });
    const { rows } = await db.query(
      `INSERT INTO marketplace_reviews (listing_id, user_id, rating, review_text)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (listing_id, user_id) DO UPDATE SET rating=$3, review_text=$4, updated_at=NOW()
       RETURNING *`,
      [listingId, userId, rating, review_text || null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/marketplace/:id/reviews', async (req, res, next) => {
  try {
    const listingId = Number(req.params.id);
    const page = Math.max(0, Number(req.query.page) || 0);
    const { rows } = await db.query(
      `SELECT mr.*, u.username FROM marketplace_reviews mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.listing_id = $1
       ORDER BY mr.created_at DESC LIMIT 20 OFFSET $2`,
      [listingId, page * 20]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/marketplace/api/listings', async (req, res, next) => {
  try {
    const { q = '', category = '', platform = '', page = '0', sort = 'featured' } = req.query;
    const offset = Math.max(0, Number(page)) * 24;
    
    let orderByClause = 'mo.featured DESC NULLS LAST, mo.avg_rating DESC NULLS LAST, mo.published_at DESC';
    if (sort === 'latest') {
      orderByClause = 'mo.published_at DESC';
    } else if (sort === 'rating') {
      orderByClause = 'mo.avg_rating DESC NULLS LAST';
    } else if (sort === 'installs') {
      orderByClause = 'mo.install_count DESC NULLS LAST';
    }

    const { rows } = await db.query(
      `SELECT mo.*, u.username as creator_name, o.public_id as overlay_public_id, o.thumbnail_url
       FROM marketplace_overlays mo
       LEFT JOIN users u ON u.id = mo.user_id
       LEFT JOIN overlays o ON o.id = mo.overlay_id
       WHERE mo.status = 'published'
         AND ($1 = '' OR to_tsvector('english', mo.title || ' ' || COALESCE(mo.description,'')) @@ plainto_tsquery('english', $1))
         AND ($2 = '' OR mo.category = $2)
         AND ($3 = '' OR $3 = ANY(COALESCE(mo.platform_tags, ARRAY[]::text[])))
       ORDER BY ${orderByClause}
       LIMIT 24 OFFSET $4`,
      [q, category, platform, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});
