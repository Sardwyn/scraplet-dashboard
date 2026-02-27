// services/tiktokChatIngest.js
import { WebcastPushConnection } from "tiktok-live-connector";
import db from "../db.js";
import { buildChatEnvelopeV1FromTikTok } from "../src/ingest/buildChatEnvelopeV1.js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const SCRAPBOT_INGEST_URL = process.env.SCRAPBOT_INGEST_URL || "http://127.0.0.1:3030/api/inbound/tiktok";
const SHARED_SECRET = process.env.SCRAPBOT_SHARED_SECRET || "";

const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 2_000;
const BACKOFF_JITTER = 0.2; // +/- 20%

const DEDUPE_TTL_MS = 10_000;
const DEDUPE_PRUNE_INTERVAL_MS = 30_000;
const MAX_DEDUPE_SIZE = 50_000; // Fail-safe memory guard

const MAX_QUEUE_SIZE = 1000;
const MAX_BATCH_SIZE = 10;
const OUTBOUND_TIMEOUT_MS = 3000;

// ─────────────────────────────────────────────
// STATE MANAGEMENT
// ─────────────────────────────────────────────

// userId -> State
// State: { 
//   userId: number, 
//   uniqueId: string, 
//   connection: WebcastPushConnection | null, 
//   status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopped',
//   backoffMs: number, 
//   reconnectTimer: Timer | null
// }
const connections = new Map();

// key -> expiresAt (timestamp)
const dedupeCache = new Map();

// Outbound Queue (Bounded)
const outboundQueue = [];
let processorRunning = false;

// ─────────────────────────────────────────────
// DEDUPE LAYER (FAIL-SAFE)
// ─────────────────────────────────────────────

// Global Prune Loop
setInterval(() => {
    const now = Date.now();

    // Safety Valve: If cache explodes, clear it entirely
    if (dedupeCache.size > MAX_DEDUPE_SIZE) {
        console.warn(`[TikTok] Dedupe cache exceeded ${MAX_DEDUPE_SIZE}, clearing all.`);
        dedupeCache.clear();
        return;
    }

    // Standard pruning
    for (const [key, expires] of dedupeCache.entries()) {
        if (expires < now) {
            dedupeCache.delete(key);
        }
    }
}, DEDUPE_PRUNE_INTERVAL_MS);

function isDuplicate(userId, type, data) {
    const msgId = data?.msgId || data?.subId;
    if (!msgId) return false;

    const key = `${userId}:${type}:${msgId}`;
    if (dedupeCache.has(key)) return true;

    dedupeCache.set(key, Date.now() + DEDUPE_TTL_MS);
    return false;
}

// ─────────────────────────────────────────────
// OUTBOUND DELIVERY (BOUNDED & BATCHED)
// ─────────────────────────────────────────────

function enqueueEnvelope(envelope) {
    if (outboundQueue.length >= MAX_QUEUE_SIZE) {
        // Drop oldest to keep queue fresh and bounded
        outboundQueue.shift();
    }
    outboundQueue.push(envelope);
    processQueue();
}

async function processQueue() {
    if (processorRunning) return;
    processorRunning = true;

    try {
        while (outboundQueue.length > 0) {
            const batch = outboundQueue.splice(0, MAX_BATCH_SIZE);

            await Promise.allSettled(batch.map(async (envelope) => {
                let timeout;
                try {
                    const controller = new AbortController();
                    timeout = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);

                    const res = await fetch(SCRAPBOT_INGEST_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(SHARED_SECRET ? { 'x-scrapbot-secret': SHARED_SECRET } : {})
                        },
                        body: JSON.stringify(envelope),
                        signal: controller.signal
                    });

                    if (!res.ok) {
                        // Fire-and-forget, but log 4xx/5xx briefly
                        // console.warn(`[TikTok] Ingest returned ${res.status}`);
                    }
                } catch (err) {
                    // console.warn(`[TikTok] Ingest error: ${err.name}`);
                } finally {
                    if (timeout) clearTimeout(timeout);
                }
            }));
        }
    } catch (err) {
        console.error("[TikTok] Queue processor crash:", err);
    } finally {
        processorRunning = false;
    }
}

// ─────────────────────────────────────────────
// CONNECTION STATE MACHINE
// ─────────────────────────────────────────────

function createConnectionState(userId, uniqueId) {
    return {
        userId,
        uniqueId,
        connection: null,
        status: 'idle',
        backoffMs: INITIAL_BACKOFF_MS,
        reconnectTimer: null
    };
}

/**
 * Transitions state to 'stopped', cleans up resources.
 */
function stopUser(state) {
    if (!state) return;

    state.status = 'stopped';

    // Clear timer
    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
    }

    // Teardown connection
    if (state.connection) {
        teardownConnectionInstance(state.connection);
        state.connection = null;
    }

    // Remove from map
    connections.delete(state.userId);
}

