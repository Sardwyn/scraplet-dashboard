import Redis from "ioredis";

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
  return `overlay:${tenantId}:${publicId}`;
}

export const overlayGate = {
  async subscribe(tenantId, publicId, res, _lastEventId) {
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

    const onMessage = (_channel, message) => {
      if (_channel !== channel) return;

      let packet;
      try {
        packet = JSON.parse(message);
      } catch (e) {
        console.error("[OverlayGate] Bad JSON from Redis:", e);
        return;
      }

      res.write(`id: ${packet.header?.id ?? ""}\n`);
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
