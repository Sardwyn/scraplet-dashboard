/**
 * TopSupportersWidget.tsx
 * Declarative React renderer for the Top Supporters widget.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface SupporterEntry {
  username: string;
  platform: string;
  subs: number;
  tips: number;
  combined: number;
  avatar?: string;
}

interface TopSupportersState {
  entries: SupporterEntry[];
  title: string;
  showTitle: boolean;
  metric: 'subs' | 'tips' | 'combined';
  showRank: boolean;
  showAmount: boolean;
  showPlatform: boolean;
  showAvatar: boolean;
  highlightTop: boolean;
  layout: 'list' | 'podium';
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  bgColor: string;
  rowBg: string;
  accentColor: string;
  goldColor: string;
  borderRadius: number;
  rowGap: number;
}

const PLATFORM_ICONS: Record<string, string> = { kick: '🟢', youtube: '▶️', twitch: '💜', unknown: '⚪' };
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export function TopSupportersWidget({ state }: WidgetRendererProps) {
  const cfg = state as TopSupportersState;
  const entries: SupporterEntry[] = cfg.entries ?? [];

  const getVal = (e: SupporterEntry) => e[cfg.metric ?? 'combined'] ?? e.combined;
  const formatVal = (e: SupporterEntry) => {
    const v = getVal(e);
    if (cfg.metric === 'tips') return `$${Number(v).toFixed(2)}`;
    if (cfg.metric === 'subs') return `${v} sub${v === 1 ? '' : 's'}`;
    return `${v} pts`;
  };

  const wrapStyle: React.CSSProperties = {
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: cfg.fontSizePx ?? 15,
    color: cfg.textColor ?? '#ffffff',
    background: cfg.bgColor ?? 'rgba(0,0,0,0.6)',
    borderRadius: cfg.borderRadius ?? 10,
    padding: 12,
    minWidth: 200,
  };

  return (
    <div style={wrapStyle}>
      {cfg.showTitle && (
        <div style={{ fontWeight: 700, fontSize: '1.1em', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, color: cfg.accentColor ?? '#6366f1' }}>
          {cfg.title ?? 'Top Supporters'}
        </div>
      )}
      {entries.length === 0 ? (
        <div style={{ opacity: 0.4, padding: 8, fontSize: '0.85em' }}>No supporters yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: cfg.rowGap ?? 4 }}>
          {entries.map((entry, i) => {
            const isTop = cfg.highlightTop && i === 0;
            return (
              <div key={entry.username} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                background: isTop ? `${cfg.accentColor ?? '#6366f1'}18` : (cfg.rowBg ?? 'rgba(255,255,255,0.04)'),
                borderLeft: isTop ? `3px solid ${cfg.goldColor ?? '#fbbf24'}` : undefined,
              }}>
                {cfg.showRank && (
                  <span style={{ fontSize: '1.1em', width: 24, textAlign: 'center', flexShrink: 0 }}>
                    {RANK_MEDALS[i] ?? (i + 1)}
                  </span>
                )}
                {cfg.showAvatar && entry.avatar && (
                  <img src={entry.avatar} alt={entry.username} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.username}
                </span>
                {cfg.showPlatform && (
                  <span style={{ fontSize: '0.85em', flexShrink: 0 }}>{PLATFORM_ICONS[entry.platform] ?? PLATFORM_ICONS.unknown}</span>
                )}
                {cfg.showAmount && (
                  <span style={{ fontSize: '0.85em', opacity: 0.7, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {formatVal(entry)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
