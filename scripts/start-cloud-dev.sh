#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${EXPO_PORT:-8082}"

echo "Stopping any existing Expo server on port ${PORT}..."
fuser -k "${PORT}/tcp" 2>/dev/null || true
pkill -f "expo start.*${PORT}" 2>/dev/null || true
sleep 1

echo "Clearing Metro cache..."
rm -rf .expo node_modules/.cache/metro 2>/dev/null || true

export EXPO_NO_TELEMETRY=1

echo "Starting thisAI web preview on port ${PORT}..."
exec npx expo start --web --clear --port "${PORT}" --host lan
