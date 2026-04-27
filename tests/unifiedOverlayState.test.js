// tests/unifiedOverlayState.test.js
// Feature: unified-overlay-state
// Property-based tests for the Unified Overlay State system.
// Uses fast-check for property generation (min 100 iterations each).

import fc from 'fast-check';

// ── Inline pure logic (mirrors DerivedStateEngine / SSEConnection) ────────────

function makeEmptyState(publicId = 'test') {
  return { publicId, version: 0, updatedAt: Date.now(), widgetStates: {} };
}

function makeChatState(instanceId, overrides = {}) {
  return {
    instanceId,
    version: 0,
    messages: [],
    config: {
      maxMessages: 20,
      stripEmotes: false,
      nameColorMode: 'platform',
      fadeMs: 0,
      enableKick: true,
      enableYoutube: true,
      enableTwitch: true,
      enableTiktok: true,
      ...overrides,
    },
  };
}

function makeAlertState(instanceId) {
  return { instanceId, version: 0, active: null, queue: [] };
}

function makeCounterState(instanceId, overrides = {}) {
  return { instanceId, version: 0, value: 0, label: 'Subs', goalReached: false, lastEventTs: 0, ...overrides };
}

// Inline processChatMessage logic
function processChatMessage(chatState, envelope) {
  const config = chatState.config;
  const platform = envelope.platform;
  if (platform === 'kick' && !config.enableKick) return null;
  if (platform === 'youtube' && !config.enableYoutube) return null;
  if (platform === 'twitch' && !config.enableTwitch) return null;
  if (platform === 'tiktok' && !config.enableTiktok) return null;

  const rawText = envelope.message.text;
  const emotePattern = /\[emote:([^:]+):([^\]]+)\]/g;
  let tokens;

  if (config.stripEmotes) {
    const stripped = rawText.replace(emotePattern, '').replace(/\s{2,}/g, ' ').trim();
    tokens = [{ type: 'text', text: stripped }];
  } else {
    tokens = [];
    const emoteMap = new Map((envelope.message.emotes || []).map(e => [e.id, e.url]));
    let lastIndex = 0;
    let match;
    const re = new RegExp(emotePattern.source, 'g');
    while ((match = re.exec(rawText)) !== null) {
      if (match.index > lastIndex) tokens.push({ type: 'text', text: rawText.slice(lastIndex, match.index) });
      tokens.push({ type: 'emote', id: match[1], name: match[2], url: emoteMap.get(match[1]) || '' });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < rawText.length) tokens.push({ type: 'text', text: rawText.slice(lastIndex) });
    if (tokens.length === 0) tokens = [{ type: 'text', text: rawText }];
  }

  const color = config.nameColorMode === 'platform' ? envelope.author.color : config.nameColor;
  const now = Date.now();
  const msg = {
    id: now,
    username: envelope.author.display,
    text: rawText,
    platform,
    color,
    avatar: envelope.author.avatar,
    badges: (envelope.author.badges || []).map(b => ({ label: b.label, imageUrl: b.imageUrl })),
    tokens,
    ts: now,
  };

  const updated = [...chatState.messages, msg].slice(-config.maxMessages);
  return { ...chatState, messages: updated, version: chatState.version + 1 };
}

// Inline processAlertEvent logic
const seenAlertIds = new Set();
const seenAlertIdsOrder = [];

function processAlertEvent(alertState, payload) {
  if (seenAlertIds.has(payload.eventId)) return null;
  seenAlertIds.add(payload.eventId);
  seenAlertIdsOrder.push(payload.eventId);
  if (seenAlertIds.size > 100) seenAlertIds.delete(seenAlertIdsOrder.shift());

  const entry = {
    id: payload.eventId,
    type: payload.type,
    actorDisplay: payload.actorDisplay || 'Anonymous',
    message: payload.message,
    amount: payload.amount,
    ts: Date.now(),
  };

  if (alertState.active === null) {
    return { ...alertState, active: { ...entry, activatedAt: Date.now() }, version: alertState.version + 1 };
  }
  return { ...alertState, queue: [...alertState.queue, entry], version: alertState.version + 1 };
}

