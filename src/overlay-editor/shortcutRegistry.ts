export type ShortcutCategory =
  | "Canvas"
  | "Selection"
  | "Transform"
  | "Layers"
  | "Timeline"
  | "Edit";

export type ShortcutKey =
  | "Ctrl"
  | "Cmd"
  | "Shift"
  | "Alt"
  | "Space"
  | "Drag"
  | "Wheel"
  | "?"
  | "G"
  | "A"
  | "0"
  | "1"
  | "2"
  | "+"
  | "-"
  | "D"
  | "Delete"
  | "Backspace"
  | "Click"
  | "Double Click"
  | "Arrow"
  | "Esc"
  | "S"
  | "Z";

export type ShortcutDef = {
  id: string;
  category: ShortcutCategory;
  label: string;
  keys: ShortcutKey[];
  match?:
    | {
        key?: string;
        code?: string;
        ctrlOrMeta?: boolean;
        shift?: boolean;
        alt?: boolean;
      }
    | Array<{
        key?: string;
        code?: string;
        ctrlOrMeta?: boolean;
        shift?: boolean;
        alt?: boolean;
      }>;
  showInCheatsheet?: boolean;
  showInTooltip?: boolean;
};

export const shortcutRegistry: ShortcutDef[] = [
  { id: "show-shortcuts", category: "Edit", label: "Show Keyboard Shortcuts", keys: ["?"], match: { key: "?" }, showInCheatsheet: true },
  { id: "pan-canvas", category: "Canvas", label: "Pan Canvas", keys: ["Space", "Drag"], showInCheatsheet: true },
  { id: "toggle-grid", category: "Canvas", label: "Toggle Grid", keys: ["G"], match: { key: "g", ctrlOrMeta: false, shift: false, alt: false }, showInCheatsheet: true },
  { id: "zoom-canvas", category: "Canvas", label: "Zoom Canvas", keys: ["Ctrl", "Wheel"], showInCheatsheet: true },
  { id: "zoom-fit", category: "Canvas", label: "Fit to Screen", keys: ["Ctrl", "0"], match: { key: "0", ctrlOrMeta: true }, showInCheatsheet: true, showInTooltip: true },
  { id: "zoom-100", category: "Canvas", label: "Zoom to 100%", keys: ["Ctrl", "1"], match: { key: "1", ctrlOrMeta: true }, showInCheatsheet: true, showInTooltip: true },
  { id: "zoom-selection", category: "Canvas", label: "Zoom to Selection", keys: ["Shift", "2"], match: { code: "Digit2", shift: true }, showInCheatsheet: true },
  { id: "marquee-select", category: "Selection", label: "Marquee Select", keys: ["Drag"], showInCheatsheet: true },
  { id: "add-selection", category: "Selection", label: "Add to Selection", keys: ["Shift", "Click"], showInCheatsheet: true },
  { id: "select-matching", category: "Selection", label: "Select Matching Layers", keys: ["Ctrl", "Alt", "A"], match: { key: "a", ctrlOrMeta: true, alt: true }, showInCheatsheet: true },
  { id: "nudge", category: "Transform", label: "Nudge 1px", keys: ["Arrow"], showInCheatsheet: true },
  { id: "nudge-fast", category: "Transform", label: "Nudge 10px", keys: ["Shift", "Arrow"], showInCheatsheet: true },
  { id: "axis-lock", category: "Transform", label: "Lock Drag Axis", keys: ["Shift", "Drag"], showInCheatsheet: true },
  { id: "duplicate-drag", category: "Transform", label: "Duplicate While Dragging", keys: ["Alt", "Drag"], showInCheatsheet: true },
  { id: "resize-center", category: "Transform", label: "Resize from Center", keys: ["Alt", "Drag"], showInCheatsheet: true },
  { id: "resize-proportional", category: "Transform", label: "Maintain Aspect Ratio", keys: ["Shift", "Drag"], showInCheatsheet: true },
  { id: "free-rotate", category: "Transform", label: "Disable Rotation Snapping", keys: ["Alt", "Drag"], showInCheatsheet: true },
  { id: "group", category: "Layers", label: "Group Selection", keys: ["Ctrl", "G"], match: { key: "g", ctrlOrMeta: true, shift: false }, showInCheatsheet: true, showInTooltip: true },
  { id: "ungroup", category: "Layers", label: "Ungroup Selection", keys: ["Ctrl", "Shift", "G"], match: { key: "g", ctrlOrMeta: true, shift: true }, showInCheatsheet: true, showInTooltip: true },
  { id: "rename-layer", category: "Layers", label: "Rename Layer", keys: ["Double Click"], showInCheatsheet: true },
  { id: "timeline-add-keyframe", category: "Timeline", label: "Add Keyframe at Cursor", keys: ["Double Click"], showInCheatsheet: true },
  { id: "timeline-duplicate-keyframe", category: "Timeline", label: "Duplicate Keyframe", keys: ["Alt", "Drag"], showInCheatsheet: true },
  { id: "duplicate", category: "Edit", label: "Duplicate Selection", keys: ["Ctrl", "D"], match: { key: "d", ctrlOrMeta: true }, showInCheatsheet: true, showInTooltip: true },
  { id: "undo", category: "Edit", label: "Undo", keys: ["Ctrl", "Z"], showInCheatsheet: true, showInTooltip: true },
  { id: "redo", category: "Edit", label: "Redo", keys: ["Ctrl", "Shift", "Z"], showInCheatsheet: true, showInTooltip: true },
  { id: "save", category: "Edit", label: "Save", keys: ["Ctrl", "S"], showInCheatsheet: true },
  { id: "zoom-in", category: "Canvas", label: "Zoom In", keys: ["Ctrl", "+"], showInCheatsheet: true },
  { id: "zoom-out", category: "Canvas", label: "Zoom Out", keys: ["Ctrl", "-"], showInCheatsheet: true },
  { id: "escape", category: "Edit", label: "Cancel / Deselect", keys: ["Esc"], showInCheatsheet: true },
  { id: "undo", category: "Edit", label: "Undo", keys: ["Ctrl", "Z"], showInCheatsheet: true, showInTooltip: true },
  { id: "redo", category: "Edit", label: "Redo", keys: ["Ctrl", "Shift", "Z"], showInCheatsheet: true, showInTooltip: true },
  { id: "save", category: "Edit", label: "Save", keys: ["Ctrl", "S"], showInCheatsheet: true },
  { id: "zoom-in", category: "Canvas", label: "Zoom In", keys: ["Ctrl", "+"], showInCheatsheet: true },
  { id: "zoom-out", category: "Canvas", label: "Zoom Out", keys: ["Ctrl", "-"], showInCheatsheet: true },
  { id: "escape", category: "Edit", label: "Cancel / Deselect", keys: ["Esc"], showInCheatsheet: true },
  { id: "delete", category: "Edit", label: "Delete Selection", keys: ["Delete"], showInCheatsheet: true, showInTooltip: true },
];

