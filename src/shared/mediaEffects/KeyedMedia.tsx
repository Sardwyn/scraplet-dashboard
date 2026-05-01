import React, { useEffect, useMemo, useRef } from "react";
import { OverlayKeying, OverlayMediaFit } from "../overlayTypes";
import { createMediaKeyShader } from "./createMediaKeyShader";
import { applyKeyingToPixels } from "./keyingMath";
import { usePerformanceMode } from "../overlayRenderer/PerformanceModeContext";

// Global drag state — videos pause their RAF loop during drag to avoid
// competing with the drag compositor for GPU bandwidth
let _isDragging = false;
export function setMediaDragging(dragging: boolean) {
  _isDragging = dragging;
}

// Shared video cache with pre-drawn canvas to avoid multiple drawImage calls
// Key includes both src and a normalized size to ensure sharing
const videoCache = new Map<string, {
  video: HTMLVideoElement;
  refCount: number;
  sourceCanvas: OffscreenCanvas | HTMLCanvasElement;
  sourceCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  lastDrawnFrame: number;
  width: number;
  height: number;
  isDrawing: boolean; // Lock to prevent concurrent draws
}>();

// Global RAF coordinator to batch all video updates into a single RAF
let globalRafId: number | null = null;
const activeRenderers = new Set<() => void>();

function scheduleGlobalRender() {
  if (globalRafId !== null) return;
  globalRafId = requestAnimationFrame(() => {
    globalRafId = null;
    activeRenderers.forEach(fn => fn());
    if (activeRenderers.size > 0) {
      scheduleGlobalRender();
    }
  });
}

type Props = {
  kind: "image" | "video";
  src: string;
  fit?: OverlayMediaFit;
  keying?: OverlayKeying;
  poster?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
};

function drawWithFit(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  fit: OverlayMediaFit
) {
  ctx.clearRect(0, 0, width, height);
  if (fit === "fill") {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }

  const scale = fit === "contain"
    ? Math.min(width / sourceWidth, height / sourceHeight)
    : Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = (width - drawWidth) / 2;
  const dy = (height - drawHeight) / 2;
  ctx.drawImage(source, dx, dy, drawWidth, drawHeight);
}

// Normalize size to buckets to maximize cache sharing
// This ensures videos of similar size share the same cached canvas
function normalizeSize(width: number, height: number): [number, number] {
  // Round to nearest 100px bucket for better cache sharing
  const bucketSize = 100;
  return [
    Math.ceil(width / bucketSize) * bucketSize,
    Math.ceil(height / bucketSize) * bucketSize
  ];
}

