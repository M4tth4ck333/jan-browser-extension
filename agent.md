# Jan Extension – Engineering Notes

Engineering overview for the MV3 side‑panel Jan Extension: architecture, key message flows, and a practical UI/UX roadmap.


## Overview

- Works with OpenAI‑compatible APIs (Jan Server/local, Cerebras, OpenAI, etc.).
- MV3 service worker (`src/background.js`), side panel UI (React under `ui/sidepanel/`), content script (`src/content.js`), options UI (`ui/options/`).
- Streaming chat completions with token‑by‑token updates in the side panel; non‑streaming fallback supported.


## Architecture

- `manifest.json`
  - MV3 with permissions: `storage`, `activeTab`, `tabs`, `scripting`, `sidePanel`.
  - `background.service_worker`: `src/background.js`.
  - `side_panel.default_path`: `dist/ui/sidepanel/index.html`.
  - `options_page`: `dist/ui/options/index.html`.
  - `content_scripts`: `src/content.js` on `<all_urls>`.

- `src/background.js` (service worker)
  - Initializes provider defaults and side panel behavior on install/startup.
  - Handles toolbar click: ensures a supported http/https tab, sets side panel path, and opens the panel.
  - Agents/tools hosted here: page summarizer, inline assistant, Google Search + SERP scrape, MCP bridge client.
  - Message handlers include (non‑exhaustive):
    - `SUMMARIZE`, `CHAT_COMPLETION`, `CHAT_COMPLETION_STREAM_START`, `CHAT_COMPLETION_STREAM_STOP`
    - `INLINE_ASSIST_START`, `CUSTOM_PROMPT_RUN`
    - `AUTOCOMPLETE_SUGGEST`
    - `GOOGLE_SEARCH_AND_SCRAPE`
    - `LIST_MODELS`, `TEST_SETTINGS`
    - `GET_BRIDGE_STATUS`, `RECONNECT_BRIDGE`
    - `SELECTION_UPDATED`
  - Streaming infra:
    - Tracks side panel ports per `tabId` plus a global fallback.
    - Side panel re‑registers via `{ type: 'REGISTER_PORT', tabId }` on tab changes.
    - SSE parser supports multi‑line `data:` events, `delta.content`, `message.content`, `text`, and array segments; JSON fallback when non‑SSE.

- `ui/sidepanel/` (React UI)
  - Chat interface, session list, streaming Markdown renderer with code highlighting and safe sanitization.
  - Long‑lived port `jan-stream` receives streaming deltas.
  - Stores sessions in `chrome.storage.local` with frequent save points and unload persistence.

- `ui/options/` (React Options UI)
  - Configure provider preset, base URL, API key (optional), model, temperature, and MCP bridge token.
  - Model list toggle (`/models`), connectivity test, and helpers to copy MCP server commands.

- `vite.config.js`
  - Multi‑page inputs for side panel and options; stable asset names; source maps on.


## Side Panel Opening Behavior

- Current behavior:
  - On install/startup: `setPanelBehavior({ openPanelOnActionClick: true })` to let Chrome auto‑open on action click.
  - On click: code still sets the side‑panel path for the target tab and calls `sidePanel.open({ tabId })` to ensure visibility.
- Trade‑off:
  - Auto‑open is convenient but may reuse cached `index.html` if the extension isn’t reloaded after a new build.
  - For guaranteed fresh assets each click, use explicit open with a cache‑busted query (e.g., `index.html?v=${Date.now()}`) and set `openPanelOnActionClick: false`.


## Content Script + Messaging Robustness

- Only targets http/https tabs for extraction.
- Retries messaging with backoff.
- Programmatically injects `src/content.js` if missing (common after extension reload).
- Waits for the tab to reach a complete loading state before messaging.


## Streaming Chat Completions

- Side panel connects a port named `jan-stream`.
- Background maintains `sidepanelPorts` keyed by `tabId` and a `GLOBAL_KEY` fallback.
- The panel sends `REGISTER_PORT` with the current tab ID so the background can route deltas correctly.
- Parser supports:
  - SSE multi‑line event aggregation.
  - `delta.content`, `message.content`, `text`, and arrays of segments.
  - Fallback to non‑SSE JSON responses (single delta + done).


## Sessions Persistence

- Stored in `chrome.storage.local`:
  - `sessions: Array<{ id, title, createdAt, updatedAt, messages[], context }>`
  - `activeSessionId`
- Save points:
  - After each user/assistant message append.
  - On streaming `DONE` and error.
  - On side‑panel unload (beforeunload/pagehide).
- On mount: loads sessions and activates the last used session or creates an initial one.


## Options & Provider Settings

- Provider presets (Cerebras, Jan, Custom) fill sensible defaults.
- Connectivity test calls the configured API; timeouts surface helpful error text.
- Note: Some models/providers stream differently (e.g., reasoning segments before content). Parser covers common shapes.


## Known Limitations / Notes

- Closing the panel mid‑stream: tokens arriving after close won’t persist (UI is gone). Most recent in‑memory state is saved on unload.
- Restricted pages (chrome://, Web Store, file://) don’t support content scripts; the UI warns and can route to a supported tab.
- If auto‑open is enabled and the extension isn’t reloaded after a build, Chrome can serve a stale cached panel.


## UI/UX Improvements Implemented

- Live streaming in the chat bubble (token‑by‑token).
- Stable session persistence across side‑panel close/reopen.
- Messaging resilience (retries, injection, tab complete waiting).
- Removed auto‑scrape on mount to avoid noisy errors on restricted pages.
- DS‑class styling (`ds-*`) and Jan hand SVG branding.


## UI/UX Roadmap (Proposed)

1) Conversation quality & readability
- Markdown rendering with code blocks, tables, and inline links.
- Copy buttons for messages and code blocks.
- Optional “Show reasoning” toggle (for models that emit reasoning tokens) separate from final content.

