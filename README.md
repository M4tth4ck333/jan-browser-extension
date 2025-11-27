# Jan Browser MCP Extension

> A lean browser extension that keeps track of automation tabs and exposes them to Jan's Model Context Protocol (MCP) bridge.

## Capabilities

- 🔌 Persistent MCP WebSocket bridge
- 🧭 Tab registration helpers used by MCP automation tools
- 🔍 DuckDuckGo and Google search scraping for MCP workflows
- 🖼️ Screenshot, DOM snapshot, and interaction helpers (click, type/keys, set form inputs)

---

## Quick Start

### Install from Chrome Web Store (Recommended)

1. Visit the [Jan Browser MCP Extension](https://chromewebstore.google.com/detail/jan-browser-mcp/mkciifcjehgnpaigoiaakdgabbpfppal) on Chrome Web Store
2. Click **"Add to Chrome"** to install
3. Pin the extension for quick access

✅ You're ready to use Jan Browser MCP!

---

### Manual Installation (Alternative)

<details>
<summary>Click to expand manual installation options</summary>

#### Option 1: Download from GitHub Releases

1. Go to [Jan's GitHub releases page](https://github.com/janhq/jan-browser-extension/releases/) → click "dist.zip" under the latest version
2. Unzip the downloaded file
3. Load in Chrome (see instructions below)

#### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/janhq/jan-browser-extension.git
cd jan-browser-extension

# Install dependencies
npm install

# Build for Chromium-based browsers
npm run build

# Or build a Firefox-compatible bundle
npm run build:firefox
```

#### Load in Chrome

1. Open `chrome://extensions` or **Chrome Settings → Extensions**
2. Enable **Developer mode** (toggle ON)
3. Click **Load unpacked** → select the `dist` folder
4. Pin the extension if you want quick visibility

</details>

---

### Use with Jan Desktop

If you have [Jan Desktop](https://jan.ai) installed, you can connect it seamlessly with the browser extension:

1. **Open Jan Desktop** → Navigate to **Settings** → **MCP Servers**
2. **Enable** the **Jan Browser MCP (official)** server
3. **Verify the port** matches between Jan and the extension:
   - Default port: `17389`
   - In Jan: Set `BRIDGE_PORT` environment variable if using a custom port
   - In Extension: Click the extension icon → Check **Settings** → Ensure port matches
4. **Connect the bridge**:
   - Click the extension icon in Chrome
   - Click **Connect** to establish the WebSocket connection
   - You should see a "Connected" status indicator

**Tab Selection**:
- **Use current tab**: Click "Set current tab for browser use" to let Jan control your active tab
- **New tab**: Jan will automatically open and focus a new tab for automation

✅ Once connected, Jan can use browser automation tools through MCP!

## Project Structure

```
jan-browser/
├── src/
│   ├── background/            # Service worker for MCP routing
│   │   └── index.js
│   ├── content/               # Page data + SERP helpers for MCP tools
│   │   └── index.js
│   ├── constants.js           # Message types, timeouts, defaults
│   ├── popup/                 # React + Tailwind popup UI (Vite entry)
│   ├── mcp-bridge.js          # WebSocket bridge for the local MCP server
│   ├── lib/
│   │   ├── fetch-utils.js     # Async helpers, retries, timeouts
│   │   └── tab-manager.js     # Centralized tab selection & validation
│   ├── search/                # DuckDuckGo/Google helpers
│   └── mcp-tools/             # Browser automation tools (visit, click, etc.)
│
├── mcp-server/                # Optional MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts           # WebSocket server entry
│   │   └── tools/             # MCP tool implementations
│   └── README.md
│
├── manifest.json              # Chrome MV3 manifest
├── manifest.firefox.json      # Firefox MV3 manifest
├── scripts/build-extension.mjs# Builds React UI + copies runtime scripts
└── package.json               # Scripts & dependencies
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

The popup experience has been rebuilt with React, Tailwind CSS, and shadcn-inspired components so that the extension feels polished while keeping automation logic isolated:

- 🧩 UI lives under `src/popup` with modern component patterns
- 🧠 Core automation, bridge, and content logic remain framework-free under `src/lib`, `src/mcp-tools`, and friends
- 🏗️ `scripts/build-extension.mjs` compiles the popup via Vite and assembles the final extension bundle

Use the MCP server (`mcp-server`) if you need a local bridge that exposes the browser tools to an LLM client.
