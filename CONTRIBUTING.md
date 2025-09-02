# Contributing to Jan Browser

Thanks for your interest in contributing! This project favors small, focused changes with clear rationale.

## Setup
- Install Bun (recommended) or Node 18+.
- Install deps: `bun install` (or `npm install`).
- Build: `bun run build`.

## Scripts
- Unit tests (Vitest): `bun run test:run`
- Bun runner (preloaded DOM): `bun test`
- E2E (Playwright):
  - `npx playwright install`
  - `bun run build`
  - `bun run test:e2e`

## Guidelines
- Keep changes minimal and scoped to the task.
- Avoid unrelated refactors in the same PR.
- Match existing code style and patterns.
- Update relevant docs when behavior changes.

## PR Checklist
- [ ] Tests pass locally (unit + e2e if impacted)
- [ ] Docs updated (README/behavior.md/specs as needed)
- [ ] No secrets or keys in commits

## Questions
Open an issue or start a draft PR to discuss larger changes.
