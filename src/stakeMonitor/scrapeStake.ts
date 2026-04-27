// src/stakeMonitor/scrapeStake.ts
// Runs inside OBS browser source on stake.com
// Reads live casino data from the DOM synchronously.
// Never throws. Returns null for any field whose selector finds no element.

export interface StakePayload {
  gameName: string | null;
  currentBalance: number | null;
  lastWin: number | null;
  betSize: number | null;
  multiplier: number | null;
  pageUrl: string;
  ts: number;
}

function parseAmount(el: Element | null): number | null {
  if (!el) return null;
  const text = el.textContent?.replace(/[^0-9.]/g, '') ?? '';
  const n = parseFloat(text);
  return isFinite(n) ? n : null;
}

function parseMultiplier(el: Element | null): number | null {
  if (!el) return null;
  const text = el.textContent?.replace(/[^0-9.x]/gi, '').replace(/x/gi, '') ?? '';
  const n = parseFloat(text);
  return isFinite(n) ? n : null;
}

function sanitiseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return 'unknown';
  }
}

export function scrapeStake(): StakePayload {
  try {
    // Stake.com DOM selectors - update these if Stake changes their markup
    const gameEl    = document.querySelector('[data-test="game-name"], .game-name, h1.title');
    const balanceEl = document.querySelector('[data-test="balance-amount"], .balance-amount, [class*="balance"]');
    const betEl     = document.querySelector('[data-test="bet-amount"], .bet-amount, [class*="bet-value"]');
    const winEl     = document.querySelector('[data-test="last-win-amount"], .win-amount, [class*="win-amount"]');
    const multEl    = document.querySelector('[data-test="multiplier-value"], .multiplier, [class*="multiplier"]');

    return {
      gameName:       gameEl?.textContent?.trim() ?? null,
      currentBalance: parseAmount(balanceEl),
      lastWin:        parseAmount(winEl),
      betSize:        parseAmount(betEl),
      multiplier:     parseMultiplier(multEl),
      pageUrl:        sanitiseUrl(typeof window !== 'undefined' ? window.location.href : ''),
      ts:             Date.now(),
    };
  } catch {
    return {
      gameName: null, currentBalance: null, lastWin: null,
      betSize: null, multiplier: null,
      pageUrl: 'unknown', ts: Date.now(),
    };
  }
}
