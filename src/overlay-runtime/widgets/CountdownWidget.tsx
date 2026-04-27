/**
 * CountdownWidget.tsx
 * Declarative React renderer for the Countdown widget.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface CountdownState {
  mode: 'datetime' | 'duration';
  targetMs?: number;       // epoch ms for datetime mode
  durationMs?: number;     // total duration for duration mode
  startedAt?: number;      // epoch ms when duration started
  label: string;
  showLabel: boolean;
  showDays: boolean;
  showHours: boolean;
  showMinutes: boolean;
  showSeconds: boolean;
  showUnits: boolean;
  showBar: boolean;
  endMessage: string;
  showEndMsg: boolean;
  urgentSec: number;
  layout: 'blocks' | 'inline' | 'minimal';
  separatorChar: string;
  fontFamily: string;
  fontSizePx: number;
  labelSizePx: number;
  textColor: string;
  bgColor: string;
  blockBg: string;
  accentColor: string;
  urgentColor: string;
  borderRadius: number;
}

const KEYFRAMES = `@keyframes cd-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`;

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }

export function CountdownWidget({ state }: WidgetRendererProps) {
  const cfg = state as CountdownState;
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      if (cfg.mode === 'datetime' && cfg.targetMs) {
        return Math.max(0, cfg.targetMs - Date.now());
      }
      if (cfg.mode === 'duration' && cfg.durationMs != null && cfg.startedAt != null) {
        return Math.max(0, cfg.durationMs - (Date.now() - cfg.startedAt));
      }
      return 0;
    };
    setRemaining(calc());
    const iv = setInterval(() => setRemaining(calc()), 250);
    return () => clearInterval(iv);
  }, [cfg.mode, cfg.targetMs, cfg.durationMs, cfg.startedAt]);

  const totalSec = Math.ceil(remaining / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const isUrgent = totalSec <= (cfg.urgentSec ?? 60) && totalSec > 0;
  const ended = remaining <= 0;
  const barPct = cfg.mode === 'duration' && cfg.durationMs
    ? Math.max(0, 100 - ((Date.now() - (cfg.startedAt ?? Date.now())) / cfg.durationMs) * 100)
    : 0;

  const numColor = isUrgent ? (cfg.urgentColor ?? '#ef4444') : (cfg.textColor ?? '#ffffff');

  const wrapStyle: React.CSSProperties = {
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    color: cfg.textColor ?? '#ffffff',
    background: cfg.bgColor ?? 'transparent',
    textAlign: 'center',
    padding: 12,
    borderRadius: cfg.borderRadius ?? 10,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: cfg.labelSizePx ?? 13,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.6,
    marginBottom: 10,
  };

  if (ended && cfg.showEndMsg) {
    return (
      <div style={wrapStyle}>
        <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 48) * 0.6), fontWeight: 700, color: cfg.accentColor ?? '#6366f1', animation: 'cd-pulse 1.5s ease infinite' }}>
          <style>{KEYFRAMES}</style>
          {cfg.endMessage ?? 'LIVE NOW! 🔴'}
        </div>
      </div>
    );
  }

  const parts: Array<{ val: number; label: string }> = [];
  if (cfg.showDays)    parts.push({ val: d, label: 'DAYS' });
  if (cfg.showHours)   parts.push({ val: h, label: 'HRS' });
  if (cfg.showMinutes) parts.push({ val: m, label: 'MIN' });
  if (cfg.showSeconds) parts.push({ val: sec, label: 'SEC' });

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={wrapStyle}>
        {cfg.showLabel && <div style={labelStyle}>{cfg.label}</div>}

        {cfg.layout === 'blocks' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {parts.map((p, i) => (
              <React.Fragment key={p.label}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    fontSize: cfg.fontSizePx ?? 48,
                    fontWeight: 800,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                    background: cfg.blockBg ?? 'rgba(0,0,0,0.4)',
                    borderRadius: Math.round((cfg.borderRadius ?? 10) * 0.6),
                    padding: '8px 14px',
                    minWidth: Math.round((cfg.fontSizePx ?? 48) * 1.6),
                    textAlign: 'center',
                    color: numColor,
                  }}>
                    {pad(p.val)}
                  </div>
                  {cfg.showUnits && <div style={{ fontSize: Math.round((cfg.labelSizePx ?? 13) * 0.9), fontWeight: 600, letterSpacing: '0.1em', opacity: 0.5 }}>{p.label}</div>}
                </div>
                {i < parts.length - 1 && (
                  <div style={{ fontSize: cfg.fontSizePx ?? 48, fontWeight: 800, opacity: 0.4, lineHeight: 1, paddingBottom: cfg.showUnits ? 20 : 0 }}>
                    {cfg.separatorChar ?? ':'}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: cfg.fontSizePx ?? 48, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em', color: numColor }}>
            {parts.map(p => pad(p.val)).join(cfg.separatorChar ?? ':')}
          </div>
        )}

        {cfg.showBar && cfg.mode === 'duration' && (
          <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', background: cfg.accentColor ?? '#6366f1', borderRadius: 999, width: `${barPct}%`, transition: 'width 1s linear' }} />
          </div>
        )}
      </div>
    </>
  );
}
