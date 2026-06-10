# Overlay render parity

**Canonical renderer:** [`ElementRenderer`](../src/shared/overlayRenderer/ElementRenderer.tsx) — used by the overlay editor canvas and OBS runtime.

[`SnapshotRenderer`](../src/shared/overlayRenderer/SnapshotRenderer.tsx) and [`buildRenderSnapshot`](../src/shared/overlayRenderer/renderResolver.ts) are experimental / test-only; not used in production HTML bundles.

After saving an overlay in the dashboard, refresh the OBS browser source to load updated `config_json` (runtime does not poll config).

---

## OBS CEF Canvas/WebGL Compositing Guidelines

### ⚠️ Critical Viewport Layout Rule (Anti-Regression)
When dual-canvas layers (PixiJS for WebGL media, LeaferJS for 2D graphics) are initialized, fallback DOM nodes are hidden (`isCanvasDrawn = true`). 

Older versions of Chromium Embedded Framework (CEF) used by OBS Studio have a known rendering bug where hardware-accelerated canvases and WebGL contexts fail to composite/render when placed inside any ancestor container with `overflow: hidden`.

To prevent static text and images from disappearing inside OBS:
1. **Always ensure the viewport root container is set to `overflow: visible` inside OBS.**
2. In `src/overlay-runtime/main.tsx`, this is handled dynamically:
   ```typescript
   overflow: (isOBS || finalElements.some(...)) ? "visible" : "hidden"
   ```
3. Never wrap the `<canvas>` elements inside any intermediate layers that restrict overflow, otherwise OBS CEF will drop the entire compositing tile.

### ⚠️ Relative Asset Paths & Case-Insensitive OBS Detection (Anti-Regression)
Inside the OBS Chromium Embedded Framework (CEF) environment, sandbox security constraints and origin-mapping behaviors can cause standard relative URL resolutions (e.g., `/uploads/...` or `/assets/...`) to fail. This is particularly problematic for dynamically loaded assets such as:
1. **WebGL Canvas / PixiJS Media Sources (`KeyedMedia.tsx`)**
2. **SVG Pattern Fills & Fills (`ElementRenderer.tsx`)**
3. **HTML Image/Video DOM nodes**

#### Guidelines:
* **Absolute Path Resolution**: Never pass raw relative paths to media loaders, image tags, video tags, or SVG definitions. Always resolve relative paths to fully-qualified absolute URLs at the React component layer using the current origin:
  ```typescript
  const absoluteSrc = src.startsWith("/") ? `${window.location.origin}${src}` : src;
  ```
* **Robust OBS Detection**: The OBS CEF User-Agent string can vary across systems and setups (e.g., `OBS`, `obs`, `obs-studio`). Always perform case-insensitive User-Agent checks:
  ```typescript
  const isOBS = navigator.userAgent.toUpperCase().includes("OBS");
  ```
