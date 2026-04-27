/**
 * ChatOverlayWidget.tsx
 * Declarative React renderer for the Chat Overlay widget.
 * Consumes state emitted by chat-overlay.js.
 */

import React, { useEffect, useRef } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface ChatMessage {
  id: number;
  username: string;
  text: string;
  platform: string;
  avatar?: string;
  color?: string;
  badges?: Array<{ type: string; text?: string }>;
  hasEmotes?: boolean;
}

interface ChatOverlayState {
  messages: ChatMessage[];
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  messageGapPx: number;
  nameColor: string;
  nameColorMode: string;
  messageColor: string;
  showAvatars: boolean;
  showPlatformIcon: boolean;
  showBadges: boolean;
  shadow: boolean;
  bubbleEnabled: boolean;
  bubbleRadiusPx: number;
  bubbleBg: string;
  bubbleBorder: string;
  glowEnabled: boolean;
  glowColor: string;
  glowBlur: number;
  depthEnabled: boolean;
  depthOffset: number;
  depthColor: string;
  gradientNames: boolean;
}

const PLATFORM_COLORS: Record<string, string> = { kick: '#53fc18', youtube: '#ff0000', twitch: '#9146ff' };
const PLATFORM_ICONS: Record<string, string>  = { kick: '🟢', youtube: '▶️', twitch: '💜' };

const BADGE_URLS: Record<string, string> = {
  broadcaster: 'https://files.kick.com/images/badges/broadcaster/badge_image',
  moderator:   'https://files.kick.com/images/badges/moderator/badge_image',
  subscriber:  'https://files.kick.com/images/badges/subscriber/badge_image',
  verified:    'https://files.kick.com/images/badges/verified/badge_image',
  og:          'https://files.kick.com/images/badges/og/badge_image',
  vip:         'https://files.kick.com/images/badges/vip/badge_image',
};

const KEYFRAMES = ``;

export function ChatOverlayWidget({ state }: WidgetRendererProps) {
  const cfg = state as ChatOverlayState;
  const messages: ChatMessage[] = cfg.messages ?? [];

  const nameStyle = (msg: ChatMessage): React.CSSProperties => {
    let color: string;
    if (cfg.nameColorMode === 'user') color = msg.color || PLATFORM_COLORS[msg.platform] || cfg.nameColor || '#a5b4fc';
    else if (cfg.nameColorMode === 'platform') color = PLATFORM_COLORS[msg.platform] || cfg.nameColor || '#a5b4fc';
    else color = cfg.nameColor ?? '#a5b4fc';

    const base: React.CSSProperties = {
      fontWeight: 600,
      flexShrink: 0,
      color,
    };
    if (cfg.shadow) base.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
    if (cfg.glowEnabled) base.textShadow = `0 0 ${cfg.glowBlur ?? 8}px ${cfg.glowColor ?? '#a5b4fc'}, 0 1px 3px rgba(0,0,0,0.8)`;
    if (cfg.depthEnabled) base.textShadow = `${cfg.depthOffset ?? 2}px ${cfg.depthOffset ?? 2}px 0 ${cfg.depthColor ?? 'rgba(0,0,0,0.5)'}, 0 1px 3px rgba(0,0,0,0.8)`;
    return base;
  };

  const textStyle = (msg: ChatMessage): React.CSSProperties => {
    const base: React.CSSProperties = { color: cfg.messageColor ?? '#ffffff' };
    if (cfg.shadow) base.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
    if (cfg.depthEnabled) base.textShadow = `${cfg.depthOffset ?? 2}px ${cfg.depthOffset ?? 2}px 0 ${cfg.depthColor ?? 'rgba(0,0,0,0.5)'}`;
    return base;
  };

  const msgStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: '100%',
    wordBreak: 'break-word',
    // No CSS animation — OBS CEF doesn't repaint after animation completes
    ...(cfg.bubbleEnabled ? {
      background: cfg.bubbleBg ?? 'rgba(0,0,0,0.4)',
      border: `1px solid ${cfg.bubbleBorder ?? 'transparent'}`,
      borderRadius: cfg.bubbleRadiusPx ?? 8,
      padding: '5px 10px',
    } : {}),
  };

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column-reverse',
        padding: cfg.messageGapPx ?? 6,
        gap: cfg.messageGapPx ?? 6,
        overflow: 'visible',
        width: '100%',
        height: '100%',
        fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
        fontSize: cfg.fontSizePx ?? 16,
        lineHeight: cfg.lineHeight ?? 1.4,
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}>
        {messages.map((msg) => (
          <div key={msg.id} style={msgStyle}>
            {cfg.showAvatars && (
              msg.avatar
                ? <img src={msg.avatar} alt={msg.username} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
            )}
            {cfg.showPlatformIcon && msg.platform && (
              <span style={{ fontSize: 12, flexShrink: 0, marginTop: 2 }}>{PLATFORM_ICONS[msg.platform] ?? '💬'}</span>
            )}
            {cfg.showBadges && msg.badges && msg.badges.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 3, flexShrink: 0 }}>
                {msg.badges.map((b, i) => {
                  const url = BADGE_URLS[(b.type || '').toLowerCase()];
                  return url ? <img key={i} src={url} alt={b.text || b.type} style={{ height: '1.1em', width: 'auto', verticalAlign: 'middle' }} /> : null;
                })}
              </span>
            )}
            <span style={nameStyle(msg)}>{msg.username}</span>
            {msg.hasEmotes ? (
              <span style={textStyle(msg)} dangerouslySetInnerHTML={{ __html: msg.text }} />
            ) : (
              <span style={textStyle(msg)}>{msg.text}</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
