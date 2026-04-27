// src/shared/variables.test.ts
// Feature: overlay-editor-v3, Task 6: Custom Variables
// Tests for Properties 8 and 9 from the design spec.

import { resolveBinding, partialUpdateVariable } from "./bindingEngine";
import type { OverlayVariable, DynamicBinding } from "./overlayTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVar(name: string, value: string | number | boolean, type: OverlayVariable["type"] = "text"): OverlayVariable {
  return { id: `id-${name}`, name, type, value, defaultValue: value };
}

function makeBinding(name: string): DynamicBinding {
  return { mode: "dynamic", sourceId: "custom_variables", fieldId: name, fallback: null };
}

// ── Property 8: Variable binding round-trip ───────────────────────────────────

describe("resolveBinding — custom_variables (Property 8)", () => {
  test("resolves a text variable by name", () => {
    const config = { variables: [makeVar("myScore", "42")] };
    const result = resolveBinding(makeBinding("myScore"), {}, config);
    expect(result).toBe("42");
  });

  test("resolves a number variable", () => {
    const config = { variables: [makeVar("count", 99, "number")] };
    const result = resolveBinding(makeBinding("count"), {}, config);
    expect(result).toBe(99);
  });

  test("resolves a boolean variable", () => {
    const config = { variables: [makeVar("active", true, "boolean")] };
    const result = resolveBinding(makeBinding("active"), {}, config);
    expect(result).toBe(true);
  });

  test("returns fallback when variable not found", () => {
    const config = { variables: [makeVar("other", "x")] };
    const binding = { ...makeBinding("missing"), fallback: "DEFAULT" };
    const result = resolveBinding(binding, {}, config);
    expect(result).toBe("DEFAULT");
  });

  test("returns fallback when config has no variables", () => {
    const binding = { ...makeBinding("x"), fallback: "FB" };
    const result = resolveBinding(binding, {}, {});
    expect(result).toBe("FB");
  });

  test("returns fallback when config is undefined", () => {
    const binding = { ...makeBinding("x"), fallback: "FB" };
    const result = resolveBinding(binding, {});
    expect(result).toBe("FB");
  });

  // Property 8: round-trip for various value types
  test("property-based: round-trip for 100 random string values", () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 100; i++) {
      const name = "var" + i;
      const value = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const config = { variables: [makeVar(name, value)] };
      const result = resolveBinding(makeBinding(name), {}, config);
      expect(String(result)).toBe(String(value));
    }
  });

  test("property-based: round-trip for 100 random number values", () => {
    for (let i = 0; i < 100; i++) {
      const name = "numVar" + i;
      const value = Math.floor(Math.random() * 100000);
      const config = { variables: [makeVar(name, value, "number")] };
      const result = resolveBinding(makeBinding(name), {}, config);
      expect(result).toBe(value);
    }
  });
});

// ── Property 9: Variable partial update isolation ─────────────────────────────

describe("partialUpdateVariable (Property 9)", () => {
  test("updates only the target variable", () => {
    const vars = [makeVar("a", "1"), makeVar("b", "2"), makeVar("c", "3")];
    const updated = partialUpdateVariable(vars, "b", "UPDATED");
    expect(updated.find(v => v.name === "b")?.value).toBe("UPDATED");
    expect(updated.find(v => v.name === "a")?.value).toBe("1");
    expect(updated.find(v => v.name === "c")?.value).toBe("3");
  });

  test("returns same length array", () => {
    const vars = [makeVar("x", "1"), makeVar("y", "2")];
    const updated = partialUpdateVariable(vars, "x", "new");
    expect(updated).toHaveLength(2);
  });

  test("does not mutate original array", () => {
    const vars = [makeVar("x", "1")];
    const updated = partialUpdateVariable(vars, "x", "new");
    expect(vars[0].value).toBe("1");
    expect(updated[0].value).toBe("new");
  });

  test("no-op when name not found", () => {
    const vars = [makeVar("a", "1")];
    const updated = partialUpdateVariable(vars, "missing", "x");
    expect(updated[0].value).toBe("1");
  });

  // Property 9: all other variables unchanged across 100 random trials
  test("property-based: N-1 variables unchanged after single update (100 trials)", () => {
    for (let trial = 0; trial < 100; trial++) {
      const n = 2 + Math.floor(Math.random() * 9); // 2..10
      const vars = Array.from({ length: n }, (_, i) => makeVar(`v${i}`, `val${i}`));
      const targetIdx = Math.floor(Math.random() * n);
      const targetName = vars[targetIdx].name;
      const updated = partialUpdateVariable(vars, targetName, "newValue");

      for (let i = 0; i < n; i++) {
        if (i === targetIdx) {
          expect(updated[i].value).toBe("newValue");
        } else {
          expect(updated[i].value).toBe(vars[i].value);
        }
      }
    }
  });
});
