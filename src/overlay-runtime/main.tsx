import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  OverlayElement,
  OverlayConfigV0,
  OverlayTimelineProperty,
  OverlayVariable,
} from "../shared/overlayTypes";
import { ElementRenderer } from "../shared/overlayRenderer";
import { FontLoader, getGoogleFontsUrl } from "../shared/FontManager";
import { useElementAnimationPhases } from "./useElementAnimationPhases";
import { evaluateTimeline } from "../shared/timeline/evaluateTimeline";
import { widgetRegistry } from './widgetRegistry';
import { getWidgetRenderer } from '../shared/overlayRenderer/widgetContract';
import { useUnifiedOverlayState } from './useUnifiedOverlayState';
import type { OverlayConfigV0 as DerivedOverlayConfigV0 } from './DerivedStateEngine';
import './widgetRenderers'; // Register unified-state widget renderers
import { BotLayerRoot } from './BotLayerRoot';
import { PixiMediaCore } from './PixiMediaCore';
import { LeaferGraphicCore } from './LeaferGraphicCore';



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
   Countdown Timer Runtime
------------------------------*/

function formatCountdownMs(ms: number, format: string): string {
  const totalMs = Math.max(0, ms);
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const msRem = Math.floor(totalMs % 1000);
  const pad2 = (n: number) => String(n).padStart(2, "0");

  if (format === "HH:MM:SS") return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (format === "MM:SS") return `${pad2(m + h * 60)}:${pad2(s)}`;
  if (format === "SS") return String(totalSec);

  return format
    .replace(/\{h\}/g, String(h))
    .replace(/\{m\}/g, String(m))
    .replace(/\{s\}/g, String(s))
    .replace(/\{ms\}/g, String(msRem));
}

// Map of elementId -> start timestamp (ms)
const countdownStartTimes = new Map<string, number>();

// Map of elementId -> stopwatch start timestamp (ms)
const clockStopwatchStartTimes = new Map<string, number>();

function formatWallClockRuntime(date: Date, format: string, timezone?: string): string {
  try {
    const tz = timezone || "UTC";
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts: Record<string, string> = {};
    dtf.formatToParts(date).forEach(({ type, value }) => {
      parts[type] = value;
    });
    const h24 = parseInt(parts.hour ?? "0", 10) % 24;
    const h12 = h24 % 12 || 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    const mm = parts.minute ?? "00";
    const ss = parts.second ?? "00";
    const HH = String(h24).padStart(2, "0");
    const hh = String(h12).padStart(2, "0");
    return format
      .replace(/HH/g, HH)
      .replace(/mm/g, mm)
      .replace(/ss/g, ss)
      .replace(/hh/g, hh)
      .replace(/h/g, String(h12))
      .replace(/a/g, ampm.toLowerCase())
      .replace(/A/g, ampm);
  } catch {
    return format;
  }
}

function formatDurationRuntime(ms: number, format: string): string {
  const totalMs = Math.max(0, ms);
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return format
    .replace(/HH/g, pad2(h))
    .replace(/mm/g, pad2(m))
    .replace(/ss/g, pad2(s))
    .replace(/h/g, String(h))
    .replace(/m/g, String(m))
    .replace(/s/g, String(s));
}

function tickClocks(elements: OverlayElement[]) {
  const now = Date.now();
  const nowDate = new Date(now);
  const ckEls = elements.filter((el) => el.type === "clock") as any[];

  for (const el of ckEls) {
    const domEl = document.querySelector(`[data-clock-id="${el.id}"]`) as HTMLElement | null;
    if (!domEl) continue;

    const mode = el.clockMode ?? "wall";
    const format = el.format ?? "HH:mm:ss";
    let text = "";

    if (mode === "wall") {
      text = formatWallClockRuntime(nowDate, format, el.timezone);
    } else if (mode === "elapsed" && el.startDatetime) {
      const startMs = new Date(el.startDatetime).getTime();
      const elapsedMs = Math.max(0, now - startMs);
      text = formatDurationRuntime(elapsedMs, format);
    } else if (mode === "stopwatch") {
      if (!clockStopwatchStartTimes.has(el.id)) {
        clockStopwatchStartTimes.set(el.id, now);
      }
      const elapsed = now - clockStopwatchStartTimes.get(el.id)!;
      text = formatDurationRuntime(elapsed, format);
    } else {
      text = formatWallClockRuntime(nowDate, format, el.timezone);
    }

    domEl.textContent = text;
  }
}


