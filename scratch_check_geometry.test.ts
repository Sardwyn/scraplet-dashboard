import { test, expect } from "vitest";
import pg from "pg";
import { resolveElementRings } from "./src/shared/geometry/pathBoolean";
import { elementToOverlayPath, flattenPath } from "./src/shared/geometry/pathUtils";
import type { OverlayElement } from "./src/shared/overlayTypes";

test("check geometry rings", async () => {
  const client = new pg.Client({
    connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
  });
  await client.connect();
  console.log("DB connected!");

  const res = await client.query(
    "SELECT config_json FROM public.overlays WHERE id = 2;"
  );
  const elements = res.rows[0].config_json.elements as OverlayElement[];

  const elementsById: Record<string, OverlayElement> = {};
  for (const el of elements) {
    elementsById[el.id] = el;
  }

  const booleanEl = elements.find(el => el.type === "boolean");
  expect(booleanEl).toBeDefined();

  const childIds = (booleanEl as any).childIds;
  console.log("Child IDs:", childIds);

  const ravenEl = elementsById[childIds[0]];
  const leftEyeEl = elementsById[childIds[1]];
  const rightEyeEl = elementsById[childIds[2]];

  console.log("Raven element type:", ravenEl.type, "width:", ravenEl.width, "height:", ravenEl.height);
  const { getPathBounds } = await import("./src/shared/geometry/pathUtils");
  const rawBounds = getPathBounds(ravenEl.path);
  console.log("Raven raw path bounds:", rawBounds);

  const ravenPath = elementToOverlayPath(ravenEl);
  console.log("Raven path commands count:", ravenPath?.commands.length);
  const scaledBounds = getPathBounds(ravenPath!);
  console.log("Raven scaled path bounds:", scaledBounds);

  const ravenRings = resolveElementRings(ravenEl);
  console.log("Raven resolved rings count:", ravenRings.length);
  if (ravenRings.length > 0) {
    console.log("Raven Ring 0 points count:", ravenRings[0].length);
    console.log("Raven Ring 0 point 0:", ravenRings[0][0]);
    console.log("Raven Ring 0 point 10:", ravenRings[0][10]);
  }


  console.log("Left eye element shape:", (leftEyeEl as any).shape, "width:", leftEyeEl.width, "height:", leftEyeEl.height);
  const leftEyeRings = resolveElementRings(leftEyeEl);
  console.log("Left eye resolved rings count:", leftEyeRings.length);

  const { resolveElementGeometry } = await import("./src/shared/geometry/resolveGeometry");
  const resolved = resolveElementGeometry(booleanEl, elementsById);
  console.log("Resolved geometry bounds:", resolved?.bounds);
  console.log("Resolved geometry commands count:", resolved?.path.commands.length);
  if (resolved) {
    console.log("Resolved commands:", JSON.stringify(resolved.path.commands, null, 2));
  }

  await client.end();
});

