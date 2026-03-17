import React, { useMemo, useState } from "react";
import {
  PANEL_TEMPLATES,
  PanelPack,
  PanelTemplateType,
  Panel,
  StyleProfile,
  PanelGenerationConfig,
} from "../panelGeneration";

type Props = {
  selectedGroupId: string | null;
  selectedGroupName?: string | null;
  panelPack: PanelPack | null;
  warnings: string[];
  onGenerate: (config: PanelGenerationConfig) => void;
  onUpdatePack: (next: PanelPack) => void;
  onExportPng: (scale: number) => void;
  onExportZip: (scale: number) => void;
};

const ALL_TYPES: PanelTemplateType[] = ["about", "social", "donate", "rules"];

function toggleType(list: PanelTemplateType[], type: PanelTemplateType) {
  if (list.includes(type)) return list.filter((t) => t !== type);
  return [...list, type];
}

function updatePanel(pack: PanelPack, panelId: string, update: Partial<Panel>) {
  return {
    ...pack,
    panels: pack.panels.map((panel) => (panel.id === panelId ? { ...panel, ...update } : panel)),
  };
}

function updatePanelContent(pack: PanelPack, panelId: string, update: Partial<Panel["content"]>) {
  return {
    ...pack,
    panels: pack.panels.map((panel) =>
      panel.id === panelId ? { ...panel, content: { ...panel.content, ...update } } : panel
    ),
  };
}

function updateStyleToken(pack: PanelPack, token: keyof StyleProfile["colors"], value: string) {
  return {
    ...pack,
    styleProfile: {
      ...pack.styleProfile,
      colors: {
        ...pack.styleProfile.colors,
        [token]: value,
      },
    },
  };
}

export function PanelGeneratorPanel({
  selectedGroupId,
  selectedGroupName,
  panelPack,
  warnings,
  onGenerate,
  onUpdatePack,
  onExportPng,
  onExportZip,
}: Props) {
  const [selectedTypes, setSelectedTypes] = useState<PanelTemplateType[]>(["about"]);
  const [scale, setScale] = useState(2);

  const templateMap = useMemo(() => {
    const map = new Map<PanelTemplateType, string[]>();
    PANEL_TEMPLATES.forEach((tpl) => map.set(tpl.type, tpl.layoutVariants));
    return map;
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 text-[12px] text-slate-200">
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-indigo-300">
          Panel Generator
        </div>
        <div className="text-[12px] text-slate-400">
          Select a group/frame in the canvas, then generate a panel pack from it.
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Panel Types</div>
        <div className="text-[11px] text-slate-500">
          Source: {selectedGroupId ? (selectedGroupName || selectedGroupId) : "Select a group/frame"}
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedTypes((prev) => toggleType(prev, type))}
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
          onClick={() => onGenerate({ panelTypes: selectedTypes, layoutVariants: {} })}
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
                    onChange={(e) => onUpdatePack(updateStyleToken(panelPack, token, e.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {panelPack.panels.map((panel) => {
              const layouts = templateMap.get(panel.type) || ["stacked"];
              return (
                <div key={panel.id} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#121216] p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-indigo-200">
                      {panel.type}
                    </div>
                    <select
                      value={panel.layout}
                      onChange={(e) => onUpdatePack(updatePanel(panelPack, panel.id, { layout: e.target.value }))}
                      className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[11px]"
                    >
                      {layouts.map((layout) => (
                        <option key={layout} value={layout}>
                          {layout}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="mt-2 block text-[11px] text-slate-400">
                    Title
                    <input
                      type="text"
                      value={panel.title}
                      onChange={(e) => onUpdatePack(updatePanel(panelPack, panel.id, { title: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[12px] text-slate-100"
                    />
                  </label>

                  {panel.content.text !== undefined && (
                    <label className="mt-2 block text-[11px] text-slate-400">
                      Body
                      <textarea
                        value={panel.content.text || ""}
                        onChange={(e) => onUpdatePack(updatePanelContent(panelPack, panel.id, { text: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[12px] text-slate-100"
                        rows={3}
                      />
                    </label>
                  )}

                  {panel.content.items && (
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Items</div>
                      {panel.content.items.map((item, idx) => (
                        <div key={`${panel.id}_item_${idx}`} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => {
                              const nextItems = panel.content.items ? [...panel.content.items] : [];
                              nextItems[idx] = { ...nextItems[idx], label: e.target.value };
                              onUpdatePack(updatePanelContent(panelPack, panel.id, { items: nextItems }));
                            }}
                            className="flex-1 rounded-md border border-[rgba(255,255,255,0.12)] bg-[#0f1014] px-2 py-1 text-[12px] text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextItems = panel.content.items ? panel.content.items.filter((_, i) => i !== idx) : [];
                              onUpdatePack(updatePanelContent(panelPack, panel.id, { items: nextItems }));
                            }}
                            className="rounded-md border border-[rgba(255,255,255,0.12)] px-2 py-1 text-[11px] text-slate-300"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const nextItems = panel.content.items ? [...panel.content.items] : [];
                          nextItems.push({ label: "" });
                          onUpdatePack(updatePanelContent(panelPack, panel.id, { items: nextItems }));
                        }}
                        className="rounded-md border border-[rgba(255,255,255,0.12)] px-2 py-1 text-[11px] text-slate-300"
                      >
                        Add Item
                      </button>
                    </div>
                  )}
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
