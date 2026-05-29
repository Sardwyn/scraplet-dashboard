// src/shared/effects/parametricWebGL.ts
import { EffectParams } from "./parametricEffects";

export interface WebGLRenderer {
  gl: WebGL2RenderingContext;
  programs: Record<string, WebGLProgram>;
  quadBuffer: WebGLBuffer;
  positionAttributeLocation: number;
}

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADERS: Record<string, string> = {
  crtEmulator: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float scanlineIntensity;
uniform float curvature;
uniform float phosphorIntensity;
uniform float flickerSpeed;
uniform float vignette;

void main() {
    vec2 uv = vUv;
    vec2 cc = uv - 0.5;
    float dist = dot(cc, cc);
    uv = uv + cc * dist * curvature;
    
    // Crisp anti-aliased edge masks for the curved CRT monitor frame
    vec2 border = smoothstep(vec2(0.0), vec2(0.006), uv) * (1.0 - smoothstep(vec2(0.994), vec2(1.0), uv));
    float screenMask = border.x * border.y;
    
    if (screenMask <= 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Double frequency scanlines + shutter roll simulator
    float roll = sin(uv.y * 6.0 - uTime * 2.5) * 0.06 + 0.94;
    float scanline1 = sin(uv.y * uResolution.y * 1.25) * 0.5 + 0.5;
    float scanline2 = sin(uv.y * uResolution.y * 2.50) * 0.2 + 0.8;
    float scan = 1.0 - scanlineIntensity * scanline1 * scanline2 * 0.45 * roll;
    
    // Premium subpixel RGB aperture grille shadow mask
    float phosX = uv.x * uResolution.x * 2.2;
    vec3 phosRGB = vec3(
        sin(phosX) * 0.5 + 0.5,
        sin(phosX + 2.0944) * 0.5 + 0.5,
        sin(phosX + 4.1888) * 0.5 + 0.5
    );
    vec3 phos = mix(vec3(1.0), phosRGB, phosphorIntensity);
    
    // High-frequency monitor flicker
    float flicker = 1.0 - (sin(uTime * flickerSpeed * 10.0) * 0.02 + cos(uTime * 37.0) * 0.015);
    
    // Vignette light falloff
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    float vignetteVal = clamp(pow(16.0 * vig, vignette), 0.0, 1.0);
    
    vec3 baseCol = vec3(0.06, 0.08, 0.12);
    vec3 phosphorColor = vec3(0.0, 0.95, 0.25) * 0.07 * phosphorIntensity;
    
    // Linear blending conversion
    vec3 finalColor = pow(baseCol + phosphorColor, vec3(2.2)) * scan * phos * flicker * vignetteVal;
    finalColor = pow(finalColor, vec3(1.0 / 2.2)) * screenMask;
    
    fragColor = vec4(finalColor, (0.35 * (1.0 - scan * vignetteVal) + 0.08) * screenMask);
}
`,

  liquidDistortion: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float amplitude;
uniform float frequency;
uniform float speed;
uniform float shimmerIntensity;
uniform vec3 color;

float getCausticIntensity(vec2 uv, float freq, float t) {
    vec2 p = uv * freq - vec2(100.0);
    vec2 i = vec2(p);
    float c = 1.0;
    float inten = 0.0055;

    for (int n = 0; n < 5; n++) {
        float t_sub = t * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t_sub - i.x) + sin(t_sub + i.y), sin(t_sub - i.y) + cos(t_sub + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + t_sub) / inten), p.y / (cos(i.y + t_sub) / inten)));
    }
    c /= 5.0;
    c = 1.17 - pow(c, 1.45);
    return clamp(pow(abs(c), 7.5) * 11.0, 0.0, 1.0);
}

void main() {
    vec2 uv = vUv;
    float t = uTime * speed * 0.11;
    
    // Real Chromatic Dispersion Split on organic water ripples
    float valR = getCausticIntensity(uv, frequency * 1.018, t);
    float valG = getCausticIntensity(uv, frequency * 1.000, t);
    float valB = getCausticIntensity(uv, frequency * 0.982, t);
    
    vec3 causticCol = vec3(valR, valG, valB) * color * amplitude * 1.35;
    
    // Dynamic shimmer light modulator
    causticCol *= (1.0 + shimmerIntensity * sin(uTime * 3.2 + uv.x * 12.0) * cos(uTime * 1.8 + uv.y * 8.0));
    
    // Background fog motion
    float backgroundNoise = sin(uv.x * 3.5 + t) * cos(uv.y * 3.0 - t * 0.8) * 0.08 + 0.08;
    vec3 finalColor = causticCol + color * backgroundNoise * shimmerIntensity * 0.25;
    
    float maxVal = max(valR, max(valG, valB));
    fragColor = vec4(finalColor, maxVal * 0.88 + backgroundNoise * 0.28);
}
`,

  caLens: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float chromaSpread;
uniform float lensDistortion;
uniform float greenShift;
uniform float opacity;

void main() {
    vec2 uv = vUv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    vec2 uvAspect = vec2(uv.x * aspect, uv.y);
    float dist = length(uvAspect);
    float angle = atan(uvAspect.y, uvAspect.x);
    
    // Radial lens warp displacement
    float warp = 1.0 + lensDistortion * dist * dist;
    vec2 warpedUv = uv * warp + 0.5;
    
    if (warpedUv.x < 0.0 || warpedUv.x > 1.0 || warpedUv.y < 0.0 || warpedUv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Prismatic Chromatic Aberration Halo
    float rSpread = 1.0 + chromaSpread * 0.45;
    float gSpread = 1.0 + greenShift * 0.45;
    float bSpread = 1.0 - chromaSpread * 0.45;
    
    float ringR = smoothstep(0.38, 0.395, dist * rSpread) * (1.0 - smoothstep(0.395, 0.415, dist * rSpread));
    float ringG = smoothstep(0.38, 0.395, dist * gSpread) * (1.0 - smoothstep(0.395, 0.415, dist * gSpread));
    float ringB = smoothstep(0.38, 0.395, dist * bSpread) * (1.0 - smoothstep(0.395, 0.415, dist * bSpread));
    
    // Premium horizontal anamorphic streak lens flare (Red Giant style)
    float anamorphic = exp(-pow(uv.y * 36.0, 2.0)) * exp(-pow(uv.x * 1.8, 2.0));
    vec3 anamCol = vec3(0.08, 0.35, 1.0) * anamorphic * (1.0 + 0.15 * sin(uTime * 12.0)) * chromaSpread * 14.0;
    
    // Radial shimmering starburst rays
    float rays = sin(angle * 8.0 + uTime * 0.45) * cos(angle * 3.0 - uTime * 0.25) * 0.5 + 0.5;
    rays += sin(angle * 24.0 - uTime * 1.1) * 0.25;
    float rayFade = smoothstep(0.5, 0.0, dist);
    vec3 rayCol = vec3(0.95, 0.88, 0.78) * rays * rayFade * chromaSpread * 3.5;
    
    // Volumetric center spot lens glow
    float centerGlow = exp(-dist * 8.5) * 0.45;
    vec3 centerCol = vec3(1.0, 0.82, 0.65) * centerGlow;
    
    // Vignette light falloff
    float vig = warpedUv.x * warpedUv.y * (1.0 - warpedUv.x) * (1.0 - warpedUv.y);
    float vignetteVal = clamp(pow(16.0 * vig, 0.35), 0.0, 1.0);
    
    vec3 rgbHalo = vec3(ringR, ringG, ringB) * vec3(1.0, 0.92, 0.82) * 0.8;
    vec3 finalColor = (rgbHalo + anamCol + rayCol + centerCol) * vignetteVal;
    
    float alpha = (ringR + ringG + ringB + anamorphic * 0.45 + rays * 0.32 + centerGlow) * opacity;
    fragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
}
`,

  godRays: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float beamCount;
uniform float rayLength;
uniform float shimmerSpeed;
uniform float intensity;
uniform vec3 color;

float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
    float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
    float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 4-octave Fractal Brownian Motion for rich volumetric smoke density
float fbm(in vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = vUv - vec2(0.5, 0.5);
    float aspect = uResolution.x / uResolution.y;
    vec2 uvAspect = vec2(uv.x * aspect, uv.y);
    float dist = length(uvAspect);
    float angle = atan(uvAspect.y, uvAspect.x);
    
    float t = uTime * shimmerSpeed * 0.42;
    
    // Volumetric multi-frequency light ray shafts
    float rays1 = sin(angle * beamCount + t) * 0.5 + 0.5;
    float rays2 = cos(angle * (beamCount * 0.43) - t * 0.65) * 0.32;
    float rays3 = sin(angle * (beamCount * 1.88) + t * 1.35) * 0.16;
    float rays = rays1 + rays2 + rays3;
    
    // Rich foggy dust distribution
    vec2 fbmUv = vec2(angle * 4.0, dist * 2.4 - t);
    float dust = fbm(fbmUv);
    rays = rays * (0.28 + 0.72 * dust);
    
    // Core light flare
    float glow = exp(-dist * 12.5) * 1.45;
    
    // Soft outer falloff bound
    float fade = smoothstep(rayLength + 0.12, 0.0, dist);
    
    // Gamma-corrected highlight S-curve mapper
    vec3 linearColor = color * (rays * intensity * fade * (1.18 - dist) + glow * intensity);
    vec3 finalColor = pow(linearColor, vec3(1.0 / 1.55));
    
    float alpha = clamp((rays * intensity * fade + glow * 0.48) * 0.88, 0.0, 1.0);
    fragColor = vec4(finalColor, alpha);
}
`,

  digitalGlitch: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float glitchIntensity;
uniform float frequency;
uniform float chromaticSplit;
uniform float noiseDensity;
uniform float speed;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    float t = floor(uTime * speed * 14.5);
    
    // Horizontal line shears
    float sliceY = floor(uv.y * (14.0 + 35.0 * (1.0 - glitchIntensity)));
    float sliceValue = rand(vec2(sliceY, t));
    
    float xOffset = 0.0;
    if (sliceValue < glitchIntensity * frequency * 0.16) {
        xOffset = (rand(vec2(sliceY + 2.76, t)) - 0.5) * glitchIntensity * 0.17;
    }
    
    vec2 warpedUv = uv + vec2(xOffset, 0.0);
    
    // Chromatic split parameters
    float splitFreq = sin(warpedUv.y * 115.0 + uTime * 12.0) * 0.5 + 0.5;
    
    // Pixelated block corruption overlays
    float blockGrid = 18.0;
    vec2 blockUv = floor(warpedUv * blockGrid) / blockGrid;
    float blockValue = rand(blockUv + vec2(t * 0.28, 0.0));
    
    vec4 finalColor = vec4(0.0);
    
    if (blockValue < glitchIntensity * noiseDensity * 0.28) {
        // Digital package corruption packets
        float bR = rand(blockUv + vec2(1.0, t));
        float bG = rand(blockUv + vec2(2.0, t));
        float bB = rand(blockUv + vec2(3.0, t));
        finalColor = vec4(vec3(bR, bG, bB), 0.72 * glitchIntensity);
    } else {
        // Laser scanning boundary outlines
        float borderLines = smoothstep(0.016, 0.0, abs(warpedUv.x - 0.5) - 0.482) +
                            smoothstep(0.016, 0.0, abs(warpedUv.y - 0.5) - 0.482);
        if (borderLines > 0.0) {
            finalColor = vec4(0.0, 0.92, 1.0, borderLines * glitchIntensity * 0.55);
        }
        
        // Static scan noise
        float analogNoise = rand(warpedUv + vec2(0.0, t * 11.5));
        if (analogNoise < glitchIntensity * noiseDensity * 0.16) {
            finalColor += vec4(1.0, 1.0, 1.0, 0.28 * glitchIntensity);
        }
    }
    
    // Spliced channel chromatic offset
    if (abs(xOffset) > 0.0) {
        finalColor.r += 0.82 * glitchIntensity * splitFreq;
        finalColor.g += 0.42 * glitchIntensity * (1.0 - splitFreq);
        finalColor.b += 0.88 * glitchIntensity * splitFreq * 0.45;
        finalColor.a = max(finalColor.a, 0.48 * glitchIntensity);
    }
    
    // VHS horizontal scan inverter
    float horizontalScanLine = sin(warpedUv.y * uResolution.y * 0.75) * 0.5 + 0.5;
    if (horizontalScanLine < glitchIntensity * 0.18) {
        finalColor.r = 1.0 - finalColor.r;
        finalColor.a = max(finalColor.a, 0.32);
    }
    
    fragColor = finalColor;
}
`,

  upsideDown: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float desaturation;
uniform float fogIntensity;
uniform float sporeDensity;
uniform float chromaSpread;
uniform float vignetteStrength;
uniform float grainIntensity;
uniform float opacity;

float hash2(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(in vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

float getFogChannel(vec2 uv, float offsetTime) {
    vec2 p1 = uv * 2.8 + vec2(uTime * 0.045 + offsetTime, uTime * 0.025);
    vec2 p2 = uv * 4.5 - vec2(uTime * 0.035, uTime * 0.04 + offsetTime);
    float f1 = fbm(p1);
    float f2 = fbm(p2);
    return mix(f1, f2, 0.5);
}

float getSporesChannel(vec2 uv, float aspect) {
    // Elegant grid density for delicate particles
    vec2 gridUv = uv * vec2(15.0 * aspect, 15.0);
    vec2 cellId = floor(gridUv);
    vec2 cellUv = fract(gridUv) - 0.5;
    
    float spores = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 currentCell = cellId + neighbor;
            float h = hash2(currentCell);
            
            if (h < sporeDensity * 0.65) {
                float seed = h * 827.41;
                // Much smaller and delicate spore sizes
                float size = 0.008 + fract(seed * 0.2) * 0.018;
                
                // Continuous 2D organic hovering/swaying in the wind (no linear upward progression or wrapping jitter)
                float tX = uTime * 0.12 + seed;
                float tY = uTime * 0.10 + seed * 2.3;
                vec2 sporePos = vec2(
                    noise(vec2(tX, seed)) - 0.5,
                    noise(vec2(tY, seed + 17.4)) - 0.5
                ) * 0.75;
                
                float distToSpore = length(cellUv - neighbor - sporePos);
                
                // Depth of field focus breathing (particles drift slowly in and out of the focus plane)
                float depthFade = 0.4 + 0.6 * noise(vec2(uTime * 0.15 + seed, seed * 1.8));
                
                float glow = smoothstep(size, 0.0, distToSpore);
                glow = pow(glow, 1.8) * depthFade;
                spores += glow;
            }
        }
    }
    return spores;
}

void main() {
    vec2 radialDir = vUv - 0.5;
    float distFromCenter = length(radialDir);
    
    // Radial Chromatic Aberration offset scaled near corners
    vec2 caOffset = normalize(radialDir) * distFromCenter * distFromCenter * chromaSpread * 0.45;
    
    vec2 uvR = vUv - caOffset;
    vec2 uvG = vUv;
    vec2 uvB = vUv + caOffset;
    
    float aspect = uResolution.x / uResolution.y;
    
    // Evaluate chromatic splitting of Fog and Spores
    float fogR = getFogChannel(uvR, 0.0);
    float fogG = getFogChannel(uvG, 0.015);
    float fogB = getFogChannel(uvB, 0.03);
    
    float sporesR = getSporesChannel(uvR, aspect);
    float sporesG = getSporesChannel(uvG, aspect);
    float sporesB = getSporesChannel(uvB, aspect);
    
    // Color grade: deep eerie cyan-teal shadows & midtones
    vec3 baseTealShadow = vec3(0.01, 0.08, 0.11);
    vec3 baseTealMid = vec3(0.03, 0.16, 0.20);
    vec3 bgWash = mix(baseTealShadow, baseTealMid, 1.0 - distFromCenter * 1.1);
    
    // Desaturate background
    float lumaBg = dot(bgWash, vec3(0.2126, 0.7152, 0.0722));
    bgWash = mix(bgWash, vec3(lumaBg), desaturation);
    
    // Combine fog (pale green-cyan)
    vec3 fogColor = vec3(0.10, 0.38, 0.44);
    vec3 fogComp = vec3(fogR, fogG, fogB) * fogColor * fogIntensity * 1.6;
    
    // Combine spores (contrasting warm red-orange embers)
    vec3 sporeColor = vec3(0.92, 0.30, 0.06);
    vec3 sporeComp = vec3(sporesR, sporesG, sporesB) * sporeColor * 1.85;
    
    vec3 finalRGB = bgWash + fogComp + sporeComp;
    
    // Vignette outer edge darkening
    float vig = vUv.x * vUv.y * (1.0 - vUv.x) * (1.0 - vUv.y);
    float vignetteVal = clamp(pow(16.0 * vig, 0.3 + vignetteStrength * 0.7), 0.0, 1.0);
    finalRGB *= mix(1.0, vignetteVal, vignetteStrength);
    
    // Inject dynamic film grain
    float grainNoise = hash2(vUv + fract(uTime));
    float grain = (grainNoise - 0.5) * grainIntensity;
    finalRGB += vec3(grain);
    
    // Atmospheric alpha calculation (scaled cleanly by the user-controlled opacity)
    float alpha = 0.25 * (1.0 - desaturation) + fogG * fogIntensity * 0.5 + sporesG * 0.8 + (1.0 - vignetteVal) * vignetteStrength * 0.65;
    alpha = clamp(alpha, 0.0, 0.95) * opacity;
    
    fragColor = vec4(finalRGB, alpha);
}
`
};

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return [r / 255, g / 255, b / 255];
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function initWebGLRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  const gl = canvas.getContext("webgl2", { alpha: true, preimageAlpha: false, antialias: true });
  if (!gl) {
    console.warn("WebGL 2 context is not available.");
    return null;
  }

  // Enable standard alpha blending
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  if (!vs) return null;

  const programs: Record<string, WebGLProgram> = {};
  for (const [preset, source] of Object.entries(FRAGMENT_SHADERS)) {
    const fs = createShader(gl, gl.FRAGMENT_SHADER, source);
    if (fs) {
      const prog = createProgram(gl, vs, fs);
      if (prog) {
        programs[preset] = prog;
      }
      gl.deleteShader(fs);
    }
  }
  gl.deleteShader(vs);

  // Setup simple full-screen quad
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]), gl.STATIC_DRAW);

  return {
    gl,
    programs,
    quadBuffer,
    positionAttributeLocation: 0
  };
}

