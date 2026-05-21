# Overlay render parity

**Canonical renderer:** [`ElementRenderer`](../src/shared/overlayRenderer/ElementRenderer.tsx) — used by the overlay editor canvas and OBS runtime.

[`SnapshotRenderer`](../src/shared/overlayRenderer/SnapshotRenderer.tsx) and [`buildRenderSnapshot`](../src/shared/overlayRenderer/renderResolver.ts) are experimental / test-only; not used in production HTML bundles.

After saving an overlay in the dashboard, refresh the OBS browser source to load updated `config_json` (runtime does not poll config).
