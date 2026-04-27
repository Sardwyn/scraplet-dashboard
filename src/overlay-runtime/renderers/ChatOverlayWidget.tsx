import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';
import type { ChatOverlayState } from '../types/unifiedOverlayState';

export function ChatOverlayWidget(props: WidgetRendererProps<ChatOverlayState>): React.ReactElement | null {
  const { state } = props;
  const s = state as any; // visual props spread from propOverrides

  if (!state.messages || state.messages.length === 0) {
    return null;
  }

  const fontFamily = s.fontFamily || 'Inter, system-ui, sans-serif';
  const fontSizePx = s.fontSizePx || 16;
  const lineHeight = s.lineHeight || 1.4;
  const messageColor = s.messageColor || '#ffffff';
  const nameColor = s.nameColor || '#a5b4fc';
  const messageGapPx = s.messageGapPx || 6;
  const bubbleEnabled = s.bubbleEnabled === true || s.bubbleEnabled === 'true' || s.bubbleEnabled === '1';
  const bubbleBg = s.bubbleBg || 'rgba(0,0,0,0.4)';
  const bubbleBorder = s.bubbleBorder || 'transparent';
  const bubbleRadiusPx = Number(s.bubbleRadiusPx) || 8;
  const shadow = s.shadow !== false;
  const animateIn = s.animateIn !== false;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      gap: `${messageGapPx}px`,
      padding: '8px',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'none',
      fontFamily,
      fontSize: `${fontSizePx}px`,
      lineHeight,
    }}>
      {state.messages.map((msg) => (
        <div key={msg.id} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '6px',
          maxWidth: '100%',
          wordBreak: 'break-word',
          ...(bubbleEnabled ? {
            background: bubbleBg,
            border: `1px solid ${bubbleBorder}`,
            borderRadius: `${bubbleRadiusPx}px`,
            padding: '6px 10px',
          } : {}),
          ...(shadow ? { textShadow: '1px 1px 2px rgba(0,0,0,0.8)' } : {}),
        }}>
          <span style={{
            fontWeight: 600,
            color: (state.config?.nameColorMode === 'custom' ? state.config?.nameColor : msg.color) || nameColor,
            flexShrink: 0,
          }}>
            {msg.username}
          </span>
          <span style={{ color: messageColor }}>: </span>
          <span style={{ color: messageColor, flex: 1 }}>
            {msg.tokens.map((token, idx) => {
              if (token.type === 'text') {
                return <span key={idx}>{token.text}</span>;
              }
              return (
                <img
                  key={idx}
                  src={(token as any).url}
                  alt={(token as any).name}
                  style={{ height: '1.5em', verticalAlign: 'middle', display: 'inline-block' }}
                />
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
