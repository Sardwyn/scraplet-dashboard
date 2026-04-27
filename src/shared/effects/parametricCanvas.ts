// src/shared/effects/parametricCanvas.ts
// Canvas-based effect renderers (particles, lightning)

import type { EffectParams } from "./parametricEffects";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  shape: string;
}

// Per-element particle state (keyed by element id)
const particleState = new Map<string, { particles: Particle[]; lastT: number }>();

export function renderParticleEmitter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: EffectParams,
  t: number,
  elementId: string
) {
  const count = Number(params.count ?? 30);
  const speed = Number(params.speed ?? 1);
  const spread = Number(params.spread ?? 1);
  const gravity = Number(params.gravity ?? 0.1);
  const size = Number(params.size ?? 3);
  const color = String(params.color ?? "#ffffff");
  const fade = params.fade !== false;
  const shape = String(params.shape ?? "circle");

  let state = particleState.get(elementId);
  if (!state) {
    state = { particles: [], lastT: t };
    particleState.set(elementId, state);
  }

  const dt = Math.min(50, t - state.lastT) / 16.67; // normalized to 60fps
  state.lastT = t;

  // Emit new particles
  const emitRate = count / 60 * speed * dt;
  for (let i = 0; i < emitRate; i++) {
    const angle = (Math.random() - 0.5) * Math.PI * 2 * spread;
    const spd = (0.5 + Math.random() * 0.5) * speed * 2;
    state.particles.push({
      x: width / 2 + (Math.random() - 0.5) * width * 0.3,
      y: height / 2 + (Math.random() - 0.5) * height * 0.3,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - speed,
      life: 1,
      maxLife: 0.5 + Math.random() * 0.5,
      size: size * (0.5 + Math.random() * 0.5),
      color,
      shape,
    });
  }

  // Update and draw
  // clearRect handled by caller before clip is applied
  state.particles = state.particles.filter(p => p.life > 0);

  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += gravity * dt;
    p.life -= dt / (p.maxLife * 60);

    const alpha = fade ? Math.max(0, p.life) : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    if (p.shape === "circle") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "square") {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.shape === "spark") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.5;
      ctx.stroke();
    } else if (p.shape === "star") {
      drawStar(ctx, p.x, p.y, p.size, 5);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    else ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
}

