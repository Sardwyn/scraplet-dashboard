import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';
import type { AlertOverlayState } from '../types/unifiedOverlayState';

export function AlertBoxWidget(props: WidgetRendererProps<AlertOverlayState>): React.ReactElement | null {
  const { state } = props;
  
  if (!state.active) {
    return null;
  }

  const alert = state.active;
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '12px',
        padding: '24px 32px',
        minWidth: '300px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#a5b4fc',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          {alert.type}
        </div>
        <div style={{
          fontSize: '24px',
          fontWeight: 600,
          color: '#ffffff',
        }}>
          {alert.actorDisplay}
        </div>
        {alert.message && (
          <div style={{
            fontSize: '16px',
            color: '#e5e7eb',
            textAlign: 'center',
          }}>
            {alert.message}
          </div>
        )}
        {alert.amount !== undefined && (
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#34d399',
          }}>
            ${alert.amount}
          </div>
        )}
      </div>
    </div>
  );
}
