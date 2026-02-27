// src/widgets/blackjack/index.js
import api from "./api.js";
import page from "./page.js";

export function registerBlackjack(app) {
  app.use(api);
  app.use(page);
}
