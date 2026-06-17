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
    float t = mod(uTime, 1000.0);
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
    float roll = sin(uv.y * 6.0 - t * 2.5) * 0.06 + 0.94;
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
    float flicker = 1.0 - (sin(t * flickerSpeed * 10.0) * 0.02 + cos(t * 37.0) * 0.015);
    
    // Vignette light falloff
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    float vignetteVal = clamp(pow(max(16.0 * vig, 0.0001), vignette), 0.0, 1.0);
    
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
    float t = mod(uTime, 1000.0) * speed * 0.11;
    
    // Real Chromatic Dispersion Split on organic water ripples
    float valR = getCausticIntensity(uv, frequency * 1.018, t);
    float valG = getCausticIntensity(uv, frequency * 1.000, t);
    float valB = getCausticIntensity(uv, frequency * 0.982, t);
    
    vec3 causticCol = vec3(valR, valG, valB) * color * amplitude * 1.35;
    
    // Dynamic shimmer light modulator
    causticCol *= (1.0 + shimmerIntensity * sin(mod(uTime, 1000.0) * 3.2 + uv.x * 12.0) * cos(mod(uTime, 1000.0) * 1.8 + uv.y * 8.0));
    
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
    float t = mod(uTime, 1000.0);
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
    vec3 anamCol = vec3(0.08, 0.35, 1.0) * anamorphic * (1.0 + 0.15 * sin(t * 12.0)) * chromaSpread * 14.0;
    
    // Radial shimmering starburst rays
    float rays = sin(angle * 8.0 + t * 0.45) * cos(angle * 3.0 - t * 0.25) * 0.5 + 0.5;
    rays += sin(angle * 24.0 - t * 1.1) * 0.25;
    float rayFade = smoothstep(0.5, 0.0, dist);
    vec3 rayCol = vec3(0.95, 0.88, 0.78) * rays * rayFade * chromaSpread * 3.5;
    
    // Volumetric center spot lens glow
    float centerGlow = exp(-dist * 8.5) * 0.45;
    vec3 centerCol = vec3(1.0, 0.82, 0.65) * centerGlow;
    
    // Vignette light falloff
    float vig = warpedUv.x * warpedUv.y * (1.0 - warpedUv.x) * (1.0 - warpedUv.y);
    float vignetteVal = clamp(pow(max(16.0 * vig, 0.0001), 0.35), 0.0, 1.0);
    
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
    vec2 i = mod(floor(p), 289.0);
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
    
    float t = mod(uTime, 1000.0) * shimmerSpeed * 0.42;
    
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
    float t_wrap = mod(uTime, 1000.0);
    float t = floor(t_wrap * speed * 14.5);
    
    // Horizontal line shears
    float sliceY = floor(uv.y * (14.0 + 35.0 * (1.0 - glitchIntensity)));
    float sliceValue = rand(vec2(sliceY, t));
    
    float xOffset = 0.0;
    if (sliceValue < glitchIntensity * frequency * 0.16) {
        xOffset = (rand(vec2(sliceY + 2.76, t)) - 0.5) * glitchIntensity * 0.17;
    }
    
    vec2 warpedUv = uv + vec2(xOffset, 0.0);
    
    // Chromatic split parameters
    float splitFreq = sin(warpedUv.y * 115.0 + t_wrap * 12.0) * 0.5 + 0.5;
    
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
    float a = hash2(mod(i, 289.0));
    float b = hash2(mod(i + vec2(1.0, 0.0), 289.0));
    float c = hash2(mod(i + vec2(0.0, 1.0), 289.0));
    float d = hash2(mod(i + vec2(1.0, 1.0), 289.0));
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
    float t = mod(uTime, 1000.0);
    vec2 p1 = uv * 2.8 + vec2(t * 0.045 + offsetTime, t * 0.025);
    vec2 p2 = uv * 4.5 - vec2(t * 0.035, t * 0.04 + offsetTime);
    float f1 = fbm(p1);
    float f2 = fbm(p2);
    return mix(f1, f2, 0.5);
}

float hash2(vec2 co);

