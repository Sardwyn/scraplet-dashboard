// src/domains/casino/crash/routes.js
import express from "express";
import { getLatestCrashState } from "./service.js";

const router = express.Router();

router.get("/api/obs/casino/crash/state", async (req, res) => {
  try {
    const platform = String(req.query.platform || "kick").trim().toLowerCase();
    const channel_id = String(req.query.channel_id || "").trim();
    const username = req.query.username ? String(req.query.username).trim() : null;

    if (!platform || !channel_id) {
      return res.status(400).json({ ok: false, error: "missing platform/channel_id" });
    }

    const state = await getLatestCrashState({ platform, channel_id, username });
    return res.json(state);
  } catch (err) {
    console.error("[crash.state] error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

export default router;
