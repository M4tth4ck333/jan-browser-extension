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
