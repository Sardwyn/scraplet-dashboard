// src/widgets/crash/index.js
import crashDashboardApi from "./dashboardApi.js";

/**
 * Crash widget registration
 *
 * IMPORTANT:
 * - Dashboard configure pages are owned by routes/dashboard.js (source of truth).
 * - This widget module should only mount API / internal routes here.
 * - Any public renderer routes (OBS) can be mounted elsewhere explicitly when you add them.
 */
export function registerCrash(app) {
  app.use(crashDashboardApi);
}
