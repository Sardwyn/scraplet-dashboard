// src/overlay-editor/BindingPicker.tsx
import React, { useState, useEffect } from 'react';
import { SourceCatalog } from '../shared/bindingEngine';
import { DynamicBinding } from '../shared/overlayTypes';

interface BindingPickerProps {
    propName: string;
    binding?: DynamicBinding;
    onUpdate: (binding: DynamicBinding | undefined) => void;
    type: 'text' | 'image' | 'number';
}

interface Preset {
    id: string;
    icon: string;
    label: string;
    description: string;
    sourceId: string;
    fieldId: string;
    formatType?: 'text' | 'number';
    prefix?: string;
    suffix?: string;
}

const TEXT_PRESETS: Preset[] = [
    {
        id: 'chat_msg',
        icon: '💬',
        label: 'Chat Message',
        description: 'Latest chat message text',
        sourceId: 'latest_chat',
        fieldId: 'text',
        formatType: 'text'
    },
    {
        id: 'chat_sender',
        icon: '👤',
        label: 'Chat Sender',
        description: 'Username of latest chatter',
        sourceId: 'latest_chat',
        fieldId: 'name',
        formatType: 'text'
    },
    {
        id: 'alert_user',
        icon: '🔔',
        label: 'Alert Username',
        description: 'Latest follower/subscriber',
        sourceId: 'latest_alert',
        fieldId: 'user',
        formatType: 'text'
    },
    {
        id: 'alert_msg',
        icon: '📣',
        label: 'Alert Message',
        description: 'Action (e.g., "subscribed!")',
        sourceId: 'latest_alert',
        fieldId: 'message',
        formatType: 'text'
    },
    {
        id: 'countdown_sec',
        icon: '⏱️',
        label: 'Countdown (Sec)',
        description: 'Remaining time in seconds',
        sourceId: 'countdown',
        fieldId: 'remainingSec',
        formatType: 'number'
    },
    {
        id: 'stake_balance',
        icon: '💰',
        label: 'Stake Balance',
        description: 'Current session balance',
        sourceId: 'stake_monitor',
        fieldId: 'currentBalance',
        formatType: 'number',
        prefix: '$'
    },
    {
        id: 'stake_pnl',
        icon: '📈',
        label: 'Stake P&L',
        description: 'Current session profit/loss',
        sourceId: 'stake_monitor',
        fieldId: 'sessionPnl',
        formatType: 'number',
        prefix: '$'
    },
    {
        id: 'tts_sender',
        icon: '🗣️',
        label: 'TTS Speaker',
        description: 'Username of active speaker',
        sourceId: 'tts_player',
        fieldId: 'senderUsername',
        formatType: 'text'
    }
];