export function KeyedMedia({
  kind,
  src,
  fit = "cover",
  keying,
  poster,
  autoplay,
  muted,
  loop,
  controls,
}: Props) {
  const { isPerformanceMode } = usePerformanceMode();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const renderFnRef = useRef<(() => void) | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const cacheKeyRef = useRef<string>("");
  const localSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const localSourceCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const hasKeying = (keying?.mode ?? "none") !== "none";
  
  // Debug logging
  if (kind === "video" && Math.random() < 0.01) {
    console.log(`[KeyedMedia] kind=${kind} isPerformanceMode=${isPerformanceMode} src=${src.substring(src.lastIndexOf('/'))}`);
  }
  const mediaStyle = useMemo<React.CSSProperties>(() => ({
    width: "100%",
    height: "100%",
    display: "block",
    willChange: "transform",
    transform: "translate3d(0,0,0)",
    backfaceVisibility: "hidden" as any,
    contain: "strict" as any,
  }), []);

  // Pause/hide videos in performance mode
  useEffect(() => {
    if (kind !== "video" || !videoRef.current) return;
    
    if (isPerformanceMode) {
      videoRef.current.pause();
    } else if (autoplay) {
      void videoRef.current.play().catch(() => {});
    }
  }, [isPerformanceMode, kind, autoplay]);

  useEffect(() => {
    if (!hasKeying) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let cancelled = false;
    let shader = createMediaKeyShader(canvas, keying);
    let lastWidth = 0;
    let lastHeight = 0;

    const ensureCanvasSize = () => {
      const rect = host.getBoundingClientRect();
      // Reduce resolution by 50% for keying operations
      const scale = 0.5;
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      
      let needsResize = false;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        needsResize = true;
      }
      
      lastWidth = width;
      lastHeight = height;
      return needsResize;
    };

    const renderFrame = () => {
      if (cancelled) return;

      // Skip rendering in performance mode for videos
      if (isPerformanceMode && kind === "video") {
        return;
      }

      // Skip canvas redraw during drag
      if (_isDragging && kind === "video") {
        return;
      }

      // Frame throttling: limit to ~24fps for keyed videos
      const now = performance.now();
      const elapsed = now - lastFrameTimeRef.current;
      if (kind === "video" && elapsed < 42) { // ~24fps
        return;
      }
      
      const frameStart = performance.now();
      lastFrameTimeRef.current = now;

      const needsResize = ensureCanvasSize();
      const width = lastWidth;
      const height = lastHeight;
      
      const source = kind === "image" ? imageRef.current : videoRef.current;
      if (!source || !width || !height) {
        return;
      }

      const naturalWidth =
        kind === "image"
          ? (source as HTMLImageElement).naturalWidth
          : (source as HTMLVideoElement).videoWidth;
      const naturalHeight =
        kind === "image"
          ? (source as HTMLImageElement).naturalHeight
          : (source as HTMLVideoElement).videoHeight;

      if (!naturalWidth || !naturalHeight) {
        return;
      }

      // Only redraw if video is playing or size changed
      if (kind === "video") {
        const video = source as HTMLVideoElement;
        if (video.paused && !needsResize) {
          return;
        }
      }

      const drawStart = performance.now();
      
      // For videos, use shared source canvas from cache
      let sourceCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
      if (kind === "video" && videoRef.current) {
        // Create cache key based on current render size
        const [normWidth, normHeight] = normalizeSize(width, height);
        const cacheKey = `${src}:${normWidth}x${normHeight}`;
        
        // Update cache key if it changed (due to resize)
        if (cacheKeyRef.current && cacheKeyRef.current !== cacheKey) {
          // Decrement old cache entry
          const oldCached = videoCache.get(cacheKeyRef.current);
          if (oldCached) {
            oldCached.refCount--;
            if (oldCached.refCount <= 0) {
              videoCache.delete(cacheKeyRef.current);
            }
          }
          cacheKeyRef.current = "";
        }
        
        let cached = videoCache.get(cacheKey);
        
        // Create cache entry if it doesn't exist
        if (!cached) {
          const useOffscreen = typeof OffscreenCanvas !== 'undefined';
          const newSourceCanvas = useOffscreen 
            ? new OffscreenCanvas(normWidth, normHeight)
            : document.createElement("canvas");
          
          if (!useOffscreen) {
            (newSourceCanvas as HTMLCanvasElement).width = normWidth;
            (newSourceCanvas as HTMLCanvasElement).height = normHeight;
          }
          
          const newSourceCtx = newSourceCanvas.getContext("2d", { 
            willReadFrequently: true,
            alpha: true,
            desynchronized: true,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'low' as ImageSmoothingQuality
          }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
          
          if (newSourceCtx) {
            cached = {
              video: videoRef.current,
              refCount: 1,
              sourceCanvas: newSourceCanvas,
              sourceCtx: newSourceCtx,
              lastDrawnFrame: -1,
              width: normWidth,
              height: normHeight,
              isDrawing: false
            };
            videoCache.set(cacheKey, cached);
            cacheKeyRef.current = cacheKey;
          }
        } else if (!cacheKeyRef.current) {
          // Increment ref count for existing cache entry
          cached.refCount++;
          cacheKeyRef.current = cacheKey;
        }
        
        if (cached) {
          sourceCanvas = cached.sourceCanvas;
          const sourceCtx = cached.sourceCtx;
          
          // Only draw if this is a new video frame (not already drawn by another instance)
          // Use atomic check-and-set to prevent race conditions
          const currentFrame = (videoRef.current as HTMLVideoElement).currentTime;
          const frameDiff = Math.abs(cached.lastDrawnFrame - currentFrame);
          const needsDraw = frameDiff > 0.001 && !cached.isDrawing;
          
          if (needsDraw) {
            cached.isDrawing = true;
            drawWithFit(sourceCtx, videoRef.current, naturalWidth, naturalHeight, cached.width, cached.height, fit);
            cached.lastDrawnFrame = currentFrame;
            cached.isDrawing = false;
          }
        }
      }
      
      // Fallback to local canvas for images or if cache miss
      if (!sourceCanvas) {
        if (!localSourceCanvasRef.current) {
          localSourceCanvasRef.current = document.createElement("canvas");
          localSourceCtxRef.current = localSourceCanvasRef.current.getContext("2d", { 
            willReadFrequently: true,
            alpha: true,
            desynchronized: true,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'low' as ImageSmoothingQuality
          });
        }
        sourceCanvas = localSourceCanvasRef.current;
        const localCtx = localSourceCtxRef.current;
        if (localCtx && sourceCanvas) {
          sourceCanvas.width = width;
          sourceCanvas.height = height;
          drawWithFit(localCtx, source, naturalWidth, naturalHeight, width, height, fit);
        }
      }
      
      const drawTime = performance.now() - drawStart;

      const keyStart = performance.now();
      if (shader && sourceCanvas) {
        shader.render(sourceCanvas);
      } else {
        // CPU fallback - should rarely happen
        console.warn("KeyedMedia: Using CPU fallback for keying - WebGL shader failed");
        const ctx2d = canvas.getContext("2d", { 
          willReadFrequently: true,
          alpha: true,
          desynchronized: true
        });
        if (ctx2d && sourceCanvas) {
          ctx2d.clearRect(0, 0, width, height);
          ctx2d.drawImage(sourceCanvas, 0, 0);
          const frame = ctx2d.getImageData(0, 0, width, height);
          applyKeyingToPixels(frame.data, width, height, keying);
          ctx2d.putImageData(frame, 0, 0);
        }
      }
      const keyTime = performance.now() - keyStart;
      const totalTime = performance.now() - frameStart;
      
      // Log performance every 60 frames (~2.5 seconds at 24fps)
      if (kind === "video" && Math.random() < 0.016) {
        console.log(`KeyedMedia perf: total=${totalTime.toFixed(2)}ms draw=${drawTime.toFixed(2)}ms key=${keyTime.toFixed(2)}ms res=${width}x${height} videoRes=${naturalWidth}x${naturalHeight} cache=${videoCache.size} renderers=${activeRenderers.size}`);
      }
    };

    // Debounced resize handler
    resizeRef.current = new ResizeObserver(() => {
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        ensureCanvasSize();
        renderFrame();
      }, 100);
    });
    resizeRef.current.observe(host);

    if (kind === "image") {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => renderFrame();
      image.src = src;
      imageRef.current = image;
    } else {
      // For videos, we'll create the cache entry on first render when we know the actual size
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = src;
      video.poster = poster || "";
      video.autoplay = !!autoplay;
      video.muted = muted !== false;
      video.loop = !!loop;
      video.controls = !!controls;
      video.playsInline = true;
      video.preload = "auto";
      
      video.onloadeddata = () => {
        renderFrame();
        if (!isPerformanceMode) {
          void video.play().catch(() => {});
        }
      };
      
      videoRef.current = video;
      
      // Register with global RAF coordinator
      renderFnRef.current = renderFrame;
      activeRenderers.add(renderFrame);
      scheduleGlobalRender();
    }

    renderFrame();

    return () => {
      cancelled = true;
      
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeRef.current?.disconnect();
      shader?.destroy();
      shader = null;
      
      // Unregister from global RAF
      if (renderFnRef.current) {
        activeRenderers.delete(renderFnRef.current);
      }
      
      // Handle video cache cleanup
      if (videoRef.current && kind === "video" && cacheKeyRef.current) {
        const cached = videoCache.get(cacheKeyRef.current);
        if (cached) {
          cached.refCount--;
          if (cached.refCount <= 0) {
            cached.video.pause();
            cached.video.src = "";
            cached.video.load();
            videoCache.delete(cacheKeyRef.current);
          }
        }
      }
      
      imageRef.current = null;
      videoRef.current = null;
      localSourceCanvasRef.current = null;
      localSourceCtxRef.current = null;
    };
  }, [autoplay, controls, fit, hasKeying, keying, kind, loop, muted, poster, src, isPerformanceMode]);

  // Show placeholder in performance mode for videos
  if (isPerformanceMode && kind === "video") {
    return (
      <div style={{ 
        ...mediaStyle, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)',
        color: 'rgba(255,255,255,0.5)',
        fontSize: '12px',
        fontFamily: 'system-ui, sans-serif'
      }}>
        Video paused (Performance Mode)
      </div>
    );
  }

  if (!hasKeying) {
    if (kind === "image") {
      return <img src={src} alt="" style={{ ...mediaStyle, objectFit: fit as any }} />;
    }
    return (
      <video
        src={src}
        poster={poster || undefined}
        autoPlay={!!autoplay}
        muted={muted !== false}
        loop={!!loop}
        controls={!!controls}
        playsInline
        style={{ ...mediaStyle, objectFit: fit as any }}
      />
    );
  }

  return (
    <div ref={hostRef} style={{ width: "100%", height: "100%", willChange: "transform", transform: "translate3d(0,0,0)" }}>
      <canvas ref={canvasRef} style={mediaStyle} />
    </div>
  );
}