vec3 getSporesChannel(vec2 uv, float aspect, vec2 caOffset) {
    float t_wrap = mod(uTime, 1000.0);
    // Grid density for atmospheric particles
    vec2 gridUv = uv * vec2(15.0 * aspect, 15.0);
    vec2 cellId = floor(gridUv);
    vec2 cellUv = fract(gridUv) - 0.5;
    
    // Scale caOffset to cell-grid space and apply a premium dampening factor (0.10) to keep it as a subtle subpixel lens fringe
    vec2 cellOffset = caOffset * vec2(15.0 * aspect, 15.0) * 0.10;
    
    vec3 spores = vec3(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 currentCell = cellId + neighbor;
            float h = hash2(currentCell);
            
            if (h < sporeDensity * 0.65) {
                float seed = h * 5.0; // Keep seed small to prevent sin precision loss over time
                
                // Beautifully visible cinematic base size (notched up as requested)
                float baseSize = 0.04 + fract(seed * 0.3) * 0.06;
                
                // 3D Depth coordinate: 0.1 (extremely close) to 1.0 (far away)
                float z = 0.1 + 0.9 * fract(seed * 7.13);
                
                // Defocus distance relative to focal plane at z = 0.5
                float defocus = abs(z - 0.5);
                
                // Perspective projection: closer objects appear much larger
                float size = baseSize * (0.35 / (z + 0.08));
                
                // Defocus blur radius (DoF camera lens simulation)
                float blur = 0.015 + defocus * 0.22;
                
                // Buttery-smooth, organic 2D drift using prime frequencies (zero noise precision jitter)
                float tX = t_wrap * (0.15 + (1.0 - z) * 0.15); // Closer particles drift slightly faster
                float tY = t_wrap * (0.12 + (1.0 - z) * 0.12);
                vec2 sporePos = vec2(
                    sin(tX + seed * 6.28) * 0.35 + cos(tX * 0.43 + seed * 3.14) * 0.15,
                    cos(tY + seed * 6.28) * 0.35 + sin(tY * 0.37 + seed * 3.14) * 0.15
                );
                
                // Standard subpixel chromatic aberration offsets inside the same grid cell
                float distR = length(cellUv - cellOffset - neighbor - sporePos);
                float distG = length(cellUv - neighbor - sporePos);
                float distB = length(cellUv + cellOffset - neighbor - sporePos);
                
                // DoF physical lens blurring using smoothstep
                float glowR = smoothstep(size + blur, max(0.0, size - blur), distR);
                float glowG = smoothstep(size + blur, max(0.0, size - blur), distG);
                float glowB = smoothstep(size + blur, max(0.0, size - blur), distB);
                
                // Bokeh brightness attenuation (energy conservation)
                float intensityMultiplier = 1.0 / (1.0 + defocus * 5.0);
                
                // Individual particle breathing
                float breathing = 0.6 + 0.4 * sin(t_wrap * 0.5 + seed * 10.0);
                
                float factor = intensityMultiplier * breathing;
                spores.r += glowR * factor;
                spores.g += glowG * factor;
                spores.b += glowB * factor;
            }
        }
    }
    return spores;
}

