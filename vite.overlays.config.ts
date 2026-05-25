import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const isRuntime = process.env.BUILD_TARGET === "runtime";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "write-build-stamp",
      closeBundle() {
        const stamp = { buildTime: Date.now(), built: new Date().toISOString() };
        fs.writeFileSync(
          path.resolve(__dirname, "public/static/overlays/build-stamp.json"),
          JSON.stringify(stamp)
        );
      },
    },
  ],

  publicDir: false,
  base: "/static/overlays/",

  build: {
    target: "chrome75",
    outDir: path.resolve(__dirname, "public/static/overlays"),
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: isRuntime
      ? {
          input: {
            "overlay-runtime": path.resolve(__dirname, "src/overlay-runtime/main.tsx"),
          },
          output: {
            format: "iife",
            name: "OverlayRuntime",
            entryFileNames: "[name].bundle.js",
            assetFileNames: "[name].[ext]",
            inlineDynamicImports: true,
          },
        }
      : {
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
