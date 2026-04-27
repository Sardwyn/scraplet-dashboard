/**
 * unifiedOverlayState.ts
 *
 * Core type definitions for the Unified Overlay State architecture.
 *
 * CONSTRAINT: UnifiedOverlayState is the only state that can influence
 * rendering anywhere in the system. No widget renderer may read from
 * any other source (window globals, SSE, polling) to update its display.
 */

// ── Base ──────────────────────────────────────────────────────────────────────

export interface BaseWidgetState {
  instanceId: string;
  version: number;
}

// ── Unified state ─────────────────────────────────────────────────────────────

export interface UnifiedOverlayState {
  /** Overlay public ID this state belongs to */
  publicId: string;
  /** Monotonically increasing counter, incremented on every mutation */
  version: number;
  /** Unix ms timestamp of last mutation */
  updatedAt: number;
  /** Widget sub-states keyed by widget instance ID */
  widgetStates: Record<string, WidgetSubState>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export type Platform = 'kick' | 'youtube' | 'twitch' | 'tiktok';

export interface ResolvedBadge {
  label: string;
  imageUrl?: string;
}

export type MessageToken =
  | { type: 'text'; text: string }
  | { type: 'emote'; id: string; name: string; url: string };

export interface ChatMessage {
  id: number;
  username: string;
  text: string;
  platform: Platform;
  color?: string;
  avatar?: string;
  badges: ResolvedBadge[];
  tokens: MessageToken[];
  ts: number;
}

export interface ChatOverlayConfig {
  maxMessages: number;
  stripEmotes: boolean;
  nameColorMode: 'platform' | 'custom';
  nameColor?: string;
  fadeMs: number;
  enableKick: boolean;
  enableYoutube: boolean;
  enableTwitch: boolean;
  enableTiktok: boolean;
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  messageGapPx: number;
  messageColor: string;
  showAvatars: boolean;
  showPlatformIcon: boolean;
  showBadges: boolean;
  shadow: boolean;
  bubbleEnabled: boolean;
  bubbleRadiusPx: number;
  bubbleBg: string;
  bubbleBorder: string;
  glowEnabled: boolean;
  glowColor: string;
  glowBlur: number;
  depthEnabled: boolean;
  depthOffset: number;
  depthColor: string;
}

export interface ChatOverlayState extends BaseWidgetState {
  messages: ChatMessage[];
  config: ChatOverlayConfig;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export type AlertType = 'follow' | 'subscribe' | 'resub' | 'subgift' | 'raid' | 'tip';

export interface AlertEntry {
  id: string;
  type: AlertType;
  actorDisplay: string;
  message?: string;
  amount?: number;
  imageUrl?: string;
  ts: number;
  activatedAt?: number;
}

export interface AlertOverlayState extends BaseWidgetState {
  active: AlertEntry | null;
  queue: AlertEntry[];
}

// ── Counters ──────────────────────────────────────────────────────────────────

export interface CounterOverlayState extends BaseWidgetState {
  value: number;
  label: string;
  goal?: number;
  goalReached: boolean;
  lastEventTs: number;
}

// ── Scrapbot ──────────────────────────────────────────────────────────────────

export interface ScrapbotCommandEvent {
  commandName: string;
  username: string;
  platform: Platform;
  args: string[];
  ts: number;
}

export interface TtsQueueEntry {
  ttsJobId: string;
  text: string;
  username: string;
  platform: Platform;
  queuedAt: number;
}

export type TrustSignalType = 'flood_detected' | 'swarm_detected' | 'user_banned';
export type TrustSeverity = 'low' | 'medium' | 'high';

export interface TrustSignal {
  signalType: TrustSignalType;
  username: string;
  platform: Platform;
  severity: TrustSeverity;
  ts: number;
}

export interface ScrapbotOverlayState extends BaseWidgetState {
  lastCommand: ScrapbotCommandEvent | null;
  ttsQueue: TtsQueueEntry[];
  trustSignals: TrustSignal[];
}

// ── Discriminated union ───────────────────────────────────────────────────────

export type WidgetSubState =
  | ChatOverlayState
  | AlertOverlayState
  | CounterOverlayState
  | ScrapbotOverlayState;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function createEmptyUnifiedState(publicId: string): UnifiedOverlayState {
  return {
    publicId,
    version: 0,
    updatedAt: Date.now(),
    widgetStates: {},
  };
}

export function mergeWidgetState(
  state: UnifiedOverlayState,
  updates: Record<string, WidgetSubState>
): UnifiedOverlayState {
  return {
    ...state,
    version: state.version + 1,
    updatedAt: Date.now(),
    widgetStates: { ...state.widgetStates, ...updates },
  };
}
