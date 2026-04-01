// routes/api/uploads.js
import express from "express";
import { makeUploadMiddleware } from "../../services/uploads.js";

function getUserId(req) {
  return req.session?.user?.id;
}

const router = express.Router();

// POST /dashboard/api/uploads/overlay/image
router.post(
  "/overlay/image",
  makeUploadMiddleware({
    getUserId,
    scope: "overlay",
    kind: "image",
    maxBytes: 25 * 1024 * 1024,
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    fieldName: "file",
  }),
  (req, res) => {
    return res.json({ ok: true, ...req.uploads });
  }
);

// POST /dashboard/api/uploads/overlay/video
router.post(
  "/overlay/video",
  makeUploadMiddleware({
    getUserId,
    scope: "overlay",
    kind: "video",
    maxBytes: 250 * 1024 * 1024,
    allowedMimes: ["video/mp4", "video/webm", "video/quicktime"],
    fieldName: "file",
  }),
  (req, res) => {
    return res.json({ ok: true, ...req.uploads });
  }
);

// POST /dashboard/api/uploads/overlay/audio
router.post(
  "/overlay/audio",
  makeUploadMiddleware({
    getUserId,
    scope: "overlay",
    kind: "audio",
    maxBytes: 10 * 1024 * 1024,
    allowedMimes: ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/webm", "audio/aac"],
    fieldName: "file",
  }),
  (req, res) => {
    return res.json({ ok: true, ...req.uploads });
  }
);

export default router;
