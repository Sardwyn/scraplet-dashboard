/**
 * ViewerCountWidget.tsx
 * Declarative React renderer for the Viewer Count widget.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface ViewerCountState {
  total: number;
  kick: number;
  youtube: number;
  twitch: number;
  peak: number;
  label: string;
  showLabel: boolean;
  showPlatforms: boolean;
  showPeak: boolean;
  showKick: boolean;
  showYoutube: boolean;
  showTwitch: boolean;
  displayMode: 'total' | 'breakdown' | 'both';
  fontFamily: string;
  fontSizePx: number;
  labelSizePx: number;
  textColor: string;
  bgColor: string;
  accentColor: string;
  borderRadius: number;
  showIcon: boolean;
  layout: 'vertical' | 'horizontal' | 'compact';
}

function formatNum(n: number): string {
  const v = Math.round(n);
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 10000)   return (v / 1000).toFixed(1) + 'K';
  return String(v);
}

const PLATFORM_COLORS: Record<string, string> = { kick: '#53fc18', youtube: '#ff0000', twitch: '#9146ff' };
const PLATFORM_ICONS: Record<string, string>  = { kick: '🟢', youtube: '▶️', twitch: '💜' };

export function ViewerCountWidget({ state }: WidgetRendererProps) {
  const cfg = state as ViewerCountState;
  const [displayed, setDisplayed] = useState(cfg.total ?? 0);
  const prevRef = useRef(cfg.total ?? 0);

  // Animate count change
  useEffect(() => {
    const from = prevRef.current;
    const to = cfg.total ?? 0;
    if (from === to) return;
    prevRef.current = to;
    const start = Date.now();
    const dur = 600;
    const tick = () => {
      const p = Math.min((Date.now() - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(from + (to - from) * ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [cfg.total]);

  const isHoriz = cfg.layout === 'horizontal' || cfg.layout === 'compact';

  const wrapStyle: React.CSSProperties = {
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    color: cfg.textColor ?? '#ffffff',
    background: cfg.bgColor ?? 'transparent',
    padding: cfg.layout === 'compact' ? '6px 12px' : '12px 16px',
    borderRadius: cfg.borderRadius ?? 12,
    textAlign: 'center',
    display: 'flex',
    flexDirection: isHoriz ? 'row' : 'column',
    alignItems: 'center',
    gap: isHoriz ? 12 : 4,
  };

  return (
    <div style={wrapStyle}>
      {cfg.showLabel && (
        <div style={{ fontSize: cfg.labelSizePx ?? 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6 }}>
          {cfg.label ?? 'VIEWERS'}
        </div>
      )}
      {(cfg.displayMode === 'total' || cfg.displayMode === 'both') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {cfg.showIcon && <span style={{ fontSize: Math.round((cfg.fontSizePx ?? 48) * 0.6), opacity: 0.7 }}>👁</span>}
          <span style={{ fontSize: cfg.fontSizePx ?? 48, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {formatNum(displayed)}
          </span>
        </div>
      )}
      {cfg.showPlatforms && (cfg.displayMode === 'breakdown' || cfg.displayMode === 'both') && (
        <div style={{ display: 'flex', gap: 10, marginTop: isHoriz ? 0 : 2 }}>
          {cfg.showKick    && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: Math.round((cfg.fontSizePx ?? 48) * 0.35), opacity: 0.85 }}><span>{PLATFORM_ICONS.kick}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNum(cfg.kick ?? 0)}</span></div>}
          {cfg.showYoutube && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: Math.round((cfg.fontSizePx ?? 48) * 0.35), opacity: 0.85 }}><span>{PLATFORM_ICONS.youtube}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNum(cfg.youtube ?? 0)}</span></div>}
          {cfg.showTwitch  && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: Math.round((cfg.fontSizePx ?? 48) * 0.35), opacity: 0.85 }}><span>{PLATFORM_ICONS.twitch}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNum(cfg.twitch ?? 0)}</span></div>}
        </div>
      )}
      {cfg.showPeak && (
        <div style={{ fontSize: Math.round((cfg.fontSizePx ?? 48) * 0.28), opacity: 0.5, marginTop: 2 }}>
          Peak: {formatNum(cfg.peak ?? 0)}
        </div>
      )}
    </div>
  );
}