function tickCountdowns(elements: OverlayElement[]) {
  const now = Date.now();
  const cdEls = elements.filter((el) => el.type === "countdown") as any[];

  for (const el of cdEls) {
    const domEl = document.querySelector(`[data-countdown-id="${el.id}"]`) as HTMLElement | null;
    if (!domEl) continue;

    let remainingMs: number;

    if (el.mode === "target" && el.targetDatetime) {
      const target = new Date(el.targetDatetime).getTime();
      remainingMs = target - now;
    } else {
      // duration mode
      if (!countdownStartTimes.has(el.id)) {
        countdownStartTimes.set(el.id, now);
      }
      const elapsed = now - countdownStartTimes.get(el.id)!;
      remainingMs = (el.durationMs ?? 300000) - elapsed;
    }

    const endBehaviour = el.endBehaviour ?? "hold";

    if (remainingMs <= 0) {
      if (endBehaviour === "hide") {
        domEl.style.display = "none";
        continue;
      } else if (endBehaviour === "loop") {
        countdownStartTimes.set(el.id, now);
        remainingMs = el.durationMs ?? 300000;
      } else {
        // hold
        remainingMs = 0;
      }
    }

    domEl.style.display = "";
    domEl.textContent = formatCountdownMs(remainingMs, el.format ?? "MM:SS");
  }
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
  const [variables, setVariables] = useState<OverlayVariable[]>([]);
  const lastIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!publicId) return;

    // useOverlayEvents no longer opens its own SSE connection.
    // Packets are forwarded here via scraplet:overlay:event dispatched by
    // useUnifiedOverlayState's onPacketSideEffect — single SSE connection for the whole runtime.
    const handlePacket = (e: Event) => {
      try {
        const packet = (e as CustomEvent).detail;
        const { header, payload } = packet || {};
        if (!header?.type) return;
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

        if (header?.type === "variables.update") {
          const vars = payload?.variables;
          if (Array.isArray(vars)) {
            setVariables(vars);
          }
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



        // Group flash on generic packets removed — was a no-op hide and fired on every payload.
      } catch (err) {
        console.error("[OverlayEvents] Parse error:", err);
      }
    };

    window.addEventListener('scraplet:overlay:event', handlePacket);
    return () => {
      window.removeEventListener('scraplet:overlay:event', handlePacket);
    };
  }, [publicId, elements]);

  return { overrides, data, flash, variables };
}

/* -----------------------------
   Overlay runtime root
------------------------------*/

// ── Widget Runtime Loader ─────────────────────────────────────────────────────
// Checks registry first — registered widgets use unified state path.
// Unregistered widgets use widgetRegistry (sets __WIDGET_CONFIG_* globals, fetches tokens, loads IIFE scripts).

// Shared SSE multiplexer — one connection for all IIFE widgets
let sharedWidgetSse: EventSource | null = null;
let sharedWidgetToken: string | null = null;

const WIDGET_SSE_EVENT_TYPES = [
  'subs.update','chat_message','follow','sub','raid','tip','redemption',
  'channel.subscription.new','channel.subscription.renewal','channel.subscription.gifts',
  'channel.followed','channel.reward.redemption.updated',
  'kicks.gifted','donation','chat.message.sent',
  'subscribe','gift_sub','subscription','resub','raffle_update','tts.ready','tts_ready',
  'stake.update','alert','event_console','hello','ping',
];

