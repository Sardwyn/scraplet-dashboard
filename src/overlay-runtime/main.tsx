import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  OverlayElement,
  OverlayConfigV0,
  OverlayTimelineProperty,
} from "../shared/overlayTypes";
import { ElementRenderer } from "../shared/overlayRenderer";
import { FontLoader } from "../shared/FontManager";
import { useElementAnimationPhases } from "./useElementAnimationPhases";
import { evaluateTimeline } from "../shared/timeline/evaluateTimeline";


declare global {
  interface Window {
    __OVERLAY_PUBLIC_ID__?: string;
  }
}

/* -----------------------------
   Overlay State (V0 contract peg)
   - Mirrors server shape from /api/overlays/public/:publicId/state
------------------------------*/
type OverlayStateV0 = {
  rev: number;
  ts: number;
  tenant: {
    public_id: string;
    platform?: string;
    channel?: string;
  };
  show: {
    mode?: string;
    scene?: string;
    intent?: string;
    hold_alerts?: boolean;
  };
  signals: Record<string, any>;
  events: any[];
  triggers: any[];
};

const TIMELINE_PROPERTIES: OverlayTimelineProperty[] = [
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "rotationDeg",
  "scaleX",
  "scaleY",
];

function applyTimelineOverrides(
  element: OverlayElement,
  timelineValues?: Partial<Record<OverlayTimelineProperty, number>>
) {
  if (!timelineValues) return element;

  const nextBindings = element.bindings ? { ...element.bindings } : undefined;
  let removedBinding = false;

  for (const property of TIMELINE_PROPERTIES) {
    if (timelineValues[property] === undefined) continue;
    if (nextBindings && property in nextBindings) {
      delete nextBindings[property];
      removedBinding = true;
    }
  }

  return {
    ...element,
    ...timelineValues,
    bindings: removedBinding
      ? Object.keys(nextBindings || {}).length > 0
        ? nextBindings
        : undefined
      : element.bindings,
  } as OverlayElement;
}



/* -----------------------------
   Small debug HUD (optional)
   Enable via: /o/:publicId?debug=1
------------------------------*/
function DebugHud({ state, data }: { state: OverlayStateV0 | null, data?: Record<string, string> }) {
  const enabled = (() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("debug") === "1";
    } catch {
      return false;
    }
  })();

  if (!enabled) return null;

  const maxW = "min(520px, calc(100vw - 24px))";
  const maxH = "min(240px, calc(100vh - 24px))";

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 9999,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.25,
        color: "#e5e7eb",
        background: "rgba(2,6,23,0.75)",
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 10,
        padding: "10px 12px",
        width: "auto",
        maxWidth: maxW,
        maxHeight: maxH,
        overflow: "auto",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "baseline",
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>Overlay State</div>
        {state?.rev != null && (
          <div style={{ opacity: 0.8 }}>
            rev {state.rev} · {state.show?.mode ?? "—"} ·{" "}
            {state.tenant?.platform ?? "no-platform"}
          </div>
        )}
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          opacity: 0.95,
        }}
      >
        {JSON.stringify(state, null, 2)}
      </pre>
      {data && (
        <>
          <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 6 }}>Event Data</div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              opacity: 0.95,
              color: "#a5f3fc"
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

/* -----------------------------
   Overlay Event & Override Logic (Phase 11)
------------------------------*/
type OverrideMap = Record<string, Partial<OverlayElement>>;

