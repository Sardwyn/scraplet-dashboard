// src/widgets/blackjack/page.js
import express from "express";
import { getWidgetByPublicId } from "./service.js";
import { renderBlackjackOverlayPage } from "./renderer.js";

const router = express.Router();

// OBS browser source entry
router.get("/obs/blackjack/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) {
      return res.status(404).send("Not found");
    }

    return res.status(200).send(
      renderBlackjackOverlayPage({
        publicId,
        widget: w,
      })
    );
  } catch (e) {
    console.error("[blackjack/page] render failed:", e?.message || e);
    return res.status(500).send("Render failed");
  }
});

export default router;