function startSharedWidgetSse(token: string) {
  if (sharedWidgetSse && sharedWidgetToken === token) return;
  if (sharedWidgetSse) { sharedWidgetSse.close(); sharedWidgetSse = null; }
  sharedWidgetToken = token;
  const url = '/w/' + encodeURIComponent(token) + '/stream';
  const es = new EventSource(url);
  sharedWidgetSse = es;
  const dispatchNamed = (type: string, data: string) => {
    window.dispatchEvent(new MessageEvent('scraplet:widget:event:' + type, { data }));
  };
  const dispatchGeneric = (data: string) => {
    window.dispatchEvent(new MessageEvent('scraplet:widget:sse', { data }));
  };
  es.onmessage = (ev) => dispatchGeneric(ev.data);
  WIDGET_SSE_EVENT_TYPES.forEach(type => {
    es.addEventListener(type, (ev: MessageEvent) => dispatchNamed(type, ev.data));
  });
  es.onerror = () => {
    es.close();
    sharedWidgetSse = null;
    setTimeout(() => { if (sharedWidgetToken) startSharedWidgetSse(sharedWidgetToken); }, 5000);
  };
}

function registerWidgets(elements: any[], channelSlug: string) {
  const WIDGET_SCRIPTS: Record<string, string> = {
    'stake-monitor':        '/widgets/stake-monitor.js',
    'tts-player':           '/widgets/tts-player.js',
    'chat-overlay':         '/widgets/chat-overlay.js',
    'alert-box-widget':     '/widgets/alert-box-widget.js',
    'sub-counter':          '/widgets/sub-counter.js',
    'event-console-widget': '/widgets/event-console-widget.js',
    'raffle':               '/widgets/raffle.js',
    'subathon-timer':       '/widgets/subathon-timer.js',
    'random-number':        '/widgets/random-number.js',
    'emote-wall':           '/widgets/emote-wall.js',
    'emote-counter':        '/widgets/emote-counter.js',
    'top-donators':         '/widgets/top-donators.js',
    'sound-visualizer':     '/widgets/sound-visualizer.js',
    'ticker':               '/widgets/ticker.js',
    'hype-train':           '/widgets/hype-train.js',
  };

  const TOKEN_WIDGETS = new Set(['chat-overlay', 'alert-box-widget', 'sub-counter', 'event-console-widget', 'raffle', 'tts-player']);

  for (const el of elements) {
    if (el.type !== 'widget') continue;

    const widgetId = el.widgetId;

    // Unified state path — React renderer registered, skip IIFE script.
    // But still start the shared widget SSE for token widgets (chat bridge needs it).
    if (getWidgetRenderer(widgetId)) {
      console.log(`[overlay-runtime] ${widgetId} using unified state path`);
      const propOverrides = el.propOverrides || {};
      if (TOKEN_WIDGETS.has(widgetId) && propOverrides.token && !sharedWidgetSse) {
        startSharedWidgetSse(propOverrides.token);
      }
      continue;
    }

    const scriptSrc = WIDGET_SCRIPTS[widgetId];
    if (!scriptSrc) continue;

    const propOverrides = el.propOverrides || {};
    const requiresToken = TOKEN_WIDGETS.has(widgetId);
    const params = new URLSearchParams({ channel: channelSlug, v: Date.now().toString() });
    const scriptUrl = scriptSrc + '?' + params.toString();

    // Use widgetRegistry — sets __WIDGET_CONFIG_* globals, fetches tokens, loads script
    widgetRegistry.register({
      widgetId,
      elementId: el.id,
      config: { channel: channelSlug, ...propOverrides },
      scriptUrl,
      requiresToken,
    });

    if (requiresToken && propOverrides.token) {
      if (!sharedWidgetSse) {
        startSharedWidgetSse(propOverrides.token);
      }
    }
  }
}

