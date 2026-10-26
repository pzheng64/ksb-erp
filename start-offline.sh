#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export NEXT_TELEMETRY_DISABLED=1
export PYTHONNOUSERSITE=1
export npm_config_offline=true
export PATH="$ROOT/runtime/node:$PATH"

PY="$ROOT/runtime/python/python.exe"
if [[ ! -f "$PY" ]]; then
  PY="$ROOT/runtime/python/python"
fi
if [[ ! -f "$PY" ]]; then
  echo "Portable Python is missing from runtime/python."
  exit 1
fi
if [[ ! -x "$ROOT/runtime/node/node" && ! -f "$ROOT/runtime/node/node.exe" ]]; then
  echo "Portable Node.js is missing from runtime/node."
  exit 1
fi
if [[ ! -d "$ROOT/frontend/node_modules/next" ]]; then
  echo "frontend/node_modules is missing. Copy it with the project. Packages are not downloaded."
  exit 1
fi

(cd "$ROOT/backend" && "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8001) &
api_pid=$!
cleanup() {
  kill "$api_pid" >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

cd "$ROOT/frontend"
npm run dev -- --hostname 127.0.0.1 --port 3000
