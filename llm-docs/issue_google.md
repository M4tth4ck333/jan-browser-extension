# Issue: Google SERP scraping is unreliable/intermittent

## Summary
- __Problem__: Our extension’s Google search scraping sometimes returns 0 results or stalls despite opening a SERP tab.
- __Impact__: Blocks the MCP `search` tool and side panel features that depend on Google results; user-facing queries fail or degrade.
- __Scope__: Background flow (`performGoogleSearchAndScrape()`), content script selectors/ready checks, and MCP bridge.

## Environment
- Chrome Extension (MV3) with background service worker: `src/background.js`
- Content script scraping: `src/content.js`
- MCP bridge/server (websocket): `mcp/search-server/src/index.ts`

## Expected vs Actual
- __Expected__: Given a query, open Google SERP and return N organic results (`numResults`, 1–10) + optional answer box.
- __Actual__: Intermittently returns empty results or fails readiness; sometimes appears to stop on unrelated tabs.

## Repro (minimal)
1. Start dev processes: `npm run dev:all`.
2. From MCP client, call `search` with a query and `numResults` (e.g., 5).
3. Observe occasional 0 results or readiness timeouts, despite SERP loading.

## What we tried (code references)
- __Threaded numResults end-to-end__
  - Bridge handler forwards `params.numResults` → `performGoogleSearchAndScrape()` in `src/background.js`.
  - Content script respects `payload.numResults` in `SCRAPE_GOOGLE_SERP` (`src/content.js`).
- __Realistic Google URLs__
  - Added `oq`, `sourceid=chrome`, `ie=UTF-8`, `hl`, `gl`, `sclient=gws-wiz-serp` in `performGoogleSearchAndScrape()` (`src/background.js`).
- __Readiness polling with jitter__
  - `WAIT_FOR_SERP_READY` randomized interval; min results derived from `numResults` (`src/content.js` + `src/background.js`).
- __Human-like interaction__
  - `HUMANIZE_SERP` small smooth scrolls and random waits before scraping (`src/content.js`, invoked from `src/background.js`).
- __Robust scraping path + debug mode__
  - Primary selectors for organic results; fallback path; optional diagnostics (`SCRAPE_GOOGLE_SERP` in `src/content.js`).
- __MCP bridge path__
  - `connectMcpBridge()` → `performGoogleSearchAndScrape()`; returns `{answerBox, results}` (`src/background.js`, `mcp/search-server/src/index.ts`).

## Observations
- Google DOM/layout varies by locale/experiment; some pages delay organic nodes or interleave modules (Top stories, AI Overviews, People Also Ask), breaking early readiness assumptions.
- Intermittent 0 organic results even when SERP visually loads (likely timing/selector drift).
- Rare cases where active tab context/logs suggest focus on a non-SERP tab during scrape window.

## Proposed next steps
- __Add DuckDuckGo fallback__ (if Google readiness fails or results.length === 0):
  - Open DDG SERP and scrape organic results with analogous handlers.
  - New content handlers: `WAIT_FOR_DDG_READY`, `SCRAPE_DDG_SERP` (`src/content.js`).
  - Gate by feature flag and surface source in the response payload.
- __Selector hardening__ for Google:
  - Expand organic container selectors and ignore ads/modules consistently.
  - Add a second-chance readiness after minor scroll/short delay.
- __Timeout/threshold tuning__:
  - Slightly increase `readinessTimeoutMs` for cold start; minResults heuristic based on `numResults` and page modules.
- __Better tab targeting__:
  - Ensure scrape messages are sent only to the created SERP tab ID and verify URL origin before acting.
- __Optional__: Introduce Google CSE HTTP fallback when running outside the browser (if policy allows and keys are available).

## Implementation plan

- __Permissions__
  - Add DuckDuckGo host permission in `manifest.json`: `https://duckduckgo.com/*`.

- __Background flow__ (`src/background.js`)
  - Track and use the created SERP `tabId` exclusively for readiness/scrape messaging.
  - Verify origin before acting using helpers like `isGoogleSerp(url)` / `isDuckDuckGoSerp(url)`.
  - Control flow: try Google → if readiness fails or 0 results, fall back to DDG and return its results.
  - Always include `{ source: 'google' | 'duckduckgo' }` in the returned payload, together with `results` and optional `answerBox`.
  - Tune timeouts: allow a slightly higher `readinessTimeoutMs` on first try; keep jittered polling; add a second-chance readiness after a small scroll.

- __Content script__ (`src/content.js`)
  - Google hardening: broaden organic-result detection under the main results area and consistently ignore ads/modules (Top stories, PAA, AI Overviews, etc.).
  - Add `WAIT_FOR_DDG_READY` and `SCRAPE_DDG_SERP` handlers with robust selectors that target organic result cards under the DDG results container, skipping sponsored/instant-answer blocks.
  - Add a second-chance readiness probe after a short delay + minor scroll before declaring failure.
  - Instrument debug logs and counts for readiness attempts, total results, and timing when debug mode is enabled.

- __MCP bridge__ (`mcp/search-server/src/index.ts`)
  - Ensure `numResults` threading and pass-through of `{ source, results, answerBox }` from background to MCP response.

- __UI__ (`ui/sidepanel/App.jsx`)
  - Surface the search source (Google/DDG) and basic diagnostics in debug mode.

- __Docs & tests__
  - Update `docs/SPEC*.md` on scraping sources and behavior.
  - Add a manual smoke test checklist and capture sample logs to verify readiness/scrape timing.

## Task checklist

- [ ] Add `https://duckduckgo.com/*` to `manifest.json` host permissions.
- [ ] Background: restrict messages to the created SERP tab; verify URL origin; implement fallback to DDG; return `{ source, results, answerBox }`.
- [ ] Content: implement `WAIT_FOR_DDG_READY` and `SCRAPE_DDG_SERP`; harden Google selectors; add second-chance readiness and gentle scroll.
- [ ] Timing: tune `readinessTimeoutMs` and polling jitter; enable a one-time extended timeout on cold start.
- [ ] Debug: add diagnostics counters/timing and expose them behind a debug flag.
- [ ] MCP: thread `numResults` and include `source` in responses.
- [ ] UI: display search `source` and show debug diagnostics in dev mode.
- [ ] Docs: update SPEC/ADR and add selector notes; add a manual smoke-test checklist.

## Acceptance criteria
  - With `numResults` in [1..10], at least 95% of calls return the requested number from Google OR fall back to DDG with the same count.
  - No stalls; response includes source metadata: `{ source: 'google' | 'duckduckgo' }`.
  - Debug mode shows counts and timing diagnostics for readiness and scrape.
