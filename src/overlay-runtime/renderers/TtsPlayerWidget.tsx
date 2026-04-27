import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';
import type { ScrapbotOverlayState } from '../types/unifiedOverlayState';

export function TtsPlayerWidget(props: WidgetRendererProps<ScrapbotOverlayState>): React.ReactElement | null {
  const { state } = props;

  const current = state.ttsQueue[0] ?? null;

  if (!current) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      background: 'rgba(0, 0, 0, 0.6)',
      borderRadius: '10px',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, sans-serif',
      maxWidth: '100%',
    }}>
      <div style={{
        fontSize: '20px',
        flexShrink: 0,
      }}>
        🔊
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#a5b4fc',
          marginBottom: '2px',
        }}>
          {current.username}
        </div>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {current.text}
        </div>
      </div>
      {state.ttsQueue.length > 1 && (
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          flexShrink: 0,
        }}>
          +{state.ttsQueue.length - 1} queued
        </div>
      )}
    </div>
  );
}
