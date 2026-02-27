// routes/integrations/youtube_chat_ingest.js
import express from "express";
import requireAuth from "../../utils/requireAuth.js";
import {
  startYouTubeChatIngest,
  stopYouTubeChatIngest,
  getYouTubeChatIngestStatus,
} from "../../services/youtubeChatIngest.js";

const router = express.Router();

// POST /integrations/youtube/chat/start
router.post("/integrations/youtube/chat/start", requireAuth, (req, res) => {
  const userId = req.session.user.id;
  try {
    const status = startYouTubeChatIngest(userId);
    return res.json({ ok: true, status });
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /integrations/youtube/chat/stop
router.post("/integrations/youtube/chat/stop", requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const status = stopYouTubeChatIngest(userId);
  return res.json({ ok: true, status });
});

// GET /integrations/youtube/chat/status
router.get("/integrations/youtube/chat/status", requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const status = getYouTubeChatIngestStatus(userId);
  return res.json({ ok: true, status });
});

export default router;
