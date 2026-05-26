// src/overlay-editor/components/TriggerModePanel.tsx
import React, { useState } from 'react';
import { ElementInteraction, EventComponentSpawner, OverlayElement } from '../../shared/overlayTypes';

interface TriggerModePanelProps {
  elements: OverlayElement[];
  eventSpawners?: EventComponentSpawner[];
  selectedElementId?: string;
  activePreviewTrigger: string;
  onPreviewTriggerChange: (triggerId: string) => void;
  onAddInteraction?: (elementId: string, interaction: ElementInteraction) => void;
  onAddSpawner: (spawner: EventComponentSpawner) => void;
  onTestTrigger: (triggerId: string) => void;
  durationMs: number;
  onDurationMsChange: (duration: number) => void;
}

const AVAILABLE_TRIGGERS = [
  { id: 'platform.kick.raid', label: 'Kick Raid', platform: 'Kick' },
  { id: 'platform.kick.follow', label: 'Kick Follow', platform: 'Kick' },
  { id: 'platform.kick.subscription', label: 'Kick Sub', platform: 'Kick' },
  { id: 'platform.twitch.raid', label: 'Twitch Raid', platform: 'Twitch' },
  { id: 'platform.twitch.follow', label: 'Twitch Follow', platform: 'Twitch' },
  { id: 'platform.twitch.subscription', label: 'Twitch Sub', platform: 'Twitch' },
  { id: 'platform.youtube.follow', label: 'YouTube Follow', platform: 'YouTube' },
  { id: 'platform.youtube.subscription', label: 'YouTube Sub', platform: 'YouTube' },
  { id: 'room_intel.pressure', label: 'Room Pressure (Hype)', platform: 'Intel' }
];

export function TriggerModePanel({
  elements,
  eventSpawners = [],
  selectedElementId,
  activePreviewTrigger,
  onPreviewTriggerChange,
  onAddInteraction,
  onAddSpawner,
  onTestTrigger,
  durationMs,
  onDurationMsChange
}: TriggerModePanelProps) {
  const [selectedTriggerId, setSelectedTriggerId] = useState(AVAILABLE_TRIGGERS[0].id);
  const [priority, setPriority] = useState(5);
  const [cooldownMs, setCooldownMs] = useState(10000);
  const [stackMode, setStackMode] = useState<'replace' | 'stack' | 'queue'>('queue');
  const [minViewers, setMinViewers] = useState(0);

  const selectedElement = elements.find(el => el.id === selectedElementId);

  const handleCreateSpawner = () => {
    const newSpawner: EventComponentSpawner = {
      id: Math.random().toString(36).substring(2, 9),
      triggerId: selectedTriggerId,
      componentId: selectedElementId || 'custom_alert_group',
      x: 100,
      y: 100,
      durationMs,
      priority,
      cooldownMs,
      stackMode,
      conditions: minViewers > 0 ? { minViewers } : undefined
    };
    onAddSpawner(newSpawner);
  };

  return (
    <div className="text-slate-200 p-4 space-y-6 flex flex-col font-sans select-none">
      
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-lg">⚡</span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">Interactions & Reactions</h2>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Configure how elements react or spawn when stream events occur.
        </p>
      </div>

      {/* State Preview Controller */}
      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-lg p-3 space-y-2.5">
        <label className="text-[10px] uppercase font-bold tracking-wider text-cyan-300">Active State Preview</label>
        <div className="flex gap-2">
          <select
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 outline-none"
            value={activePreviewTrigger}
            onChange={(e) => onPreviewTriggerChange(e.target.value)}
          >
            <option value="idle">● Default (Idle State)</option>
            {AVAILABLE_TRIGGERS.map(t => (
              <option key={t.id} value={t.id}>⚡ {t.label}</option>
            ))}
          </select>
          {activePreviewTrigger !== 'idle' && (
            <button
              onClick={() => onTestTrigger(activePreviewTrigger)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3 rounded shadow-lg shadow-cyan-600/20 active:scale-95 transition-transform"
            >
              Test
            </button>
          )}
        </div>
      </div>

      {/* Trigger Creator Configurator */}
      <div className="space-y-4 pt-4 border-t border-slate-900">
        <h3 className="text-xs font-bold uppercase text-slate-300">Create New Spawner</h3>
        
        <div className="space-y-3">
          {/* Select Event */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Event Source</label>
            <select
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
              value={selectedTriggerId}
              onChange={(e) => setSelectedTriggerId(e.target.value)}
            >
              {AVAILABLE_TRIGGERS.map(t => (
                <option key={t.id} value={t.id}>[{t.platform}] {t.label}</option>
              ))}
            </select>
          </div>

          {/* Trigger Lifecycle Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Duration (ms)</label>
              <input
                type="number"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 outline-none font-mono focus:border-cyan-500"
                value={durationMs}
                onChange={(e) => onDurationMsChange(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Cooldown (ms)</label>
              <input
                type="number"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 outline-none font-mono focus:border-cyan-500"
                value={cooldownMs}
                onChange={(e) => setCooldownMs(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Priority (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 outline-none font-mono focus:border-cyan-500"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Stacking Model</label>
              <select
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500"
                value={stackMode}
                onChange={(e) => setStackMode(e.target.value as any)}
              >
                <option value="queue">Queue</option>
                <option value="stack">Stack</option>
                <option value="replace">Replace</option>
              </select>
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Minimum Viewers (Condition)</label>
            <input
              type="number"
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 outline-none font-mono focus:border-cyan-500"
              value={minViewers}
              onChange={(e) => setMinViewers(Number(e.target.value))}
              placeholder="e.g. 50"
            />
          </div>

          {/* Creator Buttons */}
          <div className="pt-2">
            <button
              onClick={handleCreateSpawner}
              className="w-full py-2.5 px-3 bg-slate-900 border border-cyan-500/20 hover:border-cyan-500/50 hover:bg-slate-800/80 active:scale-98 rounded text-xs font-semibold text-cyan-300 transition-all duration-200 text-center shadow-lg shadow-cyan-950/20"
            >
              Add Spawner...
            </button>
          </div>
        </div>
      </div>

      {/* Selected Element Active Triggers List */}
      {selectedElement && (
        <div className="pt-4 border-t border-slate-900 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Active Element Rules</span>
            <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full px-1.5 py-0.5 max-w-[120px] truncate font-mono">
              {selectedElement.name || selectedElement.id}
            </span>
          </div>
          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {!selectedElement.interactions || selectedElement.interactions.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic text-center py-4">No custom reactions set on this element.</p>
            ) : (
              selectedElement.interactions.map((it, idx) => (
                <div key={it.id || idx} className="bg-slate-900/40 border border-slate-850 rounded p-2.5 space-y-1 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-cyan-400 text-xs">⚡</span>
                      <span className="text-[11px] font-bold text-slate-300">{it.triggerId}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 flex gap-2 font-mono">
                      <span>{it.durationMs}ms</span>
                      <span>•</span>
                      <span>Pri: {it.priority || 5}</span>
                    </div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    {it.actionType}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
