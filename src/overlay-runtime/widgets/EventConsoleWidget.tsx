/**
 * EventConsoleWidget.tsx
 * Declarative React renderer for the Event Console widget.
 * Consumes state emitted by event-console-widget.js.
 */

import React, { useEffect, useRef } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface EventRow {
  id: number;
  type: string;
  text: string;
  color: string;
  platform: string;
  platIcon: string;
  platColor: string;
  avatar?: string;
  timestamp?: string;
}

interface EventConsoleState {
  rows: EventRow[];
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  rowBg: string;
  rowBgAlt: string;
  containerBg: string;
  borderRadius: number;
  rowPadding: number;
  newestTop: boolean;
  showTimestamp: boolean;
  showAvatar: boolean;
  showPlatform: boolean;
  entryAnim: string;
  accentWidth: number;
}

const ANIM_MAP: Record<string, string> = {
  'slide-left':  'ec-slide-left',
  'slide-right': 'ec-slide-right',
  'fade':        'ec-fade',
  'scale':       'ec-scale',
};

const KEYFRAMES = `
  @keyframes ec-slide-left  { from { opacity:0; transform:translateX(-20px) } to { opacity:1; transform:translateX(0) } }
  @keyframes ec-slide-right { from { opacity:0; transform:translateX(20px)  } to { opacity:1; transform:translateX(0) } }
  @keyframes ec-fade        { from { opacity:0 } to { opacity:1 } }
  @keyframes ec-scale       { from { opacity:0; transform:scale(0.8) } to { opacity:1; transform:scale(1) } }
`;

export function EventConsoleWidget({ state }: WidgetRendererProps) {
  const cfg = state as EventConsoleState;
  const rows: EventRow[] = cfg.rows ?? [];
  const anim = ANIM_MAP[cfg.entryAnim ?? 'slide-left'] ?? 'ec-slide-left';

  const wrapStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: cfg.containerBg ?? 'transparent',
    borderRadius: cfg.borderRadius ?? 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: cfg.newestTop ? 'flex-start' : 'flex-end',
  };

  const listStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: cfg.newestTop ? 'column' : 'column-reverse',
    gap: 2,
    padding: 4,
    overflow: 'hidden',
  };

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={wrapStyle}>
        <div style={listStyle}>
          {rows.map((row, i) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: cfg.rowPadding ?? 6,
                borderRadius: Math.max(0, (cfg.borderRadius ?? 8) - 2),
                fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
                fontSize: cfg.fontSizePx ?? 14,
                color: cfg.textColor ?? '#e2e8f0',
                borderLeft: `${cfg.accentWidth ?? 3}px solid ${row.color}`,
                background: (cfg.rowBgAlt && i % 2 === 1) ? cfg.rowBgAlt : (cfg.rowBg ?? 'rgba(0,0,0,0.4)'),
                overflow: 'hidden',
                animation: `${anim} 0.3s ease forwards`,
              }}
            >
              {cfg.showAvatar && (
                row.avatar
                  ? <img src={row.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
              )}
              {cfg.showPlatform && row.platIcon && (
                <span style={{ fontSize: 11, color: row.platColor, flexShrink: 0 }}>{row.platIcon}</span>
              )}
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.text}
              </span>
              {cfg.showTimestamp && row.timestamp && (
                <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0, marginLeft: 4 }}>{row.timestamp}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
