# Overlay VPS audit (2026-05-21)

## Host

- **SSH alias:** `scraplet-vps` → `server2.scraplet.store` (user `sardwyn`)
- **Production dashboard path:** `/var/www/scraplet/scraplet-dashboard`
- **Process:** `node /var/www/scraplet/scraplet-dashboard/index.js` (PID varies; no pm2)
- **Note:** `~/repos/scraplet-dashboard` was removed; only `~/repos/studio-controller` remains under home repos.

## Git (production)

| Item | Value |
|------|--------|
| Branch | `master` |
| HEAD | `742554fab6aafe0d50725ffe434641b7a1f71fff` |
| Working tree | Clean (no uncommitted changes at audit time) |
| Overlay bundles | `public/static/overlays/overlay-editor.bundle.js`, `overlay-runtime.bundle.js` (built May 21) |

## VPS-only / notable branches (local to production clone)

- `render-pipeline-rebuild-2026-04-22`, `render-pipeline-snapshot-2026-04-22`
- `hotfix/frontend-fix`, `hotfix/ingest-schema`, `hotfix/restore-streams`
- `vps-recovery-2026-03-14`, `vps-snapshot-*`
- `feature/drag-performance-refactor` (older snapshot on VPS)

## Local WSL (`~/repos/scraplet-dashboard`)

| Item | Value |
|------|--------|
| Branch | `master` @ same HEAD `742554f` |
| Drift | Uncommitted changes in `package.json`, `OverlayEditorApp.tsx`, `DerivedStateEngine.ts`, `overlayTypes.ts` |
| Remotes | `origin/*`, `remotes/vps/*` |

## Working branch for this hardening pass

**`master` on `/var/www/scraplet/scraplet-dashboard`** — matches deployed `index.js` and overlay bundles.

## Reconciliation

1. Apply fixes on production clone, commit on VPS.
2. `git pull` / fetch on local `~/repos/scraplet-dashboard` from origin after push (or copy commit hash from VPS).
