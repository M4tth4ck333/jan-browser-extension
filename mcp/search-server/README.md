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
node dist/index.js
# or
bun run dist/index.js
```

The process will wait on stdio for MCP clients. You usually don't run it manually—your MCP client will launch it.

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
      "args": ["/absolute/path/to/jan-browser-extension/mcp/search-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. In a chat, ask it to use the `search` tool (e.g., "search the web for ..."), and it will call this server.

### VS Code (via an MCP-enabled extension)

If your extension supports MCP servers by command, configure it to launch:

- Command: `node`
- Args: `.../mcp/search-server/dist/index.js`
  (no special env needed)

## Usage

The server exposes one tool:

- `search({ query: string, numResults?: number })`
  - Returns a short, readable text summary and a list of `resource_link`s for the top results.
  - Set `numResults` (1–10) to limit results (default 5).

Example prompt in your MCP client:

> Use the search tool to find recent articles on "hybrid search vector databases" (5 results). Provide titles and URLs.

## Environment

- `BRIDGE_HOST` (optional): Host for the WebSocket bridge server. Default `127.0.0.1`.
- `BRIDGE_PORT` (optional): Port for the WebSocket bridge server. Default `17389`.

## Notes

- The Chrome extension must be loaded and running. Its background service worker will connect out to the bridge automatically and handle `search` calls by opening a Google SERP tab, scraping with a content script, and returning results.
- If the extension is not connected yet, tool calls will error with "Browser extension not connected to bridge".

## License

MIT
