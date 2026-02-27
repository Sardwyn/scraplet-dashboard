import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  // CRITICAL: prevent Vite from copying /public into outDir
  // because outDir is inside /public (otherwise infinite recursion)
  publicDir: false,

  build: {
    outDir: path.resolve(__dirname, "public/static/overlays"),
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        "overlay-runtime": path.resolve(__dirname, "src/overlay-runtime/main.tsx"),
        "overlay-editor": path.resolve(__dirname, "src/overlay-editor/main.tsx"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "overlay-runtime") return "overlay-runtime.bundle.js";
          if (chunk.name === "overlay-editor") return "overlay-editor.bundle.js";
          return "[name].bundle.js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
