import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuAction {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface ContextMenuSection {
  items: ContextMenuAction[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  sections: ContextMenuSection[];
  onClose: () => void;
}

const MARGIN = 8;

export function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp to viewport after first render
  useLayoutEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: Math.min(x, vw - width - MARGIN),
      y: Math.min(y, vh - height - MARGIN),
    });
  }, [x, y]);

  // Close on outside click or Escape
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[9998] min-w-[180px] rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1e]/98 py-1 shadow-2xl shadow-black/50 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((section, si) => (
        <React.Fragment key={si}>
          {si > 0 && <div className="my-1 h-px bg-[rgba(255,255,255,0.07)]" />}
          {section.items.map((item, ii) => (
            <button
              key={ii}
              disabled={item.disabled}
              onClick={() => { item.onClick(); onClose(); }}
              className={[
                "flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[12px] leading-[1.4]",
                item.disabled
                  ? "cursor-default text-slate-600"
                  : item.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-slate-200 hover:bg-[rgba(255,255,255,0.06)]",
              ].join(" ")}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-slate-500">{item.shortcut}</span>
              )}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
}
