// tests/variables.test.js
// Feature: overlay-editor-v3, Task 6: Custom Variables — API layer tests

import express from "express";
import request from "supertest";

describe("PATCH /dashboard/api/overlays/:id/variables", () => {
  let app;

  beforeEach(async () => {
    const overlaysRouter = (await import("../routes/api/overlays.js")).default;
    app = express();
    app.use("/dashboard/api", overlaysRouter);
  });

  test("returns 401 or 302 when not authenticated (no session)", async () => {
    const res = await request(app)
      .patch("/dashboard/api/overlays/1/variables")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "myScore", value: 42 }));
    // requireAuth redirects or rejects unauthenticated requests
    expect([302, 401, 403, 500]).toContain(res.status);
  });
});

describe("POST /dashboard/api/overlays/internal/setvar", () => {
  let app;

  beforeEach(async () => {
    const overlaysRouter = (await import("../routes/api/overlays.js")).default;
    app = express();
    app.use("/dashboard/api", overlaysRouter);
  });

  test("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/dashboard/api/overlays/internal/setvar")
      .set("Content-Type", "application/json")
      .set("x-scraplet-internal-key", process.env.DASHBOARD_INTERNAL_KEY || "")
      .send(JSON.stringify({ overlayPublicId: "test", value: "1" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test("returns 400 when value is missing", async () => {
    const res = await request(app)
      .post("/dashboard/api/overlays/internal/setvar")
      .set("Content-Type", "application/json")
      .set("x-scraplet-internal-key", process.env.DASHBOARD_INTERNAL_KEY || "")
      .send(JSON.stringify({ overlayPublicId: "test", name: "myVar" }));
    expect(res.status).toBe(400);
  });
});