function useOverlayEvents(publicId: string, elements: OverlayElement[]) {
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [data, setData] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!publicId) return;

    // Connect to Event Gate
    const url = `/api/overlays/public/${encodeURIComponent(publicId)}/events/stream`;
    console.log("[OverlayEvents] Connecting to:", url);

    // Pass Last-Event-ID if we have one (reconnect scenario)
    // Note: Native EventSource handles Last-Event-ID auto-magically on reconnect, 
    // but we can also append it to query if needed manually.
    const es = new EventSource(url);

    es.onopen = () => console.log("[OverlayEvents] Connected");
    es.onerror = (e) => {
      // EventSource auto-reconnects, but nice to log
      console.warn("[OverlayEvents] Connection lost/error", e);
    };

    es.onmessage = (msg) => {
      try {
        if (!msg.data) return;
        const packet = JSON.parse(msg.data);
        const { header, payload } = packet || {};

        console.log("[OverlayEvents] Packet:", header?.type, payload);
        // Multiplex to widgets via window event (avoids per-widget SSE connections)
        if (header?.type) {
          window.dispatchEvent(new CustomEvent('scraplet:overlay:event', {
            detail: packet
          }));
        }
        // Producer → Overlay events
        if (header?.type === "overlay.lower_third.show") {
          // 1. Resolve payload
          const p = payload || {};
          const text = p.text || (p.username && p.message ? `${p.username}: ${p.message}` : "");
          const title = p.title || "";
          const subtitle = p.subtitle || "";

          // 2. Generate Sequence Token to race-condition proof the timer
          const seqToken = Date.now().toString(36) + Math.random().toString(36).slice(2);

          // 3. Update Data (Global keys only for V1)
          setData((prev) => ({
            ...prev,
            "lower_third.active": "1",
            "lower_third._seq": seqToken,
            "lower_third": text,
            "lower_third.title": title,
            "lower_third.subtitle": subtitle,
          }));

          // 4. Update Component Overrides (Phase 4)
          // Find any componentInstance that is a preset_lower_third
          const ltInstances = elements.filter(e => e.type === "componentInstance" && (e as any).componentId === "preset_lower_third");

          if (ltInstances.length > 0) {
            setOverrides(prev => {
              const next = { ...prev };
              ltInstances.forEach(inst => {
                next[inst.id] = {
                  ...next[inst.id],
                  visible: true,
                  propOverrides: {
                    ...(inst as any).propOverrides,
                    title: title || text,
                    subtitle: subtitle
                  }
                };
              });
              return next;
            });
          }

          // 5. Determine Duration
          // Priority: payload.duration_ms -> element default -> 8000
          let duration = typeof p.duration_ms === 'number' ? p.duration_ms : undefined;

          if (duration === undefined) {
            // Try to find ANY lower_third element to steal its default
            const ltEl = elements.find(e => e.type === "lower_third" || (e.type === "componentInstance" && (e as any).componentId === "preset_lower_third")) as any;
            if (ltEl && typeof ltEl.defaultDurationMs === 'number') {
              duration = ltEl.defaultDurationMs;
            }
          }
          if (duration === undefined) duration = 8000;

          // 6. Set Auto-Hide Timer
          window.setTimeout(() => {
            setData((prev) => {
              // Only clear if the sequence token matches
              if (prev["lower_third._seq"] !== seqToken) return prev;

              // Hide component instances
              setOverrides(oprev => {
                const next = { ...oprev };
                ltInstances.forEach(inst => {
                  next[inst.id] = { ...next[inst.id], visible: false };
                });
                return next;
              });

              const next = { ...prev };
              next["lower_third.active"] = "0";
              return next;
            });
          }, duration);
        }

        if (header?.type === "overlay.lower_third.hide") {
          setData((prev) => {
            const next = { ...prev };
            next["lower_third.active"] = "0";
            return next;
          });
          // Hide instances
          const ltInstances = elements.filter(e => e.type === "componentInstance" && (e as any).componentId === "preset_lower_third");
          setOverrides(prev => {
            const next = { ...prev };
            ltInstances.forEach(inst => {
              next[inst.id] = { ...next[inst.id], visible: false };
            });
            return next;
          });
        }

        lastIdRef.current = header?.id;

        // Universal Packet Handler (Phase 12)
        // Bind payload to data.event.* and root keys
        if (payload) {
          const flatData: Record<string, string> = {};

          // Helper to flatten object
          const flatten = (obj: any, prefix: string) => {
            for (const [k, v] of Object.entries(obj)) {
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                flatten(v, `${prefix}${k}.`);
              } else {
                flatData[`${prefix}${k}`] = String(v);
              }
            }
          };

          // 1. Namespace under "event"
          flatten(payload, "event.");

          // 2. Back-compat: Top-level keys (shallow)
          for (const [k, v] of Object.entries(payload)) {
            if (v && typeof v !== 'object') {
              flatData[k] = String(v);
            }
          }

          console.log("[OverlayEvents] Bound Data:", flatData);
          setData(prev => ({ ...prev, ...flatData }));
        }



        // 2. Find "alertGroup" -> specific reaction?
        // Or just flash a group if we find one named "Group"
        const groupEl = elements.find(e => e.type === "group" || e.name === "Group");
        if (groupEl) {
          setOverrides(prev => ({
            ...prev,
            [groupEl.id]: { opacity: 1, visible: true }
          }));

          // Hide after 5s
          setTimeout(() => {
            setOverrides(prev => ({
              ...prev,
            }));
          }, 5000);
        }
      } catch (err) {
        console.error("[OverlayEvents] Parse error:", err);
      }
    };

    return () => {
      es.close();
      console.log("[OverlayEvents] Disconnected");
    };
  }, [publicId, elements]); // Re-bind if elements list changes drastically? Ideally stable.

  return { overrides, data, flash };
}

