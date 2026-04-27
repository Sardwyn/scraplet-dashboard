// src/shared/effects/parametricSvg.ts
// SVG overlay renderers for lightsaber border, hologram scanlines etc

import type { EffectParams } from "./parametricEffects";

export function renderLightsaberBorderSVG(
  width: number,
  height: number,
  params: EffectParams,
  t: number,
  borderRadius: number = 0,
  shapePath?: string
): { svgContent: string; filterId: string } {
  const color = String(params.color ?? "#00ffff");
  const glowSize = Number(params.glowSize ?? 8);
  const strokeWidth = Number(params.strokeWidth ?? 2);
  const speed = Number(params.speed ?? 1);
  const trailLength = Number(params.trailLength ?? 0.3);

  // Build the path for the border
  const r = Math.min(borderRadius, width / 2, height / 2);
  const rectPath = r > 0
    ? `M ${r} 0 L ${width - r} 0 Q ${width} 0 ${width} ${r} L ${width} ${height - r} Q ${width} ${height} ${width - r} ${height} L ${r} ${height} Q 0 ${height} 0 ${height - r} L 0 ${r} Q 0 0 ${r} 0 Z`
    : `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
  const path = shapePath || rectPath;

  // Approximate perimeter: for custom paths use bbox perimeter, for rect use exact
  const perimeter = shapePath
    ? 2 * (width + height) // reasonable approximation for arbitrary shapes
    : 2 * (width + height) - (8 - 2 * Math.PI) * r;

  // Animate dashoffset to travel around the border
  const progress = ((t / 1000) * speed) % 1;
  const dashLength = perimeter * trailLength;
  const dashOffset = -progress * perimeter;

  const filterId = `lightsaber-filter-${Math.abs(Math.round(t / 100))}`;

  const svgContent = `
    <defs>
      <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${glowSize * 0.5}" result="blur1"/>
        <feGaussianBlur stdDeviation="${glowSize}" result="blur2"/>
        <feMerge><feMergeNode in="blur2"/><feMergeNode in="blur1"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${dashLength} ${perimeter - dashLength}"
      stroke-dashoffset="${dashOffset}"
      filter="url(#${filterId})"
      opacity="0.9"
    />
    <path d="${path}" fill="none" stroke="white" stroke-width="${strokeWidth * 0.3}"
      stroke-dasharray="${dashLength * 0.3} ${perimeter - dashLength * 0.3}"
      stroke-dashoffset="${dashOffset}"
      opacity="0.6"
    />
  `;

  return { svgContent, filterId };
}

export function renderHologramScanlinesSVG(
  width: number,
  height: number,
  params: EffectParams,
  t: number
): string {
  const color = String(params.color ?? "#00ffff");
  const scanlineOpacity = Number(params.scanlineOpacity ?? 0.15);
  const lineSpacing = 4;
  const lines = Math.ceil(height / lineSpacing);

  // Animate scanline scroll
  const scrollOffset = (t / 20) % lineSpacing;

  let linesStr = "";
  for (let i = 0; i < lines + 1; i++) {
    const y = i * lineSpacing - scrollOffset;
    linesStr += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${color}" stroke-width="1" opacity="${scanlineOpacity}"/>`;
  }

  return linesStr;
}

export function renderRippleSVG(
  width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number
): string {
  const color = String(params.color ?? "#00ffff");
  const rings = Math.round(Number(params.rings ?? 3));
  const speed = Number(params.speed ?? 1);
  const thickness = Number(params.thickness ?? 2);
  const maxScale = Number(params.maxScale ?? 2);
  const opacity = Number(params.opacity ?? 1);
  const cx = width / 2;
  const cy = height / 2;
  const baseRx = width / 2;
  const baseRy = height / 2;
  let out = "";
  for (let i = 0; i < rings; i++) {
    const phase = ((t / 1000 * speed + i / rings) % 1);
    const scale = 1 + (maxScale - 1) * phase;
    const alpha = (1 - phase) * opacity;
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${baseRx * scale}" ry="${baseRy * scale}" fill="none" stroke="${color}" stroke-width="${thickness}" opacity="${alpha.toFixed(3)}"/>`;
  }
  return out;
}