const IMAGE_PRESETS: Preset[] = [
    {
        id: 'chat_avatar',
        icon: '👤',
        label: 'Chat Avatar',
        description: 'Profile photo of latest chatter',
        sourceId: 'latest_chat',
        fieldId: 'avatar'
    },
    {
        id: 'alert_avatar',
        icon: '🔔',
        label: 'Alert Avatar',
        description: 'Profile photo of alert actor',
        sourceId: 'latest_alert',
        fieldId: 'avatar'
    },
    {
        id: 'producer_card_image',
        icon: '🖼️',
        label: 'Producer Image',
        description: 'Graphic on current producer card',
        sourceId: 'producer_card',
        fieldId: 'image'
    }
];

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
                fieldId: type === 'image' ? 'avatar' : 'name',
                fallback: '',
                format: { type: type === 'number' ? 'number' : 'text' }
            });
        }
    };

    const presets = type === 'image' ? IMAGE_PRESETS : TEXT_PRESETS;
    const currentPreset = presets.find(p => p.sourceId === binding?.sourceId && p.fieldId === binding?.fieldId);

    const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // If binding exists but doesn't match any preset, auto-route to the Custom tab
    useEffect(() => {
        if (binding && !currentPreset) {
            setActiveTab('custom');
        }
    }, [binding, currentPreset]);

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

    const bindableSources = SourceCatalog.filter((s) => s.id !== 'custom_variables');
    const source = bindableSources.find(s => s.id === binding.sourceId) || bindableSources[0];
    const fieldMatchesBindingType = (f: { type: string }) =>
      f.type === type ||
      (type === 'text' && (f.type === 'number' || f.type === 'string')) ||
      (type === 'image' && f.type === 'text');
    const fields = source.fields.filter(fieldMatchesBindingType);

    return (
        <div className="bg-slate-950 border border-indigo-500/40 rounded p-3 space-y-3.5 my-2 shadow-xl shadow-indigo-500/5 animate-in fade-in slide-in-from-top-1 duration-200 w-80">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-indigo-400 animate-pulse">●</span>
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Live Binding</span>
                </div>
                <button onClick={toggle} className="text-slate-500 hover:text-rose-400 transition-colors text-[9px] uppercase font-bold tracking-tighter">Unbind</button>
            </div>

            {/* Tab Headers */}
            <div className="flex border-b border-slate-900">
                <button
                    type="button"
                    onClick={() => setActiveTab('presets')}
                    className={`flex-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition-all outline-none ${
                        activeTab === 'presets'
                            ? 'border-indigo-500 text-indigo-400 font-extrabold'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    Quick Presets
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('custom')}
                    className={`flex-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition-all outline-none ${
                        activeTab === 'custom'
                            ? 'border-indigo-500 text-indigo-400 font-extrabold'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    Custom Source
                </button>
            </div>

            {/* Presets Grid */}
            {activeTab === 'presets' && (
                <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-2 max-h-[195px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                        {presets.map(p => {
                            const isActive = binding?.sourceId === p.sourceId && binding?.fieldId === p.fieldId;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        onUpdate({
                                            mode: 'dynamic',
                                            sourceId: p.sourceId,
                                            fieldId: p.fieldId,
                                            fallback: binding.fallback ?? '',
                                            format: {
                                                type: p.formatType ?? (type === 'number' ? 'number' : 'text'),
                                                prefix: p.prefix,
                                                suffix: p.suffix
                                            }
                                        });
                                    }}
                                    className={`flex items-start text-left gap-2 p-2 rounded border transition-all text-[11px] leading-[1.3] outline-none ${
                                        isActive
                                            ? 'bg-indigo-600/10 border-indigo-500/80 text-indigo-200 shadow-md shadow-indigo-500/5'
                                            : 'bg-slate-900/40 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <span className="text-[14px] flex-none mt-0.5">{p.icon}</span>
                                    <div className="min-w-0">
                                        <div className={`font-semibold truncate ${isActive ? 'text-indigo-300' : 'text-slate-300'}`}>{p.label}</div>
                                        <div className="text-[9px] text-slate-500 truncate mt-0.5">{p.description}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Custom Tab */}
            {activeTab === 'custom' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Source</label>
                            <select
                                className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                                value={binding.sourceId}
                                onChange={(e) => {
                                    const newSource = bindableSources.find(s => s.id === e.target.value);
                                    onUpdate({
                                        ...binding,
                                        sourceId: e.target.value,
                                        fieldId: newSource?.fields.filter(fieldMatchesBindingType)[0]?.id || ''
                                    });
                                }}
                            >
                                {bindableSources.map(s => (
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

                    {/* Expandable Advanced Section */}
                    <div className="border-t border-slate-900 pt-2.5">
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen(!advancedOpen)}
                            className="flex items-center justify-between w-full text-[9px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider transition-colors outline-none"
                        >
                            <span>Advanced Settings</span>
                            <span className="text-[8px] transition-transform duration-200" style={{ transform: advancedOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        </button>

                        {advancedOpen && (
                            <div className="mt-2 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Fallback (Initial Value)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-slate-300 focus:border-indigo-500 outline-none"
                                        value={binding.fallback ?? ''}
                                        onChange={(e) => onUpdate({ ...binding, fallback: e.target.value })}
                                        placeholder="No data fallback"
                                    />
                                </div>

                                {type === 'text' && (
                                    <div className="flex gap-2">
                                        <div className="flex-1 space-y-1">
                                            <label className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter">Prefix</label>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] font-mono text-slate-400 outline-none"
                                                value={binding.format?.prefix || ''}
                                                onChange={(e) => onUpdate({ ...binding, format: { ...(binding.format || { type: 'text' }), prefix: e.target.value } })}
                                                placeholder="@"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <label className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter">Suffix</label>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] font-mono text-slate-400 outline-none"
                                                value={binding.format?.suffix || ''}
                                                onChange={(e) => onUpdate({ ...binding, format: { ...(binding.format || { type: 'text' }), suffix: e.target.value } })}
                                                placeholder="!"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
