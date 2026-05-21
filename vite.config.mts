/**
 * Default Vite config for non-overlay builds.
 * Overlay bundles: use vite.overlays.config.ts via `npm run build:overlays`.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
