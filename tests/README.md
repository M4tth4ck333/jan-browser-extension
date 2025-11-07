# Tests

This repo supports both unit/integration tests and end-to-end (E2E) tests.

## Unit (Vitest)
- Run all: `bun run test:run`
- JSDOM env and setup: `vite.config.js` → `tests/setup.ts`
- RTL helpers: `tests/utils.tsx`

## Bun runner
- `bun test` runs with a preloaded DOM and chrome mocks (`bunfig.toml` → `tests/bun-setup.ts`).
- This is light-weight and good for quick local checks, but Vitest remains the source of truth for assertions.

## E2E (Playwright)
- One-time: `npx playwright install`
- Build: `bun run build`
- Run: `bun run test:e2e`
- Extension tests:
  - `e2e/extension.spec.ts` - Launches Chromium with the unpacked MV3 extension and opens Options + Side Panel pages
  - `e2e/inline-assistant.spec.ts` - Tests the inline assistant tooltip functionality including:
