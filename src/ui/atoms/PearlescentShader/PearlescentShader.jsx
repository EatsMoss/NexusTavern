import React, { useEffect, useRef, useState } from 'react';
import { hexToRgb } from '@ui/tokens/themeTokens.js';
import './PearlescentShader.css';

const VERTEX_SHADER_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_cssSize;
uniform vec3 u_base;
uniform vec3 u_pearlA;
uniform vec3 u_pearlB;
uniform vec3 u_pearlC;
uniform float u_intensity;
uniform float u_mode;
uniform float u_style; // 0.0 = chaotic acoustic flow, 1.0 = iridescent mother-of-pearl (nacre)

// 2D hash & smooth value noise for organic non-radial turbulence
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Chaotic domain-warped FBM (no central origin, drifts organically across the field)
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Thin-film spectral interference (cosine palette for mother-of-pearl nacre sheen)
vec3 thinFilmNacre(float phase, vec3 tintA, vec3 tintB) {
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (phase * vec3(1.0, 0.92, 0.86) + vec3(0.00, 0.18, 0.38)));
  vec3 themeBlend = mix(tintA, tintB, 0.5 + 0.5 * sin(phase * 6.28318));
  return mix(themeBlend, rainbow, 0.46);
}

void main() {
  vec2 uv = v_uv;
  vec2 p;
  if (u_mode < 0.5) {
    // World-space CSS pixels anchored to top-left (150px per noise unit).
    // Growing card width or height reveals more of the surface without stretching waves.
    vec2 cssPos = vec2(uv.x * max(u_cssSize.x, 1.0), (1.0 - uv.y) * max(u_cssSize.y, 1.0));
    p = cssPos / 150.0;
  } else {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    p = uv * vec2(aspect * 1.65, 1.65);
  }
  float t = u_time * 0.42;

  // First layer of chaotic domain warping (drifting in opposing diagonal vectors)
  vec2 q = vec2(
    fbm(p + vec2(t * 0.55, -t * 0.38)),
    fbm(p + vec2(-t * 0.47, t * 0.62) + vec2(5.2, 1.3))
  );

  // Second layer of turbulence for organic mother-of-pearl ribbons
  vec2 r = vec2(
    fbm(p + 2.4 * q + vec2(1.7 - t * 0.31, 9.2 + t * 0.27)),
    fbm(p + 2.4 * q + vec2(8.3 + t * 0.44, 2.8 - t * 0.35))
  );

  float field = fbm(p + 2.1 * r);
  float ribbon = sin(q.x * 6.2 - r.y * 5.8 + field * 4.5) * 0.5 + 0.5;
  float caustic = smoothstep(0.16, 0.90, field * 0.62 + ribbon * 0.38);

  vec3 iridescent;
  if (u_style > 0.5) {
    // Style 1: True Iridescent Mother-of-Pearl (Nacre thin-film spectral shimmer)
    float filmThickness = field * 1.35 + q.x * 0.85 - r.y * 0.75 + t * 0.18;
    vec3 spectral = thinFilmNacre(filmThickness, u_pearlA, u_pearlC);
    float opalescence = smoothstep(0.22, 0.88, sin(filmThickness * 7.5) * 0.5 + 0.5);
    iridescent = mix(u_pearlB, spectral, 0.65 + 0.35 * opalescence);
    caustic = smoothstep(0.10, 0.92, caustic * 0.75 + opalescence * 0.25);
  } else {
    // Style 0: Chaotic Acoustic Flow
    iridescent = mix(u_pearlB, u_pearlA, smoothstep(0.15, 0.85, q.x));
    iridescent = mix(iridescent, u_pearlC, smoothstep(0.20, 0.85, r.y * ribbon));
  }

  // Mode: 0 = last-message, 1 = splash, 2 = shimmer-loader (no circular center halo!)
  float mask = u_intensity;
  if (u_mode < 0.5) {
    // Organic asymmetric veil across the message card (anchored in card-width space)
    float driftPatch = smoothstep(0.15, 0.95, fbm(p * 0.4 + vec2(-t * 0.25, t * 0.18)));
    mask = (0.35 + 0.65 * driftPatch) * u_intensity;
  } else if (u_mode < 1.5) {
    // Full-canvas chaotic silk currents
    float silk = smoothstep(0.10, 0.95, q.y * 0.5 + r.x * 0.5);
    mask = (0.42 + 0.58 * silk) * u_intensity;
  } else {
    // Loader bar: turbulent wave sweep
    float sweep = sin(uv.x * 4.5 - t * 4.2 + q.x * 3.0) * 0.5 + 0.5;
    mask = (0.45 + 0.55 * sweep) * u_intensity;
  }

  vec3 col = mix(u_base, iridescent, caustic * mask);
  float crest = pow(max(0.0, caustic * ribbon), 3.2) * 0.22 * u_intensity;
  col += crest * u_pearlC;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function readThemeNormalizedRgb(varName, fallbackHex) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallbackHex;
  const { r, g, b } = hexToRgb(raw);
  return [r / 255, g / 255, b / 255];
}

export function PearlescentShader({
  variant = 'last-message',
  shaderStyle = 'caustics', // 'caustics' | 'nacre'
  intensity = 0.55,
  speed = 1,
  lowGpu = false,
  className = '',
  style,
  children,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const paramsRef = useRef({ variant, shaderStyle, intensity, speed });
  paramsRef.current = { variant, shaderStyle, intensity, speed };
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    if (lowGpu) return undefined;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });

    if (!gl) {
      setWebglSupported(false);
      return undefined;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      setWebglSupported(false);
      return undefined;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setWebglSupported(false);
      return undefined;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uCssSize = gl.getUniformLocation(program, 'u_cssSize');
    const uBase = gl.getUniformLocation(program, 'u_base');
    const uPearlA = gl.getUniformLocation(program, 'u_pearlA');
    const uPearlB = gl.getUniformLocation(program, 'u_pearlB');
    const uPearlC = gl.getUniformLocation(program, 'u_pearlC');
    const uIntensity = gl.getUniformLocation(program, 'u_intensity');
    const uMode = gl.getUniformLocation(program, 'u_mode');
    const uStyle = gl.getUniformLocation(program, 'u_style');

    let rafId = 0;
    let isVisible = true;
    let lastNow = performance.now();
    // Seed initial phase from monotonic clock so mounting on a new message never jumps to 0
    let elapsedSec = (lastNow * 0.001 * (paramsRef.current.speed || 1)) % 10000;

    let cachedColors = {
      base: readThemeNormalizedRgb('--bb-shader-base', '#171411'),
      pearlA: readThemeNormalizedRgb('--bb-shader-pearl-a', '#dcb482'),
      pearlB: readThemeNormalizedRgb('--bb-shader-pearl-b', '#9bb8b1'),
      pearlC: readThemeNormalizedRgb('--bb-shader-pearl-c', '#b999c9'),
    };

    const refreshThemeColors = () => {
      cachedColors = {
        base: readThemeNormalizedRgb('--bb-shader-base', '#171411'),
        pearlA: readThemeNormalizedRgb('--bb-shader-pearl-a', '#dcb482'),
        pearlB: readThemeNormalizedRgb('--bb-shader-pearl-b', '#9bb8b1'),
        pearlC: readThemeNormalizedRgb('--bb-shader-pearl-c', '#b999c9'),
      };
    };

    const mo = new MutationObserver(refreshThemeColors);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    });

    const syncCanvasDimensions = () => {
      const cssW = Math.max(1, container.clientWidth || container.getBoundingClientRect().width || 1);
      const cssH = Math.max(1, container.clientHeight || container.getBoundingClientRect().height || 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.min(3072, Math.max(1, Math.floor(cssW * dpr * 0.65)));
      const h = Math.min(3072, Math.max(1, Math.floor(cssH * dpr * 0.65)));
      const changed = canvas.width !== w || canvas.height !== h;
      if (changed) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      return { cssW, cssH, changed };
    };

    const drawFrame = (now) => {
      const { cssW, cssH } = syncCanvasDimensions();
      const {
        variant: curVariant,
        shaderStyle: curStyle,
        intensity: curIntensity,
        speed: curSpeed,
      } = paramsRef.current;

      const dt = Math.max(0, Math.min(0.1, (now - lastNow) * 0.001));
      lastNow = now;
      elapsedSec += dt * curSpeed;

      const modeValue = curVariant === 'splash' ? 1.0 : curVariant === 'loader' ? 2.0 : 0.0;
      const styleValue = curStyle === 'nacre' ? 1.0 : 0.0;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(uTime, elapsedSec);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uCssSize, cssW, cssH);
      gl.uniform3fv(uBase, cachedColors.base);
      gl.uniform3fv(uPearlA, cachedColors.pearlA);
      gl.uniform3fv(uPearlB, cachedColors.pearlB);
      gl.uniform3fv(uPearlC, cachedColors.pearlC);
      gl.uniform1f(uIntensity, curIntensity);
      gl.uniform1f(uMode, modeValue);
      gl.uniform1f(uStyle, styleValue);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const resize = () => {
      const { changed } = syncCanvasDimensions();
      if (changed) {
        drawFrame(performance.now());
      }
    };

    resize();
    drawFrame(performance.now());
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
        if (isVisible) {
          lastNow = performance.now();
        }
      },
      { threshold: 0.05 },
    );
    io.observe(container);

    const render = (now) => {
      rafId = requestAnimationFrame(render);
      if (!isVisible || document.hidden) return;
      drawFrame(now);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [lowGpu]);

  const showShader = !lowGpu && webglSupported;

  return (
    <div
      ref={containerRef}
      className={`bb-pearl-shader bb-pearl-shader--${variant} ${className}`.trim()}
      style={style}
    >
      {showShader ? (
        <canvas ref={canvasRef} className="bb-pearl-shader__canvas" aria-hidden="true" />
      ) : (
        <div className="bb-pearl-shader__fallback" aria-hidden="true" />
      )}
      {children && <div className="bb-pearl-shader__content">{children}</div>}
    </div>
  );
}

