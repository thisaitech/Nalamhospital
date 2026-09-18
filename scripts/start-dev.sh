#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${EXPO_PORT:-8082}"

echo "Stopping any existing Expo server on port ${PORT}..."
fuser -k "${PORT}/tcp" 2>/dev/null || true
pkill -f "expo start.*${PORT}" 2>/dev/null || true
pkill -f "localtunnel.*${PORT}" 2>/dev/null || true
sleep 1

echo "Clearing Metro cache..."
rm -rf .expo node_modules/.cache/metro 2>/dev/null || true

export EXPO_NO_TELEMETRY=1

echo "Starting Expo Metro on port ${PORT}..."
npx expo start --clear --port "${PORT}" --host lan > /tmp/workpulse-expo.log 2>&1 &
EXPO_PID=$!

for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
    break
  fi
  sleep 1
done

echo "Starting public tunnel..."
rm -f /tmp/workpulse-tunnel.log
npx --yes localtunnel --port "${PORT}" > /tmp/workpulse-tunnel.log 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 30); do
  PUBLIC_URL="$(rg -o 'https://[a-z0-9-]+\.loca\.lt' /tmp/workpulse-tunnel.log 2>/dev/null | head -1 || true)"
  if [[ -n "${PUBLIC_URL}" ]]; then
    break
  fi
  sleep 1
done

LAN_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo "=============================================="
echo " WorkPulse is running with latest code"
echo "=============================================="
echo " Local (this machine):  http://localhost:${PORT}"
echo " LAN (same WiFi):       http://${LAN_IP}:${PORT}"
if [[ -n "${PUBLIC_URL}" ]]; then
  echo " Public (open anywhere): ${PUBLIC_URL}"
  echo ""
  echo " If loca.lt asks for a password, use your public IP."
fi
echo ""
echo " Login: john.doe@company.com / password123"
echo " Expo PID: ${EXPO_PID} | Tunnel PID: ${TUNNEL_PID}"
echo "=============================================="
echo ""

tail -f /tmp/workpulse-expo.log
