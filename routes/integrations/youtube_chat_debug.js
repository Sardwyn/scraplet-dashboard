// routes/integrations/youtube_chat_debug.js
import express from "express";
import db from "../../db.js";
import requireAuth from "../../utils/requireAuth.js";

const router = express.Router();

async function getYouTubeAccessTokenForUser(userId) {
  const r = await db.query(
    `
    SELECT t.access_token
    FROM external_accounts ea
    JOIN external_account_tokens t ON t.external_account_id = ea.id
    WHERE ea.user_id = $1 AND ea.platform = 'youtube'
    LIMIT 1
    `,
    [userId]
  );
  return r.rows[0]?.access_token || null;
}

// GET /integrations/youtube/debug/broadcast
router.get("/integrations/youtube/debug/broadcast", requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const token = await getYouTubeAccessTokenForUser(userId);
  if (!token) return res.status(400).json({ ok: false, error: "No YouTube token found" });

  const url =
  "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
  "?part=snippet,contentDetails,status" +
  "&mine=true" +
  "&maxResults=5";


  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  return res.status(r.status).json({ ok: r.ok, url, data: j });
});

// GET /integrations/youtube/debug/chat?liveChatId=XXXX
router.get("/integrations/youtube/debug/chat", requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const token = await getYouTubeAccessTokenForUser(userId);
  if (!token) return res.status(400).json({ ok: false, error: "No YouTube token found" });

  const liveChatId = String(req.query.liveChatId || "").trim();
  if (!liveChatId) return res.status(400).json({ ok: false, error: "Missing liveChatId" });

  const url =
    "https://www.googleapis.com/youtube/v3/liveChat/messages" +
    "?part=snippet,authorDetails" +
    `&liveChatId=${encodeURIComponent(liveChatId)}` +
    "&maxResults=50";

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  return res.status(r.status).json({ ok: r.ok, url, data: j });
});

export default router;
