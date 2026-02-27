// src/ingest/fanOutAfterModeration.js
//
// Phase 3: Centralized fan-out helper that gates overlay pushes based on moderation decisions.
// This ensures messages only reach overlays if they are allowed or moderation is unknown (fail-open).
//

import { push as pushRing } from "../runtime/ringBuffer.js";

// Phase 3: Feature flag for centralized fan-out (default: true)
const CENTRALIZED_FANOUT =
    String(process.env.CENTRALIZED_FANOUT || "true").toLowerCase() === "true";

/**
 * Fan out chat message to overlays/widgets based on moderation decision.
 * 
 * @param {Object} options
 * @param {Object} options.chat_v1 - ChatEnvelopeV1 object
 * @param {Object|null} options.decision - Moderation decision from Scrapbot { action: "allow" | "delete" | "timeout" | "ban", ... }
 * @param {string} options.publicId - Overlay public ID
 * @param {number} options.ownerUserId - User ID for logging
 * @param {boolean} [options.forcePush=false] - Force push even in centralized mode (for legacy fallback)
 * @returns {Object} { pushed: boolean, reason: string }
 */
export function fanOutAfterModeration({ chat_v1, decision, publicId, ownerUserId, forcePush = false }) {
    // If centralized fan-out is disabled (rollback mode), allow all pushes
    if (!CENTRALIZED_FANOUT || forcePush) {
        const leanMessage = buildLeanMessage(chat_v1, "unknown");
        pushRing(publicId, leanMessage);
        return { pushed: true, reason: "centralized_fanout_disabled" };
    }

    // Determine if message should be fanned out based on moderation decision
    const shouldFanOut = shouldAllowFanOut(decision);

    if (!shouldFanOut) {
        // Message was blocked by moderation
        console.log(
            `[fanOutAfterModeration] Blocked message from overlay`,
            {
                ownerUserId,
                platform: chat_v1?.platform,
                author: chat_v1?.author?.username,
                action: decision?.action,
            }
        );
        return { pushed: false, reason: `blocked_by_moderation_${decision?.action || "unknown"}` };
    }

    // Fan out to overlay with appropriate moderation marker
    const moderationStatus = decision?.action === "allow" ? "approved" : "unknown";
    const leanMessage = buildLeanMessage(chat_v1, moderationStatus);

    try {
        pushRing(publicId, leanMessage);
        return { pushed: true, reason: `moderation_${moderationStatus}` };
    } catch (err) {
        console.error("[fanOutAfterModeration] Failed to push to ring buffer", err);
        return { pushed: false, reason: "push_error" };
    }
}

/**
 * Determine if message should be fanned out based on moderation decision.
 * Fail-open: if decision is null/undefined (Scrapbot unreachable), allow fan-out.
 * 
 * @param {Object|null} decision - Moderation decision { action: "allow" | "delete" | "timeout" | "ban" }
 * @returns {boolean} - True if message should fan out
 */
function shouldAllowFanOut(decision) {
    // Fail-open: if no decision (Scrapbot timeout/error), allow message
    if (!decision || !decision.action) {
        return true;
    }

    const action = String(decision.action).toLowerCase();

    // Allow fan-out for approved messages
    if (action === "allow" || action === "approve" || action === "ok") {
        return true;
    }

    // Block fan-out for moderation actions
    if (action === "delete" || action === "timeout" || action === "ban") {
        return false;
    }

    // Unknown action: fail-open
    console.warn(`[fanOutAfterModeration] Unknown moderation action: ${action}, allowing fan-out (fail-open)`);
    return true;
}

/**
 * Build lean overlay message from ChatEnvelopeV1.
 * 
 * @param {Object} chat_v1 - ChatEnvelopeV1 object
 * @param {string} moderationStatus - "approved" | "unknown" | "blocked"
 * @returns {Object} - Lean message for overlay ring buffer
 */
function buildLeanMessage(chat_v1, moderationStatus) {
    const c = chat_v1 || {};
    const author = c.author || {};
    const message = c.message || {};
    const channel = c.channel || {};

    return {
        id: c.id || null,
        ts: c.ts || new Date().toISOString(),
        platform: c.platform || "unknown",
        channel_slug: channel.slug || channel.channel_slug || null,
        username: author.username || "unknown",
        display_name: author.display || author.username || "unknown",
        avatar_url: author.avatar_url || null,
        role: author.role || "viewer",
        badges: Array.isArray(author.badges) ? author.badges : [],
        text: message.text || "",
        emotes: message.emotes || null,
        moderation: moderationStatus,
    };
}
