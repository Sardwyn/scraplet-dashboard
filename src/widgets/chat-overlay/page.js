// src/widgets/chat-overlay/page.js
import express from "express";
import { getWidgetByPublicId } from "./service.js";
import { renderChatOverlayPage } from "./renderer.js";

const router = express.Router();

router.get("/obs/chat/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) return res.status(404).send("Not found");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(renderChatOverlayPage({ publicId, widget: w }));
  } catch (e) {
    console.error("[chat-overlay/page] render failed:", e);
    return res.status(500).send("Overlay failed");
  }
});

export default router;
