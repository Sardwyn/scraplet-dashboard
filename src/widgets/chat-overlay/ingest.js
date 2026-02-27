// src/widgets/chat-overlay/ingest.js
import { getOrCreateUserChatOverlay } from "./service.js";
import { push as pushRing } from "../../runtime/ringBuffer.js";

/**
 * Enqueue a normalized chat message into this user's chat overlay durable event log.
 * Bypasses HTTP ingest and does NOT require ingest_key.
 */
export async function enqueueChatForUser(ownerUserId, item) {
  const widget = await getOrCreateUserChatOverlay(ownerUserId);
  if (!widget?.public_id) return { ok: false, reason: "no_widget" };
  if (widget.is_enabled === false) return { ok: false, reason: "disabled" };

  const safeItem = {
    id: item?.id || null,
    platform: item?.platform || "unknown",
    channel: item?.channel || null,
    user: {
      name: item?.user?.name || "Unknown",
      avatar: item?.user?.avatar || "",
    },
    badges: Array.isArray(item?.badges) ? item.badges.slice(0, 6) : [],
    text: String(item?.text || "").slice(0, 400),
    ts: item?.ts || Date.now(),
  };

  await pushRing(widget.public_id, safeItem);
  return { ok: true, public_id: widget.public_id };
}
