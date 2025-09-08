# Jan Extension — Agents Guide

What powers the Jan Extension under the hood: agents, message flow, and how to extend it.

## Goals

- Unify page summarization, inline writing assist, and quick web search.
- Support any OpenAI-compatible API (Jan Server/local, Cerebras, OpenAI, etc.).
- Keep UX fast and predictable across content script, background, and side panel.

## Mental Model

- Background (service worker): the router/orchestrator. Hosts agents and tools.
- Content script: runs in the page. Extracts text, shows inline tooltip UI, DOM ops.
- Side panel UI: the app surface. Shows sessions, chat composer, and streaming output.

These talk over a long‑lived port so streaming is smooth and cancellable.

## Key Components

- Side Panel UI (`ui/sidepanel/`)
  - Shows session context + chat composer; renders streaming Markdown.
  - Tracks active tab; auto-follows when enabled.
- Background Service Worker (`src/background.js`)
  - Central router for UI ↔ content scripts ↔ external services.
  - Hosts agents/tools including Google Search + SERP scraping and the MCP bridge.
- Content Script (`src/content.js`)
  - Extracts page/selection text; presents Inline Assistant tooltip; DOM helpers.
- Options UI (`ui/options/`)
  - Configure provider base URL, API key, model presets (OpenAI‑compatible endpoints, including Jan and Cerebras).
- MCP Search Bridge (`mcp/search-server/`)
  - Optional local MCP server that exposes search/visit tools to LLM clients via a WebSocket bridge.

## Agents

- Page Summarizer (Side Panel)
  - Goal: Summarize the current page or selection with clear, skimmable Markdown.
  - Inputs: Page text, selection (optional), provider config, session settings.
  - Output: Markdown with headings, bullets, and links.

- Inline Assistant
  - Goal: Improve selected text inline (rewrite, simplify, translate, adjust tone).
  - Entrypoint: Tooltip near selection; keyboard shortcuts to apply/copy/regenerate.
  - Messages are built by `buildInlineAssistMessages` in `src/background.js`.

- Search (Google Search + Scrape)
  - Goal: Run a quick web search, scrape the SERP for links/snippets.
  - Entrypoint: `performGoogleSearchAndScrape(payload)` in `src/background.js`.
  - Flow: Opens an inactive Google tab, waits for hydration, extracts structured results, optionally closes the tab.

- MCP Bridge Agent
  - Goal: Expose `search` and `visit_tool` over MCP so local tools are accessible from LLM apps.
  - Lives in `mcp/search-server/` (TypeScript). Structured outputs are planned with Zod.

## Message & Port Routing

- Long‑lived port: Side panel registers a persistent port with background.
  - On tab activation, the side panel re‑registers the active `tabId` via `{ type: 'REGISTER_PORT', tabId }` so streaming routes to the right place.
- Session ↔ tab mapping: Background maintains a tab→session map; side panel switches sessions as the active tab changes.
  - Recent fix: Auto‑follow reads from the target session’s `context.autoFollowActiveTab` (see `ui/sidepanel/App.jsx`).
- Content script messaging: Background requests page/selection text; content script returns selection/caret details and hosts the inline UI.

## Core Flows

- Summarize Current Page (Side Panel)
  1) Side panel asks content script for page/selection data.
  2) Background builds the LLM prompt and streams to the provider.
  3) Side panel renders streaming Markdown; user can copy/export.

- Inline Assistant
  1) User selects text; content script shows the tooltip.
  2) Background builds messages (`buildInlineAssistMessages`) and calls the provider.
  3) Content script previews the result; user Apply/Copy/Regenerate.

- Google Search + Scrape
  1) UI or an agent calls `performGoogleSearchAndScrape({ query, closeTab? })`.
  2) Background opens an inactive Google tab, waits for load + hydration, then scrapes.
  3) Returns structured JSON; URLs are also mirrored to `_meta.urls` for compatibility.

## Extending Agents

- Add a tool/agent in `src/background.js`.
- Define a message type and handler; wire it from the side panel or content script.
- Prefer streaming when supported; keep UI cancellable and responsive.

## Permissions & Privacy

- Manifest (`manifest.json`) requests `tabs`, `activeTab`, `sidePanel`, `storage`, and wide host permissions for dev.
- For production, restrict host permissions and sanitize logs.
- Do not persist secrets; users configure API keys in Options.

## References

- Background: `src/background.js`
- Content: `src/content.js`
- Side Panel: `ui/sidepanel/`
- Options: `ui/options/`
- MCP Server: `mcp/search-server/`
