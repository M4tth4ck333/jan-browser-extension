# ADR-005: Bun-based Release Automation and Local Testing

- Status: Accepted
- Date: 25 Aug 2025
- Owners: Jan Extension maintainers

## Context

We want a predictable way to produce downloadable zips for the browser extension and the optional MCP search server on every tagged release, and an easy local command to test the exact packaging before pushing. Initial scripts used npm-only flows and ad-hoc zipping, and contributors asked for a faster, simpler setup (Bun) and a one-command local dry run.

## Decision

- Use GitHub Actions to create a release on tag pushes and attach two zips:
  - `jan-extension-<tag>.zip`
  - `search-mcp-server-<tag>-dist.zip` (if MCP build exists)
- Use Bun in CI for dependency installation and builds for speed and consistency.
- Provide a local packaging script that mirrors CI, auto-detects Bun, and falls back to npm if Bun is not installed.

## Details

- Workflow: `.github/workflows/release.yml`
  - Trigger: `push` to any tag (e.g., `v1.2.3`); can be filtered later to `v*.*.*`.
  - Tooling: `oven-sh/setup-bun@v2`, then `bun install` and `bun run build:all`.
  - Packaging: zips contain:
    - Extension zip: `manifest.json`, `src/background.js`, `src/content.js`, `dist/ui/*`, `dist/assets/*`, `icons/*`, plus `LICENSE`/`README.md` if present.
    - MCP zip (optional): `mcp/search-server/dist/**`.
  - Artifacts: uploaded via `actions/upload-artifact@v4`.
  - Release: created/updated via `softprops/action-gh-release@v2` with both zips attached.
  - Local workflow testing: when run under `act` (`env.ACT == 'true'`), the GitHub Release step is skipped.

- Local packaging: `npm run release:local`
  - Script: `scripts/package-local.sh`.
  - Behavior: auto-detects Bun; uses `bun install`/`bun run build:all` if available, else falls back to npm (`npm ci` with `npm install` fallback).
  - Output directory: `pack/` (git-ignored).
  - Tags: uses `TAG` env var or a default `local-YYYYMMDD-HHMMSS`.

- MCP build helper: `scripts/build-mcp.sh` handles Bun/npm differences without `--prefix` flags.

## Alternatives Considered

1) npm-only CI and local scripts
- Pros: ubiquitous.
- Cons: slower install; lockfile drift causes `npm ci` failures; more friction for contributors who prefer Bun.

2) Manual release creation
- Pros: simpler workflow file.
- Cons: error prone; inconsistent artifacts; extra maintainer time.

3) Single zip combining extension + MCP
- Pros: one artifact.
- Cons: different audiences; extension users don’t need MCP, and MCP consumers don’t need the extension bundle.

## Consequences

- Contributors can validate packaging locally in one command and expect the same results in CI.
- CI relies on Bun; if Bun changes behavior, we may need to pin a version in the workflow.
- Two artifacts per release improve clarity for users (extension vs. MCP).

## Migration & Rollout

- Merge the workflow and scripts.
- Push a tag (e.g., `git tag v0.1.2 && git push origin v0.1.2`).
- Verify the release contains both zips and that the extension zip content matches the manifest paths.
- Optional: pin Bun version in CI if we observe regressions (e.g., `bun-version: 1.2.x`).

## Commands & Paths (Quick Reference)

- Local: `npm run release:local` or `TAG=v0.1.2 npm run release:local`.
- Workflow: `.github/workflows/release.yml`.
- Artifacts: `pack/jan-extension-<tag>.zip`, `pack/search-mcp-server-<tag>-dist.zip` (local), uploaded + attached on real tag pushes (CI).

