#!/usr/bin/env bash
set -euo pipefail

# Build and package local release zips matching CI layout.
# Usage: TAG=v0.0.0-local bash scripts/package-local.sh

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

# Pick tag from env or default to timestamped local tag
TAG=${TAG:-}
if [[ -z "${TAG}" ]]; then
  TAG="local-$(date -u +%Y%m%d-%H%M%S)"
fi

echo "[local-release] Using TAG=${TAG}"

if command -v bun >/dev/null 2>&1; then
  echo "[local-release] Using Bun for installs and build"
  if ! bun install --frozen-lockfile; then
    echo "[local-release] bun install failed; retrying without frozen lockfile"
    bun install
  fi
  if [ -f mcp-server/package.json ]; then
    bun install --cwd mcp-server --no-save || true
  fi
  echo "[local-release] Building all targets with Bun"
  bun run build:all
  echo "[local-release] Building Firefox extension"
  bun run build:firefox
else
  echo "[local-release] Bun not found; falling back to npm"
  echo "[local-release] Installing root deps..."
  if ! npm ci; then
    echo "[local-release] npm ci failed (lock out of sync). Falling back to npm install..."
    npm install
  fi
  echo "[local-release] Installing MCP server deps..."
  if [ -f mcp-server/package.json ]; then
    if ! npm ci --prefix mcp-server; then
      echo "[local-release] npm ci (mcp) failed. Falling back to npm install..."
      npm install --prefix mcp-server
    fi
  fi
  echo "[local-release] Building all targets..."
  npm run build:all
  echo "[local-release] Building Firefox extension"
  npm run build:firefox
fi

echo "[local-release] Packaging extension..."
rm -rf pack
mkdir -p pack/extension
cp -r manifest.json dist icons src pack/extension/
[[ -f LICENSE ]] && cp LICENSE pack/extension/ || true
[[ -f README.md ]] && cp README.md pack/extension/ || true

(cd pack/extension && zip -r "../jan-extension-chrome-${TAG}.zip" . >/dev/null)

echo "[local-release] Packaging Firefox extension..."
if [[ -d dist-firefox ]]; then
  (cd dist-firefox && zip -r "../pack/jan-extension-firefox-${TAG}.zip" . >/dev/null)
else
  echo "[local-release] dist-firefox not found; skipping Firefox zip."
fi

echo "[local-release] Packaging MCP server (if present)..."
if [[ -d mcp-server/dist ]]; then
  zip -r "pack/search-mcp-server-${TAG}-dist.zip" mcp-server/dist >/dev/null
else
  echo "[local-release] MCP dist not found; skipping."
fi

echo "[local-release] Done. Artifacts:"
ls -lh pack/*.zip 2>/dev/null || echo "No zips created."
