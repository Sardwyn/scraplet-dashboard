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
    testOverlayData?: any;
    performanceMetrics?: {
      frameTimes: number[];
      operations: Record<string, any>;
    };
  }
}

const container = document.getElementById("overlay-editor-root");
const bootstrapData = window.__OVERLAY__;

// Check if we're in test mode
const urlParams = new URLSearchParams(window.location.search);
const isTestMode = urlParams.get('test') === 'true';

console.log("[OverlayEditor] container =", container);
console.log("[OverlayEditor] overlay =", bootstrapData);
console.log("[OverlayEditor] testMode =", isTestMode);

if (!container) {
  console.error("[OverlayEditor] #overlay-editor-root not found");
} else if (!bootstrapData && !isTestMode) {
  console.error("[OverlayEditor] window.__OVERLAY__ is missing");
} else {
  const root = createRoot(container);
  
  if (isTestMode) {
    // Test mode: wait for test overlay data
    console.log("[OverlayEditor] Test mode enabled, waiting for overlay data...");
    
    window.addEventListener('loadTestOverlay', ((event: CustomEvent) => {
      const testData = event.detail;
      console.log("[OverlayEditor] Loading test overlay:", testData.name);
      
      const testOverlay = {
        id: 0,
        name: testData.name,
        slug: 'test-overlay',
        public_id: 'test',
        config_json: testData,
      };
      
      root.render(<OverlayEditorApp initialOverlay={testOverlay} />);
    }) as EventListener);
    
    // If test data is already available, load it immediately
    if (window.testOverlayData) {
      window.dispatchEvent(new CustomEvent('loadTestOverlay', { detail: window.testOverlayData }));
    }
  } else {
    // Normal mode
    root.render(<OverlayEditorApp initialOverlay={bootstrapData!} />);
  }
}
