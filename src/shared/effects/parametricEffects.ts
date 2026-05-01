import type React from 'react';
// src/shared/effects/parametricEffects.ts
// Parametric animated effect system
// Each preset is a pure function: (params, t, element) => { css?, svgFilter?, canvasRenderer? }

export type EffectParamValue = number | string | boolean;

export interface EffectParams {
  [key: string]: EffectParamValue;
}

export interface EffectKeyframe {
  t: number; // ms
  params: Partial<EffectParams>;
}

export interface ParametricEffectDef {
  id?: string;
  type: "parametric";
  enabled?: boolean;
  preset: string;
  params: EffectParams;
  // Optional animation - keyframes interpolate params over time
  keyframes?: EffectKeyframe[];
  // Duration for looping effects (ms). 0 = no loop
  duration?: number;
}

// ── Param schema for editor UI ────────────────────────────────────────────────
export interface ParamSchema {
  key: string;
  label: string;
  type: "number" | "color" | "boolean" | "select";
  default: EffectParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  animatable?: boolean; // can be keyframed
}

export interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  category: "glow" | "motion" | "distortion" | "reveal" | "particle" | "color";
  params: ParamSchema[];
  defaultDuration: number; // ms for one loop cycle
  // What the effect produces
  produces: ("css" | "svgFilter" | "canvas" | "svgOverlay")[];
}

