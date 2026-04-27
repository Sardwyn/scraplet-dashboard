import type {
  UnifiedOverlayState,
  WidgetSubState,
  ChatOverlayState,
  ChatOverlayConfig,
  ChatMessage,
  ResolvedBadge,
  MessageToken,
  AlertOverlayState,
  AlertEntry,
  CounterOverlayState,
  ScrapbotOverlayState,
  TtsQueueEntry,
  TrustSignal,
  ScrapbotCommandEvent,
} from "./types/unifiedOverlayState";

interface ScrapbotCommandPayload {
  commandName: string;
  username: string;
  platform: string;
  args: string[];
  hasOverlayReaction: boolean;
}

interface TtsQueuedPayload {
  ttsJobId: string;
  text: string;
  username: string;
  platform: string;
}

interface TtsCompletedPayload {
  ttsJobId: string;
}

interface TrustSignalPayload {
  signalType: "flood_detected" | "swarm_detected" | "user_banned";
  username: string;
  platform: string;
  severity: "low" | "medium" | "high";
}

interface AlertEventPayload {
  eventId: string;
  type: "follow" | "subscribe" | "resub" | "subgift" | "raid" | "tip";
  actorDisplay?: string;
  message?: string;
  amount?: number;
  imageUrl?: string;
}

interface ChatEnvelopeV1 {
  author: {
    display: string;
    color?: string;
    avatar?: string;
    badges?: Array<{ label: string; imageUrl?: string }>;
  };
  message: {
    text: string;
    emotes?: Array<{ id: string; name: string; url: string; positions?: unknown }>;
  };
  platform: "kick" | "youtube" | "twitch" | "tiktok";
  eventId?: string;
}

// Minimal local interface — replace with shared type once defined
export interface OverlayRuntimePacketV1 {
  header: { type: string; eventId?: string };
  payload: Record<string, unknown>;
}

// Minimal local interface — replace with shared type once defined
export interface OverlayConfigV0 {
  elements: Array<{
    type: string;
    widgetId?: string;
    instanceId?: string;
    widgetParams?: Record<string, unknown>;
  }>;
}

export interface DerivedStateEngineOptions {
  overlayConfig: OverlayConfigV0;
  scheduleTimer: (ms: number, callback: () => void) => () => void;
  fetchInitialCounterValue: (instanceId: string) => Promise<number>;
}

// Packet type patterns that route to processAlertEvent
const ALERT_PATTERNS = [
  /^platform\.[^.]+\.follow$/,
  /^platform\.[^.]+\.subscription$/,
  /^platform\.[^.]+\.raid$/,
  /^platform\.[^.]+\.tip$/,
  /^platform\.[^.]+\.subgift$/,
];

// Packet type patterns that route to processCounterIncrement
const COUNTER_PATTERNS = [
  /^platform\.[^.]+\.subscription$/,
  /^platform\.[^.]+\.resub$/,
  /^platform\.[^.]+\.subgift$/,
];

function matchesAny(type: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(type));
}

export class DerivedStateEngine {
  private readonly options: DerivedStateEngineOptions;
  private readonly seenAlertIds: Set<string> = new Set();
  private readonly seenAlertIdsOrder: string[] = [];

  constructor(options: DerivedStateEngineOptions) {
    this.options = options;
  }

  /**
   * Routes an incoming packet to the appropriate handler(s) and returns
   * a partial map of updated widget sub-states, or null if the packet type
   * is unrecognised or produces no state change.
   */
  processPacket(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const type = packet.header.type;

    // chat.message
    if (type === "chat.message") {
      return this.processChatMessage(packet, currentState);
    }

    // scrapbot.*
    if (type === "scrapbot.command.executed") {
      return this.processScrapbotCommand(packet, currentState);
    }
    if (type === "scrapbot.tts.queued") {
      return this.processTtsQueued(packet, currentState);
    }
    if (type === "scrapbot.tts.completed") {
      return this.processTtsCompleted(packet, currentState);
    }
    if (type === "scrapbot.trust.signal") {
      return this.processTrustSignal(packet, currentState);
    }

    // platform.* — may route to alert, counter, or both
    const isAlert = matchesAny(type, ALERT_PATTERNS);
    const isCounter = matchesAny(type, COUNTER_PATTERNS);

    if (isAlert || isCounter) {
      const alertResult = isAlert
        ? this.processAlertEvent(packet, currentState)
        : null;
      const counterResult = isCounter
        ? this.processCounterIncrement(packet, currentState)
        : null;

      // Merge both results when both handlers apply (subscription / resub / subgift)
      if (alertResult && counterResult) {
        return { ...alertResult, ...counterResult };
      }
      return alertResult ?? counterResult;
    }

    // Unrecognised packet type
    return null;
  }

