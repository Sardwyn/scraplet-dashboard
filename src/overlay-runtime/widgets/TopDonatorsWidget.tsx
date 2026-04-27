/**
 * TopDonatorsWidget.tsx
 * Declarative React renderer for the Top Donators widget.
 * Consumes state emitted by top-donators.js.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface DonatorEntry {
  name: string;
  amount: number;
  platform: string;
}

interface TopDonatorsState {
  leaderboard: DonatorEntry[];
  title: string;
  currency: string;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  accentColor: string;
  bgColor: string;
  borderRadius: number;
  showRank: boolean;
  showBar: boolean;
}

const PLATFORM_COLORS: Record<string, string> = {
  kick: '#53fc18',
  twitch: '#9146ff',
  youtube: '#ff0000',
};

const RANK_COLORS = ['#fbbf24', '#94a3b8', '#b45309'];

export function TopDonatorsWidget({ state }: WidgetRendererProps) {
  const cfg = state as TopDonatorsState;
  const leaderboard: DonatorEntry[] = cfg.leaderboard ?? [];
  const maxAmt = leaderboard.length > 0 ? leaderboard[0].amount : 1;

  const wrapStyle: React.CSSProperties = {
    padding: '12px 16px',
    background: cfg.bgColor ?? 'rgba(0,0,0,0.75)',
    borderRadius: cfg.borderRadius ?? 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 200,
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.75),
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 4,
  };

  return (
    <div style={wrapStyle}>
      {cfg.title && <div style={titleStyle}>{cfg.title}</div>}
      {leaderboard.length === 0 ? (
        <div style={{ fontSize: cfg.fontSizePx ?? 18, color: 'rgba(255,255,255,0.3)' }}>
          No donations yet
        </div>
      ) : (
        leaderboard.map((entry, i) => (
          <React.Fragment key={entry.name + i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cfg.showRank && (
                <div style={{
                  fontSize: Math.round((cfg.fontSizePx ?? 18) * 0.85),
                  fontWeight: 700,
                  color: RANK_COLORS[i] ?? 'rgba(255,255,255,0.4)',
                  minWidth: 20,
                  textAlign: 'center',
                }}>
                  #{i + 1}
                </div>
              )}
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: PLATFORM_COLORS[entry.platform] ?? '#fff',
                flexShrink: 0,
              }} />
              <div style={{
                fontSize: cfg.fontSizePx ?? 18,
                color: cfg.textColor ?? '#ffffff',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {entry.name}
              </div>
              <div style={{
                fontSize: cfg.fontSizePx ?? 18,
                color: cfg.accentColor ?? '#fbbf24',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                {cfg.currency ?? '$'}{entry.amount.toFixed(2)}
              </div>
            </div>
            {cfg.showBar && (
              <div style={{
                height: 3,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 2,
                overflow: 'hidden',
                marginTop: -4,
              }}>
                <div style={{
                  height: '100%',
                  background: cfg.accentColor ?? '#fbbf24',
                  borderRadius: 2,
                  width: `${Math.round((entry.amount / maxAmt) * 100)}%`,
                  opacity: 0.6,
                }} />
              </div>
            )}
          </React.Fragment>
        ))
      )}
    </div>
  );
}
