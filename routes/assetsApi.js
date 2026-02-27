// /routes/assetsApi.js
import express from "express";
import requireAuth from "../utils/requireAuth.js";
import { makeUploadMiddleware } from "../services/uploads.js";

const router = express.Router();

function getUserId(req) {
  return req?.session?.user?.id ?? null;
}

function pickScopeKind(req) {
  const scope = String(req.query.scope || "overlays");
  const kind = String(req.query.kind || "images");

  const allowedScopes = new Set(["overlays", "profiles", "widgets"]);
  const allowedKinds = new Set(["images", "videos"]);

  return {
    scope: allowedScopes.has(scope) ? scope : "overlays",
    kind: allowedKinds.has(kind) ? kind : "images",
  };
}

// POST /dashboard/api/assets/upload?scope=overlays&kind=images|videos
router.post(
  "/assets/upload",
  requireAuth,
  (req, res, next) => {
    const { scope, kind } = pickScopeKind(req);

    const allowedMimes =
      kind === "videos"
        ? ["video/mp4", "video/webm", "video/quicktime"]
        : ["image/png", "image/jpeg", "image/webp", "image/gif"];

    // Be realistic: videos will be big.
    const maxBytes = kind === "videos" ? 300 * 1024 * 1024 : 25 * 1024 * 1024;

    const mw = makeUploadMiddleware({
      getUserId,
      scope,
      kind,
      fieldName: "file",
      allowedMimes,
      maxBytes,
    });

    return mw(req, res, next);
  },
  (req, res) => {
    return res.json({
      ok: true,
      url: req.uploads.url,
      meta: {
        scope: req.uploads.scope,
        kind: req.uploads.kind,
        mimetype: req.uploads.mimetype,
        bytes: req.uploads.bytes,
        filename: req.uploads.filename,
        originalname: req.uploads.originalname,
      },
    });
  }
);

export default router;
