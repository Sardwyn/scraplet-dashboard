import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  // 🔧 Disable Vite's publicDir copying – we'll just use existing /public as-is
  publicDir: false,
  build: {
    // Put overlay bundles in their own folder under /public/static
    outDir: path.resolve(__dirname, "public/static/overlays"),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        "overlay-editor": path.resolve(
          __dirname,
          "src/overlay-editor/main.tsx"
        ),
        "overlay-runtime": path.resolve(
          __dirname,
          "src/overlay-runtime/main.tsx"
        ),
      },
      output: {
        entryFileNames: "[name].bundle.js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
