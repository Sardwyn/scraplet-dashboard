// src/widgets/chat-overlay/index.js
import pageRouter from "./page.js";
import apiRouter from "./api.js";

/**
 * Registers the Chat Overlay widget routes.
 * - Page:  /obs/chat/:publicId
 * - API:   /api/obs/chat/:publicId/poll
 *          /api/obs/chat/:publicId/ingest
 */
export function registerChatOverlay(app) {
  // Order doesn't matter here; just mount both.
  app.use(pageRouter);
  app.use(apiRouter);

  console.log("[chat-overlay] routes registered:", {
    page: "/obs/chat/:publicId",
    poll: "/api/obs/chat/:publicId/poll",
    ingest: "/api/obs/chat/:publicId/ingest",
  });
}
