import Redis from "ioredis";
import {
  OVERLAY_RUNTIME_PACKET_V1,
  assertOverlayRuntimePacketV1,
} from "../packages/contracts/overlayRuntime.js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const pub = new Redis(REDIS_URL);

const HEARTBEAT_INTERVAL_MS = 20000;

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
      assertOverlayRuntimePacketV1(packet, { allowLegacy: true });
    } catch (e) {
      console.error("[OverlayGate] Packet validation failed:", e.message, packet);
      return;
    }

    if (!packet.header.version) {
      packet = {
        ...packet,
        header: {
          ...packet.header,
          version: OVERLAY_RUNTIME_PACKET_V1,
        },
      };
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
