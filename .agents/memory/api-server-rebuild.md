---
name: API Server requires rebuild for route changes
description: API server runs from esbuild compiled dist/; code changes need a build step before restart.
---

## Rule
Any change to `artifacts/api-server/src/` (routes, lib files, etc.) requires:
1. `pnpm --filter @workspace/api-server run build` (esbuild bundles to `dist/index.mjs`)
2. Restart the `artifacts/api-server: API Server` workflow

**Why:** The workflow runs `node dist/index.mjs` (compiled), not `tsx` directly in dev mode. Hot reload is NOT enabled for routes — the server must be rebuilt and restarted.

**How to apply:** After every backend code change, always build + restart. The dashboard (Vite) does have HMR so no rebuild needed there.
