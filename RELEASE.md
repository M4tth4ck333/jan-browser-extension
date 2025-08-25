# Release Guide

This guide covers how to produce downloadable zips for the Chrome extension and the optional MCP search server.

## TL;DR

- Stable releases (tags):
  ```bash
  git tag v0.1.2
  git push origin v0.1.2
  ```
  CI builds with Bun and publishes:
  - `jan-extension-v0.1.2.zip`
  - `search-mcp-server-v0.1.2-dist.zip`

- Nightly prereleases (incremental):
  - Every push to `main` updates a prerelease with tag `nightly` and uploads files like:
    - `jan-extension-nightly-<run>-<sha>.zip`
    - `search-mcp-server-nightly-<run>-<sha>-dist.zip`

- Local packaging (dry run):
  ```bash
  npm run release:local
  # or
  TAG=v0.1.2 npm run release:local
  ```
  Artifacts appear under `pack/`.

## Workflows

- Stable: `.github/workflows/release.yml`
  - Trigger: tag pushes (e.g., `v1.2.3`)
  - Uses Bun for installs (`bun install`) and build (`bun run build:all`).
  - Packages:
    - `jan-extension-<tag>.zip`: includes `manifest.json`, `src/background.js`, `src/content.js`, `dist/ui/*`, `dist/assets/*`, `icons/*`, plus `LICENSE`/`README.md` if present.
    - `search-mcp-server-<tag>-dist.zip`: zips `mcp/search-server/dist` (if exists).
  - Uploads artifacts and creates a GitHub Release for the tag.

- Nightly: `.github/workflows/nightly.yml`
  - Trigger: push to `main`.
  - Uses Bun, same build steps.
  - Patches `manifest.json` `version_name` to include `-nightly-<run>-<sha>` without changing `version`.
  - Uploads artifacts and updates a prerelease with tag `nightly`.

## Local Packaging Details

- Script: `scripts/package-local.sh`
  - Auto-detects Bun; falls back to npm when Bun is unavailable.
  - Builds extension and MCP server (`bun run build:all` or `npm run build:all`).
  - Zips to `pack/` using either a provided `TAG` env var or a timestamped local tag.

- Outputs:
  - `pack/jan-extension-<tag>.zip`
  - `pack/search-mcp-server-<tag>-dist.zip` (if MCP dist exists)

- Verify contents:
  ```bash
  unzip -l pack/jan-extension-<tag>.zip | sed -n '1,200p'
  ```

## Optional: Run CI Locally

- Install act (macOS): `brew install act`
- Run the release job (simulating a tag push):
  ```bash
  act push -P ubuntu-latest=catthehacker/ubuntu:act-latest -j build-and-release --env GITHUB_REF_NAME=v0.0.0-local
  ```
  The workflow uploads artifacts and skips publishing the GitHub Release when `ACT=true`.

## Notes & Tips

- Bun version: we track `latest` in CI. If you see regressions, pin to `bun-version: 1.2.x`.
- npm lockfile: the local script falls back to `npm install` if `npm ci` detects lockfile drift.
- Chrome load: unzip the extension zip to a folder and load as unpacked via `chrome://extensions` in Developer mode.
- Host permissions: restrict `host_permissions` in `manifest.json` before publishing to the Chrome Web Store.

