// src/widgets/plinko/index.js
import plinkoApi from "./api.js";
import plinkoDashboardApi from "./dashboardApi.js";
import { renderPlinkoOverlayPage } from "./renderer.js";
import { getWidgetByPublicId } from "./service.js";

export function registerPlinko(app) {
  app.use(plinkoApi);
  app.use(plinkoDashboardApi);

  app.get("/obs/plinko/:publicId", async (req, res) => {
    const { publicId } = req.params;
    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) return res.status(404).send("Not found");
    return res.send(renderPlinkoOverlayPage({ publicId, widget: w }));
  });
}
