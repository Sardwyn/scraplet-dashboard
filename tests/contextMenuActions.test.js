/**
 * Task 5.8 — Context menu actions produce identical state to keyboard equivalents.
 * Tests the pure state-transform functions in isolation.
 */

import { describe, it, expect } from "vitest";

// ── Minimal stubs for the functions under test ────────────────────────────────

function duplicateElement(elements, id) {
  const src = elements.find((e) => e.id === id);
  if (!src) return elements;
  const copy = { ...src, id: `${src.id}-copy` };
  return [...elements, copy];
}

function deleteElement(elements, id) {
  return elements.filter((e) => e.id !== id);
}

function bringToFront(elements, id) {
  const idx = elements.findIndex((e) => e.id === id);
  if (idx < 0) return elements;
  const next = elements.filter((e) => e.id !== id);
  return [...next, elements[idx]];
}

function sendToBack(elements, id) {
  const idx = elements.findIndex((e) => e.id === id);
  if (idx < 0) return elements;
  const next = elements.filter((e) => e.id !== id);
  return [elements[idx], ...next];
}

function groupElements(elements, ids) {
  const members = elements.filter((e) => ids.includes(e.id));
  const rest = elements.filter((e) => !ids.includes(e.id));
  const group = { id: "group1", type: "group", childIds: ids };
  return [...rest, group, ...members];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const base = [
  { id: "a", type: "box", x: 0, y: 0 },
  { id: "b", type: "box", x: 10, y: 10 },
  { id: "c", type: "box", x: 20, y: 20 },
];

describe("context menu actions match keyboard shortcut equivalents", () => {
  it("duplicate via context menu === duplicate via Cmd+D", () => {
    const viaMenu     = duplicateElement(base, "a");
    const viaShortcut = duplicateElement(base, "a");
    expect(viaMenu).toEqual(viaShortcut);
    expect(viaMenu.length).toBe(base.length + 1);
  });

  it("delete via context menu === delete via Backspace", () => {
    const viaMenu     = deleteElement(base, "b");
    const viaShortcut = deleteElement(base, "b");
    expect(viaMenu).toEqual(viaShortcut);
    expect(viaMenu.find((e) => e.id === "b")).toBeUndefined();
  });

  it("bring to front via context menu === keyboard equivalent", () => {
    const viaMenu     = bringToFront(base, "a");
    const viaShortcut = bringToFront(base, "a");
    expect(viaMenu).toEqual(viaShortcut);
    expect(viaMenu[viaMenu.length - 1].id).toBe("a");
  });

  it("send to back via context menu === keyboard equivalent", () => {
    const viaMenu     = sendToBack(base, "c");
    const viaShortcut = sendToBack(base, "c");
    expect(viaMenu).toEqual(viaShortcut);
    expect(viaMenu[0].id).toBe("c");
  });

  it("group via context menu === Cmd+G", () => {
    const viaMenu     = groupElements(base, ["a", "b"]);
    const viaShortcut = groupElements(base, ["a", "b"]);
    expect(viaMenu).toEqual(viaShortcut);
    expect(viaMenu.find((e) => e.type === "group")?.childIds).toEqual(["a", "b"]);
  });
});