export function renderWebGLFrame(
  renderer: WebGLRenderer,
  preset: string,
  params: EffectParams,
  t: number,
  width: number,
  height: number
): void {
  const { gl, programs, quadBuffer } = renderer;
  const program = programs[preset];
  if (!program) return;

  // Set viewport
  gl.viewport(0, 0, width, height);

  // Use program
  gl.useProgram(program);

  // Bind full-screen quad
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  const posLoc = gl.getAttribLocation(program, "position");
  if (posLoc !== -1) {
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  }

  // Set standard uniforms
  const timeLoc = gl.getUniformLocation(program, "uTime");
  if (timeLoc !== -1) gl.uniform1f(timeLoc, t / 1000);

  const resLoc = gl.getUniformLocation(program, "uResolution");
  if (resLoc !== -1) gl.uniform2f(resLoc, width, height);

  // Set effect-specific uniforms
  if (preset === "crtEmulator") {
    gl.uniform1f(gl.getUniformLocation(program, "scanlineIntensity"), Number(params.scanlineIntensity ?? 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "curvature"), Number(params.curvature ?? 0.15));
    gl.uniform1f(gl.getUniformLocation(program, "phosphorIntensity"), Number(params.phosphorIntensity ?? 0.25));
    gl.uniform1f(gl.getUniformLocation(program, "flickerSpeed"), Number(params.flickerSpeed ?? 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "vignette"), Number(params.vignette ?? 0.4));
  } else if (preset === "liquidDistortion") {
    gl.uniform1f(gl.getUniformLocation(program, "amplitude"), Number(params.amplitude ?? 0.05));
    gl.uniform1f(gl.getUniformLocation(program, "frequency"), Number(params.frequency ?? 10.0));
    gl.uniform1f(gl.getUniformLocation(program, "speed"), Number(params.speed ?? 1.5));
    gl.uniform1f(gl.getUniformLocation(program, "shimmerIntensity"), Number(params.shimmerIntensity ?? 0.3));
    const [r, g, b] = hexToRgb(String(params.color ?? "#3b82f6"));
    gl.uniform3f(gl.getUniformLocation(program, "color"), r, g, b);
  } else if (preset === "caLens") {
    gl.uniform1f(gl.getUniformLocation(program, "chromaSpread"), Number(params.chromaSpread ?? 0.04));
    gl.uniform1f(gl.getUniformLocation(program, "lensDistortion"), Number(params.lensDistortion ?? 0.1));
    gl.uniform1f(gl.getUniformLocation(program, "greenShift"), Number(params.greenShift ?? 0.01));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 1.0));
  } else if (preset === "godRays") {
    gl.uniform1f(gl.getUniformLocation(program, "beamCount"), Number(params.beamCount ?? 12.0));
    gl.uniform1f(gl.getUniformLocation(program, "rayLength"), Number(params.rayLength ?? 0.6));
    gl.uniform1f(gl.getUniformLocation(program, "shimmerSpeed"), Number(params.shimmerSpeed ?? 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "intensity"), Number(params.intensity ?? 0.8));
    const [r, g, b] = hexToRgb(String(params.color ?? "#f59e0b"));
    gl.uniform3f(gl.getUniformLocation(program, "color"), r, g, b);
  } else if (preset === "digitalGlitch") {
    gl.uniform1f(gl.getUniformLocation(program, "glitchIntensity"), Number(params.glitchIntensity ?? 0.4));
    gl.uniform1f(gl.getUniformLocation(program, "frequency"), Number(params.frequency ?? 2.0));
    gl.uniform1f(gl.getUniformLocation(program, "chromaticSplit"), Number(params.chromaticSplit ?? 0.03));
    gl.uniform1f(gl.getUniformLocation(program, "noiseDensity"), Number(params.noiseDensity ?? 0.2));
    gl.uniform1f(gl.getUniformLocation(program, "speed"), Number(params.speed ?? 1.0));
  } else if (preset === "upsideDown") {
    gl.uniform1f(gl.getUniformLocation(program, "desaturation"), Number(params.desaturation ?? 0.3));
    gl.uniform1f(gl.getUniformLocation(program, "fogIntensity"), Number(params.fogIntensity ?? 0.4));
    gl.uniform1f(gl.getUniformLocation(program, "sporeDensity"), Number(params.sporeDensity ?? 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "chromaSpread"), Number(params.chromaSpread ?? 0.02));
    gl.uniform1f(gl.getUniformLocation(program, "vignetteStrength"), Number(params.vignetteStrength ?? 0.65));
    gl.uniform1f(gl.getUniformLocation(program, "grainIntensity"), Number(params.grainIntensity ?? 0.04));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.7));
  }



  // Draw quad
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export function cleanupWebGLRenderer(renderer: WebGLRenderer): void {
  const { gl, programs, quadBuffer } = renderer;
  for (const prog of Object.values(programs)) {
    gl.deleteProgram(prog);
  }
  gl.deleteBuffer(quadBuffer);
}
