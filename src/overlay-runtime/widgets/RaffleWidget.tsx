/**
 * RaffleWidget.tsx
 * Declarative React renderer for the Raffle widget.
 * Consumes state emitted by raffle.js.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface RaffleEntry { username: string; platform: string; tickets: number; }

interface RaffleState {
  phase: 'idle' | 'open' | 'spinning' | 'winner';
  entries: RaffleEntry[];
  winner?: RaffleEntry;
  spinItems?: string[]; // items shown during spin animation
  spinIndex?: number;
  // Config
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  accentColor: string;
  bgColor: string;
  winnerColor: string;
  borderRadius: number;
  showStatus: boolean;
  showCount: boolean;
  showJoinCmd: boolean;
  joinCommand: string;
}

const PLATFORM_ICONS: Record<string, string> = { kick: '🟢', youtube: '▶️', twitch: '💜' };

const KEYFRAMES = `
  @keyframes rf-winner { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
  @keyframes rf-spin   { 0%{transform:translateY(0)} 100%{transform:translateY(-100%)} }
  @keyframes rf-pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
`;

export function RaffleWidget({ state }: WidgetRendererProps) {
  const cfg = state as RaffleState;
  const phase = cfg.phase ?? 'idle';

  const wrapStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: cfg.bgColor ?? 'rgba(0,0,0,0.85)',
    borderRadius: cfg.borderRadius ?? 16,
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    color: cfg.textColor ?? '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative',
  };

  if (phase === 'idle') {
    return (
      <div style={wrapStyle}>
        <div style={{ fontSize: cfg.fontSizePx ?? 18, opacity: 0.4 }}>Raffle not active</div>
      </div>
    );
  }

  if (phase === 'winner' && cfg.winner) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div style={wrapStyle}>
          <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.7), opacity: 0.6, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>🎉 Winner!</div>
          <div style={{
            fontSize: Math.round((cfg.fontSizePx ?? 18) * 1.8),
            fontWeight: 800,
            color: cfg.winnerColor ?? '#fbbf24',
            textShadow: `0 0 20px ${cfg.winnerColor ?? '#fbbf24'}`,
            animation: 'rf-winner 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}>
            {PLATFORM_ICONS[cfg.winner.platform] ?? ''} {cfg.winner.username}
          </div>
          {cfg.winner.tickets > 1 && (
            <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.75), opacity: 0.6, marginTop: 6 }}>
              {cfg.winner.tickets} tickets
            </div>
          )}
        </div>
      </>
    );
  }

  if (phase === 'spinning' && cfg.spinItems) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div style={wrapStyle}>
          <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.7), opacity: 0.6, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em', animation: 'rf-pulse 0.4s ease infinite' }}>
            🎰 Drawing...
          </div>
          <div style={{ fontSize: cfg.fontSizePx ?? 18, fontWeight: 700, color: cfg.accentColor ?? '#6366f1', height: (cfg.fontSizePx ?? 18) * 1.5, overflow: 'hidden', textAlign: 'center' }}>
            {cfg.spinItems[cfg.spinIndex ?? 0] ?? '...'}
          </div>
        </div>
      </>
    );
  }

  // Open phase
  const entries = cfg.entries ?? [];
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={wrapStyle}>
        {cfg.showStatus && (
          <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.75), color: cfg.accentColor ?? '#6366f1', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            🎟 Raffle Open
          </div>
        )}
        {cfg.showJoinCmd && (
          <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.85), opacity: 0.7, marginBottom: 8 }}>
            Type <strong style={{ color: cfg.accentColor ?? '#6366f1' }}>{cfg.joinCommand ?? '!join'}</strong> to enter
          </div>
        )}
        {cfg.showCount && (
          <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 1.4), fontWeight: 800 }}>
            {entries.length} <span style={{ fontSize: '0.6em', opacity: 0.6 }}>entries</span>
          </div>
        )}
        {entries.length > 0 && entries.length <= 8 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
            {entries.slice(0, 8).map((e, i) => (
              <div key={i} style={{ fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.7), background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 8px' }}>
                {PLATFORM_ICONS[e.platform] ?? ''} {e.username}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
