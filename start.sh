#!/bin/bash
# JamStream — start script
# Spustí server, Vite a ngrok jedním příkazem

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== JamStream ==="
echo ""

# 1. Kill old processes
echo "[1/4] Cleaning old processes..."
kill $(lsof -ti :3001 2>/dev/null) 2>/dev/null || true
kill $(lsof -ti :5173 2>/dev/null) 2>/dev/null || true
pkill -f "ngrok http" 2>/dev/null || true
sleep 1
echo "      OK"

# 2. Start server
echo "[2/4] Starting server (port 3001)..."
cd "$ROOT_DIR/server"
nohup npx tsx src/index.ts > /tmp/jamstream-server.log 2>&1 &
sleep 2
if lsof -i :3001 > /dev/null 2>&1; then
  echo "      Server running on :3001"
else
  echo "      ERROR: Server failed. Check /tmp/jamstream-server.log"
  exit 1
fi

# 3. Start Vite
echo "[3/4] Starting Vite dev server (port 5173)..."
cd "$ROOT_DIR/client"
nohup npx vite --host > /tmp/jamstream-vite.log 2>&1 &
sleep 3
if lsof -i :5173 > /dev/null 2>&1; then
  echo "      Vite running on :5173"
else
  echo "      ERROR: Vite failed. Check /tmp/jamstream-vite.log"
  exit 1
fi

# 4. Start ngrok
echo "[4/4] Starting ngrok tunnel..."
nohup ngrok http 5173 --log=stdout > /tmp/jamstream-ngrok.log 2>&1 &
sleep 4

NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); ts=d.get('tunnels'); print(ts[0]['public_url'] if ts else '')" 2>/dev/null || echo "")

if [ -n "$NGROK_URL" ]; then
  echo ""
  echo "========================================"
  echo "  App is LIVE at:"
  echo "  $NGROK_URL"
  echo "========================================"
  echo ""
  echo "Send this URL to your friend!"
  echo ""
  echo "To stop everything: pkill -f 'tsx|vite|ngrok'"
  echo "To check logs:"
  echo "  Server:  cat /tmp/jamstream-server.log"
  echo "  Vite:    cat /tmp/jamstream-vite.log"
  echo "  Ngrok:   cat /tmp/jamstream-ngrok.log"
else
  echo "WARNING: ngrok failed to start. Check /tmp/jamstream-ngrok.log"
  echo "Local URL: http://localhost:5173"
fi
