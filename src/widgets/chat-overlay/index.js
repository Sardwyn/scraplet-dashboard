// src/widgets/chat-overlay/index.js
import api from "./api.js";
import page from "./page.js";

export function registerChatOverlay(app) {
  app.use(api);
  app.use(page);
}
