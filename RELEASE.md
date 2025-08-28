# Release Guide

This doc explains how to ship downloadable zips for the Chrome extension and the optional MCP search server.

## Quick Recipes

- Stable release (tagged):
  ```bash
  # tag can be vX.Y.Z, X.Y.Z, or a custom like 12.11
  git tag 12.11
  git push origin main
  git push origin 12.11
  ```
  CI publishes:
  - `jan-extension-chrome-12.11.zip`
  - `jan-extension-firefox-12.11.zip`
  - `search-mcp-server-12.11-dist.zip`

- Nightly prerelease (incremental):
  - Push to `main`. CI updates a prerelease with tag `nightly` and uploads:
    - `jan-extension-nightly-<run>-<sha>.zip`
    - `search-mcp-server-nightly-<run>-<sha>-dist.zip`

- Local dry run (no GitHub needed):
  ```bash
  npm run release:local                # timestamped local tag
  TAG=12.11 npm run release:local     # custom tag to mirror a release
  ```
  Outputs to `pack/`.

## Tagging, Versioning, and What Shows Up

- The artifact filenames mirror the Git tag exactly. If you tag `12.11`, the zip names will include `12.11`.
- Internal versions (`manifest.json`, root `package.json`, and `mcp/search-server/package.json`) are independent from the tag:
  - You can ship a tag-only release without bumping internal versions (handy for quick spins).
  - For consistency, bump internal versions before tagging when you want them to match.

Suggested manual bump (optional):
```bash
# Edit these files to your target version, e.g., 12.11.0
# - manifest.json               (.version)
# - package.json                (.version)
# - mcp/search-server/package.json (.version)
git add -A && git commit -m "chore(release): bump version to 12.11.0"
git tag 12.11 && git push origin main && git push origin 12.11
```

## Workflows

- Stable: `.github/workflows/release.yml`
  - Trigger: tag pushes (`vX.Y.Z`, `X.Y.Z`, or custom like `12.11`).
  - Tooling: Bun (`oven-sh/setup-bun@v2`) for `bun install` and `bun run build:all`.
  - Artifacts:
    - `jan-extension-chrome-<tag>.zip`: `manifest.json`, `src/*`, `dist/**`, `icons/*`, plus `LICENSE`/`README.md` if present.
    - `jan-extension-firefox-<tag>.zip`: zipped from `dist-firefox/**` built via `npm run build:firefox`.
    - `search-mcp-server-<tag>-dist.zip`: `mcp/search-server/dist/**` (if present).
  - Publishes a GitHub Release for the tag.

- Nightly: `.github/workflows/nightly.yml`
  - Trigger: push to `main`.
  - Patches Chrome `manifest.version_name` to include `-nightly-<run>-<sha>` (does not change `version`).
  - Updates prerelease with tag `nightly` and uploads:
    - `jan-extension-chrome-nightly-<run>-<sha>.zip`
    - `jan-extension-firefox-nightly-<run>-<sha>.zip`
    - `search-mcp-server-nightly-<run>-<sha>-dist.zip`

## Local Packaging Details

- Script: `scripts/package-local.sh`
  - Detects Bun. If unavailable, falls back to npm (`npm ci` with install fallback).
  - Builds extension + MCP (`bun run build:all` or `npm run build:all`).
  - Zips into `pack/` using `TAG` or an auto timestamp.

- Verify contents:
```bash
unzip -l pack/jan-extension-chrome-<tag>.zip | sed -n '1,200p'
unzip -l pack/jan-extension-firefox-<tag>.zip | sed -n '1,200p'
```

## Optional: Run CI Locally

- Install act (macOS): `brew install act`
- Simulate a tag release:
```bash
act push -P ubuntu-latest=catthehacker/ubuntu:act-latest -j build-and-release --env GITHUB_REF_NAME=12.11
```
The workflow uploads artifacts; publishing to GitHub Releases is skipped under `act`.

## Troubleshooting

- Tag-only releases show previous internal versions in the manifest/package files. Bump them first if you want parity with the tag.
- To retag:
  ```bash
  git tag -d 12.11
  git push origin :refs/tags/12.11   # remove remote tag (if needed)
  git tag 12.11 && git push origin 12.11
  ```
- Bun: we track `latest`. If CI regresses, pin `bun-version: 1.2.x`.
- Chrome: unzip the extension zip and load as unpacked via `chrome://extensions`.