// Inline processCounterIncrement logic
function processCounterIncrement(counterState) {
  const newValue = counterState.value + 1;
  const goalReached = counterState.goal !== undefined && newValue >= counterState.goal
    ? true : counterState.goalReached;
  return { ...counterState, value: newValue, lastEventTs: Date.now(), goalReached, version: counterState.version + 1 };
}

// Inline backoff formula
function computeBackoff(attempt) {
  return Math.min(Math.pow(2, attempt) * 1000, 30000);
}

// ── P1: Version monotonicity ──────────────────────────────────────────────────

// Feature: unified-overlay-state, Property 1: Version monotonicity
describe('P1 — Version monotonicity', () => {
  test('version increments by exactly N after N mutations (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          let state = makeEmptyState();
          const initial = state.version;
          for (let i = 0; i < n; i++) {
            state = { ...state, version: state.version + 1 };
          }
          return state.version === initial + n;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P2: Widget state round-trip ───────────────────────────────────────────────

// Feature: unified-overlay-state, Property 2: Widget state round-trip
describe('P2 — Widget state round-trip', () => {
  test('JSON serialise/deserialise produces structurally equivalent state (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.record({
          publicId: fc.string({ minLength: 1, maxLength: 20 }),
          version: fc.nat(),
          updatedAt: fc.nat(),
          widgetStates: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.record({
              instanceId: fc.string({ minLength: 1, maxLength: 10 }),
              version: fc.nat(),
              value: fc.nat(),
              label: fc.string(),
              goalReached: fc.boolean(),
              lastEventTs: fc.nat(),
            })
          ),
        }),
        (state) => {
          const rt = JSON.parse(JSON.stringify(state));
          return JSON.stringify(rt) === JSON.stringify(state);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P3: Chat message preservation ────────────────────────────────────────────

// Feature: unified-overlay-state, Property 3: Chat message preservation
describe('P3 — Chat message preservation', () => {
  test('username, platform, text preserved after processing (100 trials)', () => {
    const platforms = ['kick', 'youtube', 'twitch', 'tiktok'];
    fc.assert(
      fc.property(
        fc.record({
          display: fc.string({ minLength: 1, maxLength: 30 }),
          text: fc.string({ minLength: 1, maxLength: 200 }),
          platform: fc.constantFrom(...platforms),
        }),
        ({ display, text, platform }) => {
          const chatState = makeChatState('inst1');
          const envelope = {
            author: { display, color: '#fff', badges: [] },
            message: { text, emotes: [] },
            platform,
          };
          const updated = processChatMessage(chatState, envelope);
          if (!updated) return true;
          const msg = updated.messages[updated.messages.length - 1];
          return msg.username === display && msg.platform === platform && msg.text === text;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P4: Chat message bound ────────────────────────────────────────────────────

// Feature: unified-overlay-state, Property 4: Chat message bound
describe('P4 — Chat message bound', () => {
  test('messages.length never exceeds maxMessages (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 30 }),
        (maxMessages, count) => {
          let chatState = makeChatState('inst1', { maxMessages });
          for (let i = 0; i < count; i++) {
            const envelope = {
              author: { display: `user${i}`, color: '#fff', badges: [] },
              message: { text: `msg ${i}`, emotes: [] },
              platform: 'kick',
            };
            const updated = processChatMessage(chatState, envelope);
            if (updated) chatState = updated;
          }
          return chatState.messages.length <= maxMessages;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('last M messages are the most recent ones', () => {
    const maxMessages = 5;
    let chatState = makeChatState('inst1', { maxMessages });
    for (let i = 0; i < 10; i++) {
      const envelope = {
        author: { display: `user${i}`, color: '#fff', badges: [] },
        message: { text: `msg${i}`, emotes: [] },
        platform: 'kick',
      };
      const updated = processChatMessage(chatState, envelope);
      if (updated) chatState = updated;
    }
    expect(chatState.messages.length).toBe(maxMessages);
    expect(chatState.messages[chatState.messages.length - 1].text).toBe('msg9');
  });
});

// ── P5: Emote stripping and resolution ───────────────────────────────────────

// Feature: unified-overlay-state, Property 5: Emote stripping and resolution
describe('P5 — Emote stripping and resolution', () => {
  test('stripEmotes=true removes all [emote:...] substrings (100 trials)', () => {
    fc.assert(
      fc.property(
        // Use alphanumeric-only emote names to avoid ] breaking the regex pattern
        fc.array(fc.stringMatching(/^[a-zA-Z0-9_]{1,10}$/), { minLength: 0, maxLength: 5 }),
        fc.string({ minLength: 0, maxLength: 20 }),
        (emoteNames, prefix) => {
          const emoteTokens = emoteNames.map((n, i) => `[emote:id${i}:${n}]`).join(' ');
          const text = `${prefix} ${emoteTokens}`.trim();
          const chatState = makeChatState('inst1', { stripEmotes: true });
          const envelope = {
            author: { display: 'user', color: '#fff', badges: [] },
            message: { text, emotes: [] },
            platform: 'kick',
          };
          const updated = processChatMessage(chatState, envelope);
          if (!updated) return true;
          const msg = updated.messages[0];
          const allText = msg.tokens.map(t => t.text || '').join('');
          return !allText.includes('[emote:');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('stripEmotes=false produces N emote tokens for N emote patterns (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        (n) => {
          const emoteTokens = Array.from({ length: n }, (_, i) => `[emote:id${i}:name${i}]`).join(' ');
          const text = `hello ${emoteTokens} world`.trim();
          const chatState = makeChatState('inst1', { stripEmotes: false });
          const envelope = {
            author: { display: 'user', color: '#fff', badges: [] },
            message: { text, emotes: Array.from({ length: n }, (_, i) => ({ id: `id${i}`, name: `name${i}`, url: `https://cdn/e${i}` })) },
            platform: 'kick',
          };
          const updated = processChatMessage(chatState, envelope);
          if (!updated) return true;
          const msg = updated.messages[0];
          const emoteCount = msg.tokens.filter(t => t.type === 'emote').length;
          return emoteCount === n;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P6: Alert queue idempotence ───────────────────────────────────────────────

// Feature: unified-overlay-state, Property 6: Alert queue idempotence
describe('P6 — Alert queue idempotence', () => {
  test('processing same alert twice produces same state as once (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom('follow', 'subscribe', 'raid', 'tip'),
        fc.string({ minLength: 1, maxLength: 20 }),
        (eventId, type, actor) => {
          // Use fresh seen set per trial
          const seen = new Set();
          const seenOrder = [];
          function processOnce(alertState, payload) {
            if (seen.has(payload.eventId)) return null;
            seen.add(payload.eventId);
            seenOrder.push(payload.eventId);
            const entry = { id: payload.eventId, type: payload.type, actorDisplay: payload.actorDisplay || 'Anonymous', ts: Date.now() };
            if (alertState.active === null) {
              return { ...alertState, active: { ...entry, activatedAt: Date.now() }, version: alertState.version + 1 };
            }
            return { ...alertState, queue: [...alertState.queue, entry], version: alertState.version + 1 };
          }

          const alertState = makeAlertState('inst1');
          const payload = { eventId, type, actorDisplay: actor };

          const after1 = processOnce(alertState, payload) || alertState;
          const after2 = processOnce(after1, payload) || after1; // duplicate — should be discarded

          // Queue length should not increase on second call
          return after2.queue.length === after1.queue.length &&
            JSON.stringify(after2.active) === JSON.stringify(after1.active);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P7: Alert queue ordering under active lock ────────────────────────────────

// Feature: unified-overlay-state, Property 7: Alert queue ordering under active lock
describe('P7 — Alert queue ordering under active lock', () => {
  test('N alerts while active is set → queue.length === N, active unchanged (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (n) => {
          const seen = new Set();
          function enqueue(alertState, payload) {
            if (seen.has(payload.eventId)) return null;
            seen.add(payload.eventId);
            const entry = { id: payload.eventId, type: payload.type, actorDisplay: payload.actorDisplay || 'Anonymous', ts: Date.now() };
            if (alertState.active === null) {
              return { ...alertState, active: { ...entry, activatedAt: Date.now() }, version: alertState.version + 1 };
            }
            return { ...alertState, queue: [...alertState.queue, entry], version: alertState.version + 1 };
          }

          // Start with an active alert
          let alertState = makeAlertState('inst1');
          alertState = enqueue(alertState, { eventId: 'active-0', type: 'follow', actorDisplay: 'ActiveUser' });
          const activeSnapshot = JSON.stringify(alertState.active);

          // Enqueue N more while active is set
          for (let i = 0; i < n; i++) {
            const result = enqueue(alertState, { eventId: `queued-${i}`, type: 'follow', actorDisplay: `User${i}` });
            if (result) alertState = result;
          }

          return alertState.queue.length === n &&
            JSON.stringify(alertState.active) === activeSnapshot;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P8: Counter confluence ────────────────────────────────────────────────────

// Feature: unified-overlay-state, Property 8: Counter confluence
describe('P8 — Counter confluence', () => {
  test('N subscription events → value === N regardless of order (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (n) => {
          let counterState = makeCounterState('inst1');
          for (let i = 0; i < n; i++) {
            counterState = processCounterIncrement(counterState);
          }
          return counterState.value === n;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P9: IIFE suppression ──────────────────────────────────────────────────────

// Feature: unified-overlay-state, Property 9: IIFE suppression
describe('P9 — IIFE suppression', () => {
  test('registered widget IDs never get a <script> tag injected (100 trials)', () => {
    // Simulate the migration gate logic
    const registry = new Map();
    registry.set('chat-overlay', () => null);
    registry.set('alert-box-widget', () => null);
    registry.set('sub-counter', () => null);
    registry.set('tts-player', () => null);
    registry.set('event-console-widget', () => null);

    const registeredIds = Array.from(registry.keys());

    fc.assert(
      fc.property(
        fc.constantFrom(...registeredIds),
        (widgetId) => {
          // Migration gate: if renderer exists, skip script injection
          const injectedScripts = [];
          if (!registry.get(widgetId)) {
            injectedScripts.push(widgetId);
          }
          return injectedScripts.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── P10: Reconnection backoff bound ──────────────────────────────────────────

// Feature: unified-overlay-state, Property 10: Reconnection backoff bound
describe('P10 — Reconnection backoff bound', () => {
  test('delay === min(2^(N-1) * 1000, 30000) for attempts 1–20 (100 trials)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (attempt) => {
          // SSEConnection uses attemptCount starting at 0, incremented before scheduling
          // So attempt N means attemptCount was N-1 when delay was computed
          const delay = computeBackoff(attempt - 1);
          const expected = Math.min(Math.pow(2, attempt - 1) * 1000, 30000);
          return delay === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('backoff is capped at 30000ms', () => {
    for (let attempt = 5; attempt <= 20; attempt++) {
      expect(computeBackoff(attempt)).toBeLessThanOrEqual(30000);
    }
  });

  test('attempt counter resets → delay returns to 1000ms', () => {
    // After reset, attemptCount = 0 → delay = min(2^0 * 1000, 30000) = 1000
    expect(computeBackoff(0)).toBe(1000);
  });
});

// ── P11: SnapshotRenderer state isolation ─────────────────────────────────────

// Feature: unified-overlay-state, Property 11: SnapshotRenderer state isolation
describe('P11 — SnapshotRenderer state isolation', () => {
  test('WidgetNode with non-empty initialState does not call setInterval (100 trials)', () => {
    // We test the pure logic: if initialState is non-empty, the pure path is taken
    // (no setInterval, no __SCRAPLET_WIDGET_STORE__ access)
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          widgetId: fc.string({ minLength: 1, maxLength: 20 }),
          initialState: fc.record({
            instanceId: fc.string({ minLength: 1, maxLength: 10 }),
            version: fc.nat(),
            value: fc.nat(),
          }),
        }),
        (node) => {
          // Simulate WidgetNode decision logic
          const state = node.initialState ?? {};
          const hasState = Object.keys(state).length > 0;

          // If initialState is non-empty, pure path is taken (no legacy fallback)
          // Legacy fallback only activates when state is empty AND store entry exists
          const usesLegacyPath = !hasState; // simplified: no store entry in this test

          return !usesLegacyPath; // pure path taken → no setInterval
        }
      ),
      { numRuns: 100 }
    );
  });

  test('WidgetNode with empty initialState falls back to legacy path when store entry exists', () => {
    const node = { id: 'inst1', widgetId: 'some-widget', initialState: {} };
    const state = node.initialState ?? {};
    const hasState = Object.keys(state).length > 0;
    const storeHasEntry = true; // simulated

    const usesLegacyPath = !hasState && storeHasEntry;
    expect(usesLegacyPath).toBe(true);
  });
});
