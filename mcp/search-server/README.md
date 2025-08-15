# Search MCP Server (TypeScript)

A minimal MCP server that exposes a single `search` tool for LLM clients (Claude Desktop, VS Code MCP extensions). It acts as a bridge to the Chrome extension, which actually performs the Google search and SERP scraping in a real browser for higher-quality results.

- Transport to client: stdio via `@modelcontextprotocol/sdk`.
- Transport to extension: WebSocket bridge (local) that the extension connects to.

## Install

Using npm:

```bash
cd mcp/search-server
npm install
npm run build
```

Using Bun:

```bash
cd mcp/search-server
bun install
bun run build
```

## Run (direct)

```bash
node dist/src/index.js
# or
bun run dist/src/index.js
```

The process will wait on stdio for MCP clients. You usually don't run it manually—your MCP client will launch it.

## Run extension and MCP together (recommended for dev)

From the repo root, run both the extension build (watch) and the MCP server in watch mode:

```bash
npm install
npm run build:mcp    # one-time build of MCP TS (or skip if using dev)
npm run dev:all      # runs Vite (extension) + MCP server watcher
```

Then load the extension from `dist/` in Chrome (Developer mode → Load unpacked). The background service worker will connect out to the local bridge at `ws://127.0.0.1:17389` automatically when the MCP server is running.

To verify the connection: open `chrome://extensions`, click "Service worker" → Inspect on this extension. You should see `[MCP Bridge] connected` shortly after starting `dev:all`.

## Configure in an MCP client

Below are common examples. Paths may vary.

### Claude Desktop

Edit your Claude Desktop MCP config file (on macOS):

- `~/Library/Application Support/Claude/claude_desktop_config.json`

Add an entry under `mcpServers`:

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

Restart Claude Desktop. In a chat, ask it to use the `search` tool (e.g., "search the web for ..."), and it will call this server.

### VS Code (via an MCP-enabled extension)

If your extension supports MCP servers by command, configure it to launch:

- Command: `node`
- Args: `.../mcp/search-server/dist/src/index.js`
  (no special env needed)

## Usage

The server exposes tools:

- `search({ query: string, numResults?: number, format?: "serper" | "text" })`
  - Default `format` is `"serper"`. Returns a Serper-like JSON with `organic`, optional `knowledgeGraph`, optional `peopleAlsoAsk`, and `urls` array. `_meta.urls` also included.
  - `format: "text"` returns a human-readable summary list.
  - `numResults` (1–10), default `5`.
- `visit_tool({ url: string, mode?: "markdown" | "html" | "text" })`
  - Extracts page content via the extension (preferred) or HTTP fetch fallback.
  - Returns compact JSON string: `{ url, success, title?, contentType, content }`.
- `bridge_status()` → `connected: true|false`.
- `server_info()` → `{ name, version, ts }`.

Example prompt in your MCP client:

> Use the search tool to find recent articles on "hybrid search vector databases" (5 results). Provide titles and URLs.

## Environment

- `BRIDGE_HOST` (optional): Host for the WebSocket bridge server. Default `127.0.0.1`.
- `BRIDGE_PORT` (optional): Port for the WebSocket bridge server. Default `17389`.
- `BRIDGE_TOKEN` (optional): If set, the MCP server requires clients to provide `?t=<token>` on connection. The extension background will read `bridgeToken` from `chrome.storage.sync` and add it automatically.
- `MCP_LOG_FILE` (optional): If set, the server appends startup and minimal operational logs to this file.

## Notes

- The Chrome extension must be loaded and running. Its background service worker will connect out to the bridge automatically and handle `search` calls (opens SERP tab, scrapes, returns results).
- If the extension is not connected yet, tool calls will wait briefly and then may error with "Browser extension not connected to bridge".
- Ensure the bridge port is free. On macOS, you can find/kill the process using `lsof -iTCP:17389 -sTCP:LISTEN` then `kill -9 <PID>`.

## Unified Dev with the Extension

From the repo root you can run both the extension dev server (Vite) and the MCP server in watch mode:

```bash
npm install
npm run dev:all  # runs Vite (extension) + MCP server watcher
```

Load the extension from `dist/` in Chrome (Developer mode → Load unpacked). When the MCP server starts, it exposes tools over stdio. If `MCP_LOG_FILE` is set, it writes a brief startup line to that file.

## Optional token authentication

To secure the local bridge:

1) Set an environment variable when launching via your MCP client (or locally):

```bash
BRIDGE_TOKEN='your-secret' npm run dev:mcp
```

2) Set the same token in the extension’s storage. Quick way from the service worker DevTools console:

```js
chrome.storage.sync.set({ bridgeToken: 'your-secret' })
```

Reload the extension or wait for it to reconnect.

## Troubleshooting: `ERR_CONNECTION_REFUSED`

- The MCP server isn’t running → start it (`npm run dev:mcp`) or `npm run dev:all` from the repo root.
- Port 17389 is busy → free it: `lsof -iTCP:17389 -sTCP:LISTEN` then `kill -9 <PID>`.
- Host/port overridden incorrectly → ensure `BRIDGE_HOST=127.0.0.1` and `BRIDGE_PORT=17389`.
- Token mismatch → if `BRIDGE_TOKEN` is set, ensure the extension has the same `bridgeToken` in `chrome.storage.sync`.

## License

Apache License 2.0 — see [LICENSE](../../LICENSE)
