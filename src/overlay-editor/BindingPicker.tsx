// src/overlay-editor/BindingPicker.tsx
import React from 'react';
import { SourceCatalog } from '../shared/bindingEngine';
import { DynamicBinding } from '../shared/overlayTypes';

interface BindingPickerProps {
    propName: string;
    binding?: DynamicBinding;
    onUpdate: (binding: DynamicBinding | undefined) => void;
    type: 'text' | 'image' | 'number';
}

export function BindingPicker({ binding, onUpdate, type }: BindingPickerProps) {
    const isDynamic = !!binding;

    const toggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDynamic) {
            onUpdate(undefined);
        } else {
            // Default to first chat field
            onUpdate({
                mode: 'dynamic',
                sourceId: 'latest_chat',
                fieldId: 'name',
                fallback: '',
                format: { type: type === 'number' ? 'number' : 'text' }
            });
        }
    };

    if (!isDynamic) {
        return (
            <button
                onClick={toggle}
                className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1 group"
                title="Bind to Live Data"
            >
                <span className="opacity-60 group-hover:opacity-100 transition-opacity">🔗</span>
                <span className="uppercase tracking-tighter font-semibold">Live</span>
            </button>
        );
    }

    const source = SourceCatalog.find(s => s.id === binding.sourceId) || SourceCatalog[0];
    // Allow text bindings to receive numbers too
    const fields = source.fields.filter(f => f.type === type || (type === 'text' && f.type === 'number'));

    return (
        <div className="bg-slate-950 border border-indigo-500/40 rounded p-2.5 space-y-2.5 my-2 shadow-xl shadow-indigo-500/5 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-indigo-400 animate-pulse">●</span>
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Live Binding</span>
                </div>
                <button onClick={toggle} className="text-slate-500 hover:text-rose-400 transition-colors text-[9px] uppercase font-bold tracking-tighter">Unbind</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Source</label>
                    <select
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                        value={binding.sourceId}
                        onChange={(e) => {
                            const newSource = SourceCatalog.find(s => s.id === e.target.value);
                            onUpdate({
                                ...binding,
                                sourceId: e.target.value,
                                fieldId: newSource?.fields.filter(f => f.type === type || (type === 'text' && f.type === 'number'))[0]?.id || ''
                            });
                        }}
                    >
                        {SourceCatalog.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Field</label>
                    <select
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                        value={binding.fieldId}
                        onChange={(e) => onUpdate({ ...binding, fieldId: e.target.value })}
                    >
                        {fields.map(f => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Fallback (Initial Value)</label>
                <input
                    type="text"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 focus:border-indigo-500 outline-none"
                    value={binding.fallback ?? ''}
                    onChange={(e) => onUpdate({ ...binding, fallback: e.target.value })}
                    placeholder="e.target.value..."
                />
            </div>

            {type === 'text' && (
                <div className="pt-2 border-t border-slate-800 flex gap-2">
                    <div className="flex-1 space-y-1">
                        <label className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter">Prefix</label>
                        <input
                            type="text"
                            className="w-full bg-slate-900/50 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                            value={binding.format?.prefix || ''}
                            onChange={(e) => onUpdate({ ...binding, format: { ...(binding.format || { type: 'text' }), prefix: e.target.value } })}
                            placeholder="@"
                        />
                    </div>
                    <div className="flex-1 space-y-1">
                        <label className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter">Suffix</label>
                        <input
                            type="text"
                            className="w-full bg-slate-900/50 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                            value={binding.format?.suffix || ''}
                            onChange={(e) => onUpdate({ ...binding, format: { ...(binding.format || { type: 'text' }), suffix: e.target.value } })}
                            placeholder="!"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
