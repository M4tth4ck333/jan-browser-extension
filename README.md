# Jan Browser (Chrome)

The Jan Browser companion: chat, inline writing help, search, and page context in the side panel. Uses your Jan service and also supports any OpenAI‑compatible endpoint (Jan Server/local, Cerebras, OpenAI, etc.).

- Side panel app for chat and streaming summaries
- Inline Assistant tooltip for selected text (rewrite/simplify/translate)
- Web search with DuckDuckGo first and Google fallback (structured results)
- Optional MCP bridge to expose search/visit tools to LLM clients

## What’s New in 0.12.15

- @mention Tab Selection: type "@" in the composer to quickly select tabs for context.
- LIFO Tab Ordering: unpinned first, then most recently accessed, then rightmost.
- Overlay Sidebar: full‑screen overlay menu for session management and quick access.
- Search Preferences: DuckDuckGo‑first with Google fallback, or DDG‑only via Options.
- Model Dropdown: optionally fetch `/models` to pick from a list in Options.
- Reading Overlay and Debug Tools toggles in Options.

## Quick Start

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/menloresearch/jan-browser-extension.git
    cd jan-browser-extension
    ```
2.  **Install dependencies:**
    - With Bun (recommended)
      ```bash
      bun install
      ```
    - Or with npm
      ```bash
      npm install
      ```
3.  **Build the extension:**
    - With Bun
      ```bash
      bun run build
      ```
    - Or with npm
      ```bash
      npm run build
      ```
4.  **Load the extension in Chrome:**
    *   Open `chrome://extensions` in Chrome.
    *   Enable "Developer mode".
    *   Click "Load unpacked" and select the `dist` folder.
5.  **Configure and use the extension:**
    *   Pin the extension and click it to open the side panel.
    *   Click the settings (⚙️) in the side panel to configure your API and bridge.

## Configuration

Open the Options page (⚙️ in the side panel) and set:

- Provider Preset
  - Cerebras → sets base to `https://api.cerebras.ai/v1`
  - Jan (Local) → sets base to `http://localhost:1337/v1`
  - Jan Server (Cloud) → currently locked to `https://comingsoon.ai`
  - Custom → any OpenAI-compatible base URL
- API Base URL (required)
- API Key (required)
- Model (required)
- Temperature (optional, default 0.2)

Advanced/Optional:
- Use API Key toggle and Show/Hide key
- Use model list (fetch `/models`) to choose from a dropdown
- Custom chat completions URL for provider "Custom" (streaming supported)
- Search preferences:
  - DuckDuckGo only (no Google fallback)
  - Show Search button in composer
- Bridge token and toggle for MCP local WebSocket auth
- UI toggles: Reading overlay, Debug tools

Click "Test" to verify connectivity.

## Usage

- Summarize Page: summarize the whole page (trimmed for token safety)
- Summarize Selection: prioritize current text selection if present
- Inline Assistant: select text on any page to rewrite/simplify/translate via tooltip
- Quick Search: trigger DuckDuckGo search (with Google fallback) via side panel or agent call; configure DDG‑only in Options
- @mention tabs: in the chat composer, type "@" to select one or more tabs to use as context for that message. Auto‑follow active tab can also be enabled per session.
- Overlay sidebar: use the menu button to open the full‑screen overlay to manage chats, switch themes, and tweak context.

Output renders as Markdown in the side panel with streaming updates.

## How it Works

- `src/content.js` collects page text/selection, title, URL, language, and meta description.
- `src/background.js` builds prompts and calls your configured provider via `/v1/chat/completions` (streams when available). Also hosts search (DuckDuckGo first with Google fallback), SERP scraping, and the MCP bridge client.
- Side panel UI lives in `ui/sidepanel/` (React). Options UI lives in `ui/options/`.
- Settings are stored in `chrome.storage.sync`.
- Session context persistence and sharing use IndexedDB + BroadcastChannel in `src/lib/idb.js`.

## Files

- `manifest.json` — MV3 manifest with side panel, background service worker, and content script
- `src/background.js` — router/orchestrator; model calls, streaming, search tool, MCP bridge
- `src/content.js` — page extraction + inline assistant tooltip host
- `src/lib/idb.js` — minimal IndexedDB + BroadcastChannel wrapper for session context
- `ui/sidepanel/` — side panel React app (entry: `index.html`, `main.jsx`, `App.jsx`)
- `ui/options/` — options React app (entry: `index.html`, `main.jsx`, `App.jsx`)
- `ui/styles.css` — shared styles
- `mcp/search-server/` — optional MCP server bridging to the extension via local WebSocket

## Notes

- Host permissions are set to `*://*/*` for local dev. Restrict before publishing.
- API keys are stored in `chrome.storage.sync`. Avoid sharing Chrome profiles. Do not check in secrets.
- For pages loaded before you installed the extension, refresh so the content script can attach.

## Roadmap (nice-to-have)

- Readability-based extraction for cleaner text
- Render Markdown with a lightweight renderer
- "Read later" queue integrated with summaries
- Per-site auto-summarize toggle

## MCP Bridge (optional)

