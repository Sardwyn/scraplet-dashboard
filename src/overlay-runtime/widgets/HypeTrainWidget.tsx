/**
 * HypeTrainWidget.tsx
 * Declarative React renderer for the Hype Train widget.
 * Consumes state emitted by hype-train.js.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface HypeTrainState {
  status: 'idle' | 'active';
  level: number;
  points: number;
  pointsToNext: number;
  conductorUsername?: string;
  conductorAvatar?: string;
  expiresAt?: string;
  // Config
  trainColor: string;
  trainColor2: string;
  wheelColor: string;
  smokeColor: string;
  barColor: string;
  barBg: string;
  textColor: string;
  fontFamily: string;
  showConductor: boolean;
  showLevel: boolean;
  showTimer: boolean;
  showBar: boolean;
}

const KEYFRAMES = `
  @keyframes ht-smoke { 0%{opacity:0.8;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-20px) scale(2)} }
  @keyframes ht-spin  { from{transform-origin:center;transform:rotate(0deg)} to{transform-origin:center;transform:rotate(360deg)} }
  @keyframes ht-idle  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px)} }
  @keyframes ht-rock  { 0%,100%{transform:translateY(0) rotate(0deg)} 25%{transform:translateY(-2px) rotate(-0.5deg)} 75%{transform:translateY(-1px) rotate(0.5deg)} }
  @keyframes ht-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
  @keyframes ht-bounce{ 0%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} 60%{transform:translateY(-2px)} }
  @keyframes ht-chaos { 0%{transform:translate(0,0) rotate(0deg)} 20%{transform:translate(-4px,-3px) rotate(-1deg)} 40%{transform:translate(4px,-5px) rotate(1deg)} 60%{transform:translate(-3px,-2px) rotate(-0.5deg)} 80%{transform:translate(3px,-4px) rotate(0.5deg)} 100%{transform:translate(0,0) rotate(0deg)} }
  @keyframes ht-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes ht-levelup-anim { 0%{opacity:0;transform:translateX(-50%) scale(0.5)} 20%{opacity:1;transform:translateX(-50%) scale(1.2)} 80%{opacity:1;transform:translateX(-50%) scale(1)} 100%{opacity:0;transform:translateX(-50%) scale(0.8)} }
`;

function levelColor(lvl: number): string {
  if (lvl <= 1) return '#6366f1';
  if (lvl === 2) return '#8b5cf6';
  if (lvl === 3) return '#a855f7';
  if (lvl === 4) return '#f59e0b';
  if (lvl === 5) return '#ef4444';
  const r = Math.min(255, 200 + (lvl - 6) * 10);
  return `rgb(${r},50,50)`;
}

function trainAnimation(lvl: number, isActive: boolean): string {
  if (!isActive) return 'none';
  if (lvl === 1) return 'ht-idle 2s ease infinite';
  if (lvl === 2) return 'ht-rock 1.5s ease infinite';
  if (lvl === 3) return 'ht-shake 0.8s ease infinite';
  if (lvl === 4) return 'ht-bounce 0.6s ease infinite';
  const dur = Math.max(0.2, 0.5 - (lvl - 5) * 0.05);
  return `ht-chaos ${dur}s ease infinite`;
}

export function HypeTrainWidget({ state }: WidgetRendererProps) {
  const cfg = state as HypeTrainState;
  const [timerText, setTimerText] = useState('--');
  const [timerUrgent, setTimerUrgent] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const prevLevelRef = useRef(cfg.level ?? 1);

  const isActive = cfg.status === 'active';
  const lvl = cfg.level ?? 1;
  const barPct = cfg.pointsToNext > 0 ? Math.min(100, (cfg.points / cfg.pointsToNext) * 100) : 100;
  const color = levelColor(lvl);
  const spinDur = isActive ? Math.max(0.1, 1.5 - (lvl - 1) * 0.2) : 0;

  // Timer
  useEffect(() => {
    if (!cfg.expiresAt || !isActive) { setTimerText('--'); return; }
    const tick = () => {
      const remaining = Math.max(0, new Date(cfg.expiresAt!).getTime() - Date.now());
      const secs = Math.ceil(remaining / 1000);
      setTimerText(remaining <= 0 ? 'ENDED' : secs + 's');
      setTimerUrgent(secs <= 5 && remaining > 0);
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [cfg.expiresAt, isActive]);

  // Level up flash
  useEffect(() => {
    if (lvl > prevLevelRef.current) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 2000);
    }
    prevLevelRef.current = lvl;
  }, [lvl]);

  const c = cfg.trainColor ?? '#6366f1';
  const c2 = cfg.trainColor2 ?? '#4f46e5';
  const w = cfg.wheelColor ?? '#1e1b4b';
  const smoke = cfg.smokeColor ?? 'rgba(200,200,220,0.7)';
  const wheelAnim = spinDur > 0 ? `ht-spin ${spinDur}s linear infinite` : 'none';

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{ fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif', color: cfg.textColor ?? '#ffffff', position: 'relative', minWidth: 240, padding: 8 }}>
        {/* Train SVG */}
        <div style={{ position: 'relative', width: '100%', height: 100 }}>
          <svg style={{ width: '100%', height: 100, animation: trainAnimation(lvl, isActive) }} viewBox="0 0 220 100" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="88" x2="220" y2="88" stroke="rgba(255,255,255,0.15)" strokeWidth="2"/>
            <line x1="0" y1="92" x2="220" y2="92" stroke="rgba(255,255,255,0.15)" strokeWidth="2"/>
            <rect x="8" y="58" width="44" height="26" rx="3" fill={c2}/>
            <rect x="52" y="72" width="8" height="4" rx="1" fill="rgba(255,255,255,0.3)"/>
            <rect x="60" y="50" width="80" height="34" rx="4" fill={c}/>
            <rect x="120" y="38" width="36" height="46" rx="4" fill={c}/>
            <rect x="126" y="44" width="12" height="10" rx="2" fill="rgba(255,255,255,0.15)"/>
            <rect x="140" y="44" width="10" height="10" rx="2" fill="rgba(255,255,255,0.15)"/>
            <ellipse cx="95" cy="50" rx="12" ry="8" fill={c2}/>
            <rect x="68" y="30" width="10" height="22" rx="2" fill={c2}/>
            <rect x="65" y="28" width="16" height="5" rx="2" fill={c2}/>
            <circle style={{ animation: 'ht-smoke 1.2s ease infinite' }} cx="73" cy="22" r="6" fill={smoke}/>
            <circle style={{ animation: 'ht-smoke 1.2s ease 0.4s infinite' }} cx="73" cy="14" r="4" fill={smoke}/>
            <circle style={{ animation: 'ht-smoke 1.2s ease 0.8s infinite' }} cx="73" cy="8" r="3" fill={smoke}/>
            <circle cx="158" cy="62" r="5" fill="rgba(255,255,200,0.9)"/>
            <circle cx="158" cy="62" r="3" fill="white"/>
            <polygon points="156,84 170,84 175,92 151,92" fill={c2}/>
            <circle style={{ animation: wheelAnim }} cx="90" cy="84" r="10" fill={w} stroke={c} strokeWidth="2"/>
            <circle cx="90" cy="84" r="3" fill={c}/>
            <circle style={{ animation: wheelAnim }} cx="148" cy="84" r="8" fill={w} stroke={c} strokeWidth="2"/>
            <circle cx="148" cy="84" r="2.5" fill={c}/>
            <circle style={{ animation: wheelAnim }} cx="22" cy="84" r="7" fill={w} stroke={c2} strokeWidth="1.5"/>
            <circle style={{ animation: wheelAnim }} cx="42" cy="84" r="7" fill={w} stroke={c2} strokeWidth="1.5"/>
            {isActive && lvl >= 3 && (
              <g>
                <line x1="73" y1="28" x2="60" y2="15" stroke="rgba(200,220,255,0.6)" strokeWidth="2" strokeDasharray="3,2"/>
                <line x1="73" y1="28" x2="86" y2="15" stroke="rgba(200,220,255,0.6)" strokeWidth="2" strokeDasharray="3,2"/>
              </g>
            )}
            {isActive && lvl >= 5 && (
              <g>
                <ellipse cx="73" cy="26" rx="5" ry="7" fill="rgba(255,100,0,0.8)"/>
                <ellipse cx="73" cy="24" rx="3" ry="5" fill="rgba(255,200,0,0.9)"/>
              </g>
            )}
          </svg>
        </div>

        {/* Progress bar */}
        {cfg.showBar && (
          <div style={{ height: 6, background: cfg.barBg ?? 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', margin: '4px 0' }}>
            <div style={{ height: '100%', background: color, borderRadius: 999, width: `${barPct}%`, transition: 'width 0.4s ease' }} />
          </div>
        )}

        {/* Info row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
          {cfg.showLevel && <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', color }}>{`LEVEL ${lvl}`}</div>}
          {cfg.showTimer && (
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', opacity: timerUrgent ? 1 : 0.7, color: timerUrgent ? '#ef4444' : 'inherit', animation: timerUrgent ? 'ht-blink 0.6s ease infinite' : 'none' }}>
              {timerText}
            </div>
          )}
        </div>

        {/* Conductor */}
        {cfg.showConductor && cfg.conductorUsername && isActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, marginTop: 4, fontSize: 11 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
              {(cfg.conductorUsername[0] || '?').toUpperCase()}
            </div>
            <div>
              <div style={{ opacity: 0.5, fontSize: 10 }}>🚂 CONDUCTOR</div>
              <div style={{ fontWeight: 700 }}>{cfg.conductorUsername}</div>
            </div>
          </div>
        )}

        {/* Level up flash */}
        {showLevelUp && (
          <div style={{ position: 'absolute', top: 10, left: '50%', fontSize: 22, fontWeight: 900, letterSpacing: '0.15em', color: '#fbbf24', textShadow: '0 0 20px #f59e0b', pointerEvents: 'none', whiteSpace: 'nowrap', animation: 'ht-levelup-anim 2s ease forwards' }}>
            {`LEVEL ${lvl}!`}
          </div>
        )}
      </div>
    </>
  );
}
