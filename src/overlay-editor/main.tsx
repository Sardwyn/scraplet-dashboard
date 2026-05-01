import React from "react";
import { createRoot } from "react-dom/client";
import OverlayEditorApp from "./OverlayEditorWithPerformanceMode";
import "../overlay-runtime/widgetRenderers"; // registers React renderers for all widget types
import { OverlayConfigV0 } from "../shared/overlayTypes";

declare global {
  interface Window {
    __OVERLAY__?: {
      id: number;
      name: string;
      slug: string;
      public_id: string;
      config_json: OverlayConfigV0;
    };
  }
}

const container = document.getElementById("overlay-editor-root");
const bootstrapData = window.__OVERLAY__;

console.log("[OverlayEditor] container =", container);
console.log("[OverlayEditor] overlay =", bootstrapData);

if (!container) {
  console.error("[OverlayEditor] #overlay-editor-root not found");
} else if (!bootstrapData) {
  console.error("[OverlayEditor] window.__OVERLAY__ is missing");
} else {
  const root = createRoot(container);
  root.render(<OverlayEditorApp initialOverlay={bootstrapData} />);
}