2) Composer & flow
- Skeleton/typing indicator during streaming.
- Keyboard shortcuts: Enter = send, Shift+Enter = newline, Esc = stop.
- Stop/Cancel button to abort in‑flight streaming (AbortController in background).
- Edit & Regenerate last user message.

3) Sessions management
- Rename/delete chats; reorder via drag and drop.
- Export/import sessions (JSON), and “Copy entire chat”.
- Autosave throttle during streaming (e.g., every 1s) to minimize loss if the panel closes.

4) Context controls
- Clear badges for selected tabs; quick “Use current tab” shortcut.
- Re‑scrape indicator and auto‑refresh stale context (toggleable).
- Per‑session context pinning (remember default behavior per chat).

5) Feedback & errors
- Inline error banners with retry actions (e.g., “Reconnect”, “Open Options”).
- Network indicator pill when streaming; surface timeouts distinctly.
- Model/provider pill in the header; quick Settings shortcut.

6) Visual polish
- Scroll‑to‑bottom fab when scrolled up.
- Message timestamps and subtle separators.
- Light/dark theming sourced from DS tokens.


## Developer Notes

- Debug streaming:
  - Open SW console (chrome://extensions → extension → Service worker → Inspect).
  - Watch for parse errors or API response content‑types.
- If you see stale assets:
  - Reload the extension after build.
  - Or switch to explicit open with cache‑busting query.
- Build: `bun run build` (Vite multi‑page). Source maps enabled.

### MCP Bridge + Unified Dev

- The MCP Search server lives at `mcp/search-server/` and spins up a local WebSocket bridge (`ws://127.0.0.1:17389`) that the extension’s background connects to.
- Recommended workflow to run extension and MCP server together during dev:

```bash
# from repo root
npm install                # installs dependencies
npm run build:mcp          # one‑time TS build of the MCP server
npm run dev:all            # runs Vite (extension) and MCP server watch in parallel
```

- Load the extension from `dist/` in Chrome. The background will connect out to the MCP bridge once active.
- For MCP client testing, configure your client (e.g., Claude Desktop) to launch the server entry: `mcp/search-server/dist/src/index.js`.

Claude Desktop config (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "search": {
      "command": "node",
      "args": ["/absolute/path/to/jan-browser-extension/mcp/search-server/dist/src/index.js"],
      "env": {
        "BRIDGE_HOST": "127.0.0.1",
        "BRIDGE_PORT": "17389"
      }
    }
  }
}
```

Notes:
- The MCP server logs a startup line to `mcp/search-server/log.txt` and exposes a `server_info` tool (prints name/version/ts) and `bridge_status` tool.
- Ensure port `17389` is free (`lsof -iTCP:17389 -sTCP:LISTEN`). Kill stale processes if needed.


## Changelog (recent)

- Port routing: global fallback + `REGISTER_PORT` registration from the panel.
- SSE parser: multi‑line events; supports `delta.content`, `message.content`, `text`, arrays.
- Non‑SSE fallback: parse JSON once and emit as a single delta.
- UI streaming: functional updates with refs; prevents stale state during long streams.
- Persistence: load sessions on mount; persist on unload; removed auto‑scrape on mount.
- Vite rollup outputs use stable names to reduce cache confusion.
- Options: clearer timeout error messages for connectivity tests.


## Open Questions / Next Steps

- Decide on side‑panel opening strategy (auto‑open vs explicit + cache‑bust) for your workflow.
- Choose whether to expose reasoning streams (toggle) and/or strip them.
- Prioritize the roadmap items above and create issues per task.

## Changelog – 15 August 2025

- Theme sync polish:
  - Options theme changes now persist immediately to `chrome.storage.sync` and apply to `<html>` so the Side Panel updates live without Save.
  - Side Panel root updated to use `ds-bg ds-text` for consistent theming with the Options UI.
- MCP Bridge security hardening:
  - Introduced `useBridgeToken` toggle (default Off) in `ui/options/App.jsx` to make browser token usage optional.
  - `src/background.js` now includes the token in the WebSocket URL only if both `bridgeToken` is set and `useBridgeToken` is true.
  - Background reconnects automatically when `bridgeToken` or `useBridgeToken` changes.
  - `GET_BRIDGE_STATUS` reports `usingToken` accurately (true only when both token exists and toggle is On).
- Bridge UI clarity:
  - Server command copy adapts to the toggle: includes `BRIDGE_TOKEN=…` when On; plain `npm run dev[:mcp]` when Off.
  - Button enable/disable logic updated accordingly; helper text clarifies whether a token will be used.

- Inline Assistant UX:
  - Implemented Shadow DOM inline assistant in `src/content.js` with tooltip → menu → result card flow near the selection.
  - Draggable tooltip: users can drag to reposition; action menu opens relative to the tooltip’s current position (avoids dismissal during drag).
  - Result card polish: header pill with mode, spinner, focus states; viewport clamping; keyboard shortcuts — Enter=Apply, Esc=Close, Cmd/Ctrl+C=Copy, Cmd/Ctrl+R=Regenerate.
  - Regenerate action to rerun on the same selection context.
  - Prompting improvements in `src/background.js` via `buildInlineAssistMessages`: clearer, mode-specific constraints with strict formatting and meaning preservation.
  - Options: Inline Assistant settings to enable/disable feature and choose actions.
