# Jan Summarizer (Chrome Extension)

A Manifest V3 Chrome extension that summarizes the current page (or selected text) using any OpenAI-compatible API, including Cerebras and Jan Server.

- Side Panel UI to trigger summaries
- Content script extracts visible page text (or your selection)
- Background service worker calls `/v1/chat/completions`

## Quick Start

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/menloresearch/jan-browser-extension.git
    cd jan-browser-extension
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the extension:**
    ```bash
    npm run build
    ```
4.  **Load the extension in Chrome:**
    *   Open `chrome://extensions` in Chrome.
    *   Enable "Developer mode".
    *   Click "Load unpacked" and select the `dist` folder.
5.  **Configure and use the extension:**
    *   Pin the extension and click it to open the Side Panel.
    *   Click the settings (⚙️) button in the side panel to configure your API.

## Configuration

Open the Options page (⚙️ in the side panel) and set:

- Provider Preset
  - Cerebras → sets base to `https://api.cerebras.ai/v1`
  - Jan Server → sets base to `http://localhost:1337/v1`
  - Custom → any OpenAI-compatible base URL
- API Base URL (required)
- API Key (required)
- Model (required)
- Temperature (optional, default 0.2)

Click "Test" to verify connectivity.

## Usage

- "Summarize Page": summarizes the whole page (trimmed to a safe length)
- "Summarize Selection": prioritizes current text selection (if present)

Output is plain Markdown in the side panel.

## How it Works

- `src/content.js` collects `document.body.innerText`, selection text, title, URL, lang, and meta description.
- `src/background.js` sends these to your configured endpoint via `/chat/completions` with a structured prompt.
- `src/sidepanel.html` + `src/sidepanel.js` provide the UI.
- `src/options.html` + `src/options.js` manage settings via `chrome.storage.sync`.

## Files

- `manifest.json` — MV3 manifest with side panel, background service worker, and content script
- `src/background.js` — service worker; calls the model
- `src/content.js` — collects page data
- `src/sidepanel.html` / `src/sidepanel.js` — side panel UI
- `src/options.html` / `src/options.js` — settings UI
- `src/styles.css` — shared styles

## Notes

- Host permissions are set to `*://*/*` for local dev. Restrict before publishing.
- API keys are stored in `chrome.storage.sync`. Avoid sharing Chrome profiles. Do not check in secrets.
- For pages loaded before you installed the extension, refresh so the content script can attach.

## Roadmap (nice-to-have)

- Readability-based extraction for cleaner text
- Render Markdown with a lightweight renderer
- "Read later" queue integrated with summaries
- Per-site auto-summarize toggle

## MCP: Search Server

A standalone MCP server that bridges to the Chrome extension lives in `mcp/search-server/`.

### Unified dev workflow (extension + MCP server)

```bash
# from repo root
npm install
npm run build:mcp    # one-time build of MCP TS (or run dev below)
npm run dev:all      # runs Vite (extension) and MCP server watch in parallel
```

Then load the extension from `dist/` in Chrome (Developer mode → Load unpacked). The background service worker will connect to the MCP bridge at `ws://127.0.0.1:17389` automatically when running.

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
- SPEC v2 (Inline writing assistant tooltip): [docs/SPEC-v2.md](./docs/SPEC-v2.md)
- MCP server details: [mcp/search-server/README.md](./mcp/search-server/README.md)

## License

Apache License 2.0 — see [LICENSE](./LICENSE)
