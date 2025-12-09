# Search MCP Server

A Model Context Protocol (MCP) server that provides browser automation tools through the Jan Browser extension. Exposes tools for web navigation, interaction, search, and observation to LLM clients like Claude Desktop and Jan Desktop.

- **Transport to client**: stdio via `@modelcontextprotocol/sdk`
- **Transport to extension**: WebSocket bridge (local) that the extension connects to
- **Available on npm**: `search-mcp-server`

## Quick Start with npx (Recommended)

The easiest way to use this MCP server with Jan Desktop app:

1. **Install the Jan Browser Extension** (required):
   - Download from the releases page or build from source
   - Load the extension in Chrome: `chrome://extensions` → Enable "Developer mode" → "Load unpacked" → select `dist/` folder
   - Verify the extension is running

2. **Configure Jan Desktop**:
   - Open Jan Desktop app → Settings → Extensions → Model Context Protocol
   - Add new MCP server:
     - **Name**: Jan Browser Extension
     - **Command**: `npx`
     - **Arguments**: `search-mcp-server@latest`
   - Save and restart Jan Desktop

3. **That's it!** The MCP server will be automatically installed and run via npx when needed.

**Advantages of npx**:
- No manual installation or building required
- Always uses the latest published version
- Automatically installs dependencies (including `ws`)
- No NVM/Node path issues

## Install from Source

Using npm:

```bash
cd mcp-server
npm install
npm run build
```

Using Bun:

```bash
cd mcp-server
bun install
bun run build
```

## Run (direct)

```bash
node dist/src/index.js
# or
bun run dist/src/index.js

# run a second instance on a different bridge port
node dist/src/index.js --bridge-port 17390
```

> [!TIP]
> Each MCP server process hosts its own WebSocket bridge. Operating systems only
> allow a single listener per `host:port`, so make sure every concurrently running
> instance uses a unique combination (for example `--bridge-port 17390`,
> `--bridge-port 17391`, and so on). You can also set the `BRIDGE_HOST`,
> `BRIDGE_PORT`, or `BRIDGE_URL` environment variables if you prefer to configure
> the endpoint outside of CLI arguments.

The process will wait on stdio for MCP clients. You usually don't run it manually—your MCP client will launch it.

## Run extension and MCP together (recommended for dev)

From the repo root, run both the extension build (watch) and the MCP server in watch mode:

```bash
npm install
npm run build:mcp    # one-time build of MCP TS (or skip if using dev)
npm run dev:all      # runs Vite (extension) + MCP server watcher
```

Then load the extension from `dist/` in Chrome (Developer mode → Load unpacked). Open the extension popup and press **Connect** to link it to the MCP server running at `ws://127.0.0.1:17389` (or any port you configured).

To verify the connection: open `chrome://extensions`, click "Service worker" → Inspect on this extension. You should see `[MCP Bridge] connected` shortly after starting `dev:all`.

## Configure in an MCP client

Below are common examples. Paths may vary.

### Claude Desktop

Edit your Claude Desktop MCP config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add an entry under `mcpServers`:

**Option 1: Using npx (Recommended)**
```json
{
  "mcpServers": {
    "jan-browser": {
      "command": "npx",
      "args": ["search-mcp-server@latest"]
    }
  }
}
```

**Option 2: Using local installation**
```json
{
  "mcpServers": {
    "jan-browser": {
      "command": "node",
      "args": ["/absolute/path/to/jan-browser-extension/mcp-server/dist/src/index.js"],
      "env": {
        "BRIDGE_HOST": "127.0.0.1",
        "BRIDGE_PORT": "17389"
      }
    }
  }
}
```

Restart Claude Desktop. Make sure the Jan Browser extension is running in Chrome. In a chat, you can use tools like `browser_navigate`, `browser_snapshot`, `browser_screenshot`, etc.

### Jan Desktop App

Jan Desktop supports MCP servers via the Model Context Protocol extension.

**Option 1: Using npx (Recommended)**

1. Open Jan Desktop app → Settings → Extensions → Model Context Protocol

2. Add a new MCP server:
   - **Name**: Jan Browser Extension
   - **Command**: `npx`
   - **Arguments**: `search-mcp-server@latest`

3. **Important**: Make sure the Jan Browser Chrome extension is installed and running:
   - Download from releases or build from source
   - Load the extension in Chrome: `chrome://extensions` → Enable "Developer mode" → "Load unpacked" → select `dist/` folder
   - The extension must be active for the MCP server to work

4. Save and restart Jan Desktop

**Option 2: Using local installation**

