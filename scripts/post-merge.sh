#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[post-merge] Building API server..."
pnpm --filter @workspace/api-server run build

echo "[post-merge] Done."
