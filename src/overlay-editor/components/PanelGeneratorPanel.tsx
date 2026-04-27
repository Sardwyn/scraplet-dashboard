import React, { useEffect, useMemo, useState } from "react";
import { getFontStack } from "../../shared/FontManager";
import {
  PANEL_AXIS_LABELS,
  PANEL_AXIS_ORDER,
  PANEL_AXIS_VARIANTS,
  PanelAxisKey,
  PanelAxisSelections,
  PanelStyle,
  StyleProfile,
  buildPanel,
  getSeededAxisSelections,
  resolvePanelStyle,
} from "../panelStyleEngine";

type Props = {
  profile: StyleProfile;
  seedBase?: string;
};

const PANEL_HEIGHT = 120;

export function PanelGeneratorPanel({ profile, seedBase }: Props) {
  const baseSeed = seedBase || "panel-style";
  const [label, setLabel] = useState("Panel");
  const [axisSelections, setAxisSelections] = useState<PanelAxisSelections>(() =>
    getSeededAxisSelections(baseSeed)
  );

  useEffect(() => {
    setAxisSelections(getSeededAxisSelections(baseSeed));
  }, [baseSeed]);

  const style = useMemo(
    () => resolvePanelStyle(baseSeed, profile, axisSelections),
    [baseSeed, profile, axisSelections]
  );

  const panel = useMemo(
    () => buildPanel(baseSeed, label, profile, axisSelections),
    [baseSeed, label, profile, axisSelections]
  );

  const axisRows = useMemo(() => PANEL_AXIS_ORDER, []);

  const cycleAxis = (axis: PanelAxisKey, direction: -1 | 1) => {
    setAxisSelections((prev) => {
      const count = PANEL_AXIS_VARIANTS[axis].length;
      const next = (prev[axis] + direction + count) % count;
      return { ...prev, [axis]: next };
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 text-[12px] text-slate-200">
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-indigo-300">
          Panel Style Engine
        </div>
        <div className="text-[12px] text-slate-400">
          Axis-based style resolver with deterministic parameter sampling. Cycle any axis to explore variants without affecting the others.
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Overlay Profile</div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <ProfileSwatch label="Base" value={profile.baseColor} />
          <ProfileSwatch label="Accent" value={profile.accentColor} />
          <ProfileSwatch label="Text" value={profile.textColor} />
          <span className="rounded border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[10px] uppercase tracking-[0.08em]">
            Radius {Math.round(profile.baseRadius)}
          </span>
          <span className="rounded border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[10px] uppercase tracking-[0.08em]">
            Font {profile.fontFamily}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Panel Label</div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded border border-[rgba(255,255,255,0.1)] bg-[#0f0f12] px-2 py-1 text-[12px] text-slate-100"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Style Axes</div>
        <div className="flex flex-col gap-2">
          {axisRows.map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <div className="w-20 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                {PANEL_AXIS_LABELS[axis]}
              </div>
              <button
                type="button"
                onClick={() => cycleAxis(axis, -1)}
                className="rounded border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] text-slate-300 hover:text-white"
              >
                &lt;
              </button>
              <div className="flex-1 text-[12px] text-slate-200">
                {formatAxisValue(axis, style)}
              </div>
              <button
                type="button"
                onClick={() => cycleAxis(axis, 1)}
                className="rounded border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] text-slate-300 hover:text-white"
              >
                &gt;
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0f1013] p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Preview</div>
        <div className="flex items-center justify-center">
          <PanelPreview panelLabel={panel.label} style={style} profile={profile} />
        </div>
      </div>

      <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3 text-[11px] text-slate-500">
        Panel ID: {panel.id}
      </div>
    </div>
  );
}

function ProfileSwatch({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-2 rounded border border-[rgba(255,255,255,0.1)] px-2 py-1">
      <span
        className="h-3 w-3 rounded"
        style={{ background: value || "#111" }}
      />
      <span className="text-[10px] uppercase tracking-[0.08em]">{label}</span>
    </span>
  );
}

function PanelPreview({
  panelLabel,
  style,
  profile,
}: {
  panelLabel: string;
  style: PanelStyle;
  profile: StyleProfile;
}) {
  const padding = getSpacingPadding(style.spacing.type);
  const fontFamily = getFontStack(profile.fontFamily);
  const shapeStyles = getShapeStyles(style.shape, style.width, PANEL_HEIGHT);
  const fillStyles = getFillStyles(style.fill, style.colors);
  const accentLayer = renderAccentLayer(style);
  const highlightLayer = renderHighlightLayer(style);
  const borderLayer = renderBorderLayer(style);
  const designLayer = renderDesignLayer(style);

  const iconPlacement = style.icon.type;
  const iconSize = Math.round(Math.max(18, PANEL_HEIGHT * 0.22));

  const content = (
    <div
      className="relative z-10 flex w-full items-center justify-center"
      style={{
        gap: 12,
        padding,
        color: style.colors.primary,
        fontFamily,
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        ...getTypographyStyles(style.typography),
      }}
    >
      {iconPlacement === "left" && (
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: iconSize,
            height: iconSize,
            background: style.colors.secondary,
            opacity: 0.9,
          }}
        />
      )}
      <span className="text-[16px]" style={{ lineHeight: 1.2 }}>
        {panelLabel}
      </span>
    </div>
  );

  const topContent = (
    <div
      className="relative z-10 flex w-full flex-col items-center justify-center"
      style={{
        gap: 8,
        padding,
        color: style.colors.primary,
        fontFamily,
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        ...getTypographyStyles(style.typography),
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: iconSize,
          height: iconSize,
          background: style.colors.secondary,
          opacity: 0.9,
        }}
      />
      <span className="text-[16px]" style={{ lineHeight: 1.2 }}>
        {panelLabel}
      </span>
    </div>
  );

  return (
    <div
      className="relative"
      style={{
        width: style.width,
        height: PANEL_HEIGHT,
        overflow: "hidden",
        borderRadius: shapeStyles.borderRadius,
        clipPath: shapeStyles.clipPath,
        background: "transparent",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          ...fillStyles,
        }}
      />
      {designLayer}
      {accentLayer}
      {highlightLayer}
      {borderLayer}
      {iconPlacement === "badge" && (
        <div
          className="absolute right-3 top-3 z-20 flex items-center justify-center rounded-full"
          style={{
            width: iconSize - 4,
            height: iconSize - 4,
            background: style.colors.secondary,
            color: style.colors.primary,
            fontSize: 10,
            letterSpacing: "0.12em",
            fontFamily,
          }}
        >
          +
        </div>
      )}
      {iconPlacement === "top" ? topContent : content}
    </div>
  );
}

function formatAxisValue(axis: PanelAxisKey, style: PanelStyle) {
  switch (axis) {
    case "shape":
      if (style.shape.type === "rectangle" || style.shape.type === "rounded") {
        return `${titleCase(style.shape.type)} (r ${Math.round(style.shape.radius)})`;
      }
      if (style.shape.type === "cut") {
        return `Cut (c ${Math.round(style.shape.cutSize)})`;
      }
      if (style.shape.type === "tab") {
        return `Tab (h ${Math.round(style.shape.tabHeight)})`;
      }
      return "Pill";
    case "fill":
      if (style.fill.type === "gradient") {
        return `Gradient (${Math.round(style.fill.angle)} deg, ${style.fill.intensity})`;
      }
      return "Solid";
    case "border":
      if (style.border.type === "thin" || style.border.type === "thick") {
        return `${titleCase(style.border.type)} (${style.border.width}px)`;
      }
      return titleCase(style.border.type);
    case "highlight":
      if (style.highlight.type === "top" || style.highlight.type === "side") {
        return `${titleCase(style.highlight.type)} (${style.highlight.thickness}px)`;
      }
      if (style.highlight.type === "glow") {
        return `Glow (${style.highlight.intensity})`;
      }
      return titleCase(style.highlight.type);
    case "accent":
      if (style.accent.type === "bar") {
        return `Bar (${style.accent.position})`;
      }
      return titleCase(style.accent.type);
    case "designLayer":
      if (style.designLayer.type === "diagonal") {
        return `Diagonal (op ${style.designLayer.opacity})`;
      }
      if (style.designLayer.type === "split") {
        return `Split (${style.designLayer.ratio})`;
      }
      if (style.designLayer.type === "pattern") {
        return `Pattern (${style.designLayer.density})`;
      }
      if (style.designLayer.type === "shapeOverlay") {
        return `Shape Overlay (${style.designLayer.scale})`;
      }
      return "None";
    case "typography":
      return titleCase(style.typography.type);
    case "icon":
      return titleCase(style.icon.type);
    case "spacing":
      return titleCase(style.spacing.type);
    default:
      return "";
  }
}

function getSpacingPadding(type: PanelStyle["spacing"]["type"]) {
  switch (type) {
    case "tight":
      return 10;
    case "wide":
      return 24;
    default:
      return 16;
  }
}

function getTypographyStyles(typography: PanelStyle["typography"]) {
  switch (typography.type) {
    case "bold":
      return { fontWeight: 700 };
    case "outline":
      return {
        fontWeight: 700,
        textShadow: "-1px 0 rgba(0,0,0,0.5), 0 1px rgba(0,0,0,0.5), 1px 0 rgba(0,0,0,0.5), 0 -1px rgba(0,0,0,0.5)",
      };
    case "condensed":
      return { fontWeight: 600, letterSpacing: "0.04em" };
    default:
      return { fontWeight: 500 };
  }
}

function getShapeStyles(shape: PanelStyle["shape"], width: number, height: number) {
  if (shape.type === "pill") {
    return { borderRadius: height / 2, clipPath: undefined };
  }
  if (shape.type === "rectangle" || shape.type === "rounded") {
    return { borderRadius: shape.radius, clipPath: undefined };
  }
  if (shape.type === "cut") {
    const c = clamp(shape.cutSize, 0, Math.min(width, height) / 2);
    const clipPath = `polygon(${c}px 0px, ${width - c}px 0px, ${width}px ${c}px, ${width}px ${height - c}px, ${width - c}px ${height}px, ${c}px ${height}px, 0px ${height - c}px, 0px ${c}px)`;
    return { borderRadius: 0, clipPath };
  }
  if (shape.type === "tab") {
    const t = clamp(shape.tabHeight, 4, Math.min(height / 2, width / 3));
    const left = Math.round(width * 0.18);
    const right = Math.round(width * 0.62);
    const clipPath = `polygon(0px ${t}px, 0px ${height}px, ${width}px ${height}px, ${width}px ${t}px, ${right}px ${t}px, ${right - t}px 0px, ${left + t}px 0px, ${left}px ${t}px)`;
    return { borderRadius: 0, clipPath };
  }
  return { borderRadius: 0, clipPath: undefined };
}

function getFillStyles(fill: PanelStyle["fill"], colors: PanelStyle["colors"]) {
  if (fill.type === "gradient") {
    const mixed = mixColors(colors.background, colors.secondary, fill.intensity);
    return {
      background: `linear-gradient(${fill.angle}deg, ${colors.background} 0%, ${mixed} 100%)`,
    };
  }
  return { background: colors.background };
}

function renderDesignLayer(style: PanelStyle) {
  const { designLayer, colors } = style;
  if (designLayer.type === "none") return null;

  if (designLayer.type === "shapeOverlay") {
    const size = Math.round(style.width * 0.5 * designLayer.scale);
    return (
      <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
        <div
          className="absolute"
          style={{
            width: size,
            height: size,
            right: -size * 0.2,
            bottom: -size * 0.3,
            borderRadius: "50%",
            background: toRgba(colors.secondary, 0.18),
          }}
        />
      </div>
    );
  }

  if (designLayer.type === "split") {
    const stop = Math.round(designLayer.ratio * 100);
    return (
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${toRgba(colors.secondary, 0.2)} 0%, ${toRgba(
            colors.secondary,
            0.2
          )} ${stop}%, transparent ${stop}%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />
    );
  }

  if (designLayer.type === "pattern") {
    const stripe = Math.round(6 + designLayer.density * 16);
    return (
      <div
        className="absolute inset-0"
        style={{
          background: `repeating-linear-gradient(45deg, ${toRgba(
            colors.secondary,
            0.18
          )} 0px, ${toRgba(colors.secondary, 0.18)} ${stripe}px, transparent ${
            stripe
          }px, transparent ${stripe * 2}px)`,
          pointerEvents: "none",
        }}
      />
    );
  }

  if (designLayer.type === "diagonal") {
    return (
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${toRgba(colors.secondary, designLayer.opacity)} 0%, ${
            toRgba(colors.secondary, 0)
          } 70%)`,
          pointerEvents: "none",
        }}
      />
    );
  }

  return null;
}

function renderAccentLayer(style: PanelStyle) {
  const { accent, colors } = style;
  if (accent.type === "none") return null;

  if (accent.type === "bar") {
    const thickness = 8;
    if (accent.position === "top") {
      return (
        <div
          className="absolute left-0 top-0 right-0"
          style={{ height: thickness, background: colors.secondary, opacity: 0.9 }}
        />
      );
    }
    if (accent.position === "right") {
      return (
        <div
          className="absolute right-0 top-0 bottom-0"
          style={{ width: thickness, background: colors.secondary, opacity: 0.9 }}
        />
      );
    }
    return (
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: thickness, background: colors.secondary, opacity: 0.9 }}
      />
    );
  }

  if (accent.type === "corner") {
    return (
      <div
        className="absolute left-0 top-0"
        style={{
          width: 32,
          height: 32,
          background: colors.secondary,
          clipPath: "polygon(0 0, 100% 0, 0 100%)",
          opacity: 0.9,
        }}
      />
    );
  }

  return (
    <div
      className="absolute left-4 top-4"
      style={{
        height: 12,
        width: 48,
        background: colors.secondary,
        borderRadius: 999,
        opacity: 0.85,
      }}
    />
  );
}

function renderHighlightLayer(style: PanelStyle) {
  const { highlight, colors } = style;
  if (highlight.type === "none") return null;

  if (highlight.type === "top") {
    return (
      <div
        className="absolute left-0 top-0 right-0"
        style={{ height: highlight.thickness, background: toRgba(colors.primary, 0.4) }}
      />
    );
  }

  if (highlight.type === "side") {
    return (
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: highlight.thickness, background: toRgba(colors.primary, 0.4) }}
      />
    );
  }

  if (highlight.type === "glow") {
    return (
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `0 0 18px ${toRgba(colors.secondary, highlight.intensity)}`,
        }}
      />
    );
  }

  if (highlight.type === "outline") {
    return (
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `0 0 0 2px ${toRgba(colors.primary, 0.45)}`,
        }}
      />
    );
  }

  return null;
}

function renderBorderLayer(style: PanelStyle) {
  const { border, colors } = style;
  if (border.type === "none") return null;

  if (border.type === "inset") {
    return (
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `inset 0 0 0 2px ${toRgba(colors.primary, 0.4)}`,
        }}
      />
    );
  }

  return (
    <div
      className="absolute inset-0"
      style={{
        boxSizing: "border-box",
        border: `${border.width}px solid ${toRgba(colors.primary, 0.35)}`,
      }}
    />
  );
}

function titleCase(value: string) {
  if (!value) return value;
  return value
    .split(/[_\-\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const raw = hex.replace("#", "").trim();
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function toRgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixColors(a: string, b: string, t: number) {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return a;
  const mix = {
    r: Math.round(rgbA.r + (rgbB.r - rgbA.r) * t),
    g: Math.round(rgbA.g + (rgbB.g - rgbA.g) * t),
    b: Math.round(rgbA.b + (rgbB.b - rgbA.b) * t),
  };
  return `#${mix.r.toString(16).padStart(2, "0")}${mix.g
    .toString(16)
    .padStart(2, "0")}${mix.b.toString(16).padStart(2, "0")}`;
}

// Collapsible wrapper for use in the Widgets tab
type CollapsibleProps = {
  profile: StyleProfile;
  seedBase?: string;
};

export function PanelGeneratorCollapsible({ profile, seedBase }: CollapsibleProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="mt-2 border-t border-[rgba(255,255,255,0.07)]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="font-semibold">Panel Generator</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="pb-2">
          <PanelGeneratorPanel profile={profile} seedBase={seedBase} />
        </div>
      )}
    </div>
  );
}
