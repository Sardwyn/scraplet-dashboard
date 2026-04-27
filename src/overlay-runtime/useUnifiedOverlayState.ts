import { useState, useEffect, useRef } from "react";
import type { UnifiedOverlayState } from "./types/unifiedOverlayState";
import { DerivedStateEngine, type OverlayConfigV0 } from "./DerivedStateEngine";
import { SSEConnection, type OverlayRuntimePacketV1 } from "./SSEConnection";

const SESSION_STORAGE_KEY_PREFIX = "scraplet:overlay:state:";
const STATE_TTL_MS = 60_000; // 60 seconds

/**
 * React hook that owns the UnifiedOverlayState.
 *
 * Requirements: 1.1, 1.3, 1.4, 2.1, 5.2, 9.1–9.4
 */
export function useUnifiedOverlayState(
  publicId: string,
  overlayConfig: OverlayConfigV0
): UnifiedOverlayState & { processExternalPacket: (packet: OverlayRuntimePacketV1) => void } {
  // Initialize state from sessionStorage or create empty state
  const [state, setState] = useState<UnifiedOverlayState>(() => {
    // Priority 1: server-inlined snapshot (OBS gets this on first load — no async needed)
    const inlined = (window as any).__OVERLAY_INITIAL_STATE__;
    if (inlined && inlined.publicId === publicId) {
      console.log('[useUnifiedOverlayState] Hydrating from server snapshot');
      return inlined as UnifiedOverlayState;
    }
    // Priority 2: sessionStorage cache (browser tab reload)
    const storageKey = `${SESSION_STORAGE_KEY_PREFIX}${publicId}`;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as UnifiedOverlayState;
        if (Date.now() - parsed.updatedAt <= STATE_TTL_MS) {
          return parsed;
        }
      }
    } catch (error) {
      console.error("[useUnifiedOverlayState] Failed to load from sessionStorage:", error);
    }
    return { publicId, version: 0, updatedAt: Date.now(), widgetStates: {} };
  });

  const engineRef = useRef<DerivedStateEngine | null>(null);
  const connectionRef = useRef<SSEConnection | null>(null);

  // Seed widgetStates from propOverrides when overlay config loads.
  // Config-driven widgets (ticker, subathon-timer, etc.) get their initial state
  // from propOverrides so they render immediately without waiting for SSE events.
  useEffect(() => {
    if (!overlayConfig?.elements?.length) return;

    setState((currentState) => {
      const seeded: Record<string, any> = {};
      let changed = false;

      for (const el of overlayConfig.elements) {
        if ((el as any).type !== "widget") continue;
        const instanceId = (el as any).id || (el as any).instanceId;
        if (!instanceId) continue;
        if (currentState.widgetStates[instanceId]) continue; // already has state
        const propOverrides = (el as any).propOverrides || {};
        const widgetId = (el as any).widgetId;

        // Chat-overlay needs messages[] and config{} for DerivedStateEngine to find it
        if (widgetId === 'chat-overlay') {
          seeded[instanceId] = {
            instanceId,
            version: 0,
            messages: [],
            config: {
              maxMessages: Number(propOverrides.maxMessages) || 50,
              stripEmotes: propOverrides.stripEmotes === true,
              nameColorMode: propOverrides.nameColorMode || 'platform',
              nameColor: propOverrides.nameColor,
              fadeMs: Number(propOverrides.fadeMs) || 0,
              enableKick: propOverrides.enableKick !== false,
              enableYoutube: propOverrides.enableYoutube !== false,
              enableTwitch: propOverrides.enableTwitch !== false,
              enableTiktok: propOverrides.enableTiktok !== false,
            },
            ...propOverrides,
          };
          changed = true;
          continue;
        }

        if (Object.keys(propOverrides).length === 0) continue;
        seeded[instanceId] = { instanceId, version: 0, ...propOverrides };
        changed = true;
      }

      if (!changed) return currentState;

      return {
        ...currentState,
        widgetStates: { ...seeded, ...currentState.widgetStates },
        version: currentState.version + 1,
        updatedAt: Date.now(),
      };
    });
  }, [overlayConfig]);

  // Keep a ref to the latest overlayConfig so the engine always has it
  // without needing to re-initialize on every config change
  const overlayConfigRef = useRef(overlayConfig);
  overlayConfigRef.current = overlayConfig;

  // Initialize DerivedStateEngine ONCE — never tear it down
  // Config changes are handled via overlayConfigRef
  useEffect(() => {
    engineRef.current = new DerivedStateEngine({
      overlayConfig: overlayConfigRef.current,
      scheduleTimer: (ms: number, callback: () => void) => {
        const timerId = setTimeout(callback, ms);
        return () => clearTimeout(timerId);
      },
      fetchInitialCounterValue: async (instanceId: string) => {
        return 0;
      },
    });
    // Never set to null — engine persists for the lifetime of the hook
  }, []); // Empty deps — initialize once only

  // Initialize SSE connection ONCE — never tear it down on config changes
  useEffect(() => {
    const connection = new SSEConnection({
      publicId,
      onPacket: (packet: OverlayRuntimePacketV1) => {
        if (!engineRef.current) return;
        setState((currentState) => {
          const updates = engineRef.current!.processPacket(packet, currentState);
          if (!updates) return currentState;
          return {
            ...currentState,
            widgetStates: { ...currentState.widgetStates, ...updates },
            version: currentState.version + 1,
            updatedAt: Date.now(),
          };
        });
      },
      onConnect: () => {
        console.log(`[useUnifiedOverlayState] Connected to SSE stream for ${publicId}`);
      },
      onDisconnect: () => {
        console.log(`[useUnifiedOverlayState] Disconnected from SSE stream for ${publicId}`);
      },
    });
    connection.connect();
    connectionRef.current = connection;
    return () => {
      connectionRef.current?.disconnect();
      connectionRef.current = null;
    };
  }, [publicId]);

  // Persist to sessionStorage after every state update
  useEffect(() => {
    const storageKey = `${SESSION_STORAGE_KEY_PREFIX}${publicId}`;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error("[useUnifiedOverlayState] Failed to write to sessionStorage:", error);
    }
  }, [state, publicId]);

  const processExternalPacket = (packet: OverlayRuntimePacketV1) => {
    if (!engineRef.current) return;
    setState((currentState) => {
      const updates = engineRef.current!.processPacket(packet, currentState);
      if (!updates) return currentState;
      return {
        ...currentState,
        widgetStates: { ...currentState.widgetStates, ...updates },
        version: currentState.version + 1,
        updatedAt: Date.now(),
      };
    });
  };

  return { ...state, processExternalPacket };
}
