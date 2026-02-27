// /src/widgets/chat-overlay/buildChatEnvelopeV1.js
// Standard chat envelope used across all platforms.
// Everything upstream should normalize into this.

export function buildChatEnvelopeV1(input) {
  const v = 1;

  const platform = String(input?.platform || "").toLowerCase() || "unknown";

  const nowIso = new Date().toISOString();
  const ts =
    input?.ts ||
    input?.timestamp ||
    input?.createdAt ||
    input?.created_at ||
    nowIso;

  const messageId =
    input?.messageId ||
    input?.message_id ||
    input?.id ||
    input?.message?.id ||
    null;

  const text =
    input?.text ??
    input?.messageText ??
    input?.message_text ??
    input?.message?.text ??
    "";

  const userName =
    input?.user?.name ??
    input?.username ??
    input?.sender_username ??
    input?.author?.name ??
    input?.authorName ??
    "unknown";

  const userId =
    input?.user?.id ??
    input?.userId ??
    input?.sender_user_id ??
    input?.author?.id ??
    input?.authorId ??
    null;

  const avatar =
    input?.user?.avatar ??
    input?.avatar ??
    input?.profileImage ??
    input?.author?.avatar ??
    input?.authorAvatar ??
    null;

  const role =
    input?.user?.role ??
    input?.userRole ??
    input?.user_role ??
    input?.authorRole ??
    null;

  const channelId =
    input?.channel?.id ??
    input?.channelId ??
    input?.channel_id ??
    input?.roomId ??
    input?.room_id ??
    null;

  const channelSlug =
    input?.channel?.slug ??
    input?.channelSlug ??
    input?.channel_slug ??
    input?.channel ??
    null;

  return {
    v,
    eventType: "chat_message",

    platform,

    channel: {
      id: channelId,
      slug: channelSlug,
    },

    message: {
      id: messageId,
      text: String(text ?? ""),
      ts: typeof ts === "string" ? ts : new Date(ts).toISOString(),
    },

    user: {
      id: userId,
      name: String(userName ?? "unknown"),
      avatar: avatar ? String(avatar) : null,
      role: role ? String(role) : null,
    },

    // Safe bucket for anything extra (don’t rely on this in rendering)
    meta: input?.meta && typeof input.meta === "object" ? input.meta : {},
  };
}

/**
 * Convenience adapters (optional)
 * - Use these where you already have platform-specific payloads.
 */

export function buildEnvelopeFromYouTubeLiveChatItem(item, opts = {}) {
  // item shape: YouTube liveChatMessages.list item
  // We only use fields that are reliably present.
  const snippet = item?.snippet || {};
  const author = item?.authorDetails || {};

  return buildChatEnvelopeV1({
    platform: "youtube",
    channelId: opts.channelId ?? null,
    channelSlug: opts.channelSlug ?? null,
    messageId: item?.id ?? null,
    text: snippet?.displayMessage ?? "",
    timestamp: snippet?.publishedAt ?? null,
    user: {
      id: author?.channelId ?? null,
      name: author?.displayName ?? "unknown",
      avatar: author?.profileImageUrl ?? null,
      role: author?.isChatOwner
        ? "owner"
        : author?.isChatModerator
          ? "mod"
          : author?.isChatSponsor
            ? "member"
            : null,
    },
    meta: {
      youtube: {
        type: snippet?.type ?? null,
      },
    },
  });
}
