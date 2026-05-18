// services/twitchChatIngest.js
//
// Persistent Twitch IRC chat ingestion per dashboard user.
// Connects to irc.chat.twitch.tv using the user's OAuth access token,
// listens for PRIVMSG, builds ChatEnvelopeV1, and inserts into chat_outbox.
// Pattern mirrors tiktokChatIngest.js.

import net from "net";
import db from "../db.js";
import { buildChatEnvelopeV1FromTwitch } from "../src/ingest/buildChatEnvelopeV1.js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const IRC_HOST = "irc.chat.twitch.tv";
const IRC_PORT = 6667;

const INITIAL_BACKOFF_MS  = 3_000;
const MAX_BACKOFF_MS      = 120_000;
const PING_INTERVAL_MS    = 4 * 60 * 1000; // Twitch drops idle connections after 5min
const DEDUPE_TTL_MS       = 15_000;
const DEDUPE_PRUNE_MS     = 30_000;
const MAX_DEDUPE_SIZE     = 20_000;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
// userId → ConnectionState
const connections = new Map();
const dedupeCache = new Map();

setInterval(() => {
  const now = Date.now();
  if (dedupeCache.size > MAX_DEDUPE_SIZE) { dedupeCache.clear(); return; }
  for (const [k, exp] of dedupeCache) { if (exp < now) dedupeCache.delete(k); }
}, DEDUPE_PRUNE_MS);

function isDupe(id) {
  if (dedupeCache.has(id)) return true;
  dedupeCache.set(id, Date.now() + DEDUPE_TTL_MS);
  return false;
}

// ─────────────────────────────────────────────
// IRC PARSING
// ─────────────────────────────────────────────
// Parse a raw IRC line into { tags, prefix, command, params }
function parseIrcLine(raw) {
  let rest = raw.trim();
  const parsed = { tags: {}, prefix: null, command: null, params: [] };

  // Tags (@key=val;key=val)
  if (rest.startsWith("@")) {
    const spaceIdx = rest.indexOf(" ");
    const tagStr = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
    for (const part of tagStr.split(";")) {
      const [k, ...vs] = part.split("=");
      parsed.tags[k] = vs.join("=").replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\\\/g, "\\");
    }
  }

  // Prefix (:nick!user@host)
  if (rest.startsWith(":")) {
    const spaceIdx = rest.indexOf(" ");
    parsed.prefix = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }

  // Command + params
  const parts = rest.split(" ");
  parsed.command = parts[0].toUpperCase();
  let i = 1;
  while (i < parts.length) {
    if (parts[i].startsWith(":")) {
      parsed.params.push(parts.slice(i).join(" ").slice(1));
      break;
    }
    parsed.params.push(parts[i]);
    i++;
  }

  return parsed;
}

// ─────────────────────────────────────────────
// CONNECTION STATE MACHINE
// ─────────────────────────────────────────────
function makeState(userId, channelLogin, accessToken) {
  return {
    userId,
    channelLogin: channelLogin.toLowerCase(),
    accessToken,
    socket: null,
    status: "idle",          // idle | connecting | connected | reconnecting | stopped
    backoffMs: INITIAL_BACKOFF_MS,
    reconnectTimer: null,
    pingTimer: null,
    buf: "",
  };
}

function teardownSocket(state) {
  if (state.pingTimer)    { clearInterval(state.pingTimer); state.pingTimer = null; }
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  if (state.socket) {
    try { state.socket.destroy(); } catch (_) {}
    state.socket = null;
  }
  state.buf = "";
}

function stopUser(state) {
  if (!state) return;
  state.status = "stopped";
  teardownSocket(state);
  connections.delete(state.userId);
  console.log(`[TwitchIRC] Stopped ingest for user ${state.userId} (#${state.channelLogin})`);
}

function scheduleReconnect(state) {
  if (state.status === "stopped") return;
  if (state.reconnectTimer) return;

  const jitter  = 0.8 + Math.random() * 0.4;
  const delay   = Math.min(state.backoffMs * jitter, MAX_BACKOFF_MS);
  state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
  state.status  = "reconnecting";

  console.log(`[TwitchIRC] Reconnecting user ${state.userId} in ${Math.round(delay)}ms`);
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connect(state);
  }, delay);
}

function connect(state) {
  if (state.status === "stopped") return;
  teardownSocket(state);
  state.status = "connecting";

  const socket = net.createConnection({ host: IRC_HOST, port: IRC_PORT });
  state.socket = socket;

  socket.setEncoding("utf8");
  socket.setTimeout(90_000); // 90s read timeout

  socket.on("connect", () => {
    if (state.socket !== socket) { socket.destroy(); return; }
    // Twitch IRC handshake
    socket.write(`PASS oauth:${state.accessToken}\r\n`);
    socket.write(`NICK ${state.channelLogin}\r\n`);
    socket.write(`CAP REQ :twitch.tv/tags twitch.tv/commands\r\n`);
    socket.write(`JOIN #${state.channelLogin}\r\n`);
  });

  socket.on("data", (chunk) => {
    if (state.socket !== socket) return;
    state.buf += chunk;
    const lines = state.buf.split("\r\n");
    state.buf = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line) continue;
      handleLine(state, line);
    }
  });

  socket.on("timeout", () => {
    console.warn(`[TwitchIRC] Socket timeout for user ${state.userId}`);
    socket.destroy();
  });

  socket.on("error", (err) => {
    if (state.socket !== socket) return;
    console.error(`[TwitchIRC] Socket error user ${state.userId}:`, err.message);
    socket.destroy();
  });

  socket.on("close", () => {
    if (state.socket !== socket) return;
    console.warn(`[TwitchIRC] Connection closed for user ${state.userId}`);
    teardownSocket(state);
    scheduleReconnect(state);
  });
}