export function renderElectricBorderSVG(
  width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number,
  shapePath?: string
): string {
  const color = String(params.color ?? "#aaff00");
  const intensity = Number(params.intensity ?? 4);
  const speed = Number(params.speed ?? 1);
  const segments = Math.round(Number(params.segments ?? 20));
  const opacity = Number(params.opacity ?? 1);

  const seed = Math.floor(t * speed / 30);
  const rng = (s: number) => ((Math.sin(s * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

  // Turbulence seed cycles to animate the jitter
  const turbSeed = (seed % 999) + 1;
  const filterId = `elec-filter-${turbSeed}`;
  const dispId = `elec-disp-${turbSeed}`;
  const turbId = `elec-turb-${turbSeed}`;

  if (shapePath) {
    // Use the actual shape path with feTurbulence displacement for jagged effect
    const scale = intensity * 1.5;
    return `<defs>
      <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence id="${turbId}" type="turbulence" baseFrequency="0.05" numOctaves="2" seed="${turbSeed}" result="${turbId}out"/>
        <feDisplacementMap in="SourceGraphic" in2="${turbId}out" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="${dispId}"/>
        <feGaussianBlur in="${dispId}" stdDeviation="${intensity * 0.3}" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="${dispId}"/></feMerge>
      </filter>
    </defs>
    <path d="${shapePath}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}" filter="url(#${filterId})"/>
    <path d="${shapePath}" fill="none" stroke="white" stroke-width="0.5" opacity="${(opacity * 0.4).toFixed(2)}" filter="url(#${filterId})"/>`;
  }

  // Fallback: bounding rect with manual jitter
  const pts: string[] = [];
  const perimeter = 2 * (width + height);
  for (let i = 0; i <= segments; i++) {
    const frac = i / segments;
    const dist = frac * perimeter;
    let bx: number, by: number;
    if (dist < width) { bx = dist; by = 0; }
    else if (dist < width + height) { bx = width; by = dist - width; }
    else if (dist < 2 * width + height) { bx = width - (dist - width - height); by = height; }
    else { bx = 0; by = height - (dist - 2 * width - height); }
    const jitter = (rng(seed + i * 7) - 0.5) * intensity * 2;
    const nx = i === 0 || i === segments ? bx : bx + jitter;
    const ny = i === 0 || i === segments ? by : by + jitter;
    pts.push(`${nx.toFixed(1)},${ny.toFixed(1)}`);
  }

  return `<defs>
    <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${intensity * 0.4}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}" filter="url(#${filterId})"/>
  <polyline points="${pts.join(' ')}" fill="none" stroke="white" stroke-width="0.5" opacity="${(opacity * 0.5).toFixed(2)}"/>`;
}

export function renderLensFlareSVG(
  width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number
): string {
  const color = String(params.color ?? "#ffffff");
  const intensity = Number(params.intensity ?? 1);
  const speed = Number(params.speed ?? 1);
  const angleDeg = Number(params.angle ?? 45);
  const opacity = Number(params.opacity ?? 1);
  const rad = angleDeg * Math.PI / 180;
  const cx = width / 2;
  const cy = height / 2;
  const pulse = 0.7 + 0.3 * Math.sin(t / 1000 * Math.PI * 2 * speed);
  const len = Math.max(width, height) * 1.2 * intensity * pulse;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Main streak
  const streak = `<line x1="${cx - dx*len}" y1="${cy - dy*len}" x2="${cx + dx*len}" y2="${cy + dy*len}"
    stroke="${color}" stroke-width="${2 * intensity * pulse}" opacity="${opacity * 0.6}"
    style="filter:blur(${2*intensity}px)"/>`;
  // Rings at intervals along the streak
  const rings = [0.2, 0.4, 0.6, 0.8].map((frac, i) => {
    const rx = cx + dx * len * (frac - 0.5) * 2;
    const ry = cy + dy * len * (frac - 0.5) * 2;
    const r = (8 + i * 6) * intensity * pulse;
    const op = (0.4 - i * 0.07) * opacity;
    return `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="${r.toFixed(1)}" fill="none"
      stroke="${color}" stroke-width="${1.5}" opacity="${op.toFixed(3)}"/>`;
  }).join('');
  // Central glow
  const glow = `<circle cx="${cx}" cy="${cy}" r="${20 * intensity * pulse}" fill="${color}" opacity="${opacity * 0.15 * pulse}"/>`;
  const filterId = `flare-blur-${Math.round(t/200)%10}`;
  return `<defs><filter id="${filterId}"><feGaussianBlur stdDeviation="${3*intensity}"/></filter></defs>
    <g filter="url(#${filterId})">${streak}</g>${rings}${glow}`;
}

export function renderStrokePulseSVG(
  width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number,
  shapePath?: string
): string {
  const color = String(params.color ?? "#00ffff");
  const maxWidth = Number(params.maxWidth ?? 6);
  const speed = Number(params.speed ?? 1);
  const opacity = Number(params.opacity ?? 1);
  const pulse = 0.5 + 0.5 * Math.sin(t / 1000 * Math.PI * 2 * speed);
  const sw = maxWidth * pulse;
  const r = 0;
  const path = shapePath || `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
  const filterId = `sp-glow-${Math.round(t/100)%20}`;
  return `<defs>
    <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${sw * 0.6}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <path d="${path}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}"
    opacity="${(opacity * (0.4 + 0.6 * pulse)).toFixed(3)}" filter="url(#${filterId})"/>`;
}


export function renderCornerBracketsSVG(
  width: number,
  height: number,
  params: EffectParams,
  t: number
): string {
  const color = String(params.color ?? "#00ffff");
  const size = Number(params.size ?? 20);
  const thickness = Number(params.thickness ?? 2);
  const glow = Number(params.glow ?? 4);
  const pulse = params.pulse !== false;
  const speed = Number(params.speed ?? 1);
  const inset = Number(params.inset ?? 0);
  const opacity = Number(params.opacity ?? 1);

  const pulseVal = pulse ? 0.6 + 0.4 * Math.sin((t / 1000) * Math.PI * 2 * speed) : 1;
  const effectiveOpacity = opacity * pulseVal;
  const filterId = `cb-filter-${Math.abs(Math.round(t / 200))}`;

  // Corner positions with inset
  const x0 = inset, y0 = inset;
  const x1 = width - inset, y1 = height - inset;

  // Each corner: two lines (horizontal + vertical)
  const corners = [
    // Top-left
    `M ${x0 + size} ${y0} L ${x0} ${y0} L ${x0} ${y0 + size}`,
    // Top-right
    `M ${x1 - size} ${y0} L ${x1} ${y0} L ${x1} ${y0 + size}`,
    // Bottom-left
    `M ${x0} ${y1 - size} L ${x0} ${y1} L ${x0 + size} ${y1}`,
    // Bottom-right
    `M ${x1} ${y1 - size} L ${x1} ${y1} L ${x1 - size} ${y1}`,
  ];

  const filterDef = glow > 0 ? `
    <defs>
      <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${glow * 0.4}" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>` : '';

  const pathData = corners.join(' ');
  return `${filterDef}
    <path
      d="${pathData}"
      fill="none"
      stroke="${color}"
      stroke-width="${thickness}"
      stroke-linecap="square"
      opacity="${effectiveOpacity.toFixed(3)}"
      ${glow > 0 ? `filter="url(#${filterId})"` : ''}
    />`;
}