  // -------------------------------------------------------------------------
  // Private handler stubs — implementations in tasks 2.2–2.5
  // -------------------------------------------------------------------------

  private processChatMessage(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const payload = packet.payload as unknown as ChatEnvelopeV1;

    // Find all ChatOverlayState instances (those with a messages array and config)
    const result: Partial<Record<string, WidgetSubState>> = {};

    const widgetIds = Object.keys(currentState.widgetStates);
    console.log('[DerivedState] processChatMessage', payload?.message?.text?.slice(0,20), 'widgetStates:', widgetIds.length);

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("messages" in state && "config" in state)) {
        console.log('[DerivedState] skip', instanceId, 'no messages/config, keys:', Object.keys(state).slice(0,5));
        continue;
      }

      const chatState = state as ChatOverlayState;
      const config: ChatOverlayConfig = chatState.config;

      // Apply platform filter (req 3.7)
      const platform = payload.platform;
      console.log('[DerivedState] platform check', platform, 'enableKick:', config?.enableKick, 'config:', !!config);
      if (platform === "kick" && !config.enableKick) { console.log('[DerivedState] DROPPED by kick filter'); continue; }
      if (platform === "youtube" && !config.enableYoutube) continue;
      if (platform === "twitch" && !config.enableTwitch) continue;
      if (platform === "tiktok" && !config.enableTiktok) continue;

      // Resolve badges (req 3.5)
      const badges: ResolvedBadge[] = (payload.author.badges ?? []).map((b) => ({
        label: b.label,
        imageUrl: b.imageUrl,
      }));