void main() {
    vec2 radialDir = vUv - 0.5;
    float distFromCenter = length(radialDir);
    
    // Radial Chromatic Aberration offset scaled near corners (multiplied slightly for better visibility)
    vec2 caOffset = normalize(radialDir) * distFromCenter * distFromCenter * chromaSpread * 0.95;
    
    vec2 uvR = vUv - caOffset;
    vec2 uvG = vUv;
    vec2 uvB = vUv + caOffset;
    
    float aspect = uResolution.x / uResolution.y;
    
    // Evaluate chromatic splitting of Fog (smooth, continuous noise is safe for coordinate-splitting)
    float fogR = getFogChannel(uvR, 0.0);
    float fogG = getFogChannel(uvG, 0.015);
    float fogB = getFogChannel(uvB, 0.03);
    
    // Boost contrast to create distinct, beautiful rolling smoke wisps instead of flat fog
    float smokeR = smoothstep(0.22, 0.78, fogR);
    float smokeG = smoothstep(0.22, 0.78, fogG);
    float smokeB = smoothstep(0.22, 0.78, fogB);
    
    // Sample Spores exactly once to completely prevent cell-grid RGB boundary-crossing jitter
    // Now with premium 3D subpixel chromatic aberration mapped on the spore geometry
    vec3 spores = getSporesChannel(vUv, aspect, caOffset);
    
    // Base is transparent for clean streaming overlays
    vec3 finalRGB = vec3(0.0);
    float alphaAccum = 0.0;
    
    // Combine fog (cool volumetric blue-teal, screen-blended to prevent muddy/washed-out composites)
    vec3 fogColor = vec3(0.12, 0.34, 0.40);
    float fogAlpha = smokeG * fogIntensity * 1.2;
    vec3 fogComp = vec3(smokeR, smokeG, smokeB) * fogColor * fogIntensity * 2.5;
    finalRGB = mix(finalRGB, fogComp, clamp(fogAlpha, 0.0, 1.0));
    alphaAccum += fogAlpha;
    
    // Combine spores (gorgeous cold glowing white/blue ashes, perfectly aligned across RGB)
    vec3 sporeColor = vec3(0.88, 0.94, 1.0);
    vec3 sporeComp = spores * sporeColor * 1.85;
    float maxSpore = max(spores.r, max(spores.g, spores.b));
    float sporeAlpha = maxSpore * 0.85;
    finalRGB += sporeComp;
    alphaAccum += sporeAlpha;
    
    // Vignette outer edge darkening (rendered as a dark eerie deep teal vignette frame)
    float vig = vUv.x * vUv.y * (1.0 - vUv.x) * (1.0 - vUv.y);
    float vignetteVal = clamp(pow(max(16.0 * vig, 0.0001), 0.3 + vignetteStrength * 0.7), 0.0, 1.0);
    float vigAlpha = (1.0 - vignetteVal) * vignetteStrength * 0.75;
    vec3 vigColor = vec3(0.01, 0.05, 0.07);
    finalRGB = mix(finalRGB, vigColor, vigAlpha);
    alphaAccum += vigAlpha;
    
    // Inject dynamic film grain
    float grainNoise = hash2(vUv + fract(mod(uTime, 1000.0)));
    float grain = (grainNoise - 0.5) * grainIntensity;
    finalRGB += vec3(grain);
    alphaAccum += abs(grain) * 0.5;
    
    float alpha = clamp(alphaAccum, 0.0, 0.98) * opacity;
    fragColor = vec4(finalRGB, alpha);
}
`,

  silentHillFog: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float desaturation;
uniform float fogDensity;
uniform float fogSpeed;
uniform float contrast;
uniform float grainIntensity;
uniform float opacity;

float hash2_sh(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise_sh(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash2_sh(mod(i, 289.0));
    float b = hash2_sh(mod(i + vec2(1.0, 0.0), 289.0));
    float c = hash2_sh(mod(i + vec2(0.0, 1.0), 289.0));
    float d = hash2_sh(mod(i + vec2(1.0, 1.0), 289.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm_sh(in vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 3; i++) {
        v += a * noise_sh(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = vUv;
    float t = mod(uTime, 1000.0) * fogSpeed;
    
    // Slow drifting dual-layer FBM fog
    vec2 p1 = uv * 2.5 + vec2(t * 0.03, t * 0.015);
    vec2 p2 = uv * 3.8 - vec2(t * 0.02, t * 0.025);
    float f1 = fbm_sh(p1);
    float f2 = fbm_sh(p2);
    float rawFog = mix(f1, f2, 0.5);
    
    // Apply contrast curves
    float wisp = smoothstep(0.2, 0.8, rawFog);
    wisp = pow(max(wisp, 0.0001), 1.0 / max(0.1, contrast));
    
    // Base is transparent for clean streaming overlays
    vec3 finalRGB = vec3(0.0);
    float alphaAccum = 0.0;
    
    // Fog contribution (cool greyish/ash fog)
    vec3 ashFogColor = vec3(0.48, 0.49, 0.51);
    float fogAlpha = wisp * fogDensity * 1.5;
    finalRGB = mix(finalRGB, ashFogColor, clamp(fogAlpha, 0.0, 1.0));
    alphaAccum += fogAlpha;
    
    // Vignette (rendered as a dark border framing)
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    float vignetteVal = clamp(pow(max(16.0 * vig, 0.0001), 0.4), 0.0, 1.0);
    float vigAlpha = (1.0 - vignetteVal) * 0.75;
    vec3 vigColor = vec3(0.08, 0.08, 0.09);
    finalRGB = mix(finalRGB, vigColor, vigAlpha);
    alphaAccum += vigAlpha;
    
    // Film grain
    float grain = (hash2_sh(uv + fract(mod(uTime, 1000.0))) - 0.5) * grainIntensity;
    finalRGB += vec3(grain);
    alphaAccum += abs(grain) * 0.5;
    
    float alpha = clamp(alphaAccum, 0.0, 1.0) * opacity;
    fragColor = vec4(finalRGB, alpha);
}
`,

  bladeRunnerRain: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float rainDensity;
uniform float rainSpeed;
uniform float tailLength;
uniform vec3 neonColor1;
uniform vec3 neonColor2;
uniform float ambientReflection;
uniform float opacity;

