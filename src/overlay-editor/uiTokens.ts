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
  fieldLabel: "text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500",
  field:
    "h-7 min-w-0 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-200 transition-colors hover:bg-[#1d1d20] focus:border-indigo-500/70 focus:outline-none",
  select:
    "h-7 min-w-0 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] pl-2 pr-8 text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-200 transition-colors hover:bg-[#1d1d20] focus:border-indigo-500/70 focus:outline-none appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_8px_center] bg-no-repeat cursor-pointer",
  button:
    "inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-3 text-[12px] leading-[1.4] tracking-[-0.02em] font-medium text-slate-200 transition-colors hover:bg-[#1d1d20]",
  buttonGhost:
    "inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-[rgba(255,255,255,0.06)] bg-transparent px-3 text-[12px] leading-[1.4] tracking-[-0.02em] font-medium text-slate-300 transition-colors hover:bg-[rgba(255,255,255,0.03)]",
  iconButton:
    "inline-flex items-center justify-center h-6 w-6 rounded-md border border-[rgba(255,255,255,0.06)] bg-transparent text-slate-400 transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-slate-100",
  layerRow:
    "group relative flex h-6 items-center gap-2 border-b border-[rgba(255,255,255,0.06)] pr-2 text-[13px] leading-[1.4] tracking-[-0.01em]",
  panelInset: "rounded-md border border-[rgba(255,255,255,0.06)] bg-[#161618]",
  timelineLane: "bg-[#0f1012]",
} as const;
