// src/widgets/crash/dashboardApi.js
import express from "express";
import requireAuth from "../../../utils/requireAuth.js";
import { getOrCreateUserCrashWidget, updateUserCrashWidgetConfig } from "./service.js";

const router = express.Router();

router.get("/dashboard/api/widgets/crash/config", requireAuth, async (req, res) => {
  try {
    const ownerUserId = req.user?.id;
    const row = await getOrCreateUserCrashWidget(ownerUserId);
    return res.json({ ok: true, config: row?.config_json || {} });
  } catch (err) {
    console.error("[crash.dashboardApi] GET config error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.post(
  "/dashboard/api/widgets/crash/config",
  requireAuth,
  express.json({ limit: "256kb" }),
  async (req, res) => {
    try {
      const ownerUserId = req.user?.id;
      const patch = req.body || {};
      const row = await updateUserCrashWidgetConfig(ownerUserId, patch);
      return res.json({ ok: true, config: row?.config_json || {} });
    } catch (err) {
      console.error("[crash.dashboardApi] POST config error", err);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

export default router;
