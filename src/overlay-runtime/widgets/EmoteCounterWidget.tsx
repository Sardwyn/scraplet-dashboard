/**
 * EmoteCounterWidget.tsx
 * Declarative React renderer for the Emote Counter widget.
 * Consumes state emitted by emote-counter.js.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface EmoteEntry {
  emote: string;
  count: number;
}

interface EmoteCounterState {
  entries: EmoteEntry[];
  title: string;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  accentColor: string;
  bgColor: string;
  borderRadius: number;
  showBar: boolean;
}

export function EmoteCounterWidget({ state }: WidgetRendererProps) {
  const cfg = state as EmoteCounterState;
  const entries: EmoteEntry[] = cfg.entries ?? [];
  const maxCount = entries.length > 0 ? entries[0].count : 1;

  const wrapStyle: React.CSSProperties = {
    padding: '12px 16px',
    background: cfg.bgColor ?? 'rgba(0,0,0,0.75)',
    borderRadius: cfg.borderRadius ?? 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 180,
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.75),
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 4,
  };

  const emptyStyle: React.CSSProperties = {
    fontSize: cfg.fontSizePx ?? 18,
    color: 'rgba(255,255,255,0.3)',
  };

  return (
    <div style={wrapStyle}>
      {cfg.title && <div style={titleStyle}>{cfg.title}</div>}
      {entries.length === 0 ? (
        <div style={emptyStyle}>Waiting for emotes…</div>
      ) : (
        entries.map((item) => (
          <div key={item.emote} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontSize: cfg.fontSizePx ?? 18,
              color: cfg.textColor ?? '#ffffff',
              fontWeight: 600,
              minWidth: 80,
              fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
            }}>
              {item.emote}
            </div>
            <div style={{
              fontSize: cfg.fontSizePx ?? 18,
              color: cfg.accentColor ?? '#6366f1',
              fontWeight: 700,
              minWidth: 32,
              textAlign: 'right',
              fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
            }}>
              {item.count}
            </div>
            {cfg.showBar && (
              <div style={{
                flex: 1,
                height: 6,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  background: cfg.accentColor ?? '#6366f1',
                  borderRadius: 3,
                  width: `${Math.round((item.count / maxCount) * 100)}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
