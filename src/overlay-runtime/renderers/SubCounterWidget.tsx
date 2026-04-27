import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';
import type { CounterOverlayState } from '../types/unifiedOverlayState';

export function SubCounterWidget(props: WidgetRendererProps<CounterOverlayState>): React.ReactElement | null {
  const { state } = props;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: '#a5b4fc',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '4px',
      }}>
        {state.label}
      </div>
      <div style={{
        fontSize: '48px',
        fontWeight: 700,
        color: state.goalReached ? '#34d399' : '#ffffff',
        lineHeight: 1,
      }}>
        {state.value}
      </div>
      {state.goal !== undefined && (
        <div style={{
          fontSize: '14px',
          color: '#9ca3af',
          marginTop: '6px',
        }}>
          {state.goalReached ? '🎉 Goal reached!' : `Goal: ${state.goal}`}
        </div>
      )}
    </div>
  );
}