// ── Preset registry ───────────────────────────────────────────────────────────
export const EFFECT_PRESETS: Record<string, PresetDefinition> = {
  neonPulse: {
    id: "neonPulse",
    label: "Neon Pulse",
    description: "Pulsing outer glow with colour cycling",
    category: "glow",
    defaultDuration: 1500,
    produces: ["css"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#00ffff", animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1, min: 0, max: 3, step: 0.1, animatable: true },
      { key: "size", label: "Size", type: "number", default: 20, min: 0, max: 80, step: 1, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  lightsaberBorder: {
    id: "lightsaberBorder",
    label: "Lightsaber Border",
    description: "Travelling glow along the element border",
    category: "glow",
    defaultDuration: 2000,
    produces: ["svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#00ffff", animatable: true },
      { key: "glowSize", label: "Glow Size", type: "number", default: 8, min: 1, max: 40, step: 1, animatable: true },
      { key: "strokeWidth", label: "Width", type: "number", default: 2, min: 1, max: 10, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "trailLength", label: "Trail", type: "number", default: 0.3, min: 0.05, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  glitchFlicker: {
    id: "glitchFlicker",
    label: "Glitch Flicker",
    description: "Random translate/skew/opacity spikes",
    category: "distortion",
    defaultDuration: 800,
    produces: ["css"],
    params: [
      { key: "intensity", label: "Intensity", type: "number", default: 1, min: 0, max: 3, step: 0.1, animatable: true },
      { key: "frequency", label: "Frequency", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "colorShift", label: "Color Shift", type: "boolean", default: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  cameraShake: {
    id: "cameraShake",
    label: "Camera Shake",
    description: "Sinusoidal translate on X/Y",
    category: "motion",
    defaultDuration: 500,
    produces: ["css"],
    params: [
      { key: "intensity", label: "Intensity", type: "number", default: 5, min: 0, max: 50, step: 1, animatable: true },
      { key: "frequency", label: "Frequency", type: "number", default: 2, min: 0.1, max: 20, step: 0.1 },
      { key: "rotational", label: "Rotational", type: "boolean", default: false },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  blurPulse: {
    id: "blurPulse",
    label: "Blur Pulse",
    description: "Animated blur in/out",
    category: "motion",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "maxBlur", label: "Max Blur", type: "number", default: 12, min: 0, max: 40, step: 1, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  hologramFlicker: {
    id: "hologramFlicker",
    label: "Hologram Flicker",
    description: "Opacity flicker with scanline overlay",
    category: "distortion",
    defaultDuration: 2000,
    produces: ["css", "svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#00ffff", animatable: true },
      { key: "flickerRate", label: "Flicker Rate", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "scanlineOpacity", label: "Scanlines", type: "number", default: 0.15, min: 0, max: 0.5, step: 0.01, animatable: true },
      { key: "glitchAmount", label: "Glitch", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  typewriter: {
    id: "typewriter",
    label: "Typewriter",
    description: "Character-by-character text reveal",
    category: "reveal",
    defaultDuration: 2000,
    produces: ["css"],
    params: [
      { key: "progress", label: "Progress", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "cursor", label: "Show Cursor", type: "boolean", default: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  textReveal: {
    id: "textReveal",
    label: "Text Reveal",
    description: "Clip-path reveal animation",
    category: "reveal",
    defaultDuration: 800,
    produces: ["css"],
    params: [
      { key: "direction", label: "Direction", type: "select", default: "left", options: ["left", "right", "up", "down", "center"] },
      { key: "progress", label: "Progress", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "easing", label: "Easing", type: "select", default: "ease-out", options: ["linear", "ease-in", "ease-out", "ease-in-out"] },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  particleEmitter: {
    id: "particleEmitter",
    label: "Particle Emitter",
    description: "Canvas-based particle system",
    category: "particle",
    defaultDuration: 3000,
    produces: ["canvas"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#ffffff", animatable: true },
      { key: "count", label: "Count", type: "number", default: 30, min: 1, max: 200, step: 1 },
      { key: "size", label: "Size", type: "number", default: 3, min: 0.5, max: 20, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "spread", label: "Spread", type: "number", default: 1, min: 0, max: 3, step: 0.1 },
      { key: "gravity", label: "Gravity", type: "number", default: 0.1, min: -1, max: 1, step: 0.05, animatable: true },
      { key: "fade", label: "Fade", type: "boolean", default: true },
      { key: "shape", label: "Shape", type: "select", default: "circle", options: ["circle", "star", "spark", "square"] },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "none", options: ["none", "surface", "space"] },
    ],
  },
  breathe: {
    id: "breathe",
    label: "Breathe",
    description: "Smooth scale pulse",
    category: "motion",
    defaultDuration: 2000,
    produces: ["css"],
    params: [
      { key: "minScale", label: "Min Scale", type: "number", default: 0.95, min: 0.5, max: 1, step: 0.01, animatable: true },
      { key: "maxScale", label: "Max Scale", type: "number", default: 1.05, min: 1, max: 2, step: 0.01, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  colorCycle: {
    id: "colorCycle",
    label: "Color Cycle",
    description: "Animated hue rotation",
    category: "glow",
    defaultDuration: 3000,
    produces: ["css"],
    params: [
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "saturation", label: "Saturation", type: "number", default: 1, min: 0, max: 3, step: 0.1, animatable: true },
      { key: "brightness", label: "Brightness", type: "number", default: 1, min: 0.5, max: 2, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  scanlineStatic: {
    id: "scanlineStatic",
    label: "Scanline Static",
    description: "CRT scanline overlay",
    category: "distortion",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "lineSpacing", label: "Line Spacing", type: "number", default: 4, min: 2, max: 20, step: 1 },
      { key: "lineOpacity", label: "Line Opacity", type: "number", default: 0.2, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "scrollSpeed", label: "Scroll Speed", type: "number", default: 0, min: -5, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  caFull: {
    id: "caFull",
    label: "CA — Cover",
    description: "Full-element chromatic aberration via SVG filter",
    category: "distortion",
    defaultDuration: 1200,
    produces: ["svgFilter"],
    params: [
      { key: "intensity", label: "Intensity", type: "number", default: 4, min: 0, max: 20, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "angle", label: "Angle", type: "number", default: 0, min: 0, max: 360, step: 1, animatable: true },
      { key: "greenOffset", label: "Green Offset", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  caEdges: {
    id: "caEdges",
    label: "CA — Edges",
    description: "Edge-only chromatic aberration via SVG filter",
    category: "distortion",
    defaultDuration: 1200,
    produces: ["svgFilter"],
    params: [
      { key: "intensity", label: "Intensity", type: "number", default: 5, min: 0, max: 20, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "angle", label: "Angle", type: "number", default: 0, min: 0, max: 360, step: 1, animatable: true },
      { key: "edgeWidth", label: "Edge Width", type: "number", default: 2, min: 1, max: 8, step: 0.5, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  turbulence: {
    id: "turbulence",
    label: "Turbulence",
    description: "SVG feTurbulence warp/melt distortion",
    category: "distortion",
    defaultDuration: 3000,
    produces: ["svgFilter"],
    params: [
      { key: "scale", label: "Scale", type: "number", default: 20, min: 2, max: 100, step: 1, animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 8, min: 0, max: 40, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "octaves", label: "Octaves", type: "number", default: 2, min: 1, max: 4, step: 1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  vignette: {
    id: "vignette",
    label: "Vignette",
    description: "Radial edge darkening overlay",
    category: "glow",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "size", label: "Size", type: "number", default: 0.6, min: 0.1, max: 1, step: 0.05, animatable: true },
      { key: "softness", label: "Softness", type: "number", default: 0.4, min: 0.05, max: 1, step: 0.05, animatable: true },
      { key: "color", label: "Color", type: "color", default: "#000000", animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  strobe: {
    id: "strobe",
    label: "Strobe",
    description: "Rapid opacity flicker",
    category: "motion",
    defaultDuration: 200,
    produces: ["css"],
    params: [
      { key: "rate", label: "Rate", type: "number", default: 4, min: 0.5, max: 30, step: 0.5 },
      { key: "minOpacity", label: "Min Opacity", type: "number", default: 0, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  lensFlare: {
    id: "lensFlare",
    label: "Lens Flare",
    description: "Animated light streak and rings",
    category: "glow",
    defaultDuration: 2000,
    produces: ["svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#ffffff", animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1, min: 0, max: 3, step: 0.1, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "angle", label: "Angle", type: "number", default: 45, min: 0, max: 360, step: 1, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  strokePulse: {
    id: "strokePulse",
    label: "Stroke Pulse",
    description: "Animated border stroke width and opacity",
    category: "glow",
    defaultDuration: 1000,
    produces: ["svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#00ffff", animatable: true },
      { key: "maxWidth", label: "Max Width", type: "number", default: 6, min: 0.5, max: 30, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "none", options: ["none", "surface", "space"] },
    ],
  },
  motionTrail: {
    id: "motionTrail",
    label: "Motion Trail",
    description: "Canvas echo trail of previous frames",
    category: "motion",
    defaultDuration: 1000,
    produces: ["canvas"],
    params: [
      { key: "length", label: "Trail Length", type: "number", default: 8, min: 2, max: 20, step: 1 },
      { key: "decay", label: "Decay", type: "number", default: 0.7, min: 0.1, max: 0.99, step: 0.01, animatable: true },
      { key: "color", label: "Tint", type: "color", default: "#ffffff", animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  ripple: {
    id: "ripple",
    label: "Ripple",
    description: "Expanding ring pulses from centre",
    category: "motion",
    defaultDuration: 1500,
    produces: ["svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#00ffff", animatable: true },
      { key: "rings", label: "Rings", type: "number", default: 3, min: 1, max: 6, step: 1 },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "thickness", label: "Thickness", type: "number", default: 2, min: 0.5, max: 8, step: 0.5, animatable: true },
      { key: "maxScale", label: "Max Scale", type: "number", default: 2, min: 1.1, max: 4, step: 0.1, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  electricBorder: {
    id: "electricBorder",
    label: "Electric Border",
    description: "Jagged energy border",
    category: "glow",
    defaultDuration: 100,
    produces: ["svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#aaff00", animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 4, min: 0, max: 20, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "segments", label: "Segments", type: "number", default: 20, min: 6, max: 60, step: 2 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  snowfall: {
    id: "snowfall",
    label: "Snowfall",
    description: "Gentle falling particles",
    category: "particle",
    defaultDuration: 4000,
    produces: ["canvas"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#ffffff", animatable: true },
      { key: "count", label: "Count", type: "number", default: 40, min: 1, max: 200, step: 1 },
      { key: "size", label: "Size", type: "number", default: 3, min: 0.5, max: 12, step: 0.5, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "wind", label: "Wind", type: "number", default: 0.3, min: -2, max: 2, step: 0.1, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "none", options: ["none", "surface", "space"] },
    ],
  },
  rain: {
    id: "rain",
    label: "Rain",
    description: "Directional rain streaks",
    category: "particle",
    defaultDuration: 1000,
    produces: ["canvas"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#88aaff", animatable: true },
      { key: "count", label: "Count", type: "number", default: 60, min: 1, max: 300, step: 1 },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "angle", label: "Angle", type: "number", default: 15, min: -45, max: 45, step: 1, animatable: true },
      { key: "length", label: "Length", type: "number", default: 12, min: 2, max: 40, step: 1, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "none", options: ["none", "surface", "space"] },
    ],
  },
  fireEmitter: {
    id: "fireEmitter",
    label: "Fire",
    description: "Upward flame particle system",
    category: "particle",
    defaultDuration: 2000,
    produces: ["canvas"],
    params: [
      { key: "color", label: "Base Color", type: "color", default: "#ff4400", animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1, min: 0, max: 3, step: 0.1, animatable: true },
      { key: "spread", label: "Spread", type: "number", default: 0.5, min: 0.1, max: 2, step: 0.1, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "none", options: ["none", "surface", "space"] },
    ],
  },
  gradientSweep: {
    id: "gradientSweep",
    label: "Gradient Sweep",
    description: "Animated shine/shimmer sweeps across the element",
    category: "glow",
    defaultDuration: 2000,
    produces: ["css"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#ffffff", animatable: true },
      { key: "width", label: "Width", type: "number", default: 0.3, min: 0.05, max: 1, step: 0.05, animatable: true },
      { key: "angle", label: "Angle", type: "number", default: 45, min: 0, max: 180, step: 5 },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 0.6, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "repeat", label: "Repeat", type: "boolean", default: true },
    ],
  },
  cornerBrackets: {
    id: "cornerBrackets",
    label: "Corner Brackets",
    description: "Animated corner bracket decorations",
    category: "glow",
    defaultDuration: 1500,
    produces: ["svgOverlay"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#00ffff", animatable: true },
      { key: "size", label: "Size", type: "number", default: 20, min: 5, max: 80, step: 1, animatable: true },
      { key: "thickness", label: "Thickness", type: "number", default: 2, min: 0.5, max: 8, step: 0.5, animatable: true },
      { key: "glow", label: "Glow", type: "number", default: 4, min: 0, max: 20, step: 1, animatable: true },
      { key: "pulse", label: "Pulse", type: "boolean", default: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "inset", label: "Inset", type: "number", default: 0, min: -20, max: 40, step: 1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  vhsTracking: {
    id: "vhsTracking",
    label: "VHS Tracking",
    description: "Horizontal tracking lines with color bleed, like a bad VHS tape",
    category: "distortion",
    defaultDuration: 3000,
    produces: ["css"],
    params: [
      { key: "trackingLines", label: "Lines", type: "number", default: 3, min: 1, max: 12, step: 1, animatable: true },
      { key: "lineHeight", label: "Line Height", type: "number", default: 4, min: 1, max: 20, step: 1, animatable: true },
      { key: "colorBleed", label: "Color Bleed", type: "number", default: 0.5, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 0.8, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  crtInterlace: {
    id: "crtInterlace",
    label: "CRT Interlace",
    description: "CRT interlace scanlines with phosphor flicker",
    category: "distortion",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "lineSpacing", label: "Line Spacing", type: "number", default: 3, min: 2, max: 10, step: 1 },
      { key: "lineOpacity", label: "Line Opacity", type: "number", default: 0.35, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "flicker", label: "Flicker", type: "number", default: 0.04, min: 0, max: 0.2, step: 0.01, animatable: true },
      { key: "phosphorGlow", label: "Phosphor Glow", type: "number", default: 0.15, min: 0, max: 0.5, step: 0.01, animatable: true },
      { key: "curvature", label: "Curvature", type: "number", default: 0, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  tapeNoise: {
    id: "tapeNoise",
    label: "Tape Noise",
    description: "Random horizontal noise bands, like damaged tape",
    category: "distortion",
    defaultDuration: 500,
    produces: ["canvas"],
    params: [
      { key: "density", label: "Density", type: "number", default: 0.05, min: 0.01, max: 0.5, step: 0.01, animatable: true },
      { key: "bandHeight", label: "Band Height", type: "number", default: 3, min: 1, max: 20, step: 1, animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 0.6, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "colorNoise", label: "Color Noise", type: "boolean", default: false },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  filmGrain: {
    id: "filmGrain",
    label: "Film Grain",
    description: "Animated film grain / noise texture",
    category: "distortion",
    defaultDuration: 100,
    produces: ["canvas"],
    params: [
      { key: "intensity", label: "Intensity", type: "number", default: 0.15, min: 0.01, max: 1, step: 0.01, animatable: true },
      { key: "size", label: "Grain Size", type: "number", default: 1, min: 0.5, max: 4, step: 0.5 },
      { key: "colored", label: "Colored", type: "boolean", default: false },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "surface", options: ["surface", "space"] },
    ],
  },
  rgbSplit: {
    id: "rgbSplit",
    label: "RGB Split",
    description: "Clean chromatic aberration — pure channel separation without glitch",
    category: "distortion",
    defaultDuration: 2000,
    produces: ["svgFilter"],
    params: [
      { key: "amount", label: "Amount", type: "number", default: 4, min: 0, max: 20, step: 0.5, animatable: true },
      { key: "angle", label: "Angle", type: "number", default: 0, min: 0, max: 360, step: 1, animatable: true },
      { key: "animate", label: "Animate", type: "boolean", default: false },
      { key: "speed", label: "Speed", type: "number", default: 0.5, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  lightningArc: {
    id: "lightningArc",
    label: "Lightning Arc",
    description: "Procedural lightning between points",
    category: "particle",
    defaultDuration: 200,
    produces: ["canvas"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#88aaff", animatable: true },
      { key: "branches", label: "Branches", type: "number", default: 3, min: 1, max: 8, step: 1 },
      { key: "intensity", label: "Intensity", type: "number", default: 1, min: 0, max: 3, step: 0.1, animatable: true },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
      { key: "clipMode", label: "Clip Mode", type: "select", default: "none", options: ["none", "surface", "space"] },
    ],
  },
  // ── CSS Filter Effects ────────────────────────────────────────────────────────
  hueShift: {
    id: "hueShift",
    label: "Hue Shift",
    description: "Rotate colors around the color wheel — perfect for tinting videos and images",
    category: "color",
    defaultDuration: 3000,
    produces: ["css"],
    params: [
      { key: "rotation", label: "Rotation", type: "number", default: 0, min: 0, max: 360, step: 1, animatable: true },
      { key: "animate", label: "Animate", type: "boolean", default: false },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  colorGrade: {
    id: "colorGrade",
    label: "Color Grade",
    description: "Adjust brightness, contrast, and saturation for color correction",
    category: "color",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "brightness", label: "Brightness", type: "number", default: 1, min: 0, max: 3, step: 0.05, animatable: true },
      { key: "contrast", label: "Contrast", type: "number", default: 1, min: 0, max: 3, step: 0.05, animatable: true },
      { key: "saturation", label: "Saturation", type: "number", default: 1, min: 0, max: 3, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  tint: {
    id: "tint",
    label: "Tint",
    description: "Apply a color tint overlay — combine hue shift and saturation for video tinting",
    category: "color",
    defaultDuration: 2000,
    produces: ["css"],
    params: [
      { key: "hue", label: "Hue", type: "number", default: 270, min: 0, max: 360, step: 1, animatable: true },
      { key: "saturation", label: "Saturation", type: "number", default: 1.5, min: 0, max: 3, step: 0.05, animatable: true },
      { key: "brightness", label: "Brightness", type: "number", default: 1, min: 0, max: 2, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  staticTint: {
    id: "staticTint",
    label: "Static Tint",
    description: "Apply a fixed color tint — no animation, just a solid color overlay",
    category: "color",
    defaultDuration: 0,
    produces: ["css"],
    params: [
      { key: "hue", label: "Hue", type: "number", default: 270, min: 0, max: 360, step: 1 },
      { key: "saturation", label: "Saturation", type: "number", default: 2.0, min: 0, max: 3, step: 0.05 },
      { key: "brightness", label: "Brightness", type: "number", default: 1, min: 0, max: 2, step: 0.05 },
    ],
  },
  colorize: {
    id: "colorize",
    label: "Colorize",
    description: "Add color to grayscale/white content — perfect for smoke, fog, and particles",
    category: "color",
    defaultDuration: 0,
    produces: ["css"],
    params: [
      { key: "hue", label: "Hue", type: "number", default: 270, min: 0, max: 360, step: 1 },
      { key: "intensity", label: "Intensity", type: "number", default: 1.0, min: 0, max: 2, step: 0.05 },
      { key: "brightness", label: "Brightness", type: "number", default: 1, min: 0, max: 2, step: 0.05 },
    ],
  },
  colorizeAnimated: {
    id: "colorizeAnimated",
    label: "Colorize (Animated)",
    description: "Animated colorize with keyframe support — animate hue, intensity, and brightness over time",
    category: "color",
    defaultDuration: 3000,
    produces: ["css"],
    params: [
      { key: "hue", label: "Hue", type: "number", default: 270, min: 0, max: 360, step: 1, animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1.0, min: 0, max: 2, step: 0.05, animatable: true },
      { key: "brightness", label: "Brightness", type: "number", default: 1, min: 0, max: 2, step: 0.05, animatable: true },
    ],
  },
  neonGlow: {
    id: "neonGlow",
    label: "Neon Glow",
    description: "Add intense neon glow — stack multiple layers for stronger effect",
    category: "glow",
    defaultDuration: 0,
    produces: ["css"],
    params: [
      { key: "color", label: "Glow Color", type: "color", default: "#a855f7" },
      { key: "intensity", label: "Intensity", type: "number", default: 30, min: 0, max: 80, step: 1 },
      { key: "spread", label: "Spread", type: "number", default: 15, min: 0, max: 50, step: 1 },
      { key: "brightness", label: "Brightness Boost", type: "number", default: 1.3, min: 1, max: 2.5, step: 0.05 },
    ],
  },
  neonGlowAnimated: {
    id: "neonGlowAnimated",
    label: "Neon Glow (Animated)",
    description: "Animated neon glow with pulsing intensity — perfect for breathing effects",
    category: "glow",
    defaultDuration: 2000,
    produces: ["css"],
    params: [
      { key: "color", label: "Glow Color", type: "color", default: "#a855f7" },
      { key: "intensity", label: "Intensity", type: "number", default: 30, min: 0, max: 80, step: 1, animatable: true },
      { key: "spread", label: "Spread", type: "number", default: 15, min: 0, max: 50, step: 1, animatable: true },
      { key: "brightness", label: "Brightness Boost", type: "number", default: 1.3, min: 1, max: 2.5, step: 0.05, animatable: true },
    ],
  },
  desaturate: {
    id: "desaturate",
    label: "Desaturate",
    description: "Remove color saturation — grayscale effect",
    category: "color",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "amount", label: "Amount", type: "number", default: 1, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  sepiaTone: {
    id: "sepiaTone",
    label: "Sepia Tone",
    description: "Vintage sepia/brown tone effect",
    category: "color",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "amount", label: "Amount", type: "number", default: 1, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  invert: {
    id: "invert",
    label: "Invert",
    description: "Invert colors — negative effect",
    category: "color",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "amount", label: "Amount", type: "number", default: 1, min: 0, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  exposure: {
    id: "exposure",
    label: "Exposure",
    description: "Adjust exposure with brightness and contrast together",
    category: "color",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "exposure", label: "Exposure", type: "number", default: 0, min: -1, max: 1, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  vibrance: {
    id: "vibrance",
    label: "Vibrance",
    description: "Boost color intensity without oversaturating",
    category: "color",
    defaultDuration: 1000,
    produces: ["css"],
    params: [
      { key: "amount", label: "Amount", type: "number", default: 1.3, min: 0, max: 3, step: 0.05, animatable: true },
      { key: "contrast", label: "Contrast", type: "number", default: 1.1, min: 0.5, max: 2, step: 0.05, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  // ── Smoke / Volumetric / Edge effects ────────────────────────────────────────
  smokeBloom: {
    id: "smokeBloom",
    label: "Smoke Bloom",
    description: "Soft volumetric glow that bleeds outward with a natural, irregular falloff — like light through fog. Stack with Neon Glow for the OWN3D look.",
    category: "glow",
    defaultDuration: 3000,
    produces: ["svgFilter"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#a855f7", animatable: true },
      { key: "radius", label: "Bloom Radius", type: "number", default: 60, min: 5, max: 200, step: 5, animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1.8, min: 0.1, max: 6, step: 0.1, animatable: true },
      { key: "turbulence", label: "Smoke Turbulence", type: "number", default: 0.04, min: 0, max: 0.2, step: 0.005, animatable: true },
      { key: "speed", label: "Anim Speed", type: "number", default: 0.5, min: 0, max: 3, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  volumetricLight: {
    id: "volumetricLight",
    label: "Volumetric Light",
    description: "Backlit haze — light appears to emanate from behind the shape, scattering outward. The signature effect on OWN3D overlays.",
    category: "glow",
    defaultDuration: 4000,
    produces: ["svgFilter"],
    params: [
      { key: "color", label: "Light Color", type: "color", default: "#c084fc", animatable: true },
      { key: "spread", label: "Spread", type: "number", default: 30, min: 5, max: 80, step: 1, animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1.5, min: 0.1, max: 5, step: 0.1, animatable: true },
      { key: "pulse", label: "Pulse", type: "boolean", default: true },
      { key: "speed", label: "Speed", type: "number", default: 0.8, min: 0.1, max: 3, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  edgeFog: {
    id: "edgeFog",
    label: "Edge Fog",
    description: "Turbulent smoke distortion on the edges — creates wispy, irregular borders like smoke or energy dissipating at the edges.",
    category: "distortion",
    defaultDuration: 5000,
    produces: ["svgFilter"],
    params: [
      { key: "scale", label: "Fog Scale", type: "number", default: 40, min: 5, max: 120, step: 5, animatable: true },
      { key: "displacement", label: "Displacement", type: "number", default: 12, min: 0, max: 40, step: 1, animatable: true },
      { key: "octaves", label: "Octaves", type: "number", default: 3, min: 1, max: 5, step: 1 },
      { key: "speed", label: "Anim Speed", type: "number", default: 0.3, min: 0, max: 2, step: 0.05 },
      { key: "blur", label: "Edge Blur", type: "number", default: 4, min: 0, max: 20, step: 0.5, animatable: true },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
  innerGlow: {
    id: "innerGlow",
    label: "Inner Glow",
    description: "Soft luminosity from within the shape — the eyes in the OWN3D Raven overlay use this. Diffuse light that fills the interior.",
    category: "glow",
    defaultDuration: 3000,
    produces: ["svgFilter"],
    params: [
      { key: "color", label: "Color", type: "color", default: "#e9d5ff", animatable: true },
      { key: "radius", label: "Glow Radius", type: "number", default: 8, min: 1, max: 30, step: 1, animatable: true },
      { key: "intensity", label: "Intensity", type: "number", default: 1.8, min: 0.1, max: 5, step: 0.1, animatable: true },
      { key: "pulse", label: "Pulse", type: "boolean", default: false },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, animatable: true },
    ],
  },
};

// ── Param interpolation ───────────────────────────────────────────────────────
export function interpolateParams(
  baseParams: EffectParams,
  keyframes: EffectKeyframe[],
  t: number,
  duration: number
): EffectParams {
  if (!keyframes || keyframes.length === 0) return baseParams;

  // Single keyframe: hold that value indefinitely (no interpolation)
  if (keyframes.length === 1) {
    return { ...baseParams, ...keyframes[0].params };
  }

  // Normalize t to loop duration
  const loopT = duration > 0 ? t % duration : t;

  // Find surrounding keyframes
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const before = sorted.filter(k => k.t <= loopT).pop();
  const after = sorted.find(k => k.t > loopT);

  if (!before && !after) return baseParams;
  if (!before) return { ...baseParams, ...after!.params };
  if (!after) return { ...baseParams, ...before.params };

  // Lerp between keyframes
  const progress = (loopT - before.t) / Math.max(1, after.t - before.t);
  const result = { ...baseParams };

  for (const key of Object.keys(before.params)) {
    const a = before.params[key];
    const b = after.params[key] ?? baseParams[key];
    if (typeof a === "number" && typeof b === "number") {
      result[key] = a + (b - a) * progress;
    } else {
      result[key] = progress < 0.5 ? a : b;
    }
  }

  return result;
}

// ── CSS effect renderers ──────────────────────────────────────────────────────
export function renderParametricEffectCSS(
  preset: string,
  params: EffectParams,
  t: number // current time in ms
): React.CSSProperties {
  const p = params;
  const sin = Math.sin;
  const cos = Math.cos;

  switch (preset) {
    case "neonPulse": {
      const pulse = 0.5 + 0.5 * sin((t / 1000) * Math.PI * 2 * Number(p.speed ?? 1));
      const intensity = Number(p.intensity ?? 1) * pulse;
      const size = Number(p.size ?? 20);
      const color = String(p.color ?? "#00ffff");
      // Use drop-shadow filter so glow follows the shape's actual pixels, not the bounding box
      const s = size * intensity;
      return {
        filter: `drop-shadow(0 0 ${s * 0.4}px ${color}) drop-shadow(0 0 ${s * 0.8}px ${color}) drop-shadow(0 0 ${s * 1.4}px ${color})`,
        opacity: 0.8 + 0.2 * pulse,
      } as any;
    }
    case "glitchFlicker": {
      const freq = Number(p.frequency ?? 1);
      const intensity = Number(p.intensity ?? 1);
      const seed = Math.floor(t * freq / 100);
      const rng = (s: number) => ((Math.sin(s * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
      const glitchChance = rng(seed);
      // Three tiers: subtle (always), medium (50%), heavy (15%)
      const heavy = glitchChance > 0.85;
      const medium = glitchChance > 0.5;
      if (!medium) return {};
      // Horizontal slice displacement — the signature glitch look
      const sliceCount = Math.floor(2 + rng(seed + 10) * 4 * intensity);
      const sliceOffset = (rng(seed + 11) - 0.5) * 30 * intensity;
      // Main body transform
      const tx = heavy ? (rng(seed + 1) - 0.5) * 24 * intensity : (rng(seed + 1) - 0.5) * 6 * intensity;
      const ty = heavy ? (rng(seed + 2) - 0.5) * 6 * intensity : 0;
      const skewX = heavy ? (rng(seed + 3) - 0.5) * 8 * intensity : (rng(seed + 3) - 0.5) * 2 * intensity;
      const scaleX = medium ? 1 + (rng(seed + 8) - 0.5) * 0.04 * intensity : 1;
      // CA-style color fringe on heavy glitch
      const colorFilter = (p.colorShift && heavy)
        ? `drop-shadow(${(rng(seed+5)-0.5)*6*intensity}px 0 0 rgba(255,0,80,0.7)) drop-shadow(${(rng(seed+7)-0.5)*6*intensity}px 0 0 rgba(0,200,255,0.7))`
        : undefined;
      // Scanline-style clip on heavy glitch (cuts a horizontal band)
      const clipY = heavy ? Math.floor(rng(seed + 9) * 100) : null;
      const clipH = heavy ? Math.floor(5 + rng(seed + 12) * 20 * intensity) : null;
      const clipPath = clipY !== null ? `inset(${clipY}% 0 ${Math.max(0, 100 - clipY - clipH!)}% 0)` : undefined;
      return {
        transform: `translate(${tx}px, ${ty}px) skewX(${skewX}deg) scaleX(${scaleX})`,
        transformOrigin: 'center center',
        opacity: heavy ? 0.6 + rng(seed + 6) * 0.4 : 0.85 + rng(seed + 6) * 0.15,
        ...(colorFilter ? { filter: colorFilter } : {}),
        ...(clipPath ? { clipPath } : {}),
      } as any;
    }
    case "cameraShake": {
      const freq = Number(p.frequency ?? 2);
      const intensity = Number(p.intensity ?? 5);
      const tx = sin(t * freq * 0.01) * intensity + sin(t * freq * 0.017) * intensity * 0.5;
      const ty = cos(t * freq * 0.013) * intensity * 0.7;
      const rot = p.rotational ? sin(t * freq * 0.008) * intensity * 0.3 : 0;
      return {
        transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`,
        transformOrigin: "center center",
      };
    }
    case "blurPulse": {
      const speed = Number(p.speed ?? 1);
      const maxBlur = Number(p.maxBlur ?? 12);
      const pulse = 0.5 + 0.5 * sin((t / 1000) * Math.PI * 2 * speed);
      const blurVal = (maxBlur * pulse).toFixed(1);
      return { filter: `blur(${blurVal}px)` };
    }
    case "hologramFlicker": {
      const rate = Number(p.flickerRate ?? 1);
      const seed = Math.floor(t * rate / 80);
      const rng = (s: number) => ((Math.sin(s * 127.1) * 43758.5453) % 1 + 1) % 1;
      const flicker = rng(seed);
      const glitch = Number(p.glitchAmount ?? 0.3);
      const tx = flicker > (1 - glitch) ? (rng(seed + 1) - 0.5) * 10 : 0;
      const color = String(p.color ?? "#00ffff");
      return {
        opacity: 0.7 + flicker * 0.3,
        transform: tx ? `translateX(${tx}px)` : undefined,
        filter: `drop-shadow(0 0 4px ${color}) saturate(1.5)`,
      };
    }
    case "textReveal": {
      const progress = Number(p.progress ?? 1);
      const dir = String(p.direction ?? "left");
      const pct = Math.round(progress * 100);
      const clipMap: Record<string, string> = {
        left: `inset(0 ${100 - pct}% 0 0)`,
        right: `inset(0 0 0 ${100 - pct}%)`,
        up: `inset(0 0 ${100 - pct}% 0)`,
        down: `inset(${100 - pct}% 0 0 0)`,
        center: `inset(0 ${(100 - pct) / 2}% 0 ${(100 - pct) / 2}%)`,
      };
      // Auto-animate progress if no keyframes set
      const autoProgress = (t % 2000) < 1000 ? (t % 1000) / 1000 : 1 - ((t % 1000) / 1000);
      const effectiveProgress = progress === 1 ? autoProgress : progress;
      const effectivePct = Math.round(effectiveProgress * 100);
      const effectiveClip = {
        left: `inset(0 ${100 - effectivePct}% 0 0)`,
        right: `inset(0 0 0 ${100 - effectivePct}%)`,
        up: `inset(0 0 ${100 - effectivePct}% 0)`,
        down: `inset(${100 - effectivePct}% 0 0 0)`,
        center: `inset(0 ${(100 - effectivePct) / 2}% 0 ${(100 - effectivePct) / 2}%)`,
      };
      return { clipPath: effectiveClip[dir] ?? effectiveClip.left };
    }
    case "breathe": {
      const speed = Number(p.speed ?? 1);
      const minS = Number(p.minScale ?? 0.95);
      const maxS = Number(p.maxScale ?? 1.05);
      const pulse = 0.5 + 0.5 * sin((t / 1000) * Math.PI * 2 * speed);
      const scale = minS + (maxS - minS) * pulse;
      return { transform: `scale(${scale})`, transformOrigin: "center center" };
    }
    case "colorCycle": {
      const speed = Number(p.speed ?? 1);
      const sat = Number(p.saturation ?? 1);
      const bri = Number(p.brightness ?? 1);
      const hue = (t / 1000 * 360 * speed) % 360;
      return { filter: `hue-rotate(${hue}deg) saturate(${sat}) brightness(${bri})` };
    }
    case "scanlineStatic": {
      const spacing = Math.max(2, Number(p.lineSpacing ?? 4));
      const lineOp = Number(p.lineOpacity ?? 0.2);
      const scroll = Number(p.scrollSpeed ?? 0);
      const offset = ((t / 1000 * scroll * 60) % spacing + spacing) % spacing;
      return {
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent ${spacing - 1}px, rgba(0,0,0,${lineOp}) ${spacing - 1}px, rgba(0,0,0,${lineOp}) ${spacing}px)`,
        backgroundPosition: `0 ${offset}px`,
        backgroundSize: `100% ${spacing}px`,
      } as any;
    }
    case "vignette": {
      const size = Number(p.size ?? 0.6);
      const softness = Number(p.softness ?? 0.4);
      const color = String(p.color ?? "#000000");
      const inner = Math.max(0, size - softness) * 100;
      const outer = Math.min(100, size * 100);
      return {
        backgroundImage: `radial-gradient(ellipse at center, transparent ${inner}%, ${color} ${outer}%)`,
      } as any;
    }
    case "strobe": {
      const rate = Number(p.rate ?? 4);
      const minOp = Number(p.minOpacity ?? 0);
      const on = Math.sin(t * rate * Math.PI / 500) > 0;
      return { opacity: on ? 1 : minOp } as any;
    }
            case "typewriter": {
      const speed = Number(p.speed ?? 1);
      const progress = Number(p.progress ?? 1);
      const showCursor = p.cursor !== false;
      // Auto-animate if progress is at default (1)
      const autoP = progress === 1 ? Math.min(1, (t / 1000 * speed) % 2 < 1 ? (t / 1000 * speed) % 1 : 1) : progress;
      const cursorBlink = showCursor && Math.floor(t / 500) % 2 === 0;
      // Use clip-path to reveal characters left-to-right
      return {
        clipPath: `inset(0 ${((1 - autoP) * 100).toFixed(1)}% 0 0)`,
        ...(cursorBlink && autoP < 1 ? { outline: "2px solid currentColor", outlineOffset: "-2px" } : {}),
      } as any;
    }
        case "gradientSweep": {
      const speed = Number(p.speed ?? 1);
      const width = Number(p.width ?? 0.3);
      const angle = Number(p.angle ?? 45);
      const color = String(p.color ?? "#ffffff");
      const opacity = Number(p.opacity ?? 0.6);
      const repeat = p.repeat !== false;
      // Position: 0 = before element, 1 = after element
      const cycle = (t / 1000) * speed;
      const pos = repeat ? (cycle % 1) : Math.min(1, cycle);
      // Convert angle to gradient direction
      const rad = angle * Math.PI / 180;
      const gx = Math.cos(rad) * 100;
      const gy = Math.sin(rad) * 100;
      // Sweep position: gradient moves from -width to 1+width
      const sweep = -width + pos * (1 + width * 2);
      const s0 = Math.max(0, sweep - width / 2) * 100;
      const s1 = Math.max(0, sweep) * 100;
      const s2 = Math.min(100, (sweep + width) * 100);
      const s3 = Math.min(100, (sweep + width * 1.5) * 100);
      // Parse color to rgba
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0,2), 16) || 255;
      const g = parseInt(hex.substring(2,4), 16) || 255;
      const b = parseInt(hex.substring(4,6), 16) || 255;
      const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;
      return {
        backgroundImage: `linear-gradient(${angle}deg, ${rgba(0)} ${s0.toFixed(1)}%, ${rgba(opacity * 0.5)} ${s1.toFixed(1)}%, ${rgba(opacity)} ${((s1+s2)/2).toFixed(1)}%, ${rgba(opacity * 0.5)} ${s2.toFixed(1)}%, ${rgba(0)} ${s3.toFixed(1)}%)`,
        backgroundSize: '100% 100%',
        mixBlendMode: 'overlay' as any,
      } as any;
    }
    case "vhsTracking": {
      const lines = Math.round(Number(p.trackingLines ?? 3));
      const lh = Number(p.lineHeight ?? 4);
      const bleed = Number(p.colorBleed ?? 0.5);
      const speed = Number(p.speed ?? 1);
      const opacity = Number(p.opacity ?? 0.8);
      const rng = (s: number) => ((Math.sin(s * 127.1 + t * 0.001 * speed) * 43758.5453) % 1 + 1) % 1;
      // Build gradient stops for tracking lines
      const stops: string[] = [];
      for (let i = 0; i < lines; i++) {
        const yPos = (rng(i * 7.3 + Math.floor(t * speed / 200)) * 100).toFixed(1);
        const r = Math.round(255 * bleed * rng(i + 1));
        const b = Math.round(255 * bleed * rng(i + 2));
        stops.push(
          `transparent ${yPos}%`,
          `rgba(${r},0,${b},${opacity}) calc(${yPos}% + 0px)`,
          `rgba(${r},0,${b},${opacity}) calc(${yPos}% + ${lh}px)`,
          `transparent calc(${yPos}% + ${lh + 2}px)`
        );
      }
      return {
        backgroundImage: `linear-gradient(to bottom, ${stops.join(', ')})`,
        backgroundSize: '100% 100%',
        mixBlendMode: 'screen' as any,
      } as any;
    }
    case "crtInterlace": {
      const spacing = Math.max(2, Number(p.lineSpacing ?? 3));
      const lineOp = Number(p.lineOpacity ?? 0.35);
      const flicker = Number(p.flicker ?? 0.04);
      const phosphor = Number(p.phosphorGlow ?? 0.15);
      const speed = Number(p.speed ?? 1);
      const curvature = Number(p.curvature ?? 0);
      // Flicker: subtle brightness variation
      const flickerVal = 1 - flicker * (0.5 + 0.5 * Math.sin(t * speed * 0.03));
      // Phosphor: slight green tint glow
      const phosphorFilter = phosphor > 0
        ? `brightness(${flickerVal}) sepia(${phosphor * 0.3}) saturate(${1 + phosphor})`
        : `brightness(${flickerVal})`;
      // Curvature via border-radius on overlay (subtle barrel distortion feel)
      const borderRadius = curvature > 0 ? `${curvature * 8}%` : undefined;
      return {
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent ${spacing - 1}px, rgba(0,0,0,${lineOp}) ${spacing - 1}px, rgba(0,0,0,${lineOp}) ${spacing}px)`,
        backgroundSize: `100% ${spacing}px`,
        filter: phosphorFilter,
        ...(borderRadius ? { borderRadius, overflow: 'hidden' } : {}),
      } as any;
    }
    // ── CSS Filter Effects ────────────────────────────────────────────────────
    case "hueShift": {
      const rotation = Number(p.rotation ?? 0);
      const animate = p.animate === true;  // Only animate if explicitly enabled
      const speed = Number(p.speed ?? 1);
      const hue = animate ? (t / 1000 * 360 * speed) % 360 : rotation;
      return { filter: `hue-rotate(${hue.toFixed(1)}deg)` };
    }
    case "colorGrade": {
      const brightness = Number(p.brightness ?? 1);
      const contrast = Number(p.contrast ?? 1);
      const saturation = Number(p.saturation ?? 1);
      return { 
        filter: `brightness(${brightness.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${saturation.toFixed(2)})` 
      };
    }
    case "tint": {
      const hue = Number(p.hue ?? 270);
      const saturation = Number(p.saturation ?? 1.5);
      const brightness = Number(p.brightness ?? 1);
      return { 
        filter: `hue-rotate(${hue.toFixed(1)}deg) saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)})` 
      };
    }
    case "staticTint": {
      const hue = Number(p.hue ?? 270);
      const saturation = Number(p.saturation ?? 2.0);
      const brightness = Number(p.brightness ?? 1);
      return { 
        filter: `hue-rotate(${hue.toFixed(1)}deg) saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)})` 
      };
    }
    case "colorize": {
      // Colorize grayscale content by: sepia (adds brown base) → hue-rotate (shift to target color) → saturate (boost intensity)
      const hue = Number(p.hue ?? 270);
      const intensity = Number(p.intensity ?? 1.0);
      const brightness = Number(p.brightness ?? 1);
      // Sepia creates a brown base, then hue-rotate shifts it to the target color
      // For purple (270°), we need to rotate from sepia's ~40° to 270° = 230° rotation
      const rotation = hue - 40; // Sepia is roughly 40° on the color wheel
      return { 
        filter: `sepia(1) hue-rotate(${rotation.toFixed(1)}deg) saturate(${intensity.toFixed(2)}) brightness(${brightness.toFixed(2)})` 
      };
    }
    case "colorizeAnimated": {
      // Same as colorize but with animatable parameters
      const hue = Number(p.hue ?? 270);
      const intensity = Number(p.intensity ?? 1.0);
      const brightness = Number(p.brightness ?? 1);
      const rotation = hue - 40;
      return { 
        filter: `sepia(1) hue-rotate(${rotation.toFixed(1)}deg) saturate(${intensity.toFixed(2)}) brightness(${brightness.toFixed(2)})` 
      };
    }
    case "neonGlow": {
      const color = String(p.color ?? "#a855f7");
      const intensity = Number(p.intensity ?? 30);
      const spread = Number(p.spread ?? 15);
      const brightness = Number(p.brightness ?? 1.3);
      // Create multiple drop-shadow layers for intense glow - more layers = stronger effect
      const shadows = [
        `drop-shadow(0 0 ${intensity}px ${color})`,
        `drop-shadow(0 0 ${intensity * 0.8}px ${color})`,
        `drop-shadow(0 0 ${intensity * 0.6}px ${color})`,
        `drop-shadow(0 0 ${spread}px ${color})`,
        `drop-shadow(0 0 ${spread * 0.7}px ${color})`,
      ].join(' ');
      return { 
        filter: `${shadows} brightness(${brightness.toFixed(2)})` 
      };
    }
    case "neonGlowAnimated": {
      // Same as neonGlow but with animatable parameters
      const color = String(p.color ?? "#a855f7");
      const intensity = Number(p.intensity ?? 30);
      const spread = Number(p.spread ?? 15);
      const brightness = Number(p.brightness ?? 1.3);
      const shadows = [
        `drop-shadow(0 0 ${intensity}px ${color})`,
        `drop-shadow(0 0 ${intensity * 0.8}px ${color})`,
        `drop-shadow(0 0 ${intensity * 0.6}px ${color})`,
        `drop-shadow(0 0 ${spread}px ${color})`,
        `drop-shadow(0 0 ${spread * 0.7}px ${color})`,
      ].join(' ');
      return { 
        filter: `${shadows} brightness(${brightness.toFixed(2)})` 
      };
    }
    case "desaturate": {
      const amount = Number(p.amount ?? 1);
      return { filter: `grayscale(${amount.toFixed(2)})` };
    }
    case "sepiaTone": {
      const amount = Number(p.amount ?? 1);
      return { filter: `sepia(${amount.toFixed(2)})` };
    }
    case "invert": {
      const amount = Number(p.amount ?? 1);
      return { filter: `invert(${amount.toFixed(2)})` };
    }
    case "exposure": {
      const exposure = Number(p.exposure ?? 0);
      // Exposure: positive = brighter + more contrast, negative = darker + less contrast
      const brightness = 1 + exposure * 0.5;
      const contrast = 1 + exposure * 0.3;
      return { 
        filter: `brightness(${brightness.toFixed(2)}) contrast(${contrast.toFixed(2)})` 
      };
    }
    case "vibrance": {
      const amount = Number(p.amount ?? 1.3);
      const contrast = Number(p.contrast ?? 1.1);
      return { 
        filter: `saturate(${amount.toFixed(2)}) contrast(${contrast.toFixed(2)})` 
      };
    }
    default:
      return {};
  }
}

// ── SVG filter renderers ──────────────────────────────────────────────────────
export function renderParametricEffectSVGFilter(
  preset: string,
  params: EffectParams,
  filterId: string,
  t: number
): { filterDef: string; filterRef: string } | null {
  const p = params;

  switch (preset) {
    case "smokeBloom": {
      const radius = Number(p.radius ?? 18);
      const intensity = Number(p.intensity ?? 1.2);
      const turbAmt = Number(p.turbulence ?? 0.04);
      const speed = Number(p.speed ?? 0.5);
      const color = String(p.color ?? "#a855f7");
      const opacity = Number(p.opacity ?? 1);
      // Animate turbulence seed over time for moving smoke
      const seed = ((t / 1000) * speed * 10) % 100;
      // Parse color to matrix values
      const hex = color.replace('#', '');
      const r = (parseInt(hex.substring(0,2), 16) || 168) / 255;
      const g = (parseInt(hex.substring(2,4), 16) || 85) / 255;
      const b = (parseInt(hex.substring(4,6), 16) || 247) / 255;

      const filterDef = `
        <filter id="${filterId}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">
          <!-- Blur the source to create bloom base -->
          <feGaussianBlur in="SourceGraphic" stdDeviation="${radius}" result="blur1"/>
          <!-- Second pass for wider, softer falloff -->
          <feGaussianBlur in="SourceGraphic" stdDeviation="${radius * 2.5}" result="blur2"/>
          <!-- Add turbulence for smoke texture -->
          ${turbAmt > 0 ? `
          <feTurbulence type="fractalNoise" baseFrequency="${turbAmt}" numOctaves="3" seed="${seed.toFixed(1)}" result="noise"/>
          <feDisplacementMap in="blur1" in2="noise" scale="${radius * 0.8}" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
          ` : `<feComposite in="blur1" in2="blur1" operator="over" result="displaced"/>`}
          <!-- Colorize the bloom -->
          <feColorMatrix type="matrix" in="displaced"
            values="${r * intensity} 0 0 0 0
                    ${g * intensity} 0 0 0 0
                    ${b * intensity} 0 0 0 0
                    0 0 0 ${opacity} 0"
            result="colored1"/>
          <feColorMatrix type="matrix" in="blur2"
            values="${r * intensity * 0.5} 0 0 0 0
                    ${g * intensity * 0.5} 0 0 0 0
                    ${b * intensity * 0.5} 0 0 0 0
                    0 0 0 ${opacity * 0.6} 0"
            result="colored2"/>
          <!-- Merge bloom layers with original -->
          <feMerge>
            <feMergeNode in="colored2"/>
            <feMergeNode in="colored1"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>`;
      return { filterDef, filterRef: `url(#${filterId})` };
    }

    case "volumetricLight": {
      const spread = Number(p.spread ?? 30);
      const intensity = Number(p.intensity ?? 1.5);
      const color = String(p.color ?? "#c084fc");
      const pulse = p.pulse !== false;
      const speed = Number(p.speed ?? 0.8);
      const opacity = Number(p.opacity ?? 1);
      // Pulse the intensity
      const pulseVal = pulse ? 0.8 + 0.2 * Math.sin((t / 1000) * Math.PI * 2 * speed) : 1;
      const effectiveIntensity = intensity * pulseVal;
      const hex = color.replace('#', '');
      const r = (parseInt(hex.substring(0,2), 16) || 192) / 255;
      const g = (parseInt(hex.substring(2,4), 16) || 132) / 255;
      const b = (parseInt(hex.substring(4,6), 16) || 252) / 255;

      const filterDef = `
        <filter id="${filterId}" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">
          <!-- Wide soft blur for volumetric scatter -->
          <feGaussianBlur in="SourceAlpha" stdDeviation="${spread}" result="alphaBlur"/>
          <!-- Dilate to push light further out -->
          <feMorphology in="alphaBlur" operator="dilate" radius="${spread * 0.3}" result="dilated"/>
          <feGaussianBlur in="dilated" stdDeviation="${spread * 0.5}" result="outerHaze"/>
          <!-- Color the haze -->
          <feColorMatrix type="matrix" in="outerHaze"
            values="${r * effectiveIntensity} 0 0 0 ${r * 0.1}
                    ${g * effectiveIntensity} 0 0 0 ${g * 0.05}
                    ${b * effectiveIntensity} 0 0 0 ${b * 0.15}
                    0 0 0 ${opacity} 0"
            result="coloredHaze"/>
          <!-- Inner tighter glow -->
          <feGaussianBlur in="SourceAlpha" stdDeviation="${spread * 0.3}" result="innerBlur"/>
          <feColorMatrix type="matrix" in="innerBlur"
            values="${r * effectiveIntensity * 1.5} 0 0 0 0
                    ${g * effectiveIntensity * 1.5} 0 0 0 0
                    ${b * effectiveIntensity * 1.5} 0 0 0 0
                    0 0 0 ${opacity} 0"
            result="innerGlow"/>
          <feMerge>
            <feMergeNode in="coloredHaze"/>
            <feMergeNode in="innerGlow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>`;
      return { filterDef, filterRef: `url(#${filterId})` };
    }

    case "edgeFog": {
      const scale = Number(p.scale ?? 40);
      const displacement = Number(p.displacement ?? 12);
      const octaves = Math.round(Number(p.octaves ?? 3));
      const speed = Number(p.speed ?? 0.3);
      const blur = Number(p.blur ?? 4);
      const opacity = Number(p.opacity ?? 1);
      // Animate the turbulence over time
      const seed = ((t / 1000) * speed * 5) % 50;
      const baseFreq = (1 / scale).toFixed(4);

      const filterDef = `
        <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
          <!-- Generate animated turbulence noise -->
          <feTurbulence type="turbulence" baseFrequency="${baseFreq}" numOctaves="${octaves}" seed="${seed.toFixed(2)}" result="noise"/>
          <!-- Displace the source using the noise — creates wispy edges -->
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="${displacement}" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
          <!-- Soft blur on the displaced result for smoky falloff -->
          ${blur > 0 ? `<feGaussianBlur in="displaced" stdDeviation="${blur}" result="blurred"/>` : ''}
          <feComposite in="${blur > 0 ? 'blurred' : 'displaced'}" in2="SourceGraphic" operator="over" result="final"/>
          <feComponentTransfer in="final">
            <feFuncA type="linear" slope="${opacity}"/>
          </feComponentTransfer>
        </filter>`;
      return { filterDef, filterRef: `url(#${filterId})` };
    }

    case "innerGlow": {
      const radius = Number(p.radius ?? 8);
      const intensity = Number(p.intensity ?? 1.8);
      const color = String(p.color ?? "#e9d5ff");
      const pulse = p.pulse === true;
      const speed = Number(p.speed ?? 1);
      const opacity = Number(p.opacity ?? 1);
      const pulseVal = pulse ? 0.7 + 0.3 * Math.sin((t / 1000) * Math.PI * 2 * speed) : 1;
      const effectiveIntensity = intensity * pulseVal;
      const hex = color.replace('#', '');
      const r = (parseInt(hex.substring(0,2), 16) || 233) / 255;
      const g = (parseInt(hex.substring(2,4), 16) || 213) / 255;
      const b = (parseInt(hex.substring(4,6), 16) || 255) / 255;

      const filterDef = `
        <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
          <!-- Erode then blur to create inner glow effect -->
          <feMorphology in="SourceAlpha" operator="erode" radius="${radius * 0.3}" result="eroded"/>
          <feGaussianBlur in="eroded" stdDeviation="${radius}" result="innerBlur"/>
          <!-- Color the inner glow -->
          <feColorMatrix type="matrix" in="innerBlur"
            values="${r * effectiveIntensity} 0 0 0 ${r * 0.2}
                    ${g * effectiveIntensity} 0 0 0 ${g * 0.1}
                    ${b * effectiveIntensity} 0 0 0 ${b * 0.3}
                    0 0 0 ${opacity * 1.5} 0"
            result="coloredInner"/>
          <!-- Composite inner glow over source -->
          <feComposite in="coloredInner" in2="SourceAlpha" operator="in" result="clipped"/>
          <feMerge>
            <feMergeNode in="SourceGraphic"/>
            <feMergeNode in="clipped"/>
          </feMerge>
        </filter>`;
      return { filterDef, filterRef: `url(#${filterId})` };
    }

    // Legacy SVG filter presets (previously unimplemented)
    case "turbulence": {
      const scale = Number(p.scale ?? 20);
      const intensity = Number(p.intensity ?? 8);
      const speed = Number(p.speed ?? 1);
      const octaves = Math.round(Number(p.octaves ?? 2));
      const seed = ((t / 1000) * speed * 3) % 30;
      const baseFreq = (1 / scale).toFixed(4);
      const filterDef = `
        <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="turbulence" baseFrequency="${baseFreq}" numOctaves="${octaves}" seed="${seed.toFixed(2)}" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="${intensity}" xChannelSelector="R" yChannelSelector="G"/>
        </filter>`;
      return { filterDef, filterRef: `url(#${filterId})` };
    }

    case "caFull":
    case "rgbSplit": {
      const amount = Number(p.amount ?? p.intensity ?? 4);
      const angle = Number(p.angle ?? 0);
      const rad = angle * Math.PI / 180;
      const dx = Math.cos(rad) * amount;
      const dy = Math.sin(rad) * amount;
      const filterDef = `
        <filter id="${filterId}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
          <feOffset in="SourceGraphic" dx="${dx.toFixed(2)}" dy="${dy.toFixed(2)}" result="shifted"/>
          <feColorMatrix type="matrix" in="shifted"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="redCh"/>
          <feColorMatrix type="matrix" in="SourceGraphic"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="greenCh"/>
          <feOffset in="SourceGraphic" dx="${(-dx).toFixed(2)}" dy="${(-dy).toFixed(2)}" result="shifted2"/>
          <feColorMatrix type="matrix" in="shifted2"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blueCh"/>
          <feMerge>
            <feMergeNode in="redCh"/>
            <feMergeNode in="greenCh"/>
            <feMergeNode in="blueCh"/>
          </feMerge>
        </filter>`;
      return { filterDef, filterRef: `url(#${filterId})` };
    }

    default:
      return null;
  }
}
