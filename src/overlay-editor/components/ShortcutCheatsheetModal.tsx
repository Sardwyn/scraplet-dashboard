import React, { useEffect } from "react";
import { getCheatsheetGroups, getKeycapLabel, ShortcutKey } from "../shortcutRegistry";
import { uiClasses } from "../uiTokens";

function Keycap({ keyName }: { keyName: ShortcutKey }) {
  return (
    <span className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 py-1 text-[11px] leading-[1] tracking-[-0.02em] text-slate-200 shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)]">
      {getKeycapLabel(keyName)}
    </span>
  );
}

export function ShortcutCheatsheetModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups = getCheatsheetGroups();

  return (
    <div className="fixed inset-0 z-[10000]">
      <div className="absolute inset-0 bg-black/70" onMouseDown={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-3xl overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111113] shadow-2xl shadow-black/50"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
            <div>
              <div className="text-[14px] leading-[1.4] font-semibold text-slate-100">Keyboard Shortcuts</div>
              <div className="text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">
                Overlay Editor shortcuts and interaction modifiers
              </div>
            </div>
            <button onClick={onClose} className={uiClasses.buttonGhost}>
              Close
            </button>
          </div>

          <div className="grid max-h-[70vh] grid-cols-1 gap-0 overflow-y-auto md:grid-cols-2">
            {groups.map((group) => (
              <section key={group.category} className="border-b border-[rgba(255,255,255,0.06)] p-4">
                <h3 className="mb-3 text-[11px] uppercase tracking-[0.08em] text-slate-500">{group.category}</h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut) => (
                    <div key={shortcut.id} className="flex items-center justify-between gap-4 rounded-md border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                      <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-200">{shortcut.label}</div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {shortcut.keys.map((key) => (
                          <Keycap key={`${shortcut.id}-${key}`} keyName={key} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
