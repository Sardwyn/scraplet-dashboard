import { OverlayKeying } from "../overlayTypes";
import { normalizeKeying } from "./keyingMath";

type Renderer = {
  render: (source: CanvasImageSource) => void;
  destroy: () => void;
};

const vertexSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const fragmentSource = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform int u_mode;
uniform float u_threshold;
uniform float u_softness;
uniform vec3 u_keyColor;
uniform float u_tolerance;
uniform float u_spillReduction;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  float alpha = color.a;
  float soft = max(0.0001, u_softness);

  if (u_mode == 1) {
    float luma = luminance(color.rgb);
    alpha *= smoothstep(u_threshold, u_threshold + soft, luma);
  } else if (u_mode == 2) {
    float luma = luminance(color.rgb);
    alpha *= 1.0 - smoothstep(1.0 - u_threshold - soft, 1.0 - u_threshold, luma);
  } else if (u_mode == 3) {
    float distanceToKey = distance(color.rgb, u_keyColor);
    float keep = smoothstep(u_tolerance, u_tolerance + soft, distanceToKey);
    alpha *= keep;
    if (u_spillReduction > 0.0) {
      float luma = luminance(color.rgb);
      float spillMix = u_spillReduction * (1.0 - keep);
      color.rgb = mix(color.rgb, vec3(luma), spillMix);
    }
  }

  gl_FragColor = vec4(color.rgb, clamp(alpha, 0.0, 1.0));
}
`;

function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "Shader compile failed");
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || "Program link failed");
  }
  return program;
}

export function createMediaKeyShader(canvas: HTMLCanvasElement, keying?: OverlayKeying): Renderer | null {
  // Try WebGL2 first for better performance, fallback to WebGL1
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = 
    canvas.getContext("webgl2", { 
      premultipliedAlpha: false, 
      alpha: true,
      antialias: false, // Disable antialiasing for better performance
      depth: false, // We don't need depth buffer
      stencil: false, // We don't need stencil buffer
      powerPreference: "high-performance" // Request high-performance GPU
    });
  
  if (!gl) {
    gl = canvas.getContext("webgl", { 
      premultipliedAlpha: false, 
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance"
    });
  }
  
  if (!gl) {
    console.warn("WebGL not available, falling back to CPU keying");
    return null;
  }

  try {
    const program = createProgram(gl);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!positionBuffer || !texCoordBuffer || !texture) {
      console.warn("Failed to create WebGL buffers");
      return null;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0,
      ]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    const modeLocation = gl.getUniformLocation(program, "u_mode");
    const thresholdLocation = gl.getUniformLocation(program, "u_threshold");
    const softnessLocation = gl.getUniformLocation(program, "u_softness");
    const keyColorLocation = gl.getUniformLocation(program, "u_keyColor");
    const toleranceLocation = gl.getUniformLocation(program, "u_tolerance");
    const spillLocation = gl.getUniformLocation(program, "u_spillReduction");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const cfg = normalizeKeying(keying);
    const modeValue = cfg.mode === "alphaBlack" ? 1 : cfg.mode === "alphaWhite" ? 2 : cfg.mode === "chromaKey" ? 3 : 0;

    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(texCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(modeLocation, modeValue);
    gl.uniform1f(thresholdLocation, cfg.threshold);
    gl.uniform1f(softnessLocation, cfg.softness);
    gl.uniform3f(keyColorLocation, cfg.keyColor[0], cfg.keyColor[1], cfg.keyColor[2]);
    gl.uniform1f(toleranceLocation, cfg.tolerance);
    gl.uniform1f(spillLocation, cfg.spillReduction);

    return {
      render(source) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      destroy() {
        gl.deleteTexture(texture);
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(texCoordBuffer);
        gl.deleteProgram(program);
      },
    };
  } catch (error) {
    console.warn("Failed to create WebGL shader, falling back to CPU:", error);
    return null;
  }
}