      // Build tokens (req 3.3, 3.4)
      const rawText = payload.message.text;
      const emotePattern = /\[emote:([^:]+):([^\]]+)\]/g;
      let tokens: MessageToken[];

      if (config.stripEmotes) {
        // Strip all [emote:id:name] patterns from text
        const strippedText = rawText.replace(emotePattern, "").replace(/\s{2,}/g, " ").trim();
        tokens = [{ type: "text", text: strippedText }];
      } else {
        // Parse emote tokens and interleave with text tokens
        tokens = [];
        const emoteMap = new Map<string, string>(
          (payload.message.emotes ?? []).map((e) => [e.id, e.url])
        );
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        const re = new RegExp(emotePattern.source, "g");

        while ((match = re.exec(rawText)) !== null) {
          if (match.index > lastIndex) {
            tokens.push({ type: "text", text: rawText.slice(lastIndex, match.index) });
          }
          const [, emoteId, emoteName] = match;
          tokens.push({
            type: "emote",
            id: emoteId,
            name: emoteName,
            url: emoteMap.get(emoteId) || (`https://files.kick.com/emotes/${emoteId}/fullsize`),
          });
          lastIndex = re.lastIndex;
        }

        if (lastIndex < rawText.length) {
          tokens.push({ type: "text", text: rawText.slice(lastIndex) });
        }

        if (tokens.length === 0) {
          tokens = [{ type: "text", text: rawText }];
        }
      }

      // Apply nameColorMode (req 3.6)
      let color: string | undefined;
      if (config.nameColorMode === "platform") {
        color = payload.author.color;
      } else if (config.nameColorMode === "custom") {
        color = config.nameColor;
      }

      // Build ChatMessage (req 3.1, 3.2)
      const now = Date.now();
      const newMessage: ChatMessage = {
        id: now,
        username: payload.author.display,
        text: rawText,
        platform,
        color,
        avatar: payload.author.avatar,
        badges,
        tokens,
        ts: now,
      };

      // Append and enforce maxMessages (req 3.2)
      const updatedMessages = [...chatState.messages, newMessage].slice(-config.maxMessages);

      // Schedule fade removal (req 3.8)
      if (config.fadeMs > 0) {
        // TODO: wire fade callback to hook
        this.options.scheduleTimer(config.fadeMs, () => {
          // Fade handled by hook layer (task 4.1)
        });
      }

      result[instanceId] = {
        ...chatState,
        messages: updatedMessages,
        version: chatState.version + 1,
      } satisfies ChatOverlayState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private processAlertEvent(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const payload = packet.payload as unknown as AlertEventPayload;

    // Dedup check (req 4.5)
    if (this.seenAlertIds.has(payload.eventId)) {
      return null;
    }
    this.seenAlertIds.add(payload.eventId);
    this.seenAlertIdsOrder.push(payload.eventId);
    if (this.seenAlertIds.size > 100) {
      const oldest = this.seenAlertIdsOrder.shift()!;
      this.seenAlertIds.delete(oldest);
    }

    // Find all AlertOverlayState instances (req 4.1)
    const result: Partial<Record<string, WidgetSubState>> = {};

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("active" in state && "queue" in state)) continue;

      const alertState = state as AlertOverlayState;

      // Build AlertEntry (req 4.3, 4.6)
      const entry: AlertEntry = {
        id: payload.eventId,
        type: payload.type,
        actorDisplay: payload.actorDisplay || "Anonymous",
        message: payload.message,
        amount: payload.amount,
        imageUrl: payload.imageUrl,
        ts: Date.now(),
      };

      let updatedState: AlertOverlayState;

      if (alertState.active === null) {
        // No active alert — activate immediately (req 4.3)
        const activeEntry: AlertEntry = { ...entry, activatedAt: Date.now() };
        // Schedule auto-dismiss (req 4.4)
        this.options.scheduleTimer(5000, () => {
          // TODO: wire dismiss callback to hook
        });
        updatedState = {
          ...alertState,
          active: activeEntry,
          queue: alertState.queue,
          version: alertState.version + 1,
        };
      } else {
        // Active alert exists — enqueue (req 4.2)
        updatedState = {
          ...alertState,
          queue: [...alertState.queue, entry],
          version: alertState.version + 1,
        };
      }

      result[instanceId] = updatedState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private processCounterIncrement(
    _packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const result: Partial<Record<string, WidgetSubState>> = {};

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("value" in state && "label" in state && "goalReached" in state)) continue;

      const counterState = state as CounterOverlayState;
      const newValue = counterState.value + 1;
      const goalReached =
        counterState.goal !== undefined && newValue >= counterState.goal
          ? true
          : counterState.goalReached;

      result[instanceId] = {
        ...counterState,
        value: newValue,
        lastEventTs: Date.now(),
        goalReached,
        version: counterState.version + 1,
      } satisfies CounterOverlayState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private processScrapbotCommand(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const payload = packet.payload as unknown as ScrapbotCommandPayload;

    // req 7.7 — skip if no overlay reaction
    if (!payload.hasOverlayReaction) return null;

    const result: Partial<Record<string, WidgetSubState>> = {};

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("ttsQueue" in state && "trustSignals" in state)) continue;

      const scrapbotState = state as ScrapbotOverlayState;
      const lastCommand: ScrapbotCommandEvent = {
        commandName: payload.commandName,
        username: payload.username,
        platform: payload.platform,
        args: payload.args,
        ts: Date.now(),
      };

      result[instanceId] = {
        ...scrapbotState,
        lastCommand,
        version: scrapbotState.version + 1,
      } satisfies ScrapbotOverlayState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private processTtsQueued(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const payload = packet.payload as unknown as TtsQueuedPayload;
    const result: Partial<Record<string, WidgetSubState>> = {};

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("ttsQueue" in state && "trustSignals" in state)) continue;

      const scrapbotState = state as ScrapbotOverlayState;
      const entry: TtsQueueEntry = {
        ttsJobId: payload.ttsJobId,
        text: payload.text,
        username: payload.username,
        platform: payload.platform,
        queuedAt: Date.now(),
      };

      result[instanceId] = {
        ...scrapbotState,
        ttsQueue: [...scrapbotState.ttsQueue, entry],
        version: scrapbotState.version + 1,
      } satisfies ScrapbotOverlayState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private processTtsCompleted(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const payload = packet.payload as unknown as TtsCompletedPayload;
    const result: Partial<Record<string, WidgetSubState>> = {};

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("ttsQueue" in state && "trustSignals" in state)) continue;

      const scrapbotState = state as ScrapbotOverlayState;

      result[instanceId] = {
        ...scrapbotState,
        ttsQueue: scrapbotState.ttsQueue.filter(
          (entry) => entry.ttsJobId !== payload.ttsJobId
        ),
        version: scrapbotState.version + 1,
      } satisfies ScrapbotOverlayState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private processTrustSignal(
    packet: OverlayRuntimePacketV1,
    currentState: UnifiedOverlayState
  ): Partial<Record<string, WidgetSubState>> | null {
    const payload = packet.payload as unknown as TrustSignalPayload;
    const result: Partial<Record<string, WidgetSubState>> = {};

    for (const [instanceId, state] of Object.entries(currentState.widgetStates)) {
      if (!("ttsQueue" in state && "trustSignals" in state)) continue;

      const scrapbotState = state as ScrapbotOverlayState;
      const signal: TrustSignal = {
        signalType: payload.signalType,
        username: payload.username,
        platform: payload.platform,
        severity: payload.severity,
        ts: Date.now(),
      };

      result[instanceId] = {
        ...scrapbotState,
        trustSignals: [...scrapbotState.trustSignals, signal],
        version: scrapbotState.version + 1,
      } satisfies ScrapbotOverlayState;
    }

    return Object.keys(result).length > 0 ? result : null;
  }
}