const keyLabels: Record<string, string> = {
  Ctrl: "Ctrl",
  Cmd: "Cmd",
  Shift: "Shift",
  Alt: "Alt",
  Space: "Space",
  Drag: "Drag",
  Wheel: "Wheel",
  "?": "?",
  G: "G",
  "0": "0",
  "1": "1",
  "2": "2",
  "+": "+",
  "-": "-",
  D: "D",
  Delete: "Del",
  Backspace: "Bksp",
  Click: "Click",
  "Double Click": "Double Click",
  Arrow: "Arrow",
  Esc: "Esc",
  A: "A",
};

export function getShortcutDef(id: string) {
  return shortcutRegistry.find((shortcut) => shortcut.id === id) ?? null;
}

export function getShortcutDisplayKeys(id: string) {
  return getShortcutDef(id)?.keys ?? [];
}

export function formatShortcutTooltip(id: string, fallbackLabel?: string) {
  const shortcut = getShortcutDef(id);
  const label = fallbackLabel ?? shortcut?.label ?? "";
  if (!shortcut || shortcut.showInTooltip === false) return label;
  const combo = shortcut.keys.map((key) => keyLabels[key] ?? key).join(" + ");
  return combo ? `${label}\n${combo}` : label;
}

export function getShortcutCategories() {
  return ["Canvas", "Selection", "Transform", "Layers", "Timeline", "Edit"] as ShortcutCategory[];
}

export function getCheatsheetGroups() {
  return getShortcutCategories()
    .map((category) => ({
      category,
      shortcuts: shortcutRegistry.filter(
        (shortcut) => shortcut.category === category && shortcut.showInCheatsheet !== false
      ),
    }))
    .filter((group) => group.shortcuts.length > 0);
}

export function getKeycapLabel(key: ShortcutKey) {
  return keyLabels[key] ?? key;
}

export function shortcutMatchesEvent(id: string, event: KeyboardEvent) {
  const shortcut = getShortcutDef(id);
  if (!shortcut?.match) return false;

  const candidates = Array.isArray(shortcut.match) ? shortcut.match : [shortcut.match];
  return candidates.some((candidate) => {
    if (candidate.key && event.key.toLowerCase() !== candidate.key.toLowerCase()) return false;
    if (candidate.code && event.code !== candidate.code) return false;
    if (candidate.ctrlOrMeta !== undefined && (event.ctrlKey || event.metaKey) !== candidate.ctrlOrMeta) return false;
    if (candidate.shift !== undefined && event.shiftKey !== candidate.shift) return false;
    if (candidate.alt !== undefined && event.altKey !== candidate.alt) return false;
    return true;
  });
}
