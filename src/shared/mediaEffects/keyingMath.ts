import { OverlayKeying, OverlayKeyMode } from "../overlayTypes";

export type NormalizedKeying = {
  mode: OverlayKeyMode;
  threshold: number;
  softness: number;
  keyColor: [number, number, number];
  tolerance: number;
  spillReduction: number;
};

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function hexToRgb01(hex?: string): [number, number, number] {
  if (!hex) return [0, 1, 0];
  const clean = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 1, 0];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export function normalizeKeying(keying?: OverlayKeying): NormalizedKeying {
  return {
    mode: keying?.mode ?? "none",
    threshold: clamp01(keying?.threshold ?? 0.2),
    softness: clamp01(keying?.softness ?? 0.15),
    keyColor: hexToRgb01(keying?.keyColor),
    tolerance: clamp01(keying?.tolerance ?? 0.2),
    spillReduction: clamp01(keying?.spillReduction ?? 0),
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function applyKeyingToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  keying?: OverlayKeying
) {
  const cfg = normalizeKeying(keying);
  if (cfg.mode === "none") return;

  const [kr, kg, kb] = cfg.keyColor;
  const keyEdge = cfg.tolerance;
  const keySoft = Math.max(0.0001, cfg.softness);
  const spill = cfg.spillReduction;

  for (let i = 0; i < width * height * 4; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const a = pixels[i + 3] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    let alpha = a;
    if (cfg.mode === "alphaBlack") {
      alpha *= smoothstep(cfg.threshold, cfg.threshold + keySoft, luma);
    } else if (cfg.mode === "alphaWhite") {
      alpha *= 1 - smoothstep(1 - cfg.threshold - keySoft, 1 - cfg.threshold, luma);
    } else if (cfg.mode === "chromaKey") {
      const dr = r - kr;
      const dg = g - kg;
      const db = b - kb;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      const keep = smoothstep(keyEdge, keyEdge + keySoft, distance);
      alpha *= keep;

      if (spill > 0 && keep < 1) {
        const l = luma;
        const spillMix = spill * (1 - keep);
        pixels[i] = Math.round((r * (1 - spillMix) + l * spillMix) * 255);
        pixels[i + 1] = Math.round((g * (1 - spillMix) + l * spillMix) * 255);
        pixels[i + 2] = Math.round((b * (1 - spillMix) + l * spillMix) * 255);
      }
    }

    pixels[i + 3] = Math.round(clamp01(alpha) * 255);
  }
}
