// public/widgets/stake-monitor.js
// Runs inside OBS Chromium browser source on stake.com
// Beacons live casino data to the Scraplet dashboard every 2-3 seconds.
// Self-contained — no imports, no build step required.

(function () {
  'use strict';

  // Injected by OBS custom JS or query param
  const BEACON_URL = window.SCRAPLET_BEACON_URL || 
    (new URLSearchParams(window.location.search).get('beacon') || null);
  const SESSION_ID = crypto.randomUUID ? crypto.randomUUID() : 
    Math.random().toString(36).slice(2);

  let widgetToken = window.SCRAPLET_WIDGET_TOKEN || 
    new URLSearchParams(window.location.search).get('token') || null;

  if (!BEACON_URL) {
    console.warn('[StakeMonitor] No BEACON_URL configured. Set window.SCRAPLET_BEACON_URL or ?beacon= param.');
    return;
  }

  function parseAmount(el) {
    if (!el) return null;
    const text = (el.textContent || '').replace(/[^0-9.]/g, '');
    const n = parseFloat(text);
    return isFinite(n) ? n : null;
  }

  function parseMultiplier(el) {
    if (!el) return null;
    const text = (el.textContent || '').replace(/[^0-9.]/gi, '');
    const n = parseFloat(text);
    return isFinite(n) ? n : null;
  }

  function sanitiseUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch (_) { return 'unknown'; }
  }

  function scrape() {
    try {
      const gameEl    = document.querySelector('[data-test="game-name"], .game-name, h1.title, [class*="gameName"]');
      const balanceEl = document.querySelector('[data-test="balance-amount"], [class*="balance"]:not([class*="label"])');
      const betEl     = document.querySelector('[data-test="bet-amount"], [class*="betAmount"], [class*="bet-value"]');
      const winEl     = document.querySelector('[data-test="last-win-amount"], [class*="winAmount"], [class*="win-amount"]');
      const multEl    = document.querySelector('[data-test="multiplier-value"], [class*="multiplier"]:not([class*="label"])');

      return {
        sessionId:      SESSION_ID,
        ts:             Date.now(),
        gameName:       gameEl  ? (gameEl.textContent || '').trim() || null : null,
        currentBalance: parseAmount(balanceEl),
        lastWin:        parseAmount(winEl),
        betSize:        parseAmount(betEl),
        multiplier:     parseMultiplier(multEl),
        pageUrl:        sanitiseUrl(window.location.href),
      };
    } catch (_) {
      return { sessionId: SESSION_ID, ts: Date.now(), gameName: null,
               currentBalance: null, lastWin: null, betSize: null,
               multiplier: null, pageUrl: 'unknown' };
    }
  }

  function allNull(payload) {
    return payload.gameName === null &&
           payload.currentBalance === null &&
           payload.lastWin === null &&
           payload.betSize === null &&
           payload.multiplier === null;
  }

  async function refreshToken() {
    try {
      const base = BEACON_URL.replace('/api/stake-monitor/beacon', '');
      const r = await fetch(base + '/api/widget-token?widget=stake-monitor');
      if (r.ok) {
        const j = await r.json();
        if (j.token) { widgetToken = j.token; return true; }
      }
    } catch (_) {}
    return false;
  }

  async function beacon() {
    const payload = scrape();
    if (allNull(payload)) return;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (widgetToken) headers['Authorization'] = 'Bearer ' + widgetToken;

      const r = await fetch(BEACON_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      });

      if (r.status === 401) {
        console.warn('[StakeMonitor] 401 — refreshing token in 10s');
        await new Promise(res => setTimeout(res, 10000));
        await refreshToken();
      }
    } catch (_) {
      // Silent — network errors don't stop the loop
    }
  }

  function scheduleNext() {
    const interval = 2000 + Math.random() * 1000; // 2000-3000ms
    setTimeout(async () => {
      await beacon();
      scheduleNext();
    }, interval);
  }

  // Start
  scheduleNext();
  console.log('[StakeMonitor] Beacon loop started. Session:', SESSION_ID);
})();