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
    
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    float scanline = sin(uv.y * uResolution.y * 1.5 + uTime * 5.0) * 0.5 + 0.5;
    float scan = 1.0 - scanlineIntensity * scanline * 0.4;
    
    float phosphor = sin(uv.x * uResolution.x * 2.5) * 0.5 + 0.5;
    float phos = 1.0 - phosphorIntensity * phosphor * 0.2;
    
    float flicker = 1.0 - (sin(uTime * flickerSpeed * 8.0) * 0.03 + cos(uTime * 31.0) * 0.02);
    
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    vig = clamp(pow(16.0 * vig, vignette), 0.0, 1.0);
    
    vec3 phosphorColor = vec3(0.0, 1.0, 0.2) * 0.05 * phosphorIntensity;
    vec3 baseCol = vec3(0.1, 0.12, 0.15);
    
    vec3 finalColor = (baseCol + phosphorColor) * scan * phos * flicker * vig;
    fragColor = vec4(finalColor, 0.3 * (1.0 - scan * phos * vig) + 0.1);
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

void main() {
    vec2 uv = vUv;
    float t = uTime * speed * 0.1;
    
    vec2 p = uv * frequency - vec2(100.0);
    vec2 i = vec2(p);
    float c = 1.0;
    float inten = 0.005;

    for (int n = 0; n < 5; n++) {
        float t_sub = t * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t_sub - i.x) + sin(t_sub + i.y), sin(t_sub - i.y) + cos(t_sub + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + t_sub) / inten), p.y / (cos(i.y + t_sub) / inten)));
    }
    
    c /= 5.0;
    c = 1.17 - pow(c, 1.4);
    
    float val = clamp(pow(abs(c), 8.0) * amplitude * 12.0, 0.0, 1.0);
    vec3 causticCol = color * val * (1.0 + shimmerIntensity * sin(uTime * 3.0 + uv.x * 10.0));
    
    float backgroundNoise = sin(uv.x * 3.0 + t) * cos(uv.y * 3.0 - t) * 0.1 + 0.1;
    vec3 finalColor = causticCol + color * backgroundNoise * shimmerIntensity * 0.2;
    
    fragColor = vec4(finalColor, val * 0.8 + backgroundNoise * 0.3);
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
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    
    float warp = 1.0 + lensDistortion * dist * dist;
    vec2 warpedUv = uv * warp + 0.5;
    
    if (warpedUv.x < 0.0 || warpedUv.x > 1.0 || warpedUv.y < 0.0 || warpedUv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    float r = length(uv - vec2(chromaSpread * 0.2, 0.0) * warp);
    float g = length(uv - vec2(0.0, greenShift) * warp);
    float b = length(uv + vec2(chromaSpread * 0.2, 0.0) * warp);
    
    float ringR = smoothstep(0.4, 0.41, r) * (1.0 - smoothstep(0.41, 0.43, r));
    float ringG = smoothstep(0.4, 0.41, g) * (1.0 - smoothstep(0.41, 0.43, g));
    float ringb = smoothstep(0.4, 0.41, b) * (1.0 - smoothstep(0.41, 0.43, b));
    
    float centerGlow = (1.0 - smoothstep(0.0, 0.35, dist)) * 0.15;
    
    vec3 col = vec3(ringR, ringG, ringb) * 0.8 + vec3(centerGlow);
    float flare = sin(angle * 3.0 + uTime) * cos(angle * 5.0 - uTime) * 0.5 + 0.5;
    col += vec3(0.1, 0.2, 0.5) * flare * (1.0 - smoothstep(0.1, 0.5, dist)) * chromaSpread * 5.0;
    
    fragColor = vec4(col, (ringR + ringG + ringb + centerGlow * 0.5) * opacity);
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

void main() {
    vec2 uv = vUv - vec2(0.5, 0.5);
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    
    float t = uTime * shimmerSpeed * 0.5;
    float rays = sin(angle * beamCount + t) * 0.5 + 0.5;
    rays += cos(angle * (beamCount * 0.5) - t * 0.8) * 0.25;
    
    float rayNoise = noise(vec2(angle * 5.0, dist * 3.0 - t));
    rays = rays * (0.4 + 0.6 * rayNoise);
    
    float fade = smoothstep(rayLength + 0.1, 0.0, dist);
    float centerGlow = (1.0 - smoothstep(0.0, 0.15, dist)) * 0.3;
    
    vec3 col = color * (rays * intensity * fade * (1.0 - dist) + centerGlow);
    float alpha = clamp((rays * intensity * fade + centerGlow) * 0.8, 0.0, 1.0);
    
    fragColor = vec4(col, alpha);
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
    float t = floor(uTime * speed * 12.0);
    
    float sliceY = floor(uv.y * (10.0 + 40.0 * (1.0 - glitchIntensity)));
    float sliceValue = rand(vec2(sliceY, t));
    
    float xOffset = 0.0;
    if (sliceValue < glitchIntensity * frequency * 0.1) {
        xOffset = (rand(vec2(sliceY + 1.0, t)) - 0.5) * glitchIntensity * 0.15;
    }
    
    vec2 warpedUv = uv + vec2(xOffset, 0.0);
    float staticNoise = rand(warpedUv + vec2(t * 0.01, 0.0));
    
    float blockGrid = 16.0;
    vec2 blockUv = floor(warpedUv * blockGrid) / blockGrid;
    float blockValue = rand(blockUv + vec2(t, 0.0));
    
    vec4 finalColor = vec4(0.0);
    if (blockValue < glitchIntensity * noiseDensity * 0.25) {
        vec3 blockCol = vec3(rand(blockUv), rand(blockUv + 1.0), rand(blockUv + 2.0));
        finalColor = vec4(blockCol, 0.6 * glitchIntensity);
    } else {
        if (staticNoise < glitchIntensity * 0.15) {
            finalColor = vec4(1.0, 1.0, 1.0, 0.3 * glitchIntensity);
        } else {
            float lineGlow = smoothstep(0.01, 0.0, abs(warpedUv.x - 0.5) - 0.48) +
                             smoothstep(0.01, 0.0, abs(warpedUv.y - 0.5) - 0.48);
            if (lineGlow > 0.0) {
                finalColor = vec4(0.0, 1.0, 0.8, lineGlow * glitchIntensity * 0.5);
            }
        }
    }
    
    float splitLine = sin(warpedUv.y * 100.0) * 0.5 + 0.5;
    if (abs(xOffset) > 0.0) {
        finalColor.r += 0.8 * glitchIntensity * splitLine;
        finalColor.b += 0.5 * glitchIntensity * (1.0 - splitLine);
        finalColor.a = max(finalColor.a, 0.4 * glitchIntensity);
    }
    
    fragColor = finalColor;
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
