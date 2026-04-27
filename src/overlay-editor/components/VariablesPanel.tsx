import React, { useState } from "react";
import { OverlayVariable } from "../../shared/overlayTypes";

function genId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

interface Props {
  variables: OverlayVariable[];
  onChange: (vars: OverlayVariable[]) => void;
}

export function VariablesPanel({ variables, onChange }: Props) {
  const addVariable = () => {
    const newVar: OverlayVariable = {
      id: genId(),
      name: `var${variables.length + 1}`,
      type: "text",
      value: "",
      defaultValue: "",
    };
    onChange([...variables, newVar]);
  };

  const updateVariable = (id: string, patch: Partial<OverlayVariable>) => {
    onChange(variables.map(v => v.id === id ? { ...v, ...patch } : v));
  };

  const deleteVariable = (id: string) => {
    onChange(variables.filter(v => v.id !== id));
  };

  const fieldCls = "w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 py-1 text-[12px] text-slate-200 outline-none focus:border-indigo-500/60";
  const labelCls = "text-[11px] text-slate-500";

  return (
    <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
      <div className="text-[11px] text-slate-500 leading-snug">
        Define custom variables for this overlay. Use them as binding sources in text elements.
      </div>

      {variables.length === 0 && (
        <div className="text-[12px] text-slate-600 italic py-2">No variables yet.</div>
      )}

      {variables.map((v) => (
        <div
          key={v.id}
          className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111113] p-2 space-y-2"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <div className={labelCls}>Name</div>
              <input
                type="text"
                className={fieldCls}
                value={v.name}
                onChange={e => updateVariable(v.id, { name: e.target.value })}
                placeholder="variableName"
              />
            </div>
            <div className="w-24 space-y-1">
              <div className={labelCls}>Type</div>
              <select
                className={fieldCls}
                value={v.type}
                onChange={e => updateVariable(v.id, { type: e.target.value as OverlayVariable["type"] })}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
              </select>
            </div>
            <button
              onClick={() => deleteVariable(v.id)}
              className="mt-4 flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] text-slate-500 hover:border-red-500/50 hover:text-red-400 transition-colors"
              title="Delete variable"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">
            <div className={labelCls}>Value</div>
            {v.type === "boolean" ? (
              <select
                className={fieldCls}
                value={String(v.value)}
                onChange={e => updateVariable(v.id, { value: e.target.value === "true" })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={v.type === "number" ? "number" : "text"}
                className={fieldCls}
                value={String(v.value)}
                onChange={e => updateVariable(v.id, {
                  value: v.type === "number" ? Number(e.target.value) : e.target.value
                })}
                placeholder="value"
              />
            )}
          </div>
        </div>
      ))}

      <button
        onClick={addVariable}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-dashed border-[rgba(255,255,255,0.12)] bg-transparent text-[12px] text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Variable
      </button>
    </div>
  );
}
