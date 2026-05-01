// routes/assets.js
// Asset Library API for overlay editor
import express from "express";
import fs from "fs";
import path from "path";
import requireAuth from "../utils/requireAuth.js";
import { makeUploadMiddleware } from "../services/uploads.js";
import db from "../db.js";

const router = express.Router();

const ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_BYTES = 300 * 1024 * 1024; // 300MB (support large videos)

function getUserId(req) {
  return req?.session?.user?.id ?? null;
}

function pickScopeKind(req) {
  const scope = String(req.query.scope || "overlays");
  const kind = String(req.query.kind || "assets");

  const allowedScopes = new Set(["overlays", "profiles", "widgets"]);
  const allowedKinds = new Set(["assets", "images", "videos"]);

  return {
    scope: allowedScopes.has(scope) ? scope : "overlays",
    kind: allowedKinds.has(kind) ? kind : "assets",
  };
}

// POST /dashboard/api/assets/upload
router.post(
  "/assets/upload",
  requireAuth,
  (req, res, next) => {
    const { scope, kind } = pickScopeKind(req);
    
    const mw = makeUploadMiddleware({
      getUserId,
      scope,
      kind,
      fieldName: "file",
      allowedMimes: ALLOWED_MIMES,
      maxBytes: MAX_BYTES,
    });
    return mw(req, res, next);
  },
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { url, filename, mimetype, bytes } = req.uploads;

      const { rows } = await db.query(
        `INSERT INTO overlay_assets (user_id, filename, url, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, filename, url, mime_type, size_bytes, created_at`,
        [userId, filename, url, mimetype, bytes]
      );

      return res.json({ ok: true, url: rows[0].url, asset: rows[0] });
    } catch (err) {
      console.error("Asset upload DB error:", err);
      return res.status(500).json({ ok: false, error: "Failed to save asset record" });
    }
  }
);

// GET /dashboard/api/assets
router.get("/assets", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rows } = await db.query(
      `SELECT id, filename, url, mime_type, size_bytes, created_at
       FROM overlay_assets
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.json({ ok: true, assets: rows });
  } catch (err) {
    console.error("Asset list error:", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch assets" });
  }
});

// DELETE /dashboard/api/assets/:id
router.delete("/assets/:id", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const assetId = parseInt(req.params.id, 10);

    if (!Number.isFinite(assetId)) {
      return res.status(400).json({ ok: false, error: "Invalid asset id" });
    }

    // Verify ownership and get file path
    const { rows } = await db.query(
      `SELECT id, url FROM overlay_assets WHERE id = $1 AND user_id = $2`,
      [assetId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Asset not found" });
    }

    const asset = rows[0];

    // Delete DB record
    await db.query(`DELETE FROM overlay_assets WHERE id = $1`, [assetId]);

    // Delete file from disk (best-effort)
    try {
      const uploadsRoot = process.env.SCRAPLET_UPLOADS_ROOT ||
        path.join(process.cwd(), "public", "uploads");
      // url is like /uploads/u/123/overlays/assets/filename.png
      const relPath = asset.url.replace(/^\/uploads/, "");
      const diskPath = path.join(uploadsRoot, relPath);
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    } catch (fileErr) {
      console.warn("Could not delete asset file:", fileErr.message);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Asset delete error:", err);
    return res.status(500).json({ ok: false, error: "Failed to delete asset" });
  }
});

export default router;
