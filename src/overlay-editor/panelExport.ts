import { Panel, PanelPack, StyleProfile } from "./panelGeneration";

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

function renderPanel(panel: Panel, profile: StyleProfile, scale: number) {
  const width = DEFAULT_WIDTH * scale;
  const padding = profile.spacing.base * scale;
  const lineGap = Math.max(6, Math.round(profile.spacing.base * 0.6)) * scale;

  const titleSize = profile.typography.h2 * scale;
  const bodySize = profile.typography.body * scale;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.font = `${profile.typography.headingWeight} ${titleSize}px ${profile.typography.fontFamily}`;
  const titleLines = panel.title ? wrapText(ctx, panel.title, width - padding * 2) : [];

  ctx.font = `${profile.typography.bodyWeight} ${bodySize}px ${profile.typography.fontFamily}`;
  const bodyText = panel.content.text || "";
  const bodyLines = bodyText ? wrapText(ctx, bodyText, width - padding * 2) : [];

  const items = panel.content.items || [];
  const itemLines = items.map((item) => item.label).filter(Boolean);

  const titleHeight = titleLines.length * (titleSize + lineGap);
  const bodyHeight = bodyLines.length * (bodySize + lineGap);
  const itemHeight = itemLines.length * (bodySize + lineGap);

  const totalHeight = Math.max(
    padding * 2 + titleHeight + bodyHeight + itemHeight + lineGap * 2,
    160 * scale
  );

  canvas.width = width;
  canvas.height = Math.ceil(totalHeight);

  ctx.fillStyle = resolveColor(profile, "background");
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = padding;
  if (titleLines.length) {
    ctx.fillStyle = resolveColor(profile, "primary");
    ctx.font = `${profile.typography.headingWeight} ${titleSize}px ${profile.typography.fontFamily}`;
    titleLines.forEach((line) => {
      ctx.fillText(line, padding, y + titleSize);
      y += titleSize + lineGap;
    });
  }

  if (bodyLines.length) {
    y += lineGap * 0.5;
    ctx.fillStyle = resolveColor(profile, "textPrimary");
    ctx.font = `${profile.typography.bodyWeight} ${bodySize}px ${profile.typography.fontFamily}`;
    bodyLines.forEach((line) => {
      ctx.fillText(line, padding, y + bodySize);
      y += bodySize + lineGap;
    });
  }

  if (itemLines.length) {
    y += lineGap * 0.5;
    ctx.fillStyle = resolveColor(profile, "textSecondary");
    ctx.font = `${profile.typography.bodyWeight} ${bodySize}px ${profile.typography.fontFamily}`;
    itemLines.forEach((line) => {
      ctx.fillText(line, padding, y + bodySize);
      y += bodySize + lineGap;
    });
  }

  return canvas;
}

export async function exportPanelPackPng(panelPack: PanelPack, scale = 1) {
  const canvases = panelPack.panels.map((panel) => renderPanel(panel, panelPack.styleProfile, scale));
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