/* -----------------------------
   Overlay runtime root
------------------------------*/

// ── Widget Runtime Loader ─────────────────────────────────────────────────────
// Scans the overlay for widget elements, fetches tokens, and loads runtime scripts
// Shared SSE multiplexer — one connection for all widgets
let sharedWidgetSse: EventSource | null = null;
let sharedWidgetToken: string | null = null;

function startSharedWidgetSse(token: string) {
  if (sharedWidgetSse && sharedWidgetToken === token) return; // already running
  if (sharedWidgetSse) { sharedWidgetSse.close(); sharedWidgetSse = null; }
  sharedWidgetToken = token;
  const url = '/w/' + encodeURIComponent(token) + '/stream';
  const es = new EventSource(url);
  sharedWidgetSse = es;
  es.onmessage = (ev) => {
    // Re-dispatch as window event for all widgets to consume
    window.dispatchEvent(new MessageEvent('scraplet:widget:sse', { data: ev.data }));
  };
  // Also forward named events
  ['subs.update','chat_message','follow','sub','raid','tip','redemption',
   'channel.subscription.new','channel.subscription.renewal','channel.subscription.gifts',
   'subscribe','raffle_update','tts.ready','tts_ready','stake.update',
   'alert','event_console'].forEach(type => {
    es.addEventListener(type, (ev: MessageEvent) => {
      window.dispatchEvent(new MessageEvent('scraplet:widget:event:' + type, { data: ev.data }));
      window.dispatchEvent(new MessageEvent('scraplet:widget:sse', { data: ev.data }));
    });
  });
  es.onerror = () => {
    es.close();
    sharedWidgetSse = null;
    setTimeout(() => { if (sharedWidgetToken) startSharedWidgetSse(sharedWidgetToken); }, 5000);
  };
  console.log('[overlay-runtime] Shared widget SSE started');
}