function OverlayRuntimeRoot({ publicId }: { publicId: string }) {
  const [overlay, setOverlay] = useState<OverlayConfigV0 | null>(null);
  const [configVariables, setConfigVariables] = useState<OverlayVariable[]>([]);
  const [state, setState] = useState<OverlayStateV0 | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const playbackStartRef = useRef<number | null>(null);
  const overlayConfigHashRef = useRef<string>("");

  const baseW = overlay?.baseResolution?.width ?? (window as any).__OVERLAY_BASE_W__ ?? 1920;
  const baseH = overlay?.baseResolution?.height ?? (window as any).__OVERLAY_BASE_H__ ?? 1080;

  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leaferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixiCoreRef = useRef<PixiMediaCore | null>(null);
  const leaferCoreRef = useRef<LeaferGraphicCore | null>(null);
  const [canvasInitialized, setCanvasInitialized] = useState(false);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [fontTrigger, setFontTrigger] = useState(0);

  useEffect(() => {
    const syncFonts = () => setFontTrigger(prev => prev + 1);
    document.fonts.addEventListener('loadingdone', syncFonts);
    return () => document.fonts.removeEventListener('loadingdone', syncFonts);
  }, []);

  // OBS detection — disable debug HUD when running inside OBS CEF
  const isOBS = navigator.userAgent.includes("OBS");

  // Unified overlay state — owns all SSE connections and widget state derivation
  // Side-effect: dispatch scraplet:overlay:event so BotLayerRoot and other
  // window-event listeners receive packets from the single SSE connection.
  const overlayConfigForState: DerivedOverlayConfigV0 = overlay ? (overlay as any) : { elements: [] };
  const unifiedState = useUnifiedOverlayState(publicId, overlayConfigForState, (packet) => {
    if (packet?.header?.type) {
      window.dispatchEvent(new CustomEvent('scraplet:overlay:event', { detail: packet }));
    }
  });

  // Chat messages now flow through overlayGate SSE (chat.message packets) — no widget SSE bridge needed.

  const pinnedMeasureRef = useRef<HTMLDivElement>(null);
  const [pinnedHeight, setPinnedHeight] = useState(0);

  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  // Enable Event System
  // We need the elements list to find targets
  const baseElements = overlay?.elements ?? [];
  const { overrides, data: eventData, flash, variables: sseVariables } = useOverlayEvents(publicId, baseElements);
  // SSE-updated variables override config-loaded ones
  const overlayVariables = sseVariables.length > 0 ? sseVariables : configVariables;
  // Active event timeline state: { name, startedAt }
  const [activeEventTl, setActiveEventTl] = React.useState<{ name: string; startedAt: number } | null>(null);

  // Listen for overlay SSE events to trigger event timelines
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const type: string = detail?.header?.type ?? "";
      // Map event types to timeline names
      const eventMap: Record<string, string> = {
        "channel.subscription.new": "sub",
        "channel.subscription.renewal": "sub",
        "subscribe": "sub",
        "channel.followed": "follow",
        "follow": "follow",
        "raid": "raid",
        "donation": "donation",
        "cheer": "cheer",
        "host": "host",
      };
      const tlName = eventMap[type];
      if (tlName && (overlay as any)?.eventTimelines?.[tlName]) {
        setActiveEventTl({ name: tlName, startedAt: performance.now() });
      }
    };
    window.addEventListener("scraplet:overlay:event", handler);
    return () => window.removeEventListener("scraplet:overlay:event", handler);
  }, [overlay]);

  // Event timeline playhead
  const eventTlElapsed = activeEventTl ? performance.now() - activeEventTl.startedAt : 0;
  const eventTl = activeEventTl ? (overlay as any)?.eventTimelines?.[activeEventTl.name] : null;

  // Clear event timeline when it finishes
  React.useEffect(() => {
    if (!activeEventTl || !eventTl) return;
    const remaining = (eventTl.durationMs ?? 3000) - eventTlElapsed;
    if (remaining <= 0) { setActiveEventTl(null); return; }
    const timer = window.setTimeout(() => setActiveEventTl(null), remaining);
    return () => window.clearTimeout(timer);
  }, [activeEventTl?.name, activeEventTl?.startedAt]);

  const timelineValues = useMemo(() => {
    const base = evaluateTimeline(overlay?.timeline, playheadMs);
    if (!eventTl || !activeEventTl) return base;
    // Event timeline values override base
    const eventValues = evaluateTimeline(eventTl, eventTlElapsed);
    const merged: typeof base = { ...base };
    for (const [elId, props] of Object.entries(eventValues)) {
      merged[elId] = { ...(merged[elId] ?? {}), ...props };
    }
    return merged;
  }, [overlay?.timeline, playheadMs, eventTl, eventTlElapsed]);

  // Apply Overrides Merge
  const elements = React.useMemo(() => {
    return baseElements.map(el => {
      const ov = overrides[el.id];
      const merged = ov ? ({ ...el, ...ov } as OverlayElement) : el;
      // Don't apply timeline position overrides to widget elements - they should stay fixed
      if ((merged as any).type === 'widget') return merged;
      return applyTimelineOverrides(merged, timelineValues[el.id]);
    });
  }, [baseElements, overrides, timelineValues]);

  const animationPhases = useElementAnimationPhases(elements);

  const [imageTrigger, setImageTrigger] = useState(0);

  const imageUrls = useMemo(() => {
    const urls = new Set<string>();
    elements.forEach(el => {
      if (el.visible === false) return;
      if (el.type === 'image' && el.src) urls.add(el.src);
      if (el.pattern?.src) urls.add(el.pattern.src);
      if (Array.isArray(el.fills)) {
        el.fills.forEach((f: any) => {
          if ((f.type === 'pattern' || f.type === 'texture') && f.src) urls.add(f.src);
        });
      }
    });
    return Array.from(urls);
  }, [elements]);

  useEffect(() => {
    if (imageUrls.length === 0) return;
    let cancelled = false;
    Promise.all(imageUrls.map(url => {
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(url);
        img.onerror = () => resolve(url);
        img.src = url;
      });
    })).then(() => {
      if (!cancelled) setImageTrigger(prev => prev + 1);
    });
    return () => { cancelled = true; };
  }, [imageUrls.join(",")]);

  // Initialize Dual Canvas core engines
  useEffect(() => {
    const pixiCanvas = pixiCanvasRef.current;
    const leaferCanvas = leaferCanvasRef.current;
    if (!pixiCanvas || !leaferCanvas) return;

    const pixiCore = new PixiMediaCore();
    const leaferCore = new LeaferGraphicCore();

    pixiCoreRef.current = pixiCore;
    leaferCoreRef.current = leaferCore;

    const initCores = async () => {
      await pixiCore.initialize({
        canvas: pixiCanvas,
        width: baseW,
        height: baseH,
      });
      leaferCore.initialize({
        canvas: leaferCanvas,
        width: baseW,
        height: baseH,
      });
      setCanvasInitialized(true);
    };

    initCores().catch(err => {
      console.error('[OverlayRuntime] Failed to initialize dual canvas core rendering:', err);
    });

    return () => {
      pixiCore.destroy();
      leaferCore.destroy();
      setCanvasInitialized(false);
    };
  }, [baseW, baseH]);

  // Sync elements to Canvas Core engines (Leafer for vector/text, Pixi for media/video)
  useLayoutEffect(() => {
    if (!canvasInitialized || !leaferCoreRef.current || !pixiCoreRef.current) return;

    // Completely clear Leafer elements before redraw to prevent stale font metrics/layout caching
    leaferCoreRef.current.clearAll();

    const activeLeaferIds = new Set<string>();
    const activePixiIds = new Set<string>();

    elements.forEach((el) => {
      if (el.visible === false) return;

      const type = el.type;

      // 1. Leafer.js Graphics (rect, ellipse, circle, path, text, shape, image)
      if (type === 'shape' || type === 'rect' || type === 'ellipse' || type === 'circle' || type === 'path' || type === 'text' || type === 'image') {
        activeLeaferIds.add(el.id);

        const properties: Record<string, any> = { ...el };
        let drawType: 'rect' | 'circle' | 'ellipse' | 'path' | 'text' = 'rect';

        if (type === 'shape') {
          const s = el as any;
          if (s.shape === 'rect') drawType = 'rect';
          else if (s.shape === 'circle') drawType = 'circle';
          else if (s.shape === 'ellipse') drawType = 'ellipse';
          else if (s.shape === 'line') {
            drawType = 'path';
            const w = s.width ?? 100;
            const h = s.height ?? 100;
            const x1 = s.line ? s.line.x1 * w : 0;
            const y1 = s.line ? s.line.y1 * h : h / 2;
            const x2 = s.line ? s.line.x2 * w : w;
            const y2 = s.line ? s.line.y2 * h : h / 2;
            properties.pathData = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            // polygon / triangle
            drawType = 'path';
            const w = s.width ?? 100;
            const h = s.height ?? 100;
            properties.pathData = `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
          }
        } else if (type === 'image') {
          drawType = 'rect';
        } else {
          drawType = type as any;
        }

        // Trigger font loading if needed
        if (drawType === 'text' && properties.fontFamily) {
          leaferCoreRef.current?.preloadFonts([properties.fontFamily]);
        }

        leaferCoreRef.current?.drawElement(el.id, drawType, properties);
      }

      // 2. PixiJS Media (video feeds)
      if (type === 'video') {
        activePixiIds.add(el.id);

        let videoEl = videoElementsRef.current.get(el.id);
        if (!videoEl) {
          videoEl = document.createElement('video');
          videoEl.crossOrigin = 'anonymous';
          videoEl.src = el.src || '';
          videoEl.loop = el.loop !== false;
          videoEl.muted = el.muted !== false;
          videoEl.autoplay = el.autoplay !== false;
          videoEl.playsInline = true;
          videoEl.volume = 0; // ensure muted for overlay safety
          
          // Append to document.body to satisfy browser auto-play policies
          videoEl.style.display = 'none';
          document.body.appendChild(videoEl);
          
          videoEl.play().catch(err => {
            console.warn('[PixiMediaCore] Background video play failed:', err);
          });
          
          videoElementsRef.current.set(el.id, videoEl);
        }

        // Update loop/muted/src properties if changed
        if (videoEl.src !== (el.src || '')) {
          videoEl.src = el.src || '';
          videoEl.load();
          videoEl.play().catch(() => {});
        }
        if (videoEl.loop !== (el.loop !== false)) videoEl.loop = el.loop !== false;
        if (videoEl.muted !== (el.muted !== false)) videoEl.muted = el.muted !== false;

        // Parse keying/chroma configuration if any
        let chromaConfig: any = undefined;
        if (el.keying && el.keying.mode && el.keying.mode !== 'none') {
          const colorHex = el.keying.color || '#00ff00';
          const cleanHex = colorHex.replace('#', '');
          const r = (parseInt(cleanHex.substring(0, 2), 16) || 0) / 255;
          const g = (parseInt(cleanHex.substring(2, 4), 16) || 255) / 255;
          const b = (parseInt(cleanHex.substring(4, 6), 16) || 0) / 255;
          
          chromaConfig = {
            keyColor: [r, g, b],
            similarity: el.keying.similarity ?? 0.4,
            smoothness: el.keying.smoothness ?? 0.08
          };
        }

        pixiCoreRef.current?.updateVideoElement(
          el.id,
          videoEl,
          {
            x: el.x ?? 0,
            y: el.y ?? 0,
            width: el.width ?? 100,
            height: el.height ?? 100
          },
          chromaConfig
        );
      }
    });

    // Cleanup orphaned Leafer elements
    leaferCoreRef.current?.cleanupOrphanedElements(activeLeaferIds);

    // Cleanup orphaned Pixi video elements
    videoElementsRef.current.forEach((videoEl, id) => {
      if (!activePixiIds.has(id)) {
        videoEl.pause();
        videoEl.src = "";
        videoEl.load();
        videoEl.remove();
        videoElementsRef.current.delete(id);
        
        pixiCoreRef.current?.removeVideoElement(id);
      }
    });
  }, [elements, canvasInitialized, fontTrigger, imageTrigger]);

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

      // Always register widgets (idempotent - safe to call multiple times)
      const channelSlug = (window as any).__OVERLAY_CHANNEL_SLUG__ || '';
      console.log('[OverlayRuntime] Calling registerWidgets, elements:', (data.elements || []).length);
      registerWidgets(data.elements || [], channelSlug);

      if (nextHash === overlayConfigHashRef.current) return;

      overlayConfigHashRef.current = nextHash;
      setOverlay(data);
      if (Array.isArray((data as any).variables)) {
        setConfigVariables((data as any).variables);
      }
    };

    loadConfig().catch((e) => console.error("Failed to load overlay config", e));
    // No polling — load once. Config only changes when user saves in editor.

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [publicId]);

  // Widget loading: unified state path handles all SSE via useUnifiedOverlayState

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

  // Countdown tick loop
  useEffect(() => {
    const interval = window.setInterval(() => {
      tickCountdowns(elements);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [elements]);

  // Clock tick loop
  useEffect(() => {
    const interval = window.setInterval(() => {
      tickClocks(elements);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [elements]);

  // Audio Visualiser runtime — Web Audio API
  useEffect(() => {
    const avEls = elements.filter((el) => el.type === "audioVisualiser") as any[];
    if (avEls.length === 0) return;

    if (!window.__AUDIO_ANALYSERS__) {
      window.__AUDIO_ANALYSERS__ = new Map();
    }

    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    const init = async () => {
      try {
        audioCtx = new AudioContext();
        let stream: MediaStream;

        // OBS browser source: try obsstudio.getAudioSources() first
        if ((window as any).obsstudio?.getAudioSources) {
          try {
            const sources = await (window as any).obsstudio.getAudioSources();
            const srcId = avEls[0]?.sourceId ?? "default";
            const obsSource = sources.find((s: any) => s.id === srcId) ?? sources[0];
            if (obsSource) {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: obsSource.deviceId ?? undefined },
              });
            } else {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        // Share one analyser for all AV elements (they all get the same audio)
        avEls.forEach((el) => {
          window.__AUDIO_ANALYSERS__!.set(el.id, analyser);
        });
      } catch (err) {
        console.warn("[AudioVisualiser] Could not initialise Web Audio:", err);
        // Demo animation continues in ElementRenderer — no action needed
      }
    };

    init();

    return () => {
      avEls.forEach((el) => window.__AUDIO_ANALYSERS__?.delete(el.id));
      source?.disconnect();
      audioCtx?.close().catch(() => {});
    };
  }, [elements]);

  // Safe defaults before overlay loads (keeps hooks order stable)
  // Use server-injected base resolution if available (avoids layout shift before config loads)

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

  const pinnedElementsToRender = pinnedElements;
  const normalElementsToRender = normalElements;

  // Rendering layers — stacking order (bottom to top):
  // z=1: flatElements    — 2D elements, no transforms
  // z=2: elements3D      — non-widget elements with 3D transforms (preserve-3d isolated)
  // z=3: widgetElements  — widgets without 3D transforms
  // z=4: widgets3D       — widgets with 3D transforms (highest priority)
  const flatElements = normalElements.filter((el: any) =>
    el.type !== 'widget' &&
    !el.tiltX && !el.tiltY && !el.skewX && !el.skewY
  );
  const elements3D = normalElements.filter((el: any) =>
    el.type !== 'widget' &&
    (el.tiltX || el.tiltY || el.skewX || el.skewY)
  );
  const widgetElements = normalElements.filter((el: any) =>
    el.type === 'widget' &&
    !el.tiltX && !el.tiltY && !el.skewX && !el.skewY
  );
  const widgets3D = normalElements.filter((el: any) =>
    el.type === 'widget' &&
    (el.tiltX || el.tiltY || el.skewX || el.skewY)
  );

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

  const usedFontsKey = usedFonts.join(",");

  // Immediately request and preload custom Google Fonts to avoid browser font face loading race conditions
  useEffect(() => {
    if (!canvasInitialized || usedFonts.length === 0) return;

    const url = getGoogleFontsUrl(usedFonts);
    if (!url) return;

    const id = "scraplet-google-fonts";
    let link = document.getElementById(id) as HTMLLinkElement;

    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    if (link.href !== url) {
      link.href = url;
    }

    // Programmatically load all fonts via Font Loading API
    let cancelled = false;
    const preload = async () => {
      try {
        await Promise.all(
          usedFonts.map((font) =>
            document.fonts.load(`1em "${font}"`).catch((err) => {
              console.warn(`[OverlayRuntime] Failed to preload font: ${font}`, err);
            })
          )
        );
        if (!cancelled) {
          console.log("[OverlayRuntime] Custom fonts preloaded successfully:", usedFonts);
          // Increment font trigger to invalidate and redraw
          setFontTrigger((prev) => prev + 1);
        }
      } catch (err) {
        console.warn("[OverlayRuntime] Font preloading error:", err);
      }
    };

    preload();

    return () => {
      cancelled = true;
    };
  }, [usedFontsKey, canvasInitialized]);

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

  // Sync scale transform to pre-rendered widget containers
  useEffect(() => {
    const widgetWrapper = document.getElementById('widget-containers-prerender');
    if (widgetWrapper) {
      widgetWrapper.style.transform = `scale(${scale})`;
    }
  }, [scale]);

  // Transforms are applied by ElementRenderer directly in baseStyle - no DOM manipulation needed

  return (
    <>
      <FontLoader fonts={usedFonts} />
      
      {/* Main overlay viewport */}
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background:
            overlay?.backgroundColor && overlay.backgroundColor !== "transparent"
              ? overlay.backgroundColor
              : "transparent",
          overflow: elements.some((el: any) => (el.tiltX ?? 0) !== 0 || (el.tiltY ?? 0) !== 0 || (el.skewX ?? 0) !== 0 || (el.skewY ?? 0) !== 0) ? "visible" : "hidden",
          position: "relative",
        }}
      >
        {/* Stage: top-left anchored scale */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: baseW,
            height: baseH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* WebGL Canvas (PixiJS - Layer 1) */}
          <canvas
            ref={pixiCanvasRef}
            id="pixi-media-canvas"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />
          
          {/* Canvas 2D Layer (LeaferJS - Layer 2) */}
          <canvas
            ref={leaferCanvasRef}
            id="leafer-graphics-canvas"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          />
          {/* PINNED LAYER */}
          {pinnedElementsToRender.length > 0 && (
            <div
              ref={pinnedMeasureRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                pointerEvents: "none",
                transformStyle: "preserve-3d",
              }}
            >
              {pinnedElementsToRender.map((el: any) => (
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
                  elementIndex={elements.indexOf(el) + 1}
                  canvasInitialized={canvasInitialized}
                  isCanvasDrawn={canvasInitialized}
                />
              ))}
            </div>
          )}

          {/* SINGLE RENDER LAYER — all elements in one preserve-3d context.
               zIndex on each element (from elementIndex = config order) handles stacking.
               No separate layer containers — they caused z-order bugs in OBS CEF. */}
          {overlay && normalElementsToRender.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transformStyle: 'preserve-3d' }}>
              {normalElementsToRender.map((el: any) => (
                <ElementRenderer
                  key={el.id}
                  element={el}
                  yOffset={pinnedHeight}
                  elementsById={elementsById}
                  overlayComponents={(overlay as any).components || []}
                  animationPhase={animationPhases[el.id]?.phase}
                  animationPhases={animationPhases}
                  data={eventData}
                  overlayVariables={overlayVariables}
                  visited={new Set()}
                  elementIndex={elements.indexOf(el) + 1}
                  widgetStates={unifiedState.widgetStates}
                  canvasInitialized={canvasInitialized}
                  isCanvasDrawn={canvasInitialized}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      {/* BOT LAYER — MUST be outside the overflow:hidden viewport container.
           OBS CEF (Chromium 75) does not composite elements inside overflow:hidden ancestors.
           position:fixed + inset:0 places it over the full viewport without being clipped. */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 9000,
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      >
        <BotLayerRoot 
          publicId={publicId} 
          isEditorMode={false} 
          pixiCanvasRef={pixiCanvasRef} 
          leaferCanvasRef={leaferCanvasRef} 
        />
      </div>

      {!isOBS && <DebugHud state={state} data={eventData} />}

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
