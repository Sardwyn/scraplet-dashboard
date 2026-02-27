// src/widgets/chat-overlay/api.js
import express from "express";
import crypto from "crypto";
import { poll as pollRing, push as pushRing } from "../../runtime/ringBuffer.js";
import { getWidgetByPublicId } from "./service.js";

const router = express.Router();

/**
 * Convert either:
 *  - Lean overlay message (legacy/current): { text, platform?, channel?, user?, badges? }
 *  - ChatEnvelopeV1: { v:1, platform, channel:{slug}, author:{display, badges?}, message:{text} }
 *  - Wrapper containing chat_v1: { chat_v1: <ChatEnvelopeV1> }
 *
 * into the lean message the overlay renderer expects:
 *   { id, platform, channel, user:{name, avatar?}, badges, text }
 */
function toLeanOverlayMessage(body) {
  const b = body && typeof body === "object" ? body : {};

  // If this is a wrapper with chat_v1, unwrap it.
  const env = b?.chat_v1 && typeof b.chat_v1 === "object" ? b.chat_v1 : b;

  // ChatEnvelopeV1 shape?
  const isChatV1 =
    env &&
    typeof env === "object" &&
    Number(env.v) === 1 &&
    typeof env.platform === "string" &&
    env.message &&
    typeof env.message === "object";

  if (isChatV1) {
    const text = env?.message?.text;
    if (typeof text !== "string" || !text.trim()) return null;

    const channelSlug =
      env?.channel?.slug != null ? String(env.channel.slug) : null;

    const authorDisplay =
      env?.author?.display != null
        ? String(env.author.display)
        : env?.author?.username != null
          ? String(env.author.username)
          : "unknown";

    const badges = Array.isArray(env?.author?.badges)
      ? env.author.badges.map((x) => String(x)).slice(0, 6)
      : [];

    // Optional avatar: if you later add author.avatar_url to the contract,
    // this will start working automatically.
    const avatar =
      env?.author?.avatar_url != null ? String(env.author.avatar_url) : null;

    return {
      id: env.id || null,
      platform: String(env.platform || "kick").toLowerCase(),
      channel: channelSlug,
      user: { name: authorDisplay, ...(avatar ? { avatar } : {}) },
      badges,
      text: String(text).slice(0, 400),
    };
  }

  // Otherwise treat it as legacy lean message
  if (!env.text || typeof env.text !== "string" || !env.text.trim()) return null;

  const lean = {
    id: env.id || null,
    platform: env.platform ? String(env.platform).toLowerCase() : "kick",
    channel: env.channel != null ? String(env.channel) : null,
    user:
      env.user && typeof env.user === "object"
        ? {
            name: env.user.name ? String(env.user.name) : "unknown",
            ...(env.user.avatar ? { avatar: String(env.user.avatar) } : {}),
          }
        : { name: "unknown" },
    badges: Array.isArray(env.badges) ? env.badges.map(String).slice(0, 6) : [],
    text: String(env.text).slice(0, 400),
  };

  return lean;
}

// OBS overlay polls for new messages
router.get("/api/obs/chat/:publicId/poll", async (req, res) => {
  try {
    const { publicId } = req.params;
    const since = req.query.since ? parseInt(String(req.query.since), 10) : 0;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const { seq, items } = await pollRing(publicId, since);
    return res.json({ ok: true, seq, items });
  } catch (e) {
    console.error("[chat-overlay] poll_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "poll_failed" });
  }
});

// Overlay config (used by preview to hot-reload when settings change)
router.get("/api/obs/chat/:publicId/config", async (req, res) => {
  try {
    const { publicId } = req.params;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const cfg = w.config_json || {};
    const sig = crypto
      .createHash("sha1")
      .update(JSON.stringify(cfg))
      .digest("hex")
      .slice(0, 12);

    return res.json({ ok: true, sig, cfg });
  } catch (e) {
    console.error("[chat-overlay] config_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "config_failed" });
  }
});

// Ingest (Scrapbot or other supervisors) → ring buffer
router.post(
  "/api/obs/chat/:publicId/ingest",
  express.json({ limit: "256kb" }),
  async (req, res) => {
    try {
      const { publicId } = req.params;
      const providedKey = String(req.header("x-ingest-key") || "");

      const w = await getWidgetByPublicId(publicId);
      if (!w || !w.is_enabled) {
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      if (!providedKey || providedKey !== w.ingest_key) {
        return res.status(401).json({ ok: false, error: "bad_key" });
      }

      const cfg = w.config_json || {};
      const max = Math.min(
        Math.max(parseInt(cfg?.bufferMax ?? 120, 10), 30),
        500
      );

      const lean = toLeanOverlayMessage(req.body);
      if (!lean) {
        return res.status(400).json({ ok: false, error: "invalid_payload" });
      }

      await pushRing(publicId, lean, max);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[chat-overlay] ingest_failed:", e?.message || e);
      return res.status(500).json({ ok: false, error: "ingest_failed" });
    }
  }
);

export default router;
