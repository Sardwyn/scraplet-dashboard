import { Panel, PanelPack, PanelStyleVariant, StyleProfile } from "./panelGeneration";

const DEFAULT_WIDTH = 320;

function resolveColor(profile: StyleProfile, token: keyof StyleProfile["colors"]) {
  return profile.colors[token] || "#111111";
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function applyShapePath(
  ctx: CanvasRenderingContext2D,
  variant: PanelStyleVariant | undefined,
  width: number,
  height: number,
  radius: number
) {
  const shape = variant?.shape || "rounded";
  if (shape === "rectangle") {
    ctx.rect(0, 0, width, height);
    return;
  }
  if (shape === "pill") {
    const r = Math.min(height / 2, radius * 1.6);
    ctx.roundRect(0, 0, width, height, r);
    return;
  }
  if (shape === "tab") {
    const tabHeight = Math.max(8, Math.min(18, height * 0.25));
    ctx.roundRect(0, tabHeight, width, height - tabHeight, radius);
    ctx.rect(0, 0, width * 0.4, tabHeight + 2);
    return;
  }
  ctx.roundRect(0, 0, width, height, radius);
}

function drawHighlight(ctx: CanvasRenderingContext2D, variant: PanelStyleVariant | undefined, width: number, height: number, accent: string) {
  const highlight = variant?.highlight || "none";
  if (highlight === "top") {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, width, Math.max(4, height * 0.08));
  } else if (highlight === "side") {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, Math.max(4, width * 0.06), height);
  } else if (highlight === "outline") {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, width * 0.01);
    ctx.strokeRect(0, 0, width, height);
  }
}

function drawAccent(ctx: CanvasRenderingContext2D, variant: PanelStyleVariant | undefined, width: number, height: number, accent: string) {
  if (!variant?.accent) return;
  const size = Math.max(6, Math.min(14, height * 0.18));
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(width - size - 8, height - size - 6, size, size, size * 0.4);
  ctx.fill();
}

function drawIcon(ctx: CanvasRenderingContext2D, variant: PanelStyleVariant | undefined, x: number, y: number, size: number, color: string) {
  if (variant?.icon === "omitted") return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2.4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, panel: Panel, profile: StyleProfile, variant: PanelStyleVariant | undefined, x: number, y: number, maxWidth: number) {
  const text = panel.title || "Panel";
  const fontSize = profile.typography.body * 1.1;
  const treatment = variant?.textTreatment || "plain";
  const weight = treatment === "bold" ? profile.typography.headingWeight : "normal";
  ctx.font = `${weight} ${fontSize}px ${profile.typography.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (treatment === "outline") {
    ctx.strokeStyle = resolveColor(profile, "accent");
    ctx.lineWidth = Math.max(1, fontSize * 0.08);
    ctx.strokeText(text, x + maxWidth / 2, y);
    ctx.fillStyle = resolveColor(profile, "textPrimary");
    ctx.fillText(text, x + maxWidth / 2, y);
    return;
  }
  const fill = treatment === "secondaryGlyph" ? resolveColor(profile, "textSecondary") : resolveColor(profile, "textPrimary");
  ctx.fillStyle = fill;
  ctx.fillText(text, x + maxWidth / 2, y);
}

async function renderPanel(panel: Panel, profile: StyleProfile, scale: number) {
  const width = DEFAULT_WIDTH * scale;
  const height = Math.max(72, profile.typography.body * 4) * scale;
  const paddingX = Math.max(10, profile.spacing.base) * scale;
  const radius = Math.max(4, profile.shape.cornerRadius) * scale;
  const variant = panel.styleVariant;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  canvas.width = width;
  canvas.height = height;

  const fontFamily = profile.typography.fontFamily || "Arial";
  try {
    await (document as any).fonts?.load(
      `${profile.typography.headingWeight} ${profile.typography.body}px ${fontFamily}`
    );
  } catch {
    // ignore font load errors; browser will fall back
  }

  ctx.save();
  ctx.beginPath();
  applyShapePath(ctx, variant, width, height, radius);
  ctx.clip();
  ctx.fillStyle = resolveColor(profile, "background");
  ctx.fillRect(0, 0, width, height);
  drawHighlight(ctx, variant, width, height, resolveColor(profile, "accent"));
  ctx.restore();

  drawAccent(ctx, variant, width, height, resolveColor(profile, "accent"));

  const iconSize = height * 0.35;
  const iconY = (height - iconSize) / 2;
  const iconX = paddingX;
  if (variant?.icon !== "omitted") {
    drawIcon(ctx, variant, iconX, iconY, iconSize, resolveColor(profile, "accent"));
  }

  const textX = variant?.icon === "omitted" ? paddingX : iconX + iconSize + paddingX * 0.6;
  const textWidth = width - textX - paddingX;
  drawText(ctx, panel, profile, variant, textX, height / 2, textWidth);

  return canvas;
}

export async function exportPanelPackPng(panelPack: PanelPack, scale = 1) {
  const canvases = [];
  for (const panel of panelPack.panels) {
    canvases.push(await renderPanel(panel, panelPack.styleProfile, scale));
  }
  return Promise.all(
    canvases.map(
      (canvas) =>
        new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob || new Blob()), "image/png");
        })
    )
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPanelPackZip(panelPack: PanelPack, scale = 1) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const blobs = await exportPanelPackPng(panelPack, scale);
  blobs.forEach((blob, idx) => {
    const panel = panelPack.panels[idx];
    zip.file(`${panel.type}-${idx + 1}.png`, blob);
  });
  return zip.generateAsync({ type: "blob" });
}
