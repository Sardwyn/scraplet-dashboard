import Redis from "ioredis";
import { recordStage } from "../src/services/pipelineHealth.js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const pub = new Redis(REDIS_URL);

const HEARTBEAT_INTERVAL_MS = 20000;

// Strict Packet Validator (same as before)
function validatePacket(packet) {
  if (!packet || typeof packet !== "object") throw new Error("Packet must be an object");
  if (!packet.header || typeof packet.header !== "object") throw new Error("Packet header missing");

  const h = packet.header;
  if (!h.id || typeof h.id !== "string") throw new Error("header.id missing or invalid");
  if (!h.type || typeof h.type !== "string") throw new Error("header.type missing or invalid");
  if (!h.ts || typeof h.ts !== "number") throw new Error("header.ts missing or invalid");

  if (!h.producer) throw new Error("header.producer missing");
  if (!h.platform) throw new Error("header.platform missing");

  if (!h.scope || typeof h.scope !== "object") throw new Error("header.scope missing");
  if (!h.scope.tenantId) throw new Error("header.scope.tenantId missing");
  if (!h.scope.overlayPublicId) throw new Error("header.scope.overlayPublicId missing");

  if (!packet.payload || typeof packet.payload !== "object") {
    throw new Error("packet.payload missing or invalid");
  }
}

function channelKey(tenantId, publicId) {
  return `overlay:stream:${tenantId}:${publicId}`; // Using explicit stream namespace
}

export const overlayGate = {
  async subscribe(tenantId, publicId, res, lastEventId) {
    const channel = channelKey(tenantId, publicId);
    
    // IMPORTANT: dedicated Redis connection per SSE connection for XREAD block
    const client = new Redis(REDIS_URL);
    
    let isSubscribed = true;
    let currentOffset = lastEventId || '$';
    
    res.write(": welcome\n\n");

    const hb = setInterval(() => {
      res.write(": ping\n\n");
      if (res.flush) res.flush();
    }, HEARTBEAT_INTERVAL_MS);

    res.on("close", () => {
      isSubscribed = false;
      clearInterval(hb);
      client.disconnect();
    });

    // Run background loop to block on XREAD
    (async () => {
      while (isSubscribed) {
        try {
          const start = Date.now();
          // BLOCK for 10 seconds. If no messages, it returns null and we loop again
          const streamResults = await client.xread('BLOCK', 10000, 'STREAMS', channel, currentOffset);
          
          if (!isSubscribed) break;

          if (streamResults) {
            const messages = streamResults[0][1];
            for (const [messageId, fields] of messages) {
              currentOffset = messageId;
              
              // We saved it as ['payload', JSON.stringify(packet)]
              const payloadIdx = fields.indexOf('payload');
              if (payloadIdx !== -1 && payloadIdx + 1 < fields.length) {
                const packetStr = fields[payloadIdx + 1];
                
                res.write(`id: ${messageId}\n`);
                res.write("event: message\n");
                res.write(`data: ${packetStr}\n\n`);
              }
            }
            if (res.flush) res.flush();
          } else {
            // Prevent event-loop starvation if stream doesn't exist yet (XREAD returns instantly)
            if (Date.now() - start < 1000) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        } catch (e) {
          if (!isSubscribed) break;
          console.error("[OverlayGate] XREAD error:", e);
          // Wait a bit before retrying on error
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    })();
  },

  async publish(tenantId, publicId, packet) {
    const channel = channelKey(tenantId, publicId);
    recordStage('messages', 5, publicId);
    console.log("[CHAIN-5] overlayGate.publish called", { tenantId, publicId, type: packet?.header?.type });

    try {
      validatePacket(packet);
    } catch (e) {
      console.error("[OverlayGate] Packet validation failed:", e.message, packet);
      return;
    }

    // Verify scope matches args
    if (
      String(packet.header.scope.tenantId) !== String(tenantId) ||
      String(packet.header.scope.overlayPublicId) !== String(publicId)
    ) {
      console.error("[OverlayGate] Scope mismatch", {
        target: { tenantId, publicId },
        packet: packet.header.scope,
      });
      return;
    }

    try {
      // Kafka-like log: keep last 1000 events reliably in a Redis Stream using XADD
      await pub.xadd(channel, 'MAXLEN', '~', 1000, '*', 'payload', JSON.stringify(packet));
    } catch (err) {
      console.error("[OverlayGate] Redis XADD failed:", err);
    }
  },
};
