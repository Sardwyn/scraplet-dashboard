// src/widgets/roulette/dashboardApi.js
import express from "express";
import requireAuth from "../../../utils/requireAuth.js";
import { getOrCreateUserRoulette, updateRouletteConfig } from "./service.js";

const router = express.Router();

router.get("/dashboard/api/widgets/roulette/config", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;
    const w = await getOrCreateUserRoulette(ownerUserId);
    return res.json({ ok: true, config: w.config_json || {}, widget: w });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/dashboard/api/widgets/roulette/config", requireAuth, express.json({ limit: "256kb" }), async (req, res) => {
  try {
    const ownerUserId = req.session.user.id;
    const patch = req.body?.patch || {};
    const updated = await updateRouletteConfig(ownerUserId, patch);
    return res.json({ ok: true, widget: updated });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
