import React, { useMemo, useState } from "react";
import {
  PanelPack,
  PanelStyleVariant,
  PanelTemplateType,
  PANEL_VARIANTS,
  getDefaultPanelConfig,
} from "../panelGeneration";

type Props = {
  selectedGroupId: string | null;
  selectedGroupName?: string | null;
  panelPack: PanelPack | null;
  warnings: string[];
  onGenerate: (config: { panelTypes: PanelTemplateType[] }) => void;
  onSamplePalette: () => void;
  sampledPaletteLabel?: string | null;
  onUpdatePack: (next: PanelPack) => void;
  onExportPng: (scale: number) => void;
  onExportZip: (scale: number) => void;
};

const PANEL_TYPES: PanelTemplateType[] = ["about", "social", "donate", "rules"];

function variantLabel(variant: PanelStyleVariant) {
  return variant.id.replace(/[-_]/g, " ");
}

export function PanelGeneratorPanel({
  selectedGroupId,
  selectedGroupName,
  panelPack,
  warnings,
  onGenerate,
  onSamplePalette,
  sampledPaletteLabel,
  onUpdatePack,
  onExportPng,
  onExportZip,
}: Props) {
  const [selectedTypes, setSelectedTypes] = useState<PanelTemplateType[]>(getDefaultPanelConfig().panelTypes);
  const [scale, setScale] = useState(2);

  const sourceLabel = selectedGroupId ? (selectedGroupName || selectedGroupId) : "Select a group/frame";

  const variantMap = useMemo(() => {
    return new Map(PANEL_VARIANTS.map((variant) => [variant.id, variant]));
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 text-[12px] text-slate-200">
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-indigo-300">
          Panel Generator
        </div>
        <div className="text-[12px] text-slate-400">
          Panels are banners derived from the overlay composition. Select a group or a selection for tighter control.
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Source</div>
        <div className="text-[11px] text-slate-500">Selected: {sourceLabel}</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <button
            type="button"
            onClick={onSamplePalette}
            className="rounded-md border border-[rgba(255,255,255,0.12)] px-2 py-1 text-[11px] text-slate-200"
          >
            Sample Canvas Palette
          </button>
          {sampledPaletteLabel ? <span>Using: {sampledPaletteLabel}</span> : <span>Using: Extracted</span>}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.08em] text-slate-400">Panel Types</div>
        <div className="flex flex-wrap gap-2">
          {PANEL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setSelectedTypes((prev) =>
                  prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                );
              }}
              className={`rounded-md border px-3 py-1 text-[11px] uppercase tracking-[0.08em] ${
                selectedTypes.includes(type)
                  ? "border-indigo-400 bg-[rgba(99,102,241,0.18)] text-indigo-200"
                  : "border-[rgba(255,255,255,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedGroupId || selectedTypes.length === 0}
          onClick={() => onGenerate({ panelTypes: selectedTypes })}
          className="mt-2 rounded-md bg-indigo-500/80 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          Generate Panel Pack
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-[12px] text-yellow-200">
          <div className="font-semibold uppercase tracking-[0.08em] text-yellow-200">Warnings</div>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((warn) => (
              <li key={warn}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {!panelPack && (
        <div className="rounded-md border border-dashed border-[rgba(255,255,255,0.12)] p-3 text-slate-500">
          No panel pack generated yet.
        </div>
      )}

      {panelPack && (
        <>
          <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0f1014] p-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Style Tokens</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              {(["background", "primary", "accent", "textPrimary", "textSecondary"] as const).map((token) => (
                <label key={token} className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">{token}</span>
                  <input
                    type="color"
                    value={panelPack.styleProfile.colors[token]}
                    onChange={(e) =>
                      onUpdatePack({
                        ...panelPack,
                        styleProfile: {
                          ...panelPack.styleProfile,
                          colors: { ...panelPack.styleProfile.colors, [token]: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {panelPack.panels.map((panel) => {
              const selectedVariant = panel.styleVariant?.id || panel.layout;
              return (
                <div key={panel.id} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-indigo-200">
                      {panel.type}
                    </div>
                    <select
                      value={selectedVariant}
                      onChange={(e) => {
                        const next = variantMap.get(e.target.value) || PANEL_VARIANTS[0];
                        onUpdatePack({
                          ...panelPack,
                          panels: panelPack.panels.map((p) =>
                            p.id === panel.id ? { ...p, layout: next.id, styleVariant: next } : p
                          ),
                        });
                      }}
                      className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[11px]"
                    >
                      {PANEL_VARIANTS.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variantLabel(variant)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="mt-2 block text-[11px] text-slate-400">
                    Text
                    <input
                      type="text"
                      value={panel.title}
                      onChange={(e) =>
                        onUpdatePack({
                          ...panelPack,
                          panels: panelPack.panels.map((p) => (p.id === panel.id ? { ...p, title: e.target.value } : p)),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[12px] text-slate-100"
                    />
                  </label>

                  <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={panel.styleVariant?.icon !== "omitted"}
                      onChange={(e) => {
                        const variant = panel.styleVariant || PANEL_VARIANTS[0];
                        const next: PanelStyleVariant = { ...variant, icon: e.target.checked ? "included" : "omitted" };
                        onUpdatePack({
                          ...panelPack,
                          panels: panelPack.panels.map((p) =>
                            p.id === panel.id ? { ...p, layout: next.id, styleVariant: next } : p
                          ),
                        });
                      }}
                    />
                    Show icon
                  </label>
                </div>
              );
            })}
          </div>

          <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                Export Scale
                <select
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[11px]"
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => onExportPng(scale)}
                className="rounded-md bg-indigo-500/80 px-3 py-2 text-[12px] font-semibold text-white"
              >
                Export PNGs
              </button>
              <button
                type="button"
                onClick={() => onExportZip(scale)}
                className="rounded-md border border-[rgba(255,255,255,0.2)] px-3 py-2 text-[12px] font-semibold text-slate-100"
              >
                Export ZIP
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
