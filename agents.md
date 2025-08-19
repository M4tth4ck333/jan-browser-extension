# Agents Overview

A concise guide to the extension's agent architecture, message flows, and how to extend it.

## Goals

- Unify page summarization, inline assistance, and search into a consistent agent orchestration.
- Support OpenAI-compatible providers (Jan Server/local, Cerebras, etc.) with a simple config UI.
- Keep UX fast and predictable across content script, background, and side panel.

## Key Components

- Side Panel UI (`ui/sidepanel/`)
  - Presents session context and chat composer, renders streaming markdown output.
  - Manages tab selection and auto-following of the active tab.
- Background Service Worker (`src/background.js`)
  - Central router/orchestrator for messages between UI, content scripts, and external services.
  - Hosts agents and tools, including Google Search + SERP scraping.
- Content Script (`src/content.js`)
  - Extracts page/selection text, drives Inline Assistant tooltip UI, handles DOM-level operations.
- Options UI (`ui/options/`)
  - Allows configuring API base URL, API key, model presets (OpenAI-compatible endpoints including Jan and Cerebras).
- MCP Search Bridge (`mcp/search-server/`)
  - Optional local MCP server that proxies search/visit tools via the extension bridge.

## Agents

- Side Panel Summarizer Agent
  - Goal: Summarize the active page or selection with clear, skimmable markdown.
  - Inputs: Page text, selection (optional), provider config, session settings.
  - Output: Markdown with headings, bullets, and links.

- Inline Assistant Agent
  - Goal: Provide inline improvements for selected text (rewrite, simplify, translate, tone, etc.).
  - Entrypoint: Tooltip near selection; keyboard shortcuts to apply/copy/regenerate.
  - Messages are built in `buildInlineAssistMessages` within `src/background.js`.

- Search Agent (Google Search + Scrape)
  - Goal: Run a quick web search and scrape SERP for links/snippets.
  - Entrypoint: Background action `performGoogleSearchAndScrape(payload)` in `src/background.js`.
  - Flow: Opens an inactive tab to Google, waits for load, allows dynamic SERP hydration, extracts structured results, optionally closes the tab.

- MCP Bridge Agent
  - Goal: Expose search/visit tools over MCP; connect local tools to LLMs via MCP client apps.
  - Lives in `mcp/search-server/` with TypeScript implementation and Zod-typed output planned.

## Message & Port Routing

- Long-lived Port
  - Side panel establishes a long-lived port to background.
  - On tab activation, side panel re-registers the port for the active `tabId` using `{ type: 'REGISTER_PORT', tabId }` to ensure streaming routes correctly.

- Session ↔ Tab Mapping
  - Background maintains a tab→session map in storage.
  - Side panel reads this map to switch sessions when the active tab changes.
  - Recent fix: On tab activation, auto-follow is derived from the target session’s `context.autoFollowActiveTab` rather than stale current session state (`ui/sidepanel/App.jsx`).

- Content Script Messaging
  - Background requests page/selection text from content scripts.
  - Content script presents inline UI and returns updated selection or caret information as needed.

## Core Flows

- Summarize Current Page (Side Panel)
  1) Side panel requests page/selection data from content script.
  2) Background builds LLM prompt and streams messages to provider.
  3) Side panel renders streaming markdown; user can copy/export.

- Inline Assistant
  1) User selects text; content script shows tooltip.
  2) Background builds messages via `buildInlineAssistMessages` and calls provider.
  3) Content script displays preview; user can Apply/Copy/Regenerate.

- Google Search + Scrape
  1) Side panel or agent triggers background `performGoogleSearchAndScrape({ query, closeTab? })`.
  2) Background opens an inactive Google tab, waits for load, lets SERP hydrate, then extracts results.
  3) Results are returned as structured JSON, with URLs also mirrored to `_meta.urls` for compatibility.

## Extending Agents

- Add a new tool/agent in `src/background.js`.
- Define a message type and handler; wire from side panel or content script.
- Prefer streaming responses when supported; keep UI responsive and cancellable.

## Permissions & Privacy

- Manifest (`manifest.json`) requests `tabs`, `activeTab`, `sidePanel`, `storage`, and wide host permissions for dev.
- For production, restrict host permissions and sanitize logs.
- Avoid persisting secrets; users configure API keys in Options.

## References

- Background: `src/background.js`
- Content: `src/content.js`
- Side Panel: `ui/sidepanel/`
- Options: `ui/options/`
- MCP Server: `mcp/search-server/`
