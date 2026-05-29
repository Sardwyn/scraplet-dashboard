import { test, expect } from "vitest";
import pg from "pg";
import { resolveElementGeometry } from "./src/shared/geometry/resolveGeometry";
import type { OverlayElement } from "./src/shared/overlayTypes";

test("check geometry", async () => {
  const client = new pg.Client({
    connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
  });
  await client.connect();
  console.log("DB connected!");

  const res = await client.query(
    "SELECT config_json FROM public.overlays WHERE id = 2;"
  );
  const elements = res.rows[0].config_json.elements as OverlayElement[];
  console.log("Total elements:", elements.length);

  const elementsById: Record<string, OverlayElement> = {};
  for (const el of elements) {
    elementsById[el.id] = el;
  }

  const booleanEl = elements.find(el => el.type === "boolean");
  expect(booleanEl).toBeDefined();

  console.log("Found boolean element:", booleanEl!.id, booleanEl!.name);
  console.log("Child IDs:", (booleanEl as any).childIds);

  const resolved = resolveElementGeometry(booleanEl!, elementsById);
  expect(resolved).not.toBeNull();

  console.log("Successfully resolved geometry!");
  console.log("Bounds:", resolved!.bounds);
  console.log("Commands count:", resolved!.path.commands.length);
  console.log("Commands (first 10):", resolved!.path.commands.slice(0, 10));

  await client.end();
});
