/**
 * TickerWidget.tsx
 *
 * Declarative React renderer for the Scrolling Ticker widget.
 * Consumes structured state emitted by ticker.js v3.
 * No DOM injection. No dangerouslySetInnerHTML. Pure JSX.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface TickerState {
  items: string[];
  separator: string;
  speed: number;
  direction: 'left' | 'right';
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  bgColor: string;
  accentColor: string;
  showAccent: boolean;
  accentWidth: number;
  paddingV: number;
  paddingH: number;
  borderRadius: number;
  textShadow: boolean;
  bold: boolean;
  uppercase: boolean;
  letterSpacing: number;
  pauseOnHover: boolean;
  fadeEdges: boolean;
  fadeWidth: number;
  prefixIcon: string;
  prefixLabel: string;
}

export function TickerWidget({ state, width }: WidgetRendererProps) {
  const cfg = state as TickerState;
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(10);
  const [paused, setPaused] = useState(false);

  // items may be a string (from propOverrides) or array (from script state)
  const itemList = Array.isArray(cfg.items)
    ? cfg.items
    : String(cfg.items || 'Welcome to the stream!').split(/\n|\|/).map((i: string) => i.trim()).filter(Boolean);
  const text = itemList.join(cfg.separator ?? ' • ');
  const height = (cfg.fontSizePx ?? 18) + (cfg.paddingV ?? 10) * 2;

  // Calculate scroll duration based on content width and speed
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const content = track.querySelector('.tk-content') as HTMLElement | null;
    if (!content) return;
    const contentWidth = content.offsetWidth || 300;
    setDuration(contentWidth / (cfg.speed ?? 60));
  }, [text, cfg.speed, width]);

  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    background: cfg.bgColor ?? 'rgba(0,0,0,0.6)',
    borderRadius: cfg.borderRadius ?? 8,
    overflow: 'hidden',
    height,
    width: '100%',
  };

  const viewportStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    height: '100%',
    ...(cfg.fadeEdges ? {
      maskImage: `linear-gradient(to right, transparent 0%, black ${cfg.fadeWidth}px, black calc(100% - ${cfg.fadeWidth}px), transparent 100%)`,
      WebkitMaskImage: `linear-gradient(to right, transparent 0%, black ${cfg.fadeWidth}px, black calc(100% - ${cfg.fadeWidth}px), transparent 100%)`,
    } : {}),
  };

  const trackStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    whiteSpace: 'nowrap',
    willChange: 'transform',
    animation: `tk-scroll-${cfg.direction ?? 'left'} ${duration}s linear infinite`,
    animationPlayState: paused ? 'paused' : 'running',
  };

  const contentStyle: React.CSSProperties = {
    display: 'inline-block',
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: cfg.fontSizePx ?? 18,
    color: cfg.textColor ?? '#ffffff',
    fontWeight: cfg.bold ? 700 : 400,
    textTransform: cfg.uppercase ? 'uppercase' : 'none',
    letterSpacing: cfg.letterSpacing ?? 0,
    padding: `0 ${cfg.paddingH ?? 16}px`,
    ...(cfg.textShadow ? { textShadow: '1px 1px 3px rgba(0,0,0,0.8)' } : {}),
  };

  const sepStyle: React.CSSProperties = {
    color: cfg.accentColor ?? '#6366f1',
    opacity: 0.7,
  };

  const prefixStyle: React.CSSProperties = {
    flexShrink: 0,
    padding: `0 ${cfg.paddingH ?? 16}px`,
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: cfg.fontSizePx ?? 18,
    fontWeight: 700,
    color: cfg.accentColor ?? '#6366f1',
    background: `${cfg.accentColor ?? '#6366f1'}22`,
    ...(cfg.showAccent ? { borderLeft: `${cfg.accentWidth ?? 4}px solid ${cfg.accentColor ?? '#6366f1'}` } : {}),
    whiteSpace: 'nowrap',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const handlers = cfg.pauseOnHover ? {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
  } : {};

  // Inject keyframe animation via a style tag (scoped, not global)
  const keyframes = `
    @keyframes tk-scroll-left { from { transform: translateX(0) } to { transform: translateX(-50%) } }
    @keyframes tk-scroll-right { from { transform: translateX(-50%) } to { transform: translateX(0) } }
  `;

  return (
    <>
      <style>{keyframes}</style>
      <div style={wrapStyle} {...handlers}>
        {(cfg.prefixLabel || cfg.prefixIcon) && (
          <div style={prefixStyle}>
            {cfg.prefixIcon && <span>{cfg.prefixIcon} </span>}
            {cfg.prefixLabel}
          </div>
        )}
        <div style={viewportStyle}>
          <div ref={trackRef} style={trackStyle}>
            {/* Duplicate content for seamless loop */}
            <span className="tk-content" style={contentStyle}>
              {text}<span style={sepStyle}>{cfg.separator ?? ' • '}</span>
            </span>
            <span className="tk-content" style={contentStyle} aria-hidden="true">
              {text}<span style={sepStyle}>{cfg.separator ?? ' • '}</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
