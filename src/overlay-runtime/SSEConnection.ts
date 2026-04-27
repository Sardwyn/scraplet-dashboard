/**
 * SSEConnection — Resilient SSE connection with Last-Event-ID replay.
 *
 * Key improvements:
 * - Tracks last received event ID for replay on reconnect
 * - Passes lastEventId as query param since manual close resets browser's tracking
 * - Uses addEventListener for named 'message' events (server sends event: message)
 * - Exponential backoff with jitter
 */

export interface OverlayRuntimePacketV1 {
  header: { type: string; eventId?: string };
  payload: Record<string, unknown>;
}

export interface SSEConnectionOptions {
  publicId: string;
  onPacket: (packet: OverlayRuntimePacketV1) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class SSEConnection {
  private eventSource: EventSource | null = null;
  private reconnectTimer: number | null = null;
  private attemptCount: number = 0;
  private lastEventId: string | null = null;
  private options: SSEConnectionOptions;
  private destroyed = false;

  constructor(options: SSEConnectionOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.destroyed) return;

    // Cancel any pending reconnect
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close existing connection if any
    if (this.eventSource !== null) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Pass lastEventId as query param so server can replay missed events
    // (manual close resets browser's built-in Last-Event-ID tracking)
    const url = this.lastEventId
      ? `/api/overlays/public/${this.options.publicId}/events/stream?lastEventId=${encodeURIComponent(this.lastEventId)}`
      : `/api/overlays/public/${this.options.publicId}/events/stream`;

    const es = new EventSource(url);
    this.eventSource = es;

    es.onopen = () => {
      this.attemptCount = 0;
      this.options.onConnect?.();
    };

    // Handle both named 'message' events and default unnamed events
    const handleMessage = (event: MessageEvent) => {
      try {
        const packet = JSON.parse(event.data) as OverlayRuntimePacketV1;
        // Track last event ID for replay
        if (event.lastEventId) {
          this.lastEventId = event.lastEventId;
        }
        this.options.onPacket(packet);
      } catch (error) {
        console.error('[SSEConnection] Failed to parse message:', error);
      }
    };

    es.addEventListener('message', handleMessage);
    es.onmessage = handleMessage; // belt and braces

    es.onerror = () => {
      if (this.destroyed) return;
      if (this.eventSource !== null) {
        this.eventSource.close();
        this.eventSource = null;
      }

      // Exponential backoff with jitter: min(2^attempt * 500, 10_000) + random 0-500ms
      const base = Math.min(Math.pow(2, this.attemptCount) * 500, 10_000);
      const jitter = Math.random() * 500;
      const delay = base + jitter;
      this.attemptCount++;

      console.log(`[SSEConnection] Reconnecting in ${Math.round(delay)}ms (attempt ${this.attemptCount}, lastEventId: ${this.lastEventId})`);

      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    };
  }

  disconnect(): void {
    this.destroyed = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource !== null) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.options.onDisconnect?.();
  }
}