float hash_br(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    float t_wrap = mod(uTime, 1000.0);
    
    // Ambient neon bloom reflection at the bottom
    float bloomY = smoothstep(0.4, 0.0, uv.y);
    vec3 ambientGlow = mix(neonColor1, neonColor2, sin(t_wrap * 0.5 + uv.x * 3.0) * 0.5 + 0.5);
    vec3 finalRGB = ambientGlow * bloomY * ambientReflection * 0.6;
    
    float numCols = 85.0 * aspect;
    vec2 gridUv = uv * vec2(numCols, 1.0);
    float colId = floor(gridUv.x);
    float fractX = fract(gridUv.x) - 0.5;
    
    float accumRain = 0.0;
    vec3 rainRGB = vec3(0.0);
    
    for (int x = -1; x <= 1; x++) {
        float col = colId + float(x);
        float h = hash_br(vec2(col, 137.45));
        
        if (h < rainDensity * 0.85) {
            float speed = rainSpeed * (1.1 + h * 0.9);
            float offset = h * 73.29;
            
            float yCoord = uv.y * 3.2; 
            float progress = t_wrap * speed + offset;
            float fractY = fract(yCoord + progress);
            
            float streakWidth = 0.04 + h * 0.035;
            float streakDistX = abs(fractX - float(x));
            
            float headGlow = exp(-fractY * 20.0);
            float tailFade = pow(max(1.0 - fractY / tailLength, 0.0), 2.5);
            float droplet = (headGlow * 1.8 + tailFade) * smoothstep(streakWidth, 0.0, streakDistX);
            
            if (droplet > 0.0) {
                vec3 colColor = mix(neonColor1, neonColor2, h);
                rainRGB += colColor * droplet * 1.8;
                accumRain += droplet;
            }
            
            float splashH = hash_br(vec2(col, 255.12));
            float rippleCenterY = 0.02 + splashH * 0.06;
            vec2 ripplePos = vec2(fractX - float(x), uv.y - rippleCenterY);
            ripplePos.x *= aspect * (1.0 / numCols) * 5.0;
            float distToRipple = length(ripplePos);
            float splashTime = fract(t_wrap * 2.2 + splashH * 15.0);
            
            float ripple = smoothstep(0.015, 0.0, abs(distToRipple - splashTime * 0.06)) * (1.0 - splashTime);
            
            if (ripple > 0.0) {
                vec3 colColor = mix(neonColor1, neonColor2, splashH);
                rainRGB += colColor * ripple * 1.5;
                accumRain += ripple;
            }
        }
    }
    
    finalRGB += rainRGB;
    
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    float vignetteVal = clamp(pow(max(16.0 * vig, 0.0001), 0.48), 0.0, 1.0);
    finalRGB *= mix(0.25, 1.0, vignetteVal);
    
    float alpha = (accumRain * 1.2 + bloomY * ambientReflection * 0.35) * opacity;
    fragColor = vec4(finalRGB, clamp(alpha, 0.0, 1.0));
}
`,

  matrixHaze: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float codeSpeed;
uniform float trailLength;
uniform float glowIntensity;
uniform vec3 codeColor;
uniform float ambientHaze;
uniform float opacity;

float hash_mx(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float getGlyph_mx(vec2 p, float seed) {
    if (p.x < 0.15 || p.x > 0.85 || p.y < 0.15 || p.y > 0.85) return 0.0;
    
    float h = hash_mx(vec2(seed, 412.18));
    float stroke = 0.0;
    float lineThickness = 0.05;
    
    float v_line = smoothstep(lineThickness, 0.0, abs(p.x - 0.5));
    float h_line = smoothstep(lineThickness, 0.0, abs(p.y - 0.5));
    float d_line1 = smoothstep(lineThickness, 0.0, abs(p.x - p.y));
    float d_line2 = smoothstep(lineThickness, 0.0, abs(p.x + p.y - 1.0));
    float circle = smoothstep(lineThickness, 0.0, abs(length(p - 0.5) - 0.25));
    float arc = circle * step(0.5, p.x);
    float top_bar = smoothstep(lineThickness, 0.0, abs(p.y - 0.75)) * step(0.25, p.x) * step(p.x, 0.75);
    float bot_bar = smoothstep(lineThickness, 0.0, abs(p.y - 0.25)) * step(0.25, p.x) * step(p.x, 0.75);
    
    int charId = int(h * 8.0);
    if (charId == 0) {
        stroke = max(v_line, top_bar);
    } else if (charId == 1) {
        stroke = max(d_line1, d_line2);
    } else if (charId == 2) {
        stroke = max(circle, h_line);
    } else if (charId == 3) {
        stroke = max(arc, d_line1);
    } else if (charId == 4) {
        stroke = max(v_line, bot_bar);
    } else if (charId == 5) {
        stroke = max(d_line2, top_bar);
    } else if (charId == 6) {
        stroke = max(v_line, d_line1 * step(0.5, p.y));
    } else {
        stroke = max(circle, top_bar);
    }
    
    return stroke;
}

void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    float t_wrap = mod(uTime, 1000.0);
    
    vec3 hazeColor = codeColor * 0.18;
    float centerDist = length(uv - vec2(0.5, 0.5));
    vec3 finalRGB = hazeColor * (1.0 - centerDist * 0.8) * ambientHaze;
    
    float numCols = 60.0 * aspect;
    float numRows = 60.0;
    
    vec2 gridUv = uv * vec2(numCols, numRows);
    vec2 cellId = floor(gridUv);
    vec2 cellUv = fract(gridUv);
    
    float codeAccum = 0.0;
    float leadingHead = 0.0;
    
    float colId = cellId.x;
    float colHash = hash_mx(vec2(colId, 314.15));
    
    if (colHash < 0.82) {
        float speed = codeSpeed * (0.7 + colHash * 0.8) * 6.0;
        float fallOffset = colHash * 142.84;
        
        float tail = trailLength * 28.0;
        float totalHeight = numRows + tail;
        float progress = mod(t_wrap * speed + fallOffset, totalHeight);
        float headY = numRows - progress;
        
        float distToHead = gridUv.y - headY;
        
        if (distToHead >= 0.0 && distToHead < tail) {
            float brightness = 1.0 - (distToHead / tail);
            brightness = pow(max(brightness, 0.0001), 1.6);
            
            float cellSeed = colId + cellId.y * 17.13;
            float charMorph = floor(t_wrap * 10.0 + colHash * 50.0);
            float finalSeed = cellSeed + charMorph * 0.19;
            
            float glyph = getGlyph_mx(cellUv, finalSeed);
            codeAccum = glyph * brightness;
            
            if (distToHead < 1.0) {
                leadingHead = smoothstep(1.0, 0.0, distToHead) * glyph;
            }
        }
    }
    
    vec3 codeComp = codeColor * codeAccum * glowIntensity;
    codeComp += vec3(0.9, 1.0, 0.9) * leadingHead * glowIntensity * 1.8;
    
    finalRGB += codeComp;
    
    float alpha = (codeAccum * 1.3 + leadingHead * 1.8 + ambientHaze * 0.2) * opacity;
    fragColor = vec4(finalRGB, clamp(alpha, 0.0, 1.0));
}
`,

  falloutRadiation: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float shimmerIntensity;
