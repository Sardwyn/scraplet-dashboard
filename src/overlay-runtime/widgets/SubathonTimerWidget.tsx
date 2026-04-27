/**
 * SubathonTimerWidget.tsx
 * Declarative React renderer for the Subathon Timer widget.
 * Consumes state emitted by subathon-timer.js.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface SubathonTimerState {
  status: 'stopped' | 'running' | 'paused';
  remainingMs: number;
  lastUpdateAt: number; // epoch ms when remainingMs was set
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  accentColor: string;
  bgColor: string;
  showLabel: boolean;
  label: string;
  showBar: boolean;
  maxMs: number;
  urgentMs: number;
  addedMs?: number; // non-zero triggers +time animation
}

const KEYFRAMES = `
  @keyframes sa-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes sa-add   { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-20px)} }
`;

function formatTime(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
function pad(n: number): string { return n < 10 ? '0' + n : String(n); }

export function SubathonTimerWidget({ state }: WidgetRendererProps) {
  const cfg = state as SubathonTimerState;
  const [displayMs, setDisplayMs] = useState(cfg.remainingMs ?? 0);
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdateRef = useRef(cfg.lastUpdateAt ?? Date.now());
  const prevAddedRef = useRef(0);

  // Sync from state and start local tick
  useEffect(() => {
    setDisplayMs(cfg.remainingMs ?? 0);
    lastUpdateRef.current = cfg.lastUpdateAt ?? Date.now();

    if (tickRef.current) clearInterval(tickRef.current);
    if (cfg.status === 'running') {
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - lastUpdateRef.current;
        setDisplayMs(Math.max(0, (cfg.remainingMs ?? 0) - elapsed));
      }, 100);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [cfg.remainingMs, cfg.status, cfg.lastUpdateAt]);

  // Show +time animation when addedMs changes
  useEffect(() => {
    const added = cfg.addedMs ?? 0;
    if (added > 0 && added !== prevAddedRef.current) {
      prevAddedRef.current = added;
      const mins = Math.floor(added / 60000);
      const secs = Math.floor((added % 60000) / 1000);
      setAddText('+' + (mins > 0 ? mins + 'm' : secs + 's'));
      setShowAdd(true);
      setTimeout(() => setShowAdd(false), 1500);
    }
  }, [cfg.addedMs]);

  const isUrgent = displayMs > 0 && displayMs < (cfg.urgentMs ?? 300000);
  const barPct = cfg.maxMs > 0 ? Math.min(100, (displayMs / cfg.maxMs) * 100) : 0;
  const barColor = isUrgent ? '#ef4444' : (cfg.accentColor ?? '#6366f1');

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{
        width: '100%',
        height: '100%',
        background: cfg.bgColor ?? 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
        color: cfg.textColor ?? '#ffffff',
        padding: 8,
        boxSizing: 'border-box',
        position: 'relative',
      }}>
        {cfg.showLabel && (
          <div style={{ fontSize: '0.35em', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>
            {cfg.label ?? 'SUBATHON'}
          </div>
        )}
        <div style={{
          fontSize: cfg.fontSizePx ?? 48,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          color: isUrgent ? '#ef4444' : (cfg.textColor ?? '#ffffff'),
          animation: isUrgent ? 'sa-pulse 1s ease infinite' : 'none',
        }}>
          {formatTime(displayMs)}
        </div>
        {cfg.showBar && (
          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
            <div style={{
              height: '100%',
              background: barColor,
              borderRadius: 999,
              width: `${barPct}%`,
              transition: 'width 1s linear',
            }} />
          </div>
        )}
        {showAdd && (
          <div style={{
            position: 'absolute',
            top: 4,
            right: 8,
            fontSize: '0.8em',
            fontWeight: 700,
            color: cfg.accentColor ?? '#6366f1',
            animation: 'sa-add 1.5s ease forwards',
            pointerEvents: 'none',
          }}>
            {addText}
          </div>
        )}
      </div>
    </>
  );
}
