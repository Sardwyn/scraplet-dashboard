// src/widgets/roulette/index.js
import rouletteApi from "./api.js";
import rouletteDashboardApi from "./dashboardApi.js";
import { renderRouletteOverlayPage } from "./renderer.js";
import { getWidgetByPublicId } from "./service.js";
import { startRouletteReconciler } from "./server/queue-manager.js";

export function registerRoulette(app) {
  // Start restart-recovery reconciler once when the widget is registered
  startRouletteReconciler();

  app.use(rouletteApi);
  app.use(rouletteDashboardApi);

  app.get("/obs/roulette/:publicId", async (req, res) => {
    const { publicId } = req.params;
    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) return res.status(404).send("Not found");
    return res.send(renderRouletteOverlayPage({ publicId, widget: w }));
  });
}
