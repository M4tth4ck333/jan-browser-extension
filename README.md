# Jan Browser MCP Extension

> A lean browser extension that keeps track of automation tabs and exposes them to Jan's Model Context Protocol (MCP) bridge.

## Capabilities

- 🔌 Persistent MCP WebSocket bridge
- 🧭 Tab registration helpers used by MCP automation tools
- 🔍 DuckDuckGo and Google search scraping for MCP workflows
- 🖼️ Screenshot, DOM snapshot, and interaction helpers (click, type, fill forms)

---

## Quick Start (5 minutes)

### 1. Install dependencies

```bash
# Clone the repository
git clone https://github.com/menloresearch/jan-browser-extension.git
cd jan-browser-extension

# Install (npm is sufficient for the minimal build script)
npm install
```

### 2. Build the extension

```bash
# Build for Chromium-based browsers
npm run build

# Build a Firefox-compatible bundle
npm run build:firefox
```

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist` folder
4. Pin the extension if you want quick visibility

✅ You're ready to use Jan Browser MCP!

---

## Project Structure

```
jan-browser/
├── src/
│   ├── background.js          # Minimal service worker for MCP routing
│   ├── content.js             # Page data + SERP helpers for MCP tools
│   ├── constants.js           # Message types, timeouts, defaults
│   ├── mcp-bridge.js          # WebSocket bridge for the local MCP server
│   ├── lib/
│   │   ├── fetch-utils.js     # Async helpers, retries, timeouts
│   │   └── tab-manager.js     # Centralized tab selection & validation
│   ├── search/                # DuckDuckGo/Google helpers
│   └── mcp-tools/             # Browser automation tools (visit, click, etc.)
│
├── mcp/
│   └── search-server/         # Optional MCP server (TypeScript)
│       ├── src/
│       │   ├── index.ts       # WebSocket server entry
│       │   └── tools/         # MCP tool implementations
│       └── README.md
│
├── manifest.json              # Chrome MV3 manifest
├── manifest.firefox.json      # Firefox MV3 manifest
├── scripts/build-extension.mjs# Simple copy-based build script
└── package.json               # Minimal scripts
```

---

## Development Workflow

```bash
# Extension only
npm run build              # Production build
npm run build:firefox      # Firefox bundle

# MCP server only
npm run build:mcp          # Build TypeScript → JavaScript
npm run dev:mcp            # Watch mode
npm run start:mcp          # Run production build

# Everything together
npm run build:all          # Build extension + MCP server
npm run build:all:firefox  # Firefox manifest + MCP server
```

---

## Why this refactor?

The extension no longer ships a chat UI, side panel, or inline assistant. All remaining code exists solely to support the browser MCP toolchain:

- No React, Vite, Tailwind, Playwright, or Vitest dependencies
- A tiny service worker dedicated to MCP bridge management
- Content script logic focused on search scraping and DOM capture
- Build scripts that simply copy files into `dist/`

Use the MCP server (`mcp/search-server`) if you need a local bridge that exposes the browser tools to an LLM client.