A standalone MCP server that bridges to the extension lives in `mcp/search-server/`.

### Unified dev workflow (extension + MCP server)

```bash
# from repo root
npm install
npm run build:mcp    # one-time build of MCP TS (or run dev below)
npm run dev:all      # runs Vite (extension) and MCP server watch in parallel
```

Then load the extension from `dist/` in Chrome (Developer mode → Load unpacked). The background service worker connects to the MCP bridge at `ws://127.0.0.1:17389` automatically when running.

To verify the connection:

- Open `chrome://extensions` → find this extension → "Service worker" → Inspect.
- You should see `[MCP Bridge] connected` in the console shortly after `npm run dev:all` starts.

### Build all

```bash
# from repo root
npm run build:all  # builds the extension (Vite) and MCP server (tsc)
```

### Start MCP server only

```bash
npm run start:mcp   # node mcp/search-server/dist/src/index.js
```

### Tools exposed

- `search({ query, numResults?, format? })` → Serper-like JSON (default) or text summary. Adds `_meta.urls` and `urls` in JSON.
- `visit_tool({ url, mode? })` → Returns compact JSON `{ url, success, title?, contentType, content }`. Uses extension first; falls back to HTTP fetch.
- `bridge_status()` → `connected: true|false` (extension ↔ bridge).
- `server_info()` → `{ name, version, ts }` to verify running binary.

### Configure in an MCP client (Claude Desktop)

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

See `mcp/search-server/README.md` for more details.

### WebSocket bridge (127.0.0.1:17389)

- The MCP server opens a local WebSocket bridge at `ws://127.0.0.1:17389`.
- The extension’s background service worker connects out to it automatically and handles `search` and `visit_tool` calls.

### Optional token authentication

- You can secure the bridge with a shared token:
  - Start MCP with `BRIDGE_TOKEN` set (env var).
  - Set the same token in the extension (Options → Bridge) under key `bridgeToken`.
  - Enable the toggle "Use token for bridge auth" (default: off). When enabled, the background appends `?t=…` to the WS URL.

Quick way to set the token in the extension (DevTools console of the service worker):

```js
chrome.storage.sync.set({ bridgeToken: 'your-secret' })
```

Then reload the extension or wait for it to auto-reconnect.

#### Adaptive server command copy (Options)

- The Options page provides a "Copy server command" button for convenience.
- With the token toggle Off → copies a plain `npm run dev[:mcp]`.
- With the token toggle On (and a token present) → includes `BRIDGE_TOKEN='…'` in the copied command.

### Troubleshooting: `ERR_CONNECTION_REFUSED`

- The MCP server isn’t running → start it via `npm run dev:all` or `npm run dev:mcp`.
- Port 17389 is in use → free it: `lsof -iTCP:17389 -sTCP:LISTEN` then `kill -9 <PID>`.
- Host/port overridden → ensure `BRIDGE_HOST=127.0.0.1` and `BRIDGE_PORT=17389` (default).
- Firewall blocked → allow local loopback connections for Node.

## Docs

- ADR-004 (MCP Bridge Security – Optional Token): [docs/adr-004-mcp-bridge-security.md](./docs/adr-004-mcp-bridge-security.md)
- ADR-005 (Bun-based Release Automation and Local Testing): [docs/adr-005-bun-release-automation.md](./docs/adr-005-bun-release-automation.md)
- ADR-003 (UI Positioning and Error Handling): [docs/adr-003-ui-positioning-and-error-handling.md](./docs/adr-003-ui-positioning-and-error-handling.md)
- ADR-003 (UX Improvements): [docs/adr-003-ux-improvements.md](./docs/adr-003-ux-improvements.md)
- SPEC v2 (Inline writing assistant tooltip): [docs/SPEC-v2.md](./docs/SPEC-v2.md)
- MCP server details: [mcp/search-server/README.md](./mcp/search-server/README.md)
- Agents Guide (architecture & flows): [agents.md](./agents.md)

## Releases

- Stable releases (tags)
  - Push a tag (e.g., `v0.1.2`) to create a GitHub Release with two zips:
    - `jan-extension-<tag>.zip` — Chrome extension bundle
    - `search-mcp-server-<tag>-dist.zip` — optional MCP server distribution
  - Trigger:
    ```bash
    git tag v0.1.2
    git push origin v0.1.2
    ```
  - CI: `.github/workflows/release.yml` (uses Bun for install/build).

- Nightly prereleases (incremental)
  - Every push to `main` updates a prerelease with tag `nightly` and uploads zips suffixed with the run number and short commit SHA.
  - CI: `.github/workflows/nightly.yml` patches `manifest.version_name` with `-nightly-<run>-<sha>`.

- Local packaging (dry run)
  - Validate packaging locally before tagging:
    ```bash
    # default timestamped tag
    npm run release:local

    # custom tag to mimic a real release name
    TAG=v0.1.2 npm run release:local
    ```
  - Outputs: `pack/jan-extension-<tag>.zip`, `pack/search-mcp-server-<tag>-dist.zip`.

See release.md for full details.

## License

Apache License 2.0 — see [LICENSE](./LICENSE)
