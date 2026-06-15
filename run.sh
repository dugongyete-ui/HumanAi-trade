#!/bin/bash

echo "=== Atlas XAUUSD Trading Bot Startup ==="

# Build api-server first
echo "[1/3] Building API server..."
pnpm --filter @workspace/api-server run build

# Start API Server in background
echo "[2/3] Starting API server on port 8080..."
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

# Start Dashboard in background
echo "[3/3] Starting Dashboard on port 23183..."
PORT=23183 BASE_PATH=/dashboard pnpm --filter @workspace/dashboard run dev &
DASH_PID=$!

echo "=== All services started ==="
echo "  API Server : port 8080  (/api)"
echo "  Dashboard  : port 23183 (/dashboard)"

# Wait — if either process dies, kill the other
wait -n $API_PID $DASH_PID
EXIT_CODE=$?
kill $API_PID $DASH_PID 2>/dev/null
exit $EXIT_CODE
