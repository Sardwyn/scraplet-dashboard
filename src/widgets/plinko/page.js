// src/widgets/plinko/page.js
import express from "express";
import { getWidgetByPublicId } from "./service.js";
import { renderPlinkoOverlayPage } from "./renderer.js";

const router = express.Router();

router.get("/obs/plinko/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) return res.status(404).send("Not found");

    const html = renderPlinkoOverlayPage({ publicId, widget: w });
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (e) {
    console.error("[plinko] page_failed", e?.message || e);
    return res.status(500).send("error");
  }
});

export default router;