function handleLine(state, raw) {
  const msg = parseIrcLine(raw);

  switch (msg.command) {
    case "PING":
      // Reply immediately to keep connection alive
      state.socket?.write(`PONG :${msg.params[0] || "tmi.twitch.tv"}\r\n`);
      break;

    case "001":
      // RPL_WELCOME — we're logged in
      state.status = "connected";
      state.backoffMs = INITIAL_BACKOFF_MS;
      console.log(`[TwitchIRC] Connected for user ${state.userId} (#${state.channelLogin})`);

      // Start keepalive PING
      if (state.pingTimer) clearInterval(state.pingTimer);
      state.pingTimer = setInterval(() => {
        if (state.socket?.writable) {
          state.socket.write("PING :tmi.twitch.tv\r\n");
        }
      }, PING_INTERVAL_MS);
      break;

    case "NOTICE":
      // Auth failure notices
      if (msg.params[1]?.includes("Login authentication failed") ||
          msg.params[1]?.includes("Improperly formatted auth")) {
        console.error(`[TwitchIRC] Auth failed for user ${state.userId} — token may be expired`);
        stopUser(state); // Don't retry on auth failure
      }
      break;

    case "PRIVMSG": {
      const channel  = msg.params[0]; // e.g. #therealscraplet
      const text     = msg.params[1];
      const tags     = msg.tags;
      const msgId    = tags["id"] || `${Date.now()}-${Math.random()}`;

      if (isDupe(msgId)) break;

      const authorLogin   = msg.prefix?.split("!")[0] || "unknown";
      const authorDisplay = tags["display-name"] || authorLogin;
      const authorUserId  = tags["user-id"]      || null;
      const channelSlug   = channel.replace(/^#/, "");

      const badgeStr  = tags["badges"] || "";
      const role      = badgeStr.includes("broadcaster") ? "broadcaster"
                      : badgeStr.includes("moderator")   ? "moderator"
                      : badgeStr.includes("vip")         ? "vip"
                      : "viewer";

      const chat_v1 = buildChatEnvelopeV1FromTwitch({
        ownerUserId:          state.userId,
        channelSlug,
        platformChannelId:    channelSlug,
        messageId:            msgId,
        messageText:          text,
        messageTs:            new Date().toISOString(),
        authorUsername:       authorLogin,
        authorDisplay,
        authorPlatformUserId: authorUserId,
        role,
        badges:               badgeStr ? badgeStr.split(",").map(b => ({ text: b.split("/")[0] })) : [],
        ingest:               "irc",
        supervisorId:         "dashboard:twitch-irc",
        platformPayload:      { tags, channel, raw },
        raw,
      });

      insertToOutbox(chat_v1).catch(err =>
        console.error("[TwitchIRC] outbox insert error:", err.message)
      );
      break;
    }

    default:
      break;
  }
}

async function insertToOutbox(chat_v1) {
  const eventId = chat_v1.id;
  await db.query(
    `INSERT INTO public.chat_outbox (event_id, payload)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, JSON.stringify({ chat_v1 })]
  );
}

// ─────────────────────────────────────────────
// TOKEN LOOKUP
// ─────────────────────────────────────────────
async function getTwitchTokenForUser(userId) {
  const { rows } = await db.query(
    `SELECT t.access_token, ea.username AS channel_login
     FROM external_account_tokens t
     JOIN external_accounts ea ON ea.id = t.external_account_id
     WHERE ea.user_id = $1
       AND ea.platform = 'twitch'
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

/**
 * Start (or restart) Twitch IRC ingest for a single user.
 * Called after OAuth completes.
 */
export async function startTwitchChatIngest(userId) {
  // Stop any existing connection first
  if (connections.has(userId)) {
    stopUser(connections.get(userId));
  }

  const row = await getTwitchTokenForUser(userId);
  if (!row?.access_token || !row?.channel_login) {
    console.warn(`[TwitchIRC] No token/channel found for user ${userId}, skipping`);
    return { ok: false, reason: "no_token" };
  }

  const state = makeState(userId, row.channel_login, row.access_token);
  connections.set(userId, state);
  connect(state);
  return { ok: true, channel: row.channel_login };
}

/**
 * Stop Twitch IRC ingest for a single user.
 * Called on disconnect.
 */
export function stopTwitchChatIngest(userId) {
  if (connections.has(userId)) {
    stopUser(connections.get(userId));
    return { ok: true };
  }
  return { ok: false, reason: "not_running" };
}

/**
 * Boot all users that have a valid Twitch token at server startup.
 */
export async function initTwitchChatIngest() {
  console.log("[TwitchIRC] Initializing Ingest Manager...");

  const { rows } = await db.query(
    `SELECT DISTINCT ea.user_id
     FROM external_accounts ea
     JOIN external_account_tokens t ON t.external_account_id = ea.id
     WHERE ea.platform = 'twitch'
     ORDER BY ea.user_id`
  );

  let started = 0;
  for (const row of rows) {
    const result = await startTwitchChatIngest(row.user_id);
    if (result.ok) started++;
  }

  console.log(`[TwitchIRC] Started ${started}/${rows.length} connection(s).`);
}

/**
 * Return connection status for all active users (for dashboard status API).
 */
export function getTwitchIngestStatus() {
  const out = {};
  for (const [userId, state] of connections) {
    out[userId] = { channel: state.channelLogin, status: state.status };
  }
  return out;
}