1. Build the MCP server first:
   ```bash
   cd /path/to/jan-browser-extension/mcp-server
   npm install
   npm run build
   ```

2. Open Jan Desktop app → Settings → Extensions → Model Context Protocol

3. Add a new MCP server:
   - **Name**: Jan Browser Extension
   - **Command**: `node`
   - **Arguments**: `/absolute/path/to/jan-browser-extension/mcp-server/dist/src/index.js`
   - **Environment variables** (optional):
     - `BRIDGE_HOST`: `127.0.0.1`
     - `BRIDGE_PORT`: `17389`

4. Make sure the Chrome extension is installed and running (see above)

5. Save and restart Jan Desktop

**Available Tools**: `browser_snapshot`, `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, and more.

**Troubleshooting Jan Desktop:**
- If you see "Failed to start MCP server", ensure the path to `index.js` is absolute and correct
- Check that Node.js is installed and accessible in your PATH: `which node`
- Verify the build completed successfully: `ls /path/to/mcp-server/dist/src/index.js`
- Ensure the file is executable: `chmod +x /path/to/mcp-server/dist/src/index.js`
- **NVM users**: If you use NVM for Node.js, Jan Desktop may not find node in your PATH. Use one of these solutions:
  - **Option 1 (Recommended)**: Use the wrapper script instead:
    - Command: `/absolute/path/to/jan-browser/mcp-server/start-mcp.sh`
    - Args: (leave empty)
  - **Option 2**: Use absolute path to node:
    - Command: `/Users/YOUR_USERNAME/.nvm/versions/node/vXX.XX.X/bin/node`
    - Args: `/absolute/path/to/jan-browser/mcp-server/dist/src/index.js`
  - **Option 3**: Install node system-wide (outside NVM) and use `node` as command
- **Port conflict**: If port 17389 is in use, kill the existing process:
  ```bash
  lsof -iTCP:17389 -sTCP:LISTEN | grep node | awk '{print $2}' | xargs kill -9
  ```
- Check Jan Desktop logs for more detailed error messages

### VS Code (via an MCP-enabled extension)

If your extension supports MCP servers by command, configure it to launch:

- Command: `node`
- Args: `.../mcp-server/dist/src/index.js`
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

- `BRIDGE_HOST` (optional): Host for the WebSocket bridge server. Default `127.0.0.1`. (CLI: `--bridge-host`/`-H`)
- `BRIDGE_PORT` (optional): Port for the WebSocket bridge server. Default `17389`. (CLI: `--bridge-port`/`-p`)
- `BRIDGE_TOKEN` (optional): If set, the MCP server requires clients to provide `?t=<token>` on connection. The extension background will read `bridgeToken` from `chrome.storage.sync` and add it automatically.
- `MCP_LOG_FILE` (optional): If set, the server appends startup and minimal operational logs to this file.

## Notes

- The Chrome extension must be loaded and running. Its background service worker will connect out to the bridge automatically and handle `search` calls (opens SERP tab, scrapes, returns results).
- If the extension is not connected yet, tool calls will retry up to 10 times (with 100 ms spacing) while waiting for the bridge to reconnect before returning "Browser extension not connected to bridge".
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

## Troubleshooting

### `ERR_CONNECTION_REFUSED`

- The MCP server isn't running → start it (`npm run dev:mcp`) or `npm run dev:all` from the repo root.
- Port 17389 is busy → free it: `lsof -iTCP:17389 -sTCP:LISTEN` then `kill -9 <PID>`.
- Host/port overridden incorrectly → ensure `BRIDGE_HOST=127.0.0.1` and `BRIDGE_PORT=17389`.
- Token mismatch → if `BRIDGE_TOKEN` is set, ensure the extension has the same `bridgeToken` in `chrome.storage.sync`.

### Tools Timing Out

If you experience timeouts with `browser_navigate` or other tools:

1. **Verify extension connection**: Check Chrome extension service worker console for `[MCP Bridge] connected`
2. **Enable debug logging**: Set `MCP_LOG_FILE` environment variable:
   ```bash
   MCP_LOG_FILE=~/.jan-mcp-debug.log node dist/src/index.js
   ```
3. **Check logs**: Review log file for detailed message flow
4. **Test manually**: Use the included test script:
   ```bash
   MCP_LOG_FILE=~/.jan-mcp-test.log node test-manual.js
   ```

See [TIMEOUT_FIX.md](TIMEOUT_FIX.md) for details on the Buffer handling fix that resolved timeout issues.

## License

Apache License 2.0 — see [LICENSE](../../LICENSE)
