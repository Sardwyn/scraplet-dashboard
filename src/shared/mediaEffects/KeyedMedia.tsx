import React, { useEffect, useMemo, useRef } from "react";
import { OverlayKeying, OverlayMediaFit } from "../overlayTypes";
import { createMediaKeyShader } from "./createMediaKeyShader";
import { applyKeyingToPixels } from "./keyingMath";

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
  ctx: CanvasRenderingContext2D,
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);

  const hasKeying = (keying?.mode ?? "none") !== "none";
  const mediaStyle = useMemo<React.CSSProperties>(() => ({ width: "100%", height: "100%", display: "block" }), []);

  useEffect(() => {
    if (!hasKeying) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const sourceCanvas = document.createElement("canvas");
    sourceCanvasRef.current = sourceCanvas;
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceCtx) return;

    let cancelled = false;
    let shader = createMediaKeyShader(canvas, keying);

    const ensureCanvasSize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
        sourceCanvas.width = width;
        sourceCanvas.height = height;
      }
    };

    const renderFrame = () => {
      if (cancelled) return;
      ensureCanvasSize();

      const width = canvas.width;
      const height = canvas.height;
      const source = kind === "image" ? imageRef.current : videoRef.current;
      if (!source || !width || !height) {
        rafRef.current = window.requestAnimationFrame(renderFrame);
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
        rafRef.current = window.requestAnimationFrame(renderFrame);
        return;
      }

      drawWithFit(sourceCtx, source, naturalWidth, naturalHeight, width, height, fit);

      if (shader) {
        shader.render(sourceCanvas);
      } else {
        const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx2d) {
          ctx2d.clearRect(0, 0, width, height);
          ctx2d.drawImage(sourceCanvas, 0, 0);
          const frame = ctx2d.getImageData(0, 0, width, height);
          applyKeyingToPixels(frame.data, width, height, keying);
          ctx2d.putImageData(frame, 0, 0);
        }
      }

      if (kind === "video") {
        rafRef.current = window.requestAnimationFrame(renderFrame);
      }
    };

    resizeRef.current = new ResizeObserver(() => {
      ensureCanvasSize();
      renderFrame();
    });
    resizeRef.current.observe(host);

    if (kind === "image") {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => renderFrame();
      image.src = src;
      imageRef.current = image;
    } else {
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
        void video.play().catch(() => {});
      };
      videoRef.current = video;
    }

    renderFrame();

    return () => {
      cancelled = true;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      resizeRef.current?.disconnect();
      shader?.destroy();
      shader = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.load();
      }
      imageRef.current = null;
      videoRef.current = null;
      sourceCanvasRef.current = null;
    };
  }, [autoplay, controls, fit, hasKeying, keying, kind, loop, muted, poster, src]);

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
    <div ref={hostRef} style={{ width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={mediaStyle} />
    </div>
  );
}