uniform float scanlineIntensity;
uniform float geigerFlicker;
uniform vec3 tintColor;
uniform float glowRadius;
uniform float opacity;

float hash_fo(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    float t = mod(uTime, 1000.0);
    
    float waveX = sin(uv.y * 14.5 + t * 4.2) * 0.015 * shimmerIntensity +
                  cos(uv.y * 31.2 + t * 7.8) * 0.007 * shimmerIntensity;
    float waveY = cos(uv.x * 12.8 + t * 3.8) * 0.010 * shimmerIntensity;
    vec2 distortedUv = uv + vec2(waveX, waveY);
    
    float centerDist = length(distortedUv - 0.5);
    float radGlow = smoothstep(glowRadius * 1.2, 0.0, centerDist);
    
    float flicker = hash_fo(vec2(t, 42.17));
    float geigerAmp = 1.0 + (flicker - 0.5) * 0.25 * geigerFlicker;
    
    float scanline = sin(distortedUv.y * uResolution.y * 0.95) * 0.5 + 0.5;
    float scanLineEffect = mix(1.0, 0.4 + scanline * 0.6, scanlineIntensity);
    
    // Transparent background, glowing radioactive center
    vec3 finalRGB = tintColor * radGlow * 1.5 * geigerAmp * scanLineEffect;
    float alphaAccum = radGlow * 1.2 * scanLineEffect;
    
    float dust = hash_fo(distortedUv + fract(t));
    if (dust < 0.015 * geigerFlicker) {
        finalRGB += tintColor * 0.85;
        alphaAccum = max(alphaAccum, 0.75 * scanLineEffect);
    }
    
    float alpha = clamp(alphaAccum, 0.0, 1.0) * opacity;
    fragColor = vec4(finalRGB, alpha);
}
`,

  cyberpunkSmear: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float glitchFrequency;
uniform float smearWidth;
uniform float chromaSplit;
uniform float laserScan;
uniform float gridIntensity;
uniform float opacity;

float hash_cp(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    float t_wrap = mod(uTime, 1000.0);
    
    float timeBlock = floor(t_wrap * glitchFrequency * 8.0);
    float rowBlock = floor(uv.y * 18.0);
    float glitchVal = hash_cp(vec2(rowBlock, timeBlock));
    
    float shiftX = 0.0;
    if (glitchVal < 0.18 * smearWidth) {
        shiftX = (hash_cp(timeBlock + vec2(rowBlock + 12.3, 0.0)) - 0.5) * 0.12 * smearWidth;
    }
    
    vec2 uvR = uv + vec2(shiftX + chromaSplit * 0.05, 0.0);
    vec2 uvG = uv + vec2(shiftX, 0.0);
    vec2 uvB = uv + vec2(shiftX - chromaSplit * 0.05, 0.0);
    
    vec3 finalRGB = vec3(0.0);
    float alphaAccum = 0.0;
    
    vec2 gridSpace = vec2(16.0 * aspect, 16.0);
    vec2 gridLineR = abs(fract(uvR * gridSpace - 0.5) - 0.5) / max(fwidth(uvR * gridSpace), 0.0001);
    vec2 gridLineG = abs(fract(uvG * gridSpace - 0.5) - 0.5) / max(fwidth(uvG * gridSpace), 0.0001);
    vec2 gridLineB = abs(fract(uvB * gridSpace - 0.5) - 0.5) / max(fwidth(uvB * gridSpace), 0.0001);
    
    float rGrid = smoothstep(1.0, 0.0, min(gridLineR.x, gridLineR.y));
    float gGrid = smoothstep(1.0, 0.0, min(gridLineG.x, gridLineG.y));
    float bGrid = smoothstep(1.0, 0.0, min(gridLineB.x, gridLineB.y));
    
    vec3 gridRGB = vec3(rGrid * 1.0, gGrid * 0.1, bGrid * 1.0) * gridIntensity * 1.5;
    finalRGB += gridRGB;
    alphaAccum += max(rGrid, max(gGrid, bGrid)) * gridIntensity * 0.7;
    
    float laserY = fract(t_wrap * 0.35);
    float laserDist = abs(uv.y - laserY);
    float laser = smoothstep(0.012, 0.0, laserDist) * laserScan;
    float laserGlow = smoothstep(0.12, 0.0, laserDist) * 0.35 * laserScan;
    
    if (laser + laserGlow > 0.0) {
        vec3 laserColor = vec3(0.0, 0.95, 1.0);
        finalRGB += laserColor * (laser * 2.5 + laserGlow * 1.1);
        alphaAccum += laser * 1.0 + laserGlow * 0.5;
    }
    
    if (shiftX != 0.0) {
        finalRGB += vec3(0.9, 0.0, 0.5) * 0.65;
        alphaAccum += 0.45;
    }
    
    float alpha = clamp(alphaAccum, 0.0, 0.98) * opacity;
    fragColor = vec4(finalRGB, alpha);
}
`,

  horrorJitter: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float desaturation;
