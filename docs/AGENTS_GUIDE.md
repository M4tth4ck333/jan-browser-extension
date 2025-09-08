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
