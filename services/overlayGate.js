import Redis from "ioredis";
import { recordStage } from "../src/services/pipelineHealth.js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const pub = new Redis(REDIS_URL);

const HEARTBEAT_INTERVAL_MS = 20000;

// In-memory event buffer for replay on reconnect
// Stores last 100 events per overlay channel, keyed by channelKey
const EVENT_BUFFER_MAX = 100;
const eventBuffers = new Map(); // channelKey -> [{id, data}]

function bufferEvent(channel, id, data) {
    if (!eventBuffers.has(channel)) eventBuffers.set(channel, []);
    const buf = eventBuffers.get(channel);
    buf.push({ id, data });
    if (buf.length > EVENT_BUFFER_MAX) buf.shift();
}

function getReplayEvents(channel, lastEventId) {
    if (!lastEventId || !eventBuffers.has(channel)) return [];
    const buf = eventBuffers.get(channel);
    const idx = buf.findIndex(e => e.id === lastEventId);
    if (idx === -1) return buf; // unknown ID — replay all buffered
    return buf.slice(idx + 1); // replay everything after last seen
}

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
  return `overlay:${tenantId}:${publicId}`;
}

export const overlayGate = {
  async subscribe(tenantId, publicId, res, lastEventId) {
    const channel = channelKey(tenantId, publicId);

    // IMPORTANT: dedicated Redis subscriber per SSE connection
    const client = new Redis(REDIS_URL);

    try {
      await client.subscribe(channel);
    } catch (err) {
      console.error("[OverlayGate] Redis subscribe failed:", err);
      client.disconnect();
      throw err;
    }

    // Replay any missed events since last-event-id
    if (lastEventId) {
      const missed = getReplayEvents(channel, lastEventId);
      for (const ev of missed) {
        res.write(`id: ${ev.id}\n`);
        res.write("event: message\n");
        res.write(`data: ${ev.data}\n\n`);
      }
      if (missed.length > 0 && res.flush) res.flush();
    }

    const onMessage = (_channel, message) => {
      if (_channel !== channel) return;

      let packet;
      try {
        packet = JSON.parse(message);
      } catch (e) {
        console.error("[OverlayGate] Bad JSON from Redis:", e);
        return;
      }

      const eventId = packet.header?.id ?? String(Date.now());
      // Buffer for replay
      bufferEvent(channel, eventId, JSON.stringify(packet));

      res.write(`id: ${eventId}\n`);
      res.write("event: message\n");
      res.write(`data: ${JSON.stringify(packet)}\n\n`);

      if (res.flush) res.flush();
    };

    client.on("message", onMessage);

    const hb = setInterval(() => {
      res.write(": ping\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    res.on("close", async () => {
      clearInterval(hb);
      try {
        client.off("message", onMessage);
        await client.unsubscribe(channel);
      } catch (e) {
        // ignore cleanup errors
      } finally {
        client.disconnect();
      }
    });

    res.write(": welcome\n\n");
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
      await pub.publish(channel, JSON.stringify(packet));
    } catch (err) {
      console.error("[OverlayGate] Redis publish failed:", err);
    }
  },
};