uniform float shakeIntensity;
uniform float flickerRate;
uniform float scratchDensity;
uniform float vignetteStrength;
uniform float opacity;

float hash_hj(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    float t_wrap = mod(uTime, 1000.0);
    
    // Continuous high-frequency gate weave
    float weaveX = sin(uTime * 45.0) * 0.0018 * shakeIntensity + cos(uTime * 93.0) * 0.0007 * shakeIntensity;
    float weaveY = cos(uTime * 49.0) * 0.0018 * shakeIntensity + sin(uTime * 113.0) * 0.0007 * shakeIntensity;
    
    // Film sprocket jumps (sudden vertical slips)
    float sprocketTimer = uTime * 4.0;
    float sprocketSlip = hash_hj(vec2(floor(sprocketTimer), 127.42));
    float jumpY = 0.0;
    if (sprocketSlip < 0.14 * shakeIntensity) {
        jumpY = (fract(sprocketTimer) - 0.5) * 0.035;
    }
    
    vec2 jitterUv = uv + vec2(weaveX, weaveY + jumpY);
    
    // Natural continuous flickering light roll
    float flicker = hash_hj(vec2(floor(uTime * 18.0), 3.5));
    float brightnessFlicker = 1.0 + (flicker - 0.5) * 0.32 * flickerRate;
    
    // Base is transparent for clean streaming overlays
    vec3 finalRGB = vec3(0.0);
    float alphaAccum = 0.0;
    
    // Vignette outer edge darkening (as an active warm cinematic vignette frame)
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    float vignetteVal = clamp(pow(max(16.0 * vig, 0.0001), 0.45 + vignetteStrength * 0.5), 0.0, 1.0);
    float vigAlpha = (1.0 - vignetteVal) * vignetteStrength * 0.75;
    vec3 vigColor = vec3(0.05, 0.04, 0.04) * brightnessFlicker;
    finalRGB = mix(finalRGB, vigColor, vigAlpha);
    alphaAccum += vigAlpha;
    
    // High-fidelity thin organic scratches
    float scratchAccum = 0.0;
    float scratchTime = floor(uTime * 15.0);
    for (int i = 0; i < 4; i++) {
        float scratchId = float(i) * 53.84;
        float sX = hash_hj(vec2(scratchId, scratchTime * 0.07));
        
        if (hash_hj(vec2(scratchId, sX * 1.5)) < scratchDensity * 0.55) {
            float distToScratch = abs(jitterUv.x - sX);
            float scratchLength = hash_hj(vec2(scratchId, 23.41));
            float verticalFade = smoothstep(0.0, 0.2, jitterUv.y) * smoothstep(1.0, 0.8, jitterUv.y);
            float line = smoothstep(0.0012, 0.0, distToScratch) * verticalFade;
            scratchAccum += line * 0.65;
        }
    }
    
    if (scratchAccum > 0.0) {
        vec3 scratchColor = vec3(0.75) * brightnessFlicker;
        finalRGB = mix(finalRGB, scratchColor, scratchAccum * 0.6);
        alphaAccum = max(alphaAccum, scratchAccum * 0.4);
    }
    
    // Authentic wobbly orange-red film edge light leak (replaces the circular point flare)
    float burnFlicker = sin(uTime * 5.4) * 0.4 + 0.6;
    float edgeNoise = sin(jitterUv.y * 18.0 + uTime * 3.5) * 0.035 + cos(jitterUv.y * 37.0 - uTime * 6.2) * 0.015;
    float distToEdge = min(jitterUv.x, 1.0 - jitterUv.x);
    float burnFactor = smoothstep(0.06 + scratchDensity * 0.10, 0.02, distToEdge + edgeNoise) * burnFlicker * scratchDensity * 1.6;
    
    if (burnFactor > 0.0) {
        vec3 burnColor = vec3(1.0, 0.22, 0.02) * 1.5; // warm cinematic light bleed glow
        finalRGB = mix(finalRGB, burnColor, burnFactor);
        alphaAccum = max(alphaAccum, burnFactor * 0.75);
    }
    
    float alpha = clamp(alphaAccum, 0.0, 1.0) * opacity;
    fragColor = vec4(finalRGB, alpha);
}
`,

  pixelator: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float pixelSize;
uniform int palette;
uniform float ditherIntensity;
uniform float opacity;

float getBayerValue(int x, int y) {
    float bayer[16] = float[](
        0.0, 0.5, 0.125, 0.625,
        0.75, 0.25, 0.875, 0.375,
        0.1875, 0.6875, 0.0625, 0.5625,
        0.9375, 0.4375, 0.8125, 0.3125
    );
    return bayer[(y % 4) * 4 + (x % 4)];
}

void main() {
    vec2 pSize = vec2(pixelSize) / uResolution;
    vec2 uv = floor(vUv / pSize) * pSize + (pSize * 0.5);
    
    float t = uTime * 0.45;
    float w1 = sin(uv.x * 3.5 + t) * 0.5 + 0.5;
    float w2 = cos(uv.y * 4.5 - t * 0.8) * 0.5 + 0.5;
    float w3 = sin(distance(uv, vec2(0.5, 0.5)) * 6.0 - t * 1.3) * 0.5 + 0.5;
    float lum = (w1 * 0.35 + w2 * 0.35 + w3 * 0.30);
    
    ivec2 pxCoord = ivec2(uv * uResolution / pixelSize);
    float dither = getBayerValue(pxCoord.x, pxCoord.y) - 0.5;
    lum = clamp(lum + dither * ditherIntensity, 0.0, 1.0);
    
    vec3 col;
    float finalAlpha = opacity;
    
    if (palette == 1) {
        if (lum < 0.25)      col = vec3(0.058, 0.219, 0.058);
        else if (lum < 0.50) col = vec3(0.188, 0.384, 0.188);
        else if (lum < 0.75) col = vec3(0.545, 0.674, 0.058);
        else                 col = vec3(0.607, 0.737, 0.058);
    } 
    else if (palette == 2) {
        if (lum < 0.12)      col = vec3(0.0, 0.0, 0.0);
        else if (lum < 0.25) col = vec3(0.0, 0.439, 0.925);
        else if (lum < 0.38) col = vec3(0.847, 0.157, 0.0);
        else if (lum < 0.50) col = vec3(0.0, 0.659, 0.0);
        else if (lum < 0.63) col = vec3(0.0, 0.910, 0.847);
        else if (lum < 0.75) col = vec3(0.973, 0.722, 0.973);
        else if (lum < 0.88) col = vec3(0.988, 0.988, 0.0);
        else                 col = vec3(1.0, 1.0, 1.0);
        finalAlpha *= (0.35 + lum * 0.65);
    } 
    else if (palette == 3) {
        if (lum < 0.2)      col = vec3(0.039, 0.020, 0.094);
        else if (lum < 0.4) col = vec3(0.333, 0.0, 0.667);
        else if (lum < 0.6) col = vec3(1.0, 0.0, 0.333);
        else if (lum < 0.8) col = vec3(0.0, 0.941, 1.0);
        else                 col = vec3(0.941, 0.902, 0.0);
        finalAlpha *= (0.3 + lum * 0.7);
    } 
    else if (palette == 4) {
        col = (lum < 0.5) ? vec3(0.0) : vec3(1.0);
    } 
    else {
        col = mix(vec3(0.039, 0.0, 0.118), vec3(0.0, 0.941, 1.0), lum);
        finalAlpha *= (0.2 + lum * 0.8);
    }
    
    fragColor = vec4(col, finalAlpha);
}
`,
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

