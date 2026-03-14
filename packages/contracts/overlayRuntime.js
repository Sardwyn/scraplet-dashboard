export const OVERLAY_RUNTIME_PACKET_V1 = "1";

export function assertOverlayRuntimePacketV1(packet, options = {}) {
  const allowLegacy = options.allowLegacy !== false;

  if (!packet || typeof packet !== "object") throw new Error("OverlayRuntimePacketV1: packet must be an object");
  if (!packet.header || typeof packet.header !== "object") throw new Error("OverlayRuntimePacketV1: header missing");

  const h = packet.header;
  if (!h.id || typeof h.id !== "string") throw new Error("OverlayRuntimePacketV1: header.id missing or invalid");
  if (!h.type || typeof h.type !== "string") throw new Error("OverlayRuntimePacketV1: header.type missing or invalid");
  if (!h.ts || typeof h.ts !== "number") throw new Error("OverlayRuntimePacketV1: header.ts missing or invalid");
  if (!h.producer || typeof h.producer !== "string") throw new Error("OverlayRuntimePacketV1: header.producer missing");
  if (!h.platform || typeof h.platform !== "string") throw new Error("OverlayRuntimePacketV1: header.platform missing");
  if (!h.scope || typeof h.scope !== "object") throw new Error("OverlayRuntimePacketV1: header.scope missing");
  if (!h.scope.tenantId) throw new Error("OverlayRuntimePacketV1: header.scope.tenantId missing");
  if (!h.scope.overlayPublicId) throw new Error("OverlayRuntimePacketV1: header.scope.overlayPublicId missing");
  if (!allowLegacy && h.version !== OVERLAY_RUNTIME_PACKET_V1) {
    throw new Error(`OverlayRuntimePacketV1: header.version must be ${OVERLAY_RUNTIME_PACKET_V1}`);
  }
  if (h.version !== undefined && h.version !== OVERLAY_RUNTIME_PACKET_V1) {
    throw new Error(`OverlayRuntimePacketV1: unsupported header.version ${String(h.version)}`);
  }
  if (!packet.payload || typeof packet.payload !== "object") {
    throw new Error("OverlayRuntimePacketV1: payload missing or invalid");
  }
}

export function createOverlayRuntimePacketV1({ header, payload }) {
  const packet = {
    header: {
      version: OVERLAY_RUNTIME_PACKET_V1,
      ...header,
    },
    payload: payload || {},
  };

  assertOverlayRuntimePacketV1(packet, { allowLegacy: false });
  return packet;
}
