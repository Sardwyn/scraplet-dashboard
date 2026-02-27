// src/widgets/plinko/dashboardApi.js
import express from "express";
import requireAuth from "../../../utils/requireAuth.js";
import { getOrCreateUserPlinko, updatePlinkoConfig } from "./service.js";

const router = express.Router();

router.get("/dashboard/api/widgets/plinko/config", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;
    const w = await getOrCreateUserPlinko(ownerUserId);
    return res.json({ ok: true, config: w.config_json || {}, widget: w });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post(
  "/dashboard/api/widgets/plinko/config",
  requireAuth,
  express.json({ limit: "256kb" }),
  async (req, res) => {
    try {
      const ownerUserId = req.session.user.id;

      // Accept multiple shapes:
      // 1) { patch: {...} }  (original expected)
      // 2) { config: {...} } (common pattern in dashboards)
      // 3) { ...configKeys } (posting the whole config directly)
      const patch =
        req.body && typeof req.body === "object"
          ? (req.body.patch ?? req.body.config ?? req.body)
          : {};

      // If someone accidentally posted { patch: { patch: {...}} }, unwrap once.
      const normalizedPatch =
        patch && typeof patch === "object" && patch.patch ? patch.patch : patch;

      const updated = await updatePlinkoConfig(ownerUserId, normalizedPatch);
      return res.json({ ok: true, widget: updated });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

export default router;