export function renderLightningArc(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: EffectParams,
  t: number
) {
  const color = String(params.color ?? "#88aaff");
  const branches = Number(params.branches ?? 3);
  const intensity = Number(params.intensity ?? 1);
  const speed = Number(params.speed ?? 1);

  // clearRect handled by caller before clip is applied

  // Regenerate lightning path every ~speed frames
  const seed = Math.floor(t * speed / 50);

  const rng = (s: number) => ((Math.sin(s * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

  const drawBolt = (x1: number, y1: number, x2: number, y2: number, depth: number, s: number) => {
    if (depth <= 0) return;
    const mx = (x1 + x2) / 2 + (rng(s) - 0.5) * 60 * intensity;
    const my = (y1 + y2) / 2 + (rng(s + 1) - 0.5) * 60 * intensity;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(mx, my);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = depth * intensity;
    ctx.globalAlpha = 0.3 + depth * 0.2;
    ctx.shadowBlur = 10 * intensity;
    ctx.shadowColor = color;
    ctx.stroke();

    if (depth > 1 && rng(s + 2) > 0.5) {
      const bx = mx + (rng(s + 3) - 0.5) * width * 0.3;
      const by = my + (rng(s + 4) - 0.5) * height * 0.3;
      drawBolt(mx, my, bx, by, depth - 1, s + 10);
    }

    drawBolt(x1, y1, mx, my, depth - 1, s + 5);
    drawBolt(mx, my, x2, y2, depth - 1, s + 7);
  };

  for (let i = 0; i < branches; i++) {
    const x1 = rng(seed + i * 3) * width;
    const y1 = rng(seed + i * 3 + 1) * height;
    const x2 = rng(seed + i * 3 + 2) * width;
    const y2 = rng(seed + i * 3 + 3) * height;
    drawBolt(x1, y1, x2, y2, 3, seed + i * 100);
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}


// ── Snowfall ──────────────────────────────────────────────────────────────────
const snowState = new Map<string, { particles: any[]; lastT: number }>();

export function renderSnowfall(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number, elementId: string
) {
  const count = Number(params.count ?? 40);
  const speed = Number(params.speed ?? 1);
  const size = Number(params.size ?? 3);
  const color = String(params.color ?? "#ffffff");
  const wind = Number(params.wind ?? 0.3);

  let state = snowState.get(elementId);
  if (!state) { state = { particles: [], lastT: t }; snowState.set(elementId, state); }
  const dt = Math.min(50, t - state.lastT) / 16.67;
  state.lastT = t;

  // Seed initial particles spread across the element
  while (state.particles.length < count) {
    state.particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5 + wind,
      vy: (0.3 + Math.random() * 0.7) * speed * 1.5,
      r: size * (0.4 + Math.random() * 0.6),
      wobble: Math.random() * Math.PI * 2,
    });
  }

  // clearRect handled by caller before clip is applied
  for (const p of state.particles) {
    p.wobble += 0.03 * dt;
    p.x += (p.vx + Math.sin(p.wobble) * 0.3) * dt;
    p.y += p.vy * dt;
    if (p.y > height + p.r) { p.y = -p.r; p.x = Math.random() * width; }
    if (p.x > width + p.r) p.x = -p.r;
    if (p.x < -p.r) p.x = width + p.r;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7 + Math.sin(p.wobble) * 0.3;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function cleanupSnowState(id: string) { snowState.delete(id); }

// ── Rain ──────────────────────────────────────────────────────────────────────
const rainState = new Map<string, { drops: any[]; lastT: number }>();

export function renderRain(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number, elementId: string
) {
  const count = Number(params.count ?? 60);
  const speed = Number(params.speed ?? 1);
  const angleDeg = Number(params.angle ?? 15);
  const length = Number(params.length ?? 12);
  const color = String(params.color ?? "#88aaff");
  const rad = angleDeg * Math.PI / 180;
  const vx = Math.sin(rad) * speed * 4;
  const vy = Math.cos(rad) * speed * 8;

  let state = rainState.get(elementId);
  if (!state) { state = { drops: [], lastT: t }; rainState.set(elementId, state); }
  const dt = Math.min(50, t - state.lastT) / 16.67;
  state.lastT = t;

  while (state.drops.length < count) {
    state.drops.push({ x: Math.random() * (width + 40) - 20, y: Math.random() * height });
  }

  // clearRect handled by caller before clip is applied
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  for (const d of state.drops) {
    d.x += vx * dt;
    d.y += vy * dt;
    if (d.y > height + length) { d.y = -length; d.x = Math.random() * (width + 40) - 20; }
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - vx / vy * length, d.y - length);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function cleanupRainState(id: string) { rainState.delete(id); }

// ── Fire ──────────────────────────────────────────────────────────────────────
const fireState = new Map<string, { particles: any[]; lastT: number }>();

export function renderFireEmitter(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number, elementId: string
) {
  const intensity = Number(params.intensity ?? 1);
  const spread = Number(params.spread ?? 0.5);
  const speed = Number(params.speed ?? 1);
  const baseColor = String(params.color ?? "#ff4400");

  // Parse base color to get hue for gradient
  const count = Math.round(30 * intensity);

  let state = fireState.get(elementId);
  if (!state) { state = { particles: [], lastT: t }; fireState.set(elementId, state); }
  const dt = Math.min(50, t - state.lastT) / 16.67;
  state.lastT = t;

  const emitRate = count / 60 * speed * dt;
  for (let i = 0; i < emitRate; i++) {
    state.particles.push({
      x: width * (0.2 + Math.random() * 0.6),
      y: height,
      vx: (Math.random() - 0.5) * spread * 3,
      vy: -(1 + Math.random()) * speed * 3,
      life: 1,
      size: 4 + Math.random() * 8 * intensity,
    });
  }

  // clearRect handled by caller before clip is applied
  state.particles = state.particles.filter((p: any) => p.life > 0);
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx += (Math.random() - 0.5) * 0.3 * dt;
    p.life -= dt / 25;
    const alpha = Math.max(0, p.life);
    // Colour shifts from white->yellow->orange->red as life decreases
    const r = 255;
    const g = Math.round(Math.max(0, p.life * 2 - 0.5) * 200);
    const b = Math.round(Math.max(0, p.life * 3 - 2) * 100);
    const radius = Math.max(0.1, p.size * p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.globalAlpha = alpha * 0.8;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function cleanupFireState(id: string) { fireState.delete(id); }

// ── Motion Trail ─────────────────────────────────────────────────────────────
// Stores snapshots of the canvas content and replays them with fading opacity
const trailState = new Map<string, { frames: ImageData[]; lastCapture: number }>();

export function renderMotionTrail(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  params: import("./parametricEffects").EffectParams, t: number, elementId: string
) {
  const length = Math.round(Number(params.length ?? 8));
  const decay = Number(params.decay ?? 0.7);
  const opacity = Number(params.opacity ?? 1);

  let state = trailState.get(elementId);
  if (!state) { state = { frames: [], lastCapture: 0 }; trailState.set(elementId, state); }

  // Capture current frame every ~33ms (30fps)
  if (t - state.lastCapture > 33) {
    try {
      const frame = ctx.getImageData(0, 0, width, height);
      state.frames.unshift(frame);
      if (state.frames.length > length) state.frames.length = length;
      state.lastCapture = t;
    } catch (e) { /* cross-origin canvas */ }
  }

  // Draw trail frames back-to-front with decaying opacity
  for (let i = state.frames.length - 1; i >= 0; i--) {
    const alpha = opacity * Math.pow(decay, i + 1) * (1 - i / length);
    if (alpha < 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.putImageData(state.frames[i], 0, 0);
  }
  ctx.globalAlpha = 1;
}

export function cleanupTrailState(id: string) { trailState.delete(id); }

export function cleanupParticleState(elementId: string) {
  particleState.delete(elementId);
}

// ── Film Grain ────────────────────────────────────────────────────────────────
// Uses ImageData + fast integer RNG (xorshift) for performance.
// Writes directly to pixel buffer — no per-pixel fillRect or Math.sin.
const _grainBuffers = new Map<string, { buf: Uint8ClampedArray; w: number; h: number }>();

export function renderFilmGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: EffectParams,
  t: number,
  elementId: string
) {
  const intensity = Math.min(1, Math.max(0, Number(params.intensity ?? 0.15)));
  const grainSize = Math.max(1, Math.round(Number(params.size ?? 1)));
  const colored = params.colored === true;
  const speed = Number(params.speed ?? 1);
  const opacity = Number(params.opacity ?? 1);

  // Work at reduced resolution then scale up — huge perf win
  const gw = Math.ceil(width / grainSize);
  const gh = Math.ceil(height / grainSize);
  const pixelCount = gw * gh;

  // Reuse buffer if same size
  let cached = _grainBuffers.get(elementId);
  if (!cached || cached.w !== gw || cached.h !== gh) {
    cached = { buf: new Uint8ClampedArray(gw * gh * 4), w: gw, h: gh };
    _grainBuffers.set(elementId, cached);
  }
  const buf = cached.buf;

  // Fast xorshift32 RNG — seed changes each frame based on time
  let rng = (Math.floor(t * speed / 40) * 1664525 + 1013904223) >>> 0;
  const next = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };

  // Alpha scaled by intensity (0-255)
  const alpha = Math.round(intensity * 255);

  for (let i = 0; i < pixelCount; i++) {
    const v = next();
    const idx = i * 4;
    if (colored) {
      buf[idx]     = (v & 0xff);
      buf[idx + 1] = ((v >> 8) & 0xff);
      buf[idx + 2] = ((v >> 16) & 0xff);
    } else {
      const lum = v & 0xff;
      buf[idx] = buf[idx + 1] = buf[idx + 2] = lum;
    }
    buf[idx + 3] = alpha;
  }

  // Create ImageData at grain resolution and draw scaled up
  const imgData = new ImageData(buf, gw, gh);

  // Draw to a temp offscreen canvas at grain size, then scale to element size
  const offscreen = new OffscreenCanvas(gw, gh);
  const offCtx = offscreen.getContext('2d')!;
  offCtx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'overlay';
  // Scale up with pixelated rendering for sharp grain
  (ctx as any).imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, width, height);
  ctx.restore();
}

export function cleanupGrainState(elementId: string) {
  _grainBuffers.delete(elementId);
}

// ── Tape Noise ────────────────────────────────────────────────────────────────
export function renderTapeNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: EffectParams,
  t: number,
  elementId: string
) {
  const density = Number(params.density ?? 0.05);
  const bandHeight = Math.max(1, Number(params.bandHeight ?? 3));
  const intensity = Number(params.intensity ?? 0.6);
  const colorNoise = params.colorNoise === true;
  const speed = Number(params.speed ?? 1);
  const opacity = Number(params.opacity ?? 1);

  const seed = Math.floor(t * speed / 100);
  const rng = (s: number) => ((Math.sin(s * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

  ctx.save();
  ctx.globalAlpha = opacity;

  const rows = Math.ceil(height / bandHeight);
  for (let row = 0; row < rows; row++) {
    const r = rng(row * 3.7 + seed);
    if (r > density) continue;

    const y = row * bandHeight;
    const noiseIntensity = intensity * rng(row * 7.1 + seed + 1);
    const xOffset = (rng(row * 5.3 + seed + 2) - 0.5) * width * 0.3;

    if (colorNoise) {
      const hue = Math.round(rng(row + seed + 3) * 360);
      ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${noiseIntensity})`;
    } else {
      const v = Math.round(rng(row * 2.1 + seed + 4) * 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${noiseIntensity})`;
    }

    // Draw a horizontal band with slight x offset (tape tracking artifact)
    ctx.fillRect(xOffset, y, width - Math.abs(xOffset), bandHeight);
    // Fill the gap left by offset
    if (xOffset > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, y, xOffset, bandHeight);
    } else if (xOffset < 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(width + xOffset, y, -xOffset, bandHeight);
    }
  }
  ctx.restore();
}
