// src/stakeMonitor/beaconLoop.js
// Runs inside OBS browser source on stake.com
// Polls scrapeStake() and POSTs to the dashboard beacon endpoint.
// Self-contained - no imports, designed to be injected as a standalone script.

(function () {
  'use strict';

  const BEACON_URL = window.STAKE_BEACON_URL || 'https://scraplet.store/api/stake-monitor/beacon';
  let token = window.WIDGET_BEACON_TOKEN || '';
  let sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  let running = true;
  let lastGameName = null;

  function parseAmount(el) {
    if (!el) return null;
    const text = (el.textContent || '').replace(/[^0-9.]/g, '');
    const n = parseFloat(text);
    return isFinite(n) ? n : null;
  }

  function parseMultiplier(el) {
    if (!el) return null;
    const text = (el.textContent || '').replace(/[^0-9.x]/gi, '').replace(/x/gi, '');
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
      const gameEl    = document.querySelector('[data-test="game-name"], .game-name, h1.title, [class*="game-title"]');
      const balanceEl = document.querySelector('[data-test="balance-amount"], [class*="balance-amount"], [class*="wallet-balance"]');
      const betEl     = document.querySelector('[data-test="bet-amount"], [class*="bet-amount"], [class*="bet-value"]');
      const winEl     = document.querySelector('[data-test="last-win-amount"], [class*="win-amount"], [class*="profit"]');
      const multEl    = document.querySelector('[data-test="multiplier-value"], [class*="multiplier"], [class*="payout"]');

      return {
        sessionId,
        ts: Date.now(),
        gameName:       gameEl    ? (gameEl.textContent || '').trim() || null : null,
        currentBalance: parseAmount(balanceEl),
        lastWin:        parseAmount(winEl),
        betSize:        parseAmount(betEl),
        multiplier:     parseMultiplier(multEl),
        pageUrl:        sanitiseUrl(window.location.href),
      };
    } catch (_) {
      return { sessionId, ts: Date.now(), gameName: null, currentBalance: null,
               lastWin: null, betSize: null, multiplier: null, pageUrl: 'unknown' };
    }
  }

  function allNull(payload) {
    return payload.currentBalance == null && payload.lastWin == null &&
           payload.betSize == null && payload.multiplier == null;
  }

  async function refreshToken() {
    try {
      const r = await fetch('/api/widget-token', { credentials: 'include' });
      if (r.ok) { const j = await r.json(); token = j.token || token; }
    } catch (_) {}
  }

  async function beacon() {
    if (!running) return;

    const payload = scrape();

    if (!allNull(payload)) {
      try {
        const r = await fetch(BEACON_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        if (r.status === 401) {
          await new Promise(res => setTimeout(res, 10000));
          await refreshToken();
        }
      } catch (_) { /* silent discard */ }
    }

    // Re-randomise interval each cycle (2000-3000ms)
    const interval = 2000 + Math.floor(Math.random() * 1000);
    setTimeout(beacon, interval);
  }

  // Start
  beacon();
})();
