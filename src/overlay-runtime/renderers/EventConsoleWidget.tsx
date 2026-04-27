import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';
import type { AlertOverlayState } from '../types/unifiedOverlayState';

// Event console shows a feed of recent alerts/events
export function EventConsoleWidget(props: WidgetRendererProps<AlertOverlayState>): React.ReactElement | null {
  const { state } = props;

  const events = [
    ...(state.active ? [state.active] : []),
    ...state.queue,
  ];

  if (events.length === 0) {
    return null;
  }

  const typeColors: Record<string, string> = {
    follow: '#60a5fa',
    subscribe: '#a78bfa',
    resub: '#c084fc',
    subgift: '#f472b6',
    raid: '#fb923c',
    tip: '#34d399',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '8px',
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {events.map((event) => (
        <div key={event.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '6px',
          padding: '6px 10px',
          borderLeft: `3px solid ${typeColors[event.type] ?? '#6b7280'}`,
        }}>
          <span style={{
            fontSize: '12px',
            fontWeight: 700,
            color: typeColors[event.type] ?? '#6b7280',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {event.type}
          </span>
          <span style={{ fontSize: '14px', color: '#ffffff', fontWeight: 600 }}>
            {event.actorDisplay}
          </span>
          {event.message && (
            <span style={{ fontSize: '13px', color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event.message}
            </span>
          )}
          {event.amount !== undefined && (
            <span style={{ fontSize: '13px', color: '#34d399', fontWeight: 600, flexShrink: 0 }}>
              ${event.amount}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