/**
 * Helper to safely dismantle a connection instance
 */
function teardownConnectionInstance(conn) {
    try {
        conn.disconnect();
        if (typeof conn.removeAllListeners === 'function') {
            conn.removeAllListeners();
        }
    } catch (e) {
        // Ignore cleanup errors
    }
}

/**
 * Main connect logic.
 * Safely handles existing connection replacement.
 */
function connectUser(state) {
    if (state.status === 'stopped') return;

    state.status = 'connecting';

    // 1. Ensure any old instance is dead
    if (state.connection) {
        teardownConnectionInstance(state.connection);
        state.connection = null;
    }

    // 2. Create FRESH instance
    const conn = new WebcastPushConnection(state.uniqueId);
    state.connection = conn;

    // 3. Attach Listeners (EXACTLY ONCE)

    // -- Lifecycle --
    conn.on('connected', (roomState) => {
        if (state.connection !== conn) return; // Stale check
        console.log(`[TikTok] Connected to @${state.uniqueId} (room: ${roomState.roomId})`);

        state.status = 'connected';
        state.backoffMs = INITIAL_BACKOFF_MS; // Reset backoff on success
    });

    conn.on('disconnected', () => {
        if (state.connection !== conn) return;
        console.warn(`[TikTok] Disconnected @${state.uniqueId}`);
        handleConnectionFailure(state);
    });

    conn.on('error', (err) => {
        if (state.connection !== conn) return;
        console.error(`[TikTok] Error @${state.uniqueId}:`, err?.message || 'Unknown error');
        handleConnectionFailure(state);
    });

    // -- Events --
    const handle = (type, data) => handleEvent(state.userId, type, data);

    conn.on('chat', d => handle('chat', d));
    conn.on('gift', d => handle('gift', d));
    conn.on('like', d => handle('like', d));
    conn.on('share', d => handle('share', d));
    conn.on('follow', d => handle('follow', d));
    conn.on('member', d => handle('member', d));

    // 4. Connect
    conn.connect().catch(err => {
        if (state.connection !== conn) return;
        console.error(`[TikTok] Connection Failed @${state.uniqueId}:`, err?.message || 'Unknown');
        handleConnectionFailure(state);
    });
}

function handleConnectionFailure(state) {
    if (state.status === 'stopped') return;

    state.status = 'reconnecting';

    // Teardown the failed instance immediately
    if (state.connection) {
        teardownConnectionInstance(state.connection);
        state.connection = null;
    }

    scheduleReconnect(state);
}

function scheduleReconnect(state) {
    if (state.status === 'stopped') return;
    if (state.reconnectTimer) return; // Already scheduled

    // Calculate delay with jitter
    const jitter = 1 - BACKOFF_JITTER + Math.random() * (BACKOFF_JITTER * 2);
    let delay = state.backoffMs * jitter;
    delay = Math.min(delay, MAX_BACKOFF_MS);

    console.log(`[TikTok] Reconnecting @${state.uniqueId} in ${Math.round(delay)}ms`);

    state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;

        // Increase backoff for next attempt
        state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);

        // Try again
        connectUser(state);
    }, delay);
}


// ─────────────────────────────────────────────
// EVENT HANDLING
// ─────────────────────────────────────────────

function handleEvent(userId, type, data) {
    if (isDuplicate(userId, type, data)) return;

    try {
        const envelope = buildChatEnvelopeV1FromTikTok({
            ownerUserId: userId,
            type,
            data
        });
        enqueueEnvelope(envelope);
    } catch (err) {
        console.error(`[TikTok] Envelope build error:`, err);
    }
}


// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export async function initTikTokIngestManager() {
    console.log("[TikTok] Initializing Ingest Manager...");

    const { rows } = await db.query(
        `SELECT user_id, unique_id FROM external_accounts WHERE platform = 'tiktok' AND enabled = true`
    );

    for (const row of rows) {
        if (connections.has(row.user_id)) {
            stopUser(connections.get(row.user_id));
        }

        const state = createConnectionState(row.user_id, row.unique_id);
        connections.set(row.user_id, state);
        connectUser(state);
    }

    console.log(`[TikTok] Started ${rows.length} connections.`);
}

export async function startTikTokIngest(userId) {
    // 1. Fully stop existing
    if (connections.has(userId)) {
        stopUser(connections.get(userId));
    }

    // 2. Re-read DB
    const { rows } = await db.query(
        `SELECT unique_id, enabled FROM external_accounts WHERE user_id = $1 AND platform = 'tiktok'`,
        [userId]
    );

    const row = rows[0];

    // 3. If disabled or missing, we are done (already stopped above)
    if (!row || !row.enabled) {
        return;
    }

    // 4. Start new details
    const state = createConnectionState(userId, row.unique_id);
    connections.set(userId, state);
    connectUser(state);
}
