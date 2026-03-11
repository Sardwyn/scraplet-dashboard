export const uiTokens = {
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "24px",
    6: "32px",
    7: "40px",
    8: "48px",
  },
  control: {
    xs: "24px",
    sm: "28px",
    md: "32px",
    lg: "36px",
  },
  text: {
    xs: "11px",
    sm: "12px",
    md: "13px",
    lg: "14px",
  },
  border: {
    subtle: "rgba(255,255,255,0.06)",
    normal: "rgba(255,255,255,0.08)",
    strong: "rgba(255,255,255,0.12)",
  },
  hover: {
    soft: "rgba(255,255,255,0.03)",
    normal: "rgba(255,255,255,0.05)",
    active: "rgba(255,255,255,0.08)",
  },
  surface: {
    canvas: "#0b0b0c",
    panel: "#111113",
    control: "#161618",
    hover: "#1d1d20",
  },
} as const;

export const uiClasses = {
  shell: "bg-[#111113] border-[rgba(255,255,255,0.08)]",
  shellMuted: "bg-[#161618] border-[rgba(255,255,255,0.06)]",
  sectionHeader:
    "h-8 px-3 text-[11px] leading-[1.4] uppercase tracking-[0.08em] font-semibold text-slate-400",
  label:
    "text-[11px] leading-[1.4] text-slate-500 uppercase tracking-[0.08em] font-semibold",
  fieldLabel: "text-[11px] leading-[1.4] text-slate-500",
  field:
    "h-7 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[12px] leading-[1.4] text-slate-200 transition-colors hover:bg-[#1d1d20] focus:border-indigo-500 focus:outline-none",
  button:
    "h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-3 text-[12px] leading-[1.4] font-medium text-slate-200 transition-colors hover:bg-[#1d1d20]",
  buttonGhost:
    "h-8 rounded-md border border-[rgba(255,255,255,0.06)] bg-transparent px-3 text-[12px] leading-[1.4] font-medium text-slate-300 transition-colors hover:bg-[rgba(255,255,255,0.03)]",
  iconButton:
    "h-6 w-6 rounded-md border border-[rgba(255,255,255,0.06)] bg-transparent text-slate-400 transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-slate-100",
  layerRow:
    "group flex h-6 items-center gap-2 border-b border-[rgba(255,255,255,0.06)] pr-2 text-[13px] leading-[1.4] relative",
  panelInset: "rounded-md border border-[rgba(255,255,255,0.06)] bg-[#161618]",
  timelineLane: "bg-[#0f1012]",
} as const;
