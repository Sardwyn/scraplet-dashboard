/**
 * ParametricCurveEditor.tsx
 * 
 * A curve graph editor for parametric effect params.
 * Shows a timeline with draggable keyframe handles.
 * Replaces sliders for animatable params.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';

interface Keyframe {
  t: number;   // ms, 0..duration
  value: number; // param value
}

interface CurveEditorProps {
  paramKey: string;
  label: string;
  min: number;
  max: number;
  step: number;
  duration: number; // ms
  currentValue: number; // current static value (used if no keyframes)
  keyframes: Keyframe[]; // existing keyframes for this param
  onChange: (keyframes: Keyframe[]) => void;
  onStaticChange: (value: number) => void; // when no keyframes, just change static value
  width?: number;
  height?: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function ParametricCurveEditor({
  paramKey, label, min, max, step, duration,
  currentValue, keyframes, onChange, onStaticChange,
  width = 280, height = 80,
}: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null); // index of dragged keyframe
  const [hovered, setHovered] = useState<number | null>(null);
  const PAD = 12;
  const W = width - PAD * 2;
  const H = height - PAD * 2;

  // Convert value to Y pixel
  const valToY = (v: number) => PAD + H - ((v - min) / (max - min)) * H;
  // Convert time to X pixel
  const tToX = (t: number) => PAD + (t / duration) * W;
  // Convert pixel to value
  const yToVal = (y: number) => {
    const v = min + ((PAD + H - y) / H) * (max - min);
    return clamp(Math.round(v / step) * step, min, max);
  };
  // Convert pixel to time
  const xToT = (x: number) => {
    const t = ((x - PAD) / W) * duration;
    return clamp(Math.round(t / 10) * 10, 0, duration);
  };

  // Build path from keyframes (or flat line if no keyframes)
  const buildPath = () => {
    const pts: Keyframe[] = keyframes.length > 0
      ? [...keyframes].sort((a, b) => a.t - b.t)
      : [{ t: 0, value: currentValue }, { t: duration, value: currentValue }];

    if (pts.length === 1) {
      const x = tToX(pts[0].t);
      const y = valToY(pts[0].value);
      return `M ${PAD} ${y} L ${PAD + W} ${y}`;
    }

    // Ensure endpoints
    const sorted = [...pts];
    if (sorted[0].t > 0) sorted.unshift({ t: 0, value: sorted[0].value });
    if (sorted[sorted.length - 1].t < duration) sorted.push({ t: duration, value: sorted[sorted.length - 1].value });

    return sorted.map((kf, i) => {
      const x = tToX(kf.t);
      const y = valToY(kf.value);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
  };

  const getSvgPos = (e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(idx);
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (dragging !== null) return;
    const { x, y } = getSvgPos(e);
    const t = xToT(x);
    const value = yToVal(y);
    // Add new keyframe
    const newKfs = [...keyframes, { t, value }].sort((a, b) => a.t - b.t);
    onChange(newKfs);
  }, [dragging, keyframes, duration, min, max, step, W, H, PAD]);

  useEffect(() => {
    if (dragging === null) return;
    const onMove = (e: MouseEvent) => {
      const { x, y } = getSvgPos(e);
      const t = xToT(x);
      const value = yToVal(y);
      const newKfs = keyframes.map((kf, i) => i === dragging ? { t, value } : kf);
      onChange(newKfs);
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, keyframes, duration, min, max, step, W, H, PAD]);

  const removeKeyframe = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(keyframes.filter((_, i) => i !== idx));
  };

  const hasKeyframes = keyframes.length > 0;
  const path = buildPath();

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!hasKeyframes && (
            <input
              type="number"
              value={Number(currentValue.toFixed(step < 1 ? 2 : 0))}
              min={min} max={max} step={step}
              onChange={e => onStaticChange(Number(e.target.value))}
              style={{
                width: 48, fontSize: 11, background: '#1a1a2a',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
                color: '#e2e8f0', padding: '1px 4px', textAlign: 'right',
              }}
            />
          )}
          {hasKeyframes && (
            <button
              onClick={() => onChange([])}
              style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
              title="Clear keyframes"
            >✕ clear</button>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          background: '#0a0a14',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.06)',
          cursor: dragging !== null ? 'grabbing' : 'crosshair',
          display: 'block',
        }}
        onClick={handleSvgClick}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t}
            x1={tToX(t * duration)} y1={PAD}
            x2={tToX(t * duration)} y2={PAD + H}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          />
        ))}
        {[0, 0.5, 1].map(v => (
          <line key={v}
            x1={PAD} y1={valToY(min + v * (max - min))}
            x2={PAD + W} y2={valToY(min + v * (max - min))}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          />
        ))}

        {/* Curve */}
        <path d={path} fill="none" stroke="#6366f1" strokeWidth={1.5} />

        {/* Keyframe handles */}
        {keyframes.map((kf, i) => {
          const x = tToX(kf.t);
          const y = valToY(kf.value);
          const isActive = dragging === i || hovered === i;
          return (
            <g key={i}>
              <circle
                cx={x} cy={y} r={isActive ? 6 : 4}
                fill={isActive ? '#818cf8' : '#6366f1'}
                stroke="#1e1b4b" strokeWidth={1.5}
                style={{ cursor: 'grab' }}
                onMouseDown={e => handleMouseDown(e, i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onContextMenu={e => removeKeyframe(e, i)}
              />
            </g>
          );
        })}

        {/* Time labels */}
        <text x={PAD} y={height - 2} fontSize={8} fill="rgba(255,255,255,0.2)">0</text>
        <text x={PAD + W} y={height - 2} fontSize={8} fill="rgba(255,255,255,0.2)" textAnchor="end">{duration}ms</text>
        <text x={PAD - 2} y={PAD + 4} fontSize={8} fill="rgba(255,255,255,0.2)" textAnchor="end">{max}</text>
        <text x={PAD - 2} y={PAD + H} fontSize={8} fill="rgba(255,255,255,0.2)" textAnchor="end">{min}</text>
      </svg>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>
        Click to add keyframe · Right-click handle to remove
      </div>
    </div>
  );
}
