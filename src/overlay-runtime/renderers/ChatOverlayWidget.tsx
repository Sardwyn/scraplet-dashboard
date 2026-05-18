import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';
import type { ChatOverlayState } from '../types/unifiedOverlayState';

const brandColors: Record<string, string> = {
  kick: '#53fc18',
  twitch: '#a970ff',
  youtube: '#ff0000',
  tiktok: '#ff0050',
};

const brandNames: Record<string, string> = {
  kick: 'Kick',
  twitch: 'Twitch',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

function getPlatformIconSvg(platform: string) {
  const p = platform?.toLowerCase() || '';
  if (p === 'twitch') {
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
      </svg>
    );
  }
  if (p === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.5 12 3.5 12 3.5s-7.518 0-9.388.553a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.553 9.388.553 9.388.553s7.518 0 9.388-.553a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    );
  }
  if (p === 'kick') {
    return (
      <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" />
      </svg>
    );
  }
  if (p === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.23a7.22 7.22 0 0 0 3.96 2.63v3.9c-1.63-.02-3.23-.46-4.64-1.28v6.78a8.218 8.218 0 0 1-13.43 6.32 8.218 8.218 0 0 1 5.21-14.88c.32-.01.64.02.96.07v3.91a4.3 4.3 0 0 0-2.17.81c-1.39 1.01-2.07 2.76-1.74 4.47a4.309 4.309 0 0 0 6.64 3.01 4.3 4.3 0 0 0 1.67-3.41V.02Z"/>
      </svg>
    );
  }
  return null;
}

function PlatformBadge({ platform, styleType }: { platform: string; styleType: string }) {
  const p = platform?.toLowerCase() || 'kick';
  const color = brandColors[p] || '#ffffff';
  const name = brandNames[p] || platform;

  // Map user-friendly terms to internal CSS render styles
  const resolvedStyle = styleType === 'symbol' ? 'icon-only'
                      : styleType === 'text' ? 'text-only'
                      : styleType === 'dot' ? 'subtle-dot'
                      : styleType === 'highlight' ? 'solid-pill'
                      : styleType; // fallback for backward compatibility

  if (resolvedStyle === 'icon-only') {
    return (
      <span style={{
        color,
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '6px',
        fontSize: '1.1em',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}>
        {getPlatformIconSvg(p)}
      </span>
    );
  }

  if (resolvedStyle === 'text-only') {
    return (
      <span style={{
        color,
        fontWeight: 600,
        marginRight: '6px',
        fontSize: '0.85em',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}>
        [{name}]
      </span>
    );
  }

  if (resolvedStyle === 'solid-pill') {
    return (
      <span style={{
        background: color,
        color: p === 'kick' ? '#000000' : '#ffffff',
        padding: '1px 6px 2px 6px',
        borderRadius: '999px',
        fontSize: '0.72em',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginRight: '6px',
        textShadow: 'none',
        verticalAlign: 'middle',
        flexShrink: 0,
        lineHeight: 1,
      }}>
        {getPlatformIconSvg(p)}
        <span>{name}</span>
      </span>
    );
  }

  if (resolvedStyle === 'outline-pill') {
    return (
      <span style={{
        border: `1px solid ${color}`,
        color,
        padding: '0px 5px 1px 5px',
        borderRadius: '999px',
        fontSize: '0.72em',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginRight: '6px',
        verticalAlign: 'middle',
        flexShrink: 0,
        lineHeight: 1,
      }}>
        {getPlatformIconSvg(p)}
        <span>{name}</span>
      </span>
    );
  }

  if (resolvedStyle === 'subtle-dot') {
    return (
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
        display: 'inline-block',
        marginRight: '6px',
        alignSelf: 'center',
        verticalAlign: 'middle',
        flexShrink: 0,
      }} />
    );
  }

  return null;
}

export function ChatOverlayWidget(props: WidgetRendererProps<ChatOverlayState>): React.ReactElement | null {
  const { state } = props;
  const c = { ...(state?.config || {}), ...(state || {}) } as any; // merge state.config and state for robust fallback

  if (!state.messages || state.messages.length === 0) {
    return null;
  }

  const fontFamily = c.fontFamily || 'Inter, system-ui, sans-serif';
  const fontSizePx = c.fontSizePx || 16;
  const lineHeight = c.lineHeight || 1.4;
  const messageColor = c.messageColor || '#ffffff';
  const nameColor = c.nameColor || '#a5b4fc';
  const messageGapPx = c.messageGapPx || 6;
  const bubbleEnabled = c.bubbleEnabled === true || c.bubbleEnabled === 'true' || c.bubbleEnabled === '1';
  const bubbleBg = c.bubbleBg || 'rgba(0,0,0,0.4)';
  const bubbleBorder = c.bubbleBorder || 'transparent';
  const bubbleRadiusPx = Number(c.bubbleRadiusPx) || 8;
  const shadow = c.shadow !== false;
  const animateIn = c.animateIn !== false;

  const showPlatformBadge = c.showPlatformBadge !== false && c.showPlatformIcon !== false;
  const platformBadgeStyle = c.platformBadgeStyle || 'symbol';

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
          {c.showAvatars && msg.avatar && (
            <img
              src={msg.avatar}
              alt={msg.username}
              referrerPolicy="no-referrer"
              style={{
                width: `${fontSizePx * 1.2}px`,
                height: `${fontSizePx * 1.2}px`,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                alignSelf: 'center',
                marginRight: '4px',
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          {showPlatformBadge && msg.platform && (
            <PlatformBadge platform={msg.platform} styleType={platformBadgeStyle} />
          )}
          {c.showBadges !== false && msg.badges && msg.badges.length > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              marginRight: '3px',
              flexShrink: 0,
              alignSelf: 'center',
            }}>
              {msg.badges.map((b, idx) => (
                b.imageUrl ? (
                  <img
                    key={idx}
                    src={b.imageUrl}
                    alt={b.label}
                    title={b.label}
                    referrerPolicy="no-referrer"
                    style={{
                      height: '1.1em',
                      width: 'auto',
                      verticalAlign: 'middle',
                      display: 'inline-block',
                    }}
                  />
                ) : null
              ))}
            </span>
          )}
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
