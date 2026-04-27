import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isRuntime = process.env.BUILD_TARGET === "runtime";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  base: "/static/overlays/",
  build: {
    outDir: path.resolve(__dirname, "public/static/overlays"),
    emptyOutDir: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: isRuntime
      ? {
          // Runtime: single entry, inline everything — OBS gets one self-contained file
          input: {
            "overlay-runtime": path.resolve(__dirname, "src/overlay-runtime/main.tsx"),
          },
          output: {
            entryFileNames: "[name].bundle.js",
            assetFileNames: "[name].[ext]",
            inlineDynamicImports: false,
            manualChunks: () => "overlay-runtime",
          },
        }
      : {
          // Editor: two entries, chunking is fine (browser tab, not OBS)
          input: {
            "overlay-editor": path.resolve(__dirname, "src/overlay-editor/main.tsx"),
            "overlay-runtime": path.resolve(__dirname, "src/overlay-runtime/main.tsx"),
          },
          output: {
            entryFileNames: "[name].bundle.js",
            assetFileNames: "[name].[ext]",
          },
        },
  },
});
