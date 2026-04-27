/**
 * SubCounterWidget.tsx
 * Declarative React renderer for the Sub Counter widget.
 * Consumes state emitted by sub-counter.js.
 */

import React, { useEffect, useRef } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface SubCounterState {
  total: number;
  kick: number;
  youtube: number;
  twitch: number;
  goalHit: boolean;
  // Config
  label: string;
  goal: number;
  overfill: boolean;
  showNumbers: boolean;
  showPercent: boolean;
  showBreakdown: boolean;
  displayMode: 'bar' | 'ring' | 'counter';
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  fillColor: string;
  fillColor2: string;
  trackColor: string;
  bgColor: string;
  borderRadius: number;
  barHeight: number;
  barRadius: number;
  barOrientation: 'horizontal' | 'vertical';
  ringSize: number;
  ringStroke: number;
  ringGlow: boolean;
  barGlow: boolean;
  milestoneAnim: string;
}

const PLATFORM_COLORS: Record<string, string> = { kick: '#53fc18', youtube: '#ff0000', twitch: '#9146ff' };

const KEYFRAMES = `
  @keyframes sc-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
  @keyframes sc-shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
`;

export function SubCounterWidget({ state }: WidgetRendererProps) {
  const cfg = state as SubCounterState;
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevGoalHit = useRef(false);

  const total = Math.max(0, cfg.total ?? 0);
  const goal = Math.max(1, cfg.goal ?? 100);
  const pctOfGoal = goal > 0 ? Math.min(cfg.overfill ? 200 : 100, (total / goal) * 100) : 0;
  const displayPct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const fillPct = Math.min(100, pctOfGoal);

  const fill = cfg.fillColor2
    ? `linear-gradient(90deg,${cfg.fillColor ?? '#6366f1'},${cfg.fillColor2})`
    : (cfg.fillColor ?? '#6366f1');

  const ringSize = cfg.ringSize ?? 120;
  const ringStroke = cfg.ringStroke ?? 10;
  const r = (ringSize / 2) - ringStroke;
  const circumference = 2 * Math.PI * r;
  const ringOffset = circumference - (displayPct / 100) * circumference;

  // Milestone animation
  useEffect(() => {
    if (cfg.goalHit && !prevGoalHit.current && wrapRef.current) {
      const anim = cfg.milestoneAnim ?? 'pulse';
      if (anim === 'pulse') {
        wrapRef.current.style.animation = 'sc-pulse 0.6s ease 3';
        setTimeout(() => { if (wrapRef.current) wrapRef.current.style.animation = ''; }, 2000);
      } else if (anim === 'shake') {
        wrapRef.current.style.animation = 'sc-shake 0.5s ease 2';
        setTimeout(() => { if (wrapRef.current) wrapRef.current.style.animation = ''; }, 1200);
      }
    }
    prevGoalHit.current = cfg.goalHit ?? false;
  }, [cfg.goalHit]);

  const isRing = cfg.displayMode === 'ring';
  const isCounter = cfg.displayMode === 'counter';
  const isVert = !isRing && !isCounter && cfg.barOrientation === 'vertical';

  const wrapStyle: React.CSSProperties = {
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: cfg.fontSizePx ?? 18,
    color: cfg.textColor ?? '#ffffff',
    background: cfg.bgColor ?? 'transparent',
    padding: '12px 16px',
    borderRadius: cfg.borderRadius ?? 12,
    textAlign: 'center',
    minWidth: isVert ? 60 : 200,
    display: isVert ? 'flex' : 'block',
    flexDirection: isVert ? 'row' : undefined,
    alignItems: isVert ? 'stretch' : undefined,
    gap: isVert ? 10 : undefined,
  };

  const numsText = goal > 0 && cfg.showNumbers ? `${total} / ${goal}` : String(total);

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div ref={wrapRef} style={wrapStyle}>
        {isVert ? (
          <>
            {/* Vertical bar on left */}
            <div style={{ width: cfg.barHeight ?? 12, minWidth: cfg.barHeight ?? 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: cfg.trackColor ?? 'rgba(255,255,255,0.1)', borderRadius: cfg.barRadius ?? 999, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: `${fillPct}%`, background: cfg.fillColor ?? '#6366f1', borderRadius: cfg.barRadius ?? 999, transition: 'height 0.6s cubic-bezier(0.34,1.56,0.64,1)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1.1em', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label}</div>
              <div style={{ fontSize: '1.4em', fontWeight: 800 }}>{numsText}</div>
              {cfg.showPercent && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{displayPct.toFixed(0)}%</div>}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: '1.1em', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label}</div>

            {isRing && goal > 0 && (
              <div style={{ position: 'relative', width: ringSize, height: ringSize, margin: '0 auto 8px' }}>
                <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox={`0 0 ${ringSize} ${ringSize}`}>
                  <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke={cfg.trackColor ?? 'rgba(255,255,255,0.1)'} strokeWidth={ringStroke} />
                  <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke={cfg.fillColor ?? '#6366f1'} strokeWidth={ringStroke} strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={ringOffset}
                    style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1)', filter: cfg.ringGlow ? `drop-shadow(0 0 8px ${cfg.fillColor ?? '#6366f1'})` : undefined }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '1.4em', fontWeight: 800 }}>{numsText}</div>
                  {cfg.showPercent && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{displayPct.toFixed(0)}%</div>}
                </div>
              </div>
            )}

            {!isRing && <div style={{ fontSize: '1.4em', fontWeight: 800, lineHeight: 1 }}>{numsText}</div>}
            {!isRing && cfg.showPercent && <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: 2 }}>{displayPct.toFixed(0)}%</div>}

            {!isRing && !isCounter && goal > 0 && (
              <div style={{ height: cfg.barHeight ?? 12, background: cfg.trackColor ?? 'rgba(255,255,255,0.1)', borderRadius: cfg.barRadius ?? 999, overflow: 'hidden', marginTop: 8 }}>
                <div style={{
                  height: '100%',
                  width: `${fillPct}%`,
                  background: fill,
                  borderRadius: cfg.barRadius ?? 999,
                  transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                  boxShadow: cfg.barGlow ? `0 0 12px ${cfg.fillColor ?? '#6366f1'}` : undefined,
                }} />
              </div>
            )}

            {cfg.showBreakdown && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8, fontSize: '0.75em', opacity: 0.8 }}>
                <span style={{ color: PLATFORM_COLORS.kick }}>🟢 {cfg.kick ?? 0}</span>
                <span style={{ color: PLATFORM_COLORS.youtube }}>▶️ {cfg.youtube ?? 0}</span>
                <span style={{ color: PLATFORM_COLORS.twitch }}>💜 {cfg.twitch ?? 0}</span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
