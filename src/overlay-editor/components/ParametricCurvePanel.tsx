/**
 * ParametricCurvePanel.tsx
 *
 * Compact flyout curve editor — FL Studio EQ style.
 * Dark graph, colored lines, numbered draggable nodes.
 * Sized to content, not full height.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { ParametricEffectDef, PresetDefinition, ParamSchema } from '../../shared/effects/parametricEffects';

interface Node { t: number; value: number; }

interface Props {
  effect: ParametricEffectDef & { id?: string };
  presetDef: PresetDefinition;
  onUpdate: (updated: ParametricEffectDef) => void;
  onClose: () => void;
}

const COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f87171',
  '#c084fc', '#22d3ee', '#fb923c', '#a3e635',
];

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function getNodes(effect: ParametricEffectDef, key: string): Node[] {
  return (effect.keyframes ?? [])
    .filter(kf => kf.params && key in kf.params)
    .map(kf => ({ t: kf.t, value: kf.params[key] as number }))
    .sort((a, b) => a.t - b.t);
}

function buildPath(
  nodes: Node[], duration: number, fallback: number,
  toX: (t: number) => number, toY: (v: number) => number
): string {
  const pts = nodes.length > 0 ? nodes : [{ t: 0, value: fallback }, { t: duration, value: fallback }];
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  const full: Node[] = [];
  if (sorted[0].t > 0) full.push({ t: 0, value: sorted[0].value });
  full.push(...sorted);
  if (sorted[sorted.length - 1].t < duration) full.push({ t: duration, value: sorted[sorted.length - 1].value });
  return full.map((n, i) => `${i === 0 ? 'M' : 'L'} ${toX(n.t).toFixed(1)} ${toY(n.value).toFixed(1)}`).join(' ');
}

export function ParametricCurvePanel({ effect, presetDef, onUpdate, onClose }: Props) {
  const animatable = presetDef.params.filter(p => p.animatable && p.type === 'number');
  const statics = presetDef.params.filter(p => !p.animatable || p.type !== 'number');

  const [selParam, setSelParam] = useState(animatable[0]?.key ?? '');
  const [duration, setDuration] = useState(effect.duration ?? 0);
  const [durInput, setDurInput] = useState(effect.duration ? String(effect.duration) : '');
  const [dragging, setDragging] = useState<{ key: string; idx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Graph dimensions
  const GW = 420, GH = 200;
  const PL = 32, PR = 12, PT = 12, PB = 24;
  const IW = GW - PL - PR, IH = GH - PT - PB;
  const effDur = duration > 0 ? duration : 4000;

  const toX = (t: number) => PL + (t / effDur) * IW;
  const toY = (v: number, p: ParamSchema) => PT + IH - ((v - (p.min ?? 0)) / ((p.max ?? 1) - (p.min ?? 0))) * IH;
  const fromX = (x: number) => clamp(Math.round(((x - PL) / IW) * effDur / 10) * 10, 0, effDur);
  const fromY = (y: number, p: ParamSchema) => {
    const min = p.min ?? 0, max = p.max ?? 1, step = p.step ?? 0.1;
    return clamp(Math.round((min + ((PT + IH - y) / IH) * (max - min)) / step) * step, min, max);
  };

  const svgPos = (e: MouseEvent | React.MouseEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const param = animatable.find(p => p.key === selParam);
    if (!param) return;
    const { x, y } = svgPos(e);
    const t = fromX(x), value = fromY(y, param);
    const others = (effect.keyframes ?? []).filter(kf => !(kf.params && selParam in kf.params));
    const existing = getNodes(effect, selParam);
    const merged = [...existing, { t, value }].sort((a, b) => a.t - b.t);
    onUpdate({ ...effect, keyframes: [...others, ...merged.map(n => ({ t: n.t, params: { [selParam]: n.value } }))] });
  }, [selParam, effect, animatable, effDur, IW, IH, PL, PT]);

  const handleNodeDown = useCallback((e: React.MouseEvent, key: string, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    setDragging({ key, idx }); setSelParam(key);
  }, []);

  const handleNodeDblClick = useCallback((e: React.MouseEvent, key: string, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    const nodes = getNodes(effect, key).filter((_, i) => i !== idx);
    const others = (effect.keyframes ?? []).filter(kf => !(kf.params && key in kf.params));
    onUpdate({ ...effect, keyframes: [...others, ...nodes.map(n => ({ t: n.t, params: { [key]: n.value } }))] });
  }, [effect]);

  useEffect(() => {
    if (!dragging) return;
    const param = animatable.find(p => p.key === dragging.key);
    if (!param) return;
    const onMove = (e: MouseEvent) => {
      const { x, y } = svgPos(e);
      const nodes = getNodes(effect, dragging.key).map((n, i) =>
        i === dragging.idx ? { t: fromX(x), value: fromY(y, param) } : n
      );
      const others = (effect.keyframes ?? []).filter(kf => !(kf.params && dragging.key in kf.params));
      onUpdate({ ...effect, keyframes: [...others, ...nodes.map(n => ({ t: n.t, params: { [dragging.key]: n.value } }))] });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, effect, animatable, effDur, IW, IH, PL, PT]);

  const saveDuration = () => {
    const ms = parseInt(durInput);
    const d = isNaN(ms) || ms <= 0 ? 0 : ms;
    setDuration(d);
    onUpdate({ ...effect, duration: d || undefined });
  };

  // Panel width = graph + padding
  const PW = GW + 32;

  return (
    <div style={{
      width: PW,
      background: '#0a0a12',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0d0d18' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>{presetDef.label}</span>
          <span style={{ fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.12)', padding: '1px 6px', borderRadius: 4 }}>✦ Curve Editor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#475569' }}>Duration (ms)</span>
          <input
            type="number" placeholder="∞ loop" value={durInput}
            onChange={e => setDurInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveDuration()}
            style={{ width: 72, fontSize: 11, background: '#161622', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', padding: '2px 6px', textAlign: 'right' }}
          />
          <button onClick={saveDuration} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
          <button onClick={onClose} style={{ fontSize: 14, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>✕</button>
        </div>
      </div>

      {/* Param tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '7px 14px', background: '#0d0d18', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {animatable.map((param, idx) => {
          const color = COLORS[idx % COLORS.length];
          const sel = selParam === param.key;
          const nodeCount = getNodes(effect, param.key).length;
          return (
            <button key={param.key} onClick={() => setSelParam(param.key)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px',
              borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: sel ? 600 : 400,
              background: sel ? `${color}20` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sel ? color : 'rgba(255,255,255,0.07)'}`,
              color: sel ? color : '#64748b', transition: 'all 0.1s',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: nodeCount > 0 ? 1 : 0.35, flexShrink: 0 }} />
              {param.label}
              {nodeCount > 0 && <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>{nodeCount}</span>}
            </button>
          );
        })}
      </div>

      {/* Graph */}
      <div style={{ padding: '10px 14px 4px' }}>
        <svg
          ref={svgRef}
          width={GW} height={GH}
          style={{ display: 'block', background: '#06060f', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)', cursor: dragging ? 'grabbing' : 'crosshair' }}
          onContextMenu={handleContextMenu}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={toX(f * effDur)} y1={PT} x2={toX(f * effDur)} y2={PT + IH} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <line x1={PL} y1={PT + f * IH} x2={PL + IW} y2={PT + f * IH} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            </g>
          ))}

          {/* Curves */}
          {animatable.map((param, idx) => {
            const color = COLORS[idx % COLORS.length];
            const sel = selParam === param.key;
            const nodes = getNodes(effect, param.key);
            const fallback = Number(effect.params[param.key] ?? param.default);
            const d = buildPath(nodes, effDur, fallback, toX, v => toY(v, param));
            return (
              <g key={param.key}>
                {/* Glow for selected */}
                {sel && <path d={d} fill="none" stroke={color} strokeWidth={6} strokeOpacity={0.08} />}
                <path d={d} fill="none" stroke={color} strokeWidth={sel ? 2 : 1.5}
                  strokeOpacity={sel ? 0.95 : 0.35}
                  strokeDasharray={nodes.length === 0 ? '5 4' : undefined}
                />
                {/* Nodes */}
                {nodes.map((node, ni) => {
                  const x = toX(node.t), y = toY(node.value, param);
                  const active = dragging?.key === param.key && dragging?.idx === ni;
                  return (
                    <g key={ni}>
                      {/* Large hit area */}
                      <circle cx={x} cy={y} r={12} fill="transparent"
                        onMouseDown={e => handleNodeDown(e, param.key, ni)}
                        onDoubleClick={e => handleNodeDblClick(e, param.key, ni)}
                        style={{ cursor: 'grab' }}
                      />
                      {/* Outer ring */}
                      <circle cx={x} cy={y} r={active ? 9 : sel ? 7 : 5}
                        fill={`${color}30`} stroke={color} strokeWidth={active ? 2 : 1.5}
                        style={{ pointerEvents: 'none' }}
                      />
                      {/* Inner dot */}
                      <circle cx={x} cy={y} r={active ? 4 : 2.5}
                        fill={active ? '#fff' : color}
                        style={{ pointerEvents: 'none' }}
                      />
                      {/* Node number */}
                      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
                        fontSize={7} fontWeight={700} fill={active ? '#000' : color}
                        style={{ pointerEvents: 'none', opacity: active ? 1 : 0.8 }}
                      >{ni + 1}</text>
                      {/* Value tooltip */}
                      {(active || sel) && (
                        <text x={x + 10} y={y - 8} fontSize={9} fill={color} fontWeight={600}>
                          {node.value.toFixed(param.step && param.step < 1 ? 2 : 0)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Axis labels */}
          <text x={PL} y={GH - 6} fontSize={9} fill="rgba(255,255,255,0.2)">0</text>
          <text x={PL + IW} y={GH - 6} fontSize={9} fill="rgba(255,255,255,0.2)" textAnchor="end">
            {duration > 0 ? `${duration}ms` : `${effDur}ms (∞)`}
          </text>
          {/* Y axis for selected param */}
          {(() => {
            const param = animatable.find(p => p.key === selParam);
            if (!param) return null;
            const color = COLORS[animatable.indexOf(param) % COLORS.length];
            return <>
              <text x={PL - 4} y={PT + 4} fontSize={9} fill={color} textAnchor="end" opacity={0.7}>{param.max}</text>
              <text x={PL - 4} y={PT + IH + 2} fontSize={9} fill={color} textAnchor="end" opacity={0.7}>{param.min}</text>
            </>;
          })()}
        </svg>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 5, letterSpacing: '0.02em' }}>
          Right-click to add node · Double-click to remove · Drag to adjust
        </div>
      </div>

      {/* Static params */}
      {statics.length > 0 && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 4 }}>
          <div style={{ fontSize: 9, color: '#334155', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Static Params</div>
          {statics.map(param => (
            <div key={param.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <label style={{ fontSize: 11, color: '#64748b', width: 72, flexShrink: 0 }}>{param.label}</label>
              {param.type === 'color' ? (
                <input type="color" value={String(effect.params[param.key] ?? param.default)}
                  onChange={e => onUpdate({ ...effect, params: { ...effect.params, [param.key]: e.target.value } })}
                  style={{ width: 32, height: 22, borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer' }}
                />
              ) : param.type === 'boolean' ? (
                <input type="checkbox" checked={Boolean(effect.params[param.key] ?? param.default)}
                  onChange={e => onUpdate({ ...effect, params: { ...effect.params, [param.key]: e.target.checked } })}
                  style={{ accentColor: '#6366f1' }}
                />
              ) : (
                <>
                  <input type="range" min={param.min ?? 0} max={param.max ?? 10} step={param.step ?? 0.1}
                    value={Number(effect.params[param.key] ?? param.default)}
                    onChange={e => onUpdate({ ...effect, params: { ...effect.params, [param.key]: Number(e.target.value) } })}
                    style={{ flex: 1, accentColor: '#6366f1', height: 3 }}
                  />
                  <span style={{ fontSize: 11, color: '#94a3b8', width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(effect.params[param.key] ?? param.default).toFixed(param.step && param.step < 1 ? 1 : 0)}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
