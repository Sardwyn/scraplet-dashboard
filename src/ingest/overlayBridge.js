import db from "../../db.js";
import { overlayGate } from "../../services/overlayGate.js";
import crypto from "crypto";
import { OVERLAY_RUNTIME_PACKET_V1 } from "../../packages/contracts/overlayRuntime.js";

// Allowed Event Types (Conservative V1 list)
const ALLOWED_TYPES = new Set([
    "kick.follow",
    "kick.subscription", // ingest/kick.js uses 'kick.subscription' for new/renew/gift? Need to check kick.js
    "kick.raid",
    "youtube.superchat",
    "test.ping",
    "test.follow",
    "test.subscription"
]);

// Map Ingest Type -> OverlayGate Type
// Ingest currently uses "channel.followed" in DB but "kick.follow" in some places?
// Let's look at `kick.js`: `buildAlertEventFromWebhook` returns `{ type: 'follow' }`.
// `maybeInsertIntoEvents` uses `eventType` from webhook (e.g. "channel.followed").
// The requirement says:
// Map ingest-native event -> OverlayGatePacket:
// header.type = "platform.<platform>.<kind>" (e.g. "platform.kick.follow")

function mapToGateType(platform, kind) {
    if (kind === "channel.followed" || kind === "follow") return `platform.${platform}.follow`;
    if (kind === "channel.subscription.new" || kind === "subscription") return `platform.${platform}.subscription`;
    if (kind === "channel.subscription.renewal") return `platform.${platform}.resub`;
    if (kind === "channel.subscription.gifts") return `platform.${platform}.subgift`;
    if (kind === "kicks.gifted" || kind === "tip") return `platform.${platform}.tip`;
    if (kind === "livestream.status.updated") return `platform.${platform}.streamstat`; // Maybe? Not in user list but useful.
    return null;
}

// Extract Presentation-Safe Payload
function extractPayload(event) {
    // Expects normalized event shape from buildAlertEventFromWebhook (kick.js)
    // { actor: {...}, message: {...}, amount: {...}, count: ... }

    return {
        actor: {
            id: event.actor?.id || null,
            displayName: event.actor?.display || event.actor?.username || "Anonymous",
            username: event.actor?.username || null,
            avatar: event.actor?.avatar_url || null
        },
        message: event.message?.text || null,
        amount: event.amount || null,
        count: event.count || null,
        // Optional: Meta for advanced usage
        meta: {
            tier: event.meta?.tier || null
        }
    };
}

export async function publishOverlayIngestEvent(tenantId, normalizedEvent, { platform = "kick" } = {}) {
    try {
        if (!normalizedEvent) return;

        const kind = normalizedEvent.type; // "follow", "subscription" from buildAlertEventFromWebhook
        const gateType = mapToGateType(platform, kind);

        if (!gateType) return; // Not mapped / allowed

        // Construct Packet
        const uuid = normalizedEvent.id || crypto.randomUUID();
        const ts = normalizedEvent.ts ? new Date(normalizedEvent.ts).getTime() : Date.now();

        // 1. Find Targets (All overlays for tenant)
        // Optimization: In V1 we just broadcast to all. 
        // Future: Filter by "reactions enabled"
        const { rows } = await db.query(
            `SELECT public_id FROM overlays WHERE user_id = $1`,
            [tenantId]
        );

        if (rows.length === 0) return;

        const payload = extractPayload(normalizedEvent);

        for (const row of rows) {
            const packet = {
                header: {
                    version: OVERLAY_RUNTIME_PACKET_V1,
                    id: uuid,
                    type: gateType,
                    ts: ts,
                    producer: "dashboard",
                    platform: platform,
                    scope: {
                        tenantId: tenantId,
                        overlayPublicId: row.public_id
                    }
                },
                payload: payload
            };

            overlayGate.publish(tenantId, row.public_id, packet);
        }

        // console.log(`[OverlayBridge] Published ${gateType} to ${rows.length} overlays for tenant ${tenantId}`);

    } catch (err) {
        console.error("[OverlayBridge] Failed to publish", err);
    }
}