async function loadWidgetRuntimes(elements: any[], channelSlug: string) {
  const WIDGET_SCRIPTS: Record<string, string> = {
    'stake-monitor':        '/widgets/stake-monitor.js',
    'tts-player':           '/widgets/tts-player.js',
    'chat-overlay':         '/widgets/chat-overlay.js',
    'alert-box-widget':     '/widgets/alert-box-widget.js',
    'sub-counter':          '/widgets/sub-counter.js',
    'event-console-widget': '/widgets/event-console-widget.js',
    'raffle':               '/widgets/raffle.js',
    'subathon-timer':       '/widgets/subathon-timer.js',
  };

  // Widgets that need a token (connect to /w/:token/stream)
  const TOKEN_WIDGETS = new Set(['chat-overlay', 'alert-box-widget', 'sub-counter', 'event-console-widget', 'raffle', 'tts-player']);

  for (const el of elements) {
    if (el.type !== 'widget') continue;
    const widgetId = el.widgetId;
    const propOverrides = el.propOverrides || {};
    const scriptSrc = WIDGET_SCRIPTS[widgetId];
    if (!scriptSrc) continue;

    // Don't load twice
    if (document.querySelector(`script[data-widget="${widgetId}"]`)) continue;

    let token = propOverrides.token || '';

    // Fetch a widget token if needed and not already set
    if (TOKEN_WIDGETS.has(widgetId) && !token) {
      try {
        const overlayPublicId = (window as any).__OVERLAY_PUBLIC_ID__ ||
          new URLSearchParams(window.location.search).get('id') ||
          window.location.pathname.split('/').pop() || '';
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const resp = await fetch(`/dashboard/api/widget-token/public?widgetId=${encodeURIComponent(widgetId)}&overlayPublicId=${encodeURIComponent(overlayPublicId)}`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (resp.ok) {
          const data = await resp.json();
          token = data.token || '';
        }
      } catch (e) {
        console.warn('[overlay-runtime] Failed to fetch widget token for', widgetId);
      }
    }

    // Set global config AFTER token is resolved so widget reads correct token
    const configKey = `__WIDGET_CONFIG_${widgetId.replace(/-/g, '_').toUpperCase()}__`;
    (window as any)[configKey] = {
      channel: channelSlug,
      ...propOverrides,
      token,  // token last so it overrides any empty propOverrides.token
    };

    // Also set legacy token global
    if (token) {
      (window as any).__WIDGET_TOKEN__ = token;
      // Start shared SSE multiplexer with first valid token (only once)
      if (!sharedWidgetSse) startSharedWidgetSse(token);
    }

    // Load the widget script
    const params = new URLSearchParams({ channel: channelSlug });
    const script = document.createElement('script');
    params.set('v', Date.now().toString()); script.src = scriptSrc + '?' + params.toString();
    script.setAttribute('data-widget', widgetId);
    script.onerror = () => console.warn('[overlay-runtime] Failed to load widget:', widgetId);
    document.head.appendChild(script);
    console.log('[overlay-runtime] Loaded widget:', widgetId, 'token:', token ? 'yes' : 'no');
  }
}

function OverlayRuntimeRoot({ publicId }: { publicId: string }) {
  const [overlay, setOverlay] = useState<OverlayConfigV0 | null>(null);
  const [state, setState] = useState<OverlayStateV0 | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const playbackStartRef = useRef<number | null>(null);
  const overlayConfigHashRef = useRef<string>("");

  // ... (existing refs/state) ...
  const pinnedMeasureRef = useRef<HTMLDivElement>(null);
  const [pinnedHeight, setPinnedHeight] = useState(0);
  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  // Enable Event System
  // We need the elements list to find targets
  const baseElements = overlay?.elements ?? [];
  const { overrides, data: eventData, flash } = useOverlayEvents(publicId, baseElements);
  const timelineValues = useMemo(
    () => evaluateTimeline(overlay?.timeline, playheadMs),
    [overlay?.timeline, playheadMs]
  );

  // Apply Overrides Merge
  const elements = React.useMemo(() => {
    return baseElements.map(el => {
      const ov = overrides[el.id];
      const merged = ov ? ({ ...el, ...ov } as OverlayElement) : el;
      // Don't apply timeline position overrides to widget elements - they should stay fixed
      if ((merged as any).type === 'widget') return merged;
      // Don't apply timeline position overrides to widget elements - they should stay fixed
      if ((merged as any).type === 'widget') return merged;
      return applyTimelineOverrides(merged, timelineValues[el.id]);
    });
  }, [baseElements, overrides, timelineValues]);

  const animationPhases = useElementAnimationPhases(elements);


  // Load config and refresh it periodically so persistent OBS browser sources
  // pick up saved timeline changes without needing a manual source refresh.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const loadConfig = async () => {
      const res = await fetch(`/api/overlays/public/${encodeURIComponent(publicId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("Failed to load overlay config", res.status);
        return;
      }
      const data = (await res.json()) as OverlayConfigV0;
      const nextHash = JSON.stringify(data);
      if (cancelled) return;
      if (nextHash === overlayConfigHashRef.current) return;

      overlayConfigHashRef.current = nextHash;
      setOverlay(data);

      // Load widget runtime scripts for any widget elements
      const allElements = (data as any).elements || [];
      const channelSlug = new URLSearchParams(window.location.search).get('channel') || (window as any).__OVERLAY_CHANNEL_SLUG__ || '';
      // Use requestAnimationFrame x2 to ensure React has committed the DOM
      requestAnimationFrame(() => requestAnimationFrame(() => loadWidgetRuntimes(allElements, channelSlug)));
    };

    loadConfig().catch((e) => console.error("Failed to load overlay config", e));
    // No polling — load once. Config only changes when user saves in editor.

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [publicId]);

  useEffect(() => {
    const durationMs = overlay?.timeline?.durationMs ?? 0;
    const reverse = overlay?.timeline?.playback?.reverse === true;
    setPlayheadMs(reverse ? durationMs : 0);
    setIsTimelinePlaying(durationMs > 0);
  }, [overlay?.timeline?.durationMs, overlay?.timeline?.tracks, overlay?.timeline?.playback?.reverse]);

  useEffect(() => {
    if (!isTimelinePlaying) return;

    const durationMs = overlay?.timeline?.durationMs ?? 0;
    if (durationMs <= 0) {
      setIsTimelinePlaying(false);
      return;
    }

    const reverse = overlay?.timeline?.playback?.reverse === true;
    const loop = overlay?.timeline?.playback?.loop === true;
    let frameId = 0;
    // Use a ref to track playhead without triggering re-renders on every frame
    const playheadRef = { current: reverse ? durationMs : 0 };
    playbackStartRef.current = performance.now();

    const tick = (now: number) => {
      const startedAt = playbackStartRef.current ?? now;
      const elapsed = Math.max(0, now - startedAt);
      const clampedElapsed = loop && durationMs > 0 ? elapsed % durationMs : Math.min(durationMs, elapsed);
      const next = reverse ? durationMs - clampedElapsed : clampedElapsed;
      playheadRef.current = next;

      if (!loop && elapsed >= durationMs) {
        // Timeline finished — update React state once
        setPlayheadMs(reverse ? 0 : durationMs);
        setIsTimelinePlaying(false);
        playbackStartRef.current = null;
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    // Update React state at ~10fps for smooth-enough position updates
    const stateInterval = window.setInterval(() => {
      setPlayheadMs(playheadRef.current);
    }, 100);

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(stateInterval);
      playbackStartRef.current = null;
    };
  }, [isTimelinePlaying, overlay?.timeline?.durationMs, overlay?.timeline?.playback?.loop, overlay?.timeline?.playback?.reverse]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll state (dynamic, contract peg)
  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;

    // State polling disabled - state is delivered via SSE events instead
    // const pollMs = 1000;

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, [publicId]);

  // Resize tracking
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Safe defaults before overlay loads (keeps hooks order stable)
  const baseW = overlay?.baseResolution?.width ?? 1920;
  const baseH = overlay?.baseResolution?.height ?? 1080;

  // IMPORTANT: Filter out children of container elements so they don't double-render at root
  const allChildIds = React.useMemo(() => {
    const ids = new Set<string>();
    elements.forEach(el => {
      if ((el.type === 'group' || el.type === 'frame' || el.type === 'mask' || el.type === 'boolean') && (el as any).childIds) {
        (el as any).childIds.forEach((cid: string) => ids.add(cid));
      }
    });
    return ids;
  }, [elements]);

  const rootElements = React.useMemo(() => elements.filter(el => !allChildIds.has(el.id)), [elements, allChildIds]);

  const pinnedElements = rootElements.filter((el: any) => el.pinned === true);
  const normalElements = rootElements.filter((el: any) => el.pinned !== true);

  // CONTAIN scale: fits entire canvas in viewport — coordinates are 1:1 with OBS
  const scale = Math.min(viewport.w / baseW, viewport.h / baseH);

  const elementsById = React.useMemo(() => {
    const map: Record<string, OverlayElement> = {};
    for (const el of elements) {
      map[el.id] = el as OverlayElement;
    }
    return map;
  }, [elements]);

  // Calculate used fonts
  const usedFonts = React.useMemo(() => {
    const set = new Set<string>();
    for (const el of elements) {
      if (el.type === "text" && (el as any).fontFamily) {
        set.add((el as any).fontFamily);
      }
    }
    return Array.from(set);
  }, [elements]);

  // Measure pinned block height in overlay coordinate space (unscaled)
  useLayoutEffect(() => {
    const el = pinnedMeasureRef.current;
    if (!el || pinnedElements.length === 0) {
      setPinnedHeight(0);
      return;
    }

    const sync = () => {
      const px = el.getBoundingClientRect().height;
      const overlayUnits = scale > 0 ? px / scale : 0;
      setPinnedHeight(Math.ceil(overlayUnits));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [pinnedElements.length, scale]);

  return (
    <>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background:
            overlay?.backgroundColor && overlay.backgroundColor !== "transparent"
              ? overlay.backgroundColor
              : "transparent",

          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Stage: scaled to CONTAIN the viewport, anchored top-left with letterbox offset */}
        <div
          style={{
            position: "absolute",
            left: Math.round((viewport.w - baseW * scale) / 2),
            top: Math.round((viewport.h - baseH * scale) / 2),
            width: baseW,
            height: baseH,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          {/* PINNED LAYER */}
          {pinnedElements.length > 0 && (
            <div
              ref={pinnedMeasureRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              {pinnedElements.map((el: any) => (
                <ElementRenderer
                  key={el.id}
                  element={{
                    ...el,
                    x: 0,
                    y: 0,
                  }}
                  elementsById={elementsById}
                  overlayComponents={(overlay as any).components || []}
                  animationPhase={animationPhases[el.id]?.phase}
                  animationPhases={animationPhases}
                  data={{}} // Test data placeholder
                  visited={new Set()}
                />
              ))}
            </div>
          )}

          {/* NORMAL ELEMENTS — JS OFFSET, NOT CSS */}
          {overlay &&
            normalElements.map((el: any) => (
              <ElementRenderer
                key={el.id}
                element={el}
                yOffset={pinnedHeight}
                elementsById={elementsById}
                overlayComponents={(overlay as any).components || []}
                animationPhase={animationPhases[el.id]?.phase}
                animationPhases={animationPhases}
                data={eventData}
                visited={new Set()}
              />
            ))}
        </div>
      </div>

      <DebugHud state={state} data={eventData} />

    </>
  );
}

/* -----------------------------
   Boot
------------------------------*/
const rootEl = document.getElementById("overlay-runtime-root");
if (rootEl && window.__OVERLAY_PUBLIC_ID__) {
  createRoot(rootEl).render(<OverlayRuntimeRoot publicId={window.__OVERLAY_PUBLIC_ID__} />);
}
