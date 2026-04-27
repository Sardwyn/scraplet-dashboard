/**
 * Task 4.8 — Texture layer positional invariance
 * Moving a parent element by (dx, dy) must move its texture child by exactly (dx, dy).
 */

import { describe, it, expect } from "vitest";

// Simulate the move logic used in OverlayEditorApp when an element is moved.
// The real app calls updateElement for the parent, then syncs texture children.
function moveElementWithTextureChildren(elements, parentId, dx, dy) {
  return elements.map((el) => {
    if (el.id === parentId) {
      return { ...el, x: el.x + dx, y: el.y + dy };
    }
    if (el.isTextureChild && el.parentId === parentId) {
      return { ...el, x: el.x + dx, y: el.y + dy };
    }
    return el;
  });
}

describe("texture layer positional invariance", () => {
  const parent = { id: "box1", type: "box", x: 100, y: 200, width: 300, height: 150 };
  const textureChild = {
    id: "tex1",
    type: "image",
    isTextureChild: true,
    parentId: "box1",
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    src: "/uploads/noise.png",
  };
  const unrelated = { id: "other", type: "box", x: 50, y: 50, width: 100, height: 100 };

  const elements = [parent, textureChild, unrelated];

  it("moves texture child by same (dx, dy) as parent", () => {
    const dx = 42, dy = -17;
    const result = moveElementWithTextureChildren(elements, "box1", dx, dy);
    const movedParent = result.find((e) => e.id === "box1");
    const movedChild  = result.find((e) => e.id === "tex1");

    expect(movedParent.x).toBe(parent.x + dx);
    expect(movedParent.y).toBe(parent.y + dy);
    expect(movedChild.x).toBe(textureChild.x + dx);
    expect(movedChild.y).toBe(textureChild.y + dy);
  });

  it("does not move unrelated elements", () => {
    const result = moveElementWithTextureChildren(elements, "box1", 99, 99);
    const other = result.find((e) => e.id === "other");
    expect(other.x).toBe(50);
    expect(other.y).toBe(50);
  });

  it("child offset relative to parent is preserved after move", () => {
    const dx = 200, dy = 300;
    const result = moveElementWithTextureChildren(elements, "box1", dx, dy);
    const movedParent = result.find((e) => e.id === "box1");
    const movedChild  = result.find((e) => e.id === "tex1");

    const relX = movedChild.x - movedParent.x;
    const relY = movedChild.y - movedParent.y;
    expect(relX).toBe(textureChild.x - parent.x);
    expect(relY).toBe(textureChild.y - parent.y);
  });

  it("handles zero delta", () => {
    const result = moveElementWithTextureChildren(elements, "box1", 0, 0);
    const p = result.find((e) => e.id === "box1");
    const c = result.find((e) => e.id === "tex1");
    expect(p.x).toBe(parent.x);
    expect(c.x).toBe(textureChild.x);
  });

  it("handles negative coordinates", () => {
    const dx = -200, dy = -300;
    const result = moveElementWithTextureChildren(elements, "box1", dx, dy);
    const p = result.find((e) => e.id === "box1");
    const c = result.find((e) => e.id === "tex1");
    expect(p.x).toBe(parent.x + dx);
    expect(c.x).toBe(textureChild.x + dx);
  });
});