export function initWebGLRenderer(canvas: HTMLCanvasElement, activePresets?: string[]): WebGLRenderer | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: true });
  if (!gl) {
    console.warn("WebGL 2 context is not available.");
    return null;
  }

  // Enable standard alpha blending for straight alpha context
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  if (!vs) return null;

  const programs: Record<string, WebGLProgram> = {};
  for (const [preset, source] of Object.entries(FRAGMENT_SHADERS)) {
    if (activePresets && !activePresets.includes(preset)) continue;
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
  } else if (preset === "silentHillFog") {
    gl.uniform1f(gl.getUniformLocation(program, "desaturation"), Number(params.desaturation ?? 0.6));
    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), Number(params.fogDensity ?? 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "fogSpeed"), Number(params.fogSpeed ?? 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "contrast"), Number(params.contrast ?? 1.2));
    gl.uniform1f(gl.getUniformLocation(program, "grainIntensity"), Number(params.grainIntensity ?? 0.05));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.8));
  } else if (preset === "bladeRunnerRain") {
    gl.uniform1f(gl.getUniformLocation(program, "rainDensity"), Number(params.rainDensity ?? 0.6));
    gl.uniform1f(gl.getUniformLocation(program, "rainSpeed"), Number(params.rainSpeed ?? 1.2));
    gl.uniform1f(gl.getUniformLocation(program, "tailLength"), Number(params.tailLength ?? 0.5));
    const [r1, g1, b1] = hexToRgb(String(params.neonColor1 ?? "#ff007f"));
    gl.uniform3f(gl.getUniformLocation(program, "neonColor1"), r1, g1, b1);
    const [r2, g2, b2] = hexToRgb(String(params.neonColor2 ?? "#00f3ff"));
    gl.uniform3f(gl.getUniformLocation(program, "neonColor2"), r2, g2, b2);
    gl.uniform1f(gl.getUniformLocation(program, "ambientReflection"), Number(params.ambientReflection ?? 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.9));
  } else if (preset === "matrixHaze") {
    gl.uniform1f(gl.getUniformLocation(program, "codeSpeed"), Number(params.codeSpeed ?? 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "trailLength"), Number(params.trailLength ?? 0.7));
    gl.uniform1f(gl.getUniformLocation(program, "glowIntensity"), Number(params.glowIntensity ?? 1.2));
    const [r, g, b] = hexToRgb(String(params.codeColor ?? "#00ff41"));
    gl.uniform3f(gl.getUniformLocation(program, "codeColor"), r, g, b);
    gl.uniform1f(gl.getUniformLocation(program, "ambientHaze"), Number(params.ambientHaze ?? 0.3));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.85));
  } else if (preset === "falloutRadiation") {
    gl.uniform1f(gl.getUniformLocation(program, "shimmerIntensity"), Number(params.shimmerIntensity ?? 0.4));
    gl.uniform1f(gl.getUniformLocation(program, "scanlineIntensity"), Number(params.scanlineIntensity ?? 0.3));
    gl.uniform1f(gl.getUniformLocation(program, "geigerFlicker"), Number(params.geigerFlicker ?? 0.5));
    const [r, g, b] = hexToRgb(String(params.tintColor ?? "#22c55e"));
    gl.uniform3f(gl.getUniformLocation(program, "tintColor"), r, g, b);
    gl.uniform1f(gl.getUniformLocation(program, "glowRadius"), Number(params.glowRadius ?? 0.8));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.8));
  } else if (preset === "cyberpunkSmear") {
    gl.uniform1f(gl.getUniformLocation(program, "glitchFrequency"), Number(params.glitchFrequency ?? 1.5));
    gl.uniform1f(gl.getUniformLocation(program, "smearWidth"), Number(params.smearWidth ?? 0.45));
    gl.uniform1f(gl.getUniformLocation(program, "chromaSplit"), Number(params.chromaSplit ?? 0.03));
    gl.uniform1f(gl.getUniformLocation(program, "laserScan"), Number(params.laserScan ?? 0.6));
    gl.uniform1f(gl.getUniformLocation(program, "gridIntensity"), Number(params.gridIntensity ?? 0.25));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.8));
  } else if (preset === "horrorJitter") {
    gl.uniform1f(gl.getUniformLocation(program, "desaturation"), Number(params.desaturation ?? 0.8));
    gl.uniform1f(gl.getUniformLocation(program, "shakeIntensity"), Number(params.shakeIntensity ?? 0.3));
    gl.uniform1f(gl.getUniformLocation(program, "flickerRate"), Number(params.flickerRate ?? 0.4));
    gl.uniform1f(gl.getUniformLocation(program, "scratchDensity"), Number(params.scratchDensity ?? 0.3));
    gl.uniform1f(gl.getUniformLocation(program, "vignetteStrength"), Number(params.vignetteStrength ?? 0.7));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 0.95));
  } else if (preset === "pixelator") {
    gl.uniform1f(gl.getUniformLocation(program, "pixelSize"), Number(params.pixelSize ?? 8));
    const paletteStr = String(params.palette ?? "none");
    let paletteId = 0; // none
    if (paletteStr === "gameboy") paletteId = 1;
    else if (paletteStr === "nes") paletteId = 2;
    else if (paletteStr === "cyberpunk") paletteId = 3;
    else if (paletteStr === "monochrome") paletteId = 4;
    gl.uniform1i(gl.getUniformLocation(program, "palette"), paletteId);
    gl.uniform1f(gl.getUniformLocation(program, "ditherIntensity"), Number(params.ditherIntensity ?? 0.20));
    gl.uniform1f(gl.getUniformLocation(program, "opacity"), Number(params.opacity ?? 1.0));
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
