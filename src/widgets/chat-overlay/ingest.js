// src/widgets/chat-overlay/ingest.js
import { getOrCreateUserChatOverlay } from "./service.js";
import { push as pushRing } from "../../runtime/ringBuffer.js";
import { overlayGate } from "../../../services/overlayGate.js";
import db from "../../../db.js";

/**
 * Enqueue a normalized chat message into this user's chat overlay durable event log.
 * Also publishes a chat.message packet to overlayGate so the unified overlay runtime
 * receives it via SSE without any CEF-side polling.
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
    emotes: Array.isArray(item?.emotes) ? item.emotes : [],
    color: item?.color || "",
    ts: item?.ts || Date.now(),
  };

  await pushRing(widget.public_id, safeItem);

  // Publish chat.message packet to overlayGate so unified overlay runtime
  // receives it via /api/overlays/public/:id/events/stream — no CEF polling needed.
  try {
    const overlays = await db.query(
      `SELECT public_id FROM overlays WHERE user_id = $1`,
      [String(ownerUserId)]
    );
    const packet = {
      header: {
        type: "chat.message",
        eventId: String(safeItem.id || Date.now()),
        ts: safeItem.ts,
      },
      payload: {
        author: {
          display: safeItem.user.name,
          color: safeItem.color,
          avatar: safeItem.user.avatar,
          badges: safeItem.badges,
        },
        message: {
          text: safeItem.text,
          emotes: safeItem.emotes,
        },
        platform: safeItem.platform,
      },
    };
    for (const row of overlays.rows) {
      overlayGate.publish(String(ownerUserId), row.public_id, packet);
    }
  } catch (e) {
    // Non-fatal — ring buffer write already succeeded
    console.warn("[chat-ingest] overlayGate publish failed:", e.message);
  }

  return { ok: true, public_id: widget.public_id };
}
