const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../middleware/auth");
const db = require("../../db");

// GET /dashboard/api/overlays/components — list all components for the user
router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      "SELECT id, name, definition, created_at FROM overlay_components WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json({ components: rows.rows });
  } catch (e) {
    console.error("GET overlay_components error", e);
    res.status(500).json({ error: "Failed to fetch components" });
  }
});

// POST /dashboard/api/overlays/components — save a new component
router.post("/", requireAuth, async (req, res) => {
  const { name, definition } = req.body;
  if (!name || !definition) return res.status(400).json({ error: "name and definition required" });
  try {
    const result = await db.query(
      "INSERT INTO overlay_components (user_id, name, definition, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id",
      [req.user.id, name, JSON.stringify(definition)]
    );
    res.json({ id: result.rows[0].id, name });
  } catch (e) {
    console.error("POST overlay_components error", e);
    res.status(500).json({ error: "Failed to save component" });
  }
});

// DELETE /dashboard/api/overlays/components/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM overlay_components WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete component" });
  }
});

module.exports = router;
