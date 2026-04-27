import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  description?: string;
  disabledMessage?: string;
  disabled?: boolean;
  children: React.ReactElement;
}

const MARGIN = 8; // min gap from viewport edge

export function Tooltip({ label, description, disabledMessage, disabled, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ cx: 0, bottom: 0, top: 0 });
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setAnchor({ cx: r.left + r.width / 2, bottom: r.bottom, top: r.top });
    setVisible(true);
  }, []);

  // After the tooltip renders, clamp its position to the viewport
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;
    const tip = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer below; flip above if not enough room
    const fitsBelow = anchor.bottom + 6 + tip.height + MARGIN <= vh;
    const top = fitsBelow ? anchor.bottom + 6 : anchor.top - tip.height - 6;

    // Clamp horizontal so tooltip stays inside viewport
    let left = anchor.cx - tip.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - tip.width - MARGIN));

    setStyle({ left, top });
  }, [visible, anchor]);

  const body = disabled && disabledMessage ? disabledMessage : description;

  return (
    <>
      <span
        ref={triggerRef}
        className="contents"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onFocus={show}
        onBlur={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={style}
            className="pointer-events-none fixed z-[9999] max-w-[200px] rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1e]/95 px-2.5 py-1.5 shadow-xl shadow-black/40 backdrop-blur-sm"
          >
            <p className="text-[11px] font-medium leading-[1.4] tracking-[-0.01em] text-slate-100">{label}</p>
            {body && (
              <p className={`mt-0.5 text-[10px] leading-[1.4] ${disabled ? "text-amber-400/80" : "text-slate-400"}`}>
                {body}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
