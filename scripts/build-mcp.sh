#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR/mcp-server"

if command -v bun >/dev/null 2>&1; then
  echo "[build-mcp] Using Bun"
  bun run build
else
  echo "[build-mcp] Using npm"
  npm run build
fi
