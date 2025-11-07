# Jan Browser Extension

> A Chrome extension that brings AI chat, inline writing assistance, web search, and page context to your browser. Works with Jan (local), Jan Server, Cerebras, OpenAI, and any OpenAI-compatible API.

**Key Features:**
- 💬 Side panel chat with streaming responses
- ✍️ Inline writing assistant for selected text (rewrite/translate)
- 🔍 Smart web search (DuckDuckGo + Google fallback)
- 📄 Page summarization with context awareness
- 🤖 Optional MCP bridge for browser automation

---

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
# Clone the repository
git clone https://github.com/menloresearch/jan-browser-extension.git
cd jan-browser-extension

# Install (Bun recommended, npm works too)
bun install  # or: npm install
```

### 2. Build the Extension

```bash
# Build for Chrome
bun run build  # or: npm run build

# Watch mode (auto-rebuild on changes)
bun run dev:ext  # or: npm run dev:ext
```

### 3. Load in Chrome

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → Select the `dist` folder
4. Pin the extension to your toolbar

### 4. Configure Your API

1. Click the extension icon → Opens side panel
2. Click ⚙️ (settings icon) → Opens Options page
3. Choose your provider:
   - **Jan (Local)**: `http://localhost:1337/v1`
   - **Cerebras**: `https://api.cerebras.ai/v1`
   - **OpenAI**: `https://api.openai.com/v1`
   - **Custom**: Any OpenAI-compatible endpoint
4. Enter your **API Key** and **Model name**
5. Click **Test** to verify connectivity

✅ You're ready to use Jan Browser!

---

## For Contributors

### Project Structure (Refactored!)

The codebase is now modular and maintainable:

```
jan-browser/
├── src/
│   ├── background.js          # Main orchestrator (~540 lines, down from 2,912!)
│   ├── content.js             # Page content extraction & inline assistant
│   │
│   ├── constants.js           # All constants, message types, timeouts
│   ├── settings.js            # API configuration & testing
│   ├── prompts.js             # Prompt builders (summarize, inline assist)
│   ├── mcp-bridge.js          # WebSocket bridge for MCP server
│   │
│   ├── lib/                   # Shared utilities
│   │   ├── event-routing.js   # Port management & streaming
│   │   ├── fetch-utils.js     # Async helpers, retries, timeouts
│   │   ├── tab-manager.js     # Centralized tab selection
│   │   └── idb.js             # IndexedDB + BroadcastChannel
│   │
│   ├── streaming/             # LLM streaming implementations
│   │   ├── openai-stream.js   # OpenAI-compatible streaming
│   │   ├── anthropic-stream.js # Anthropic-specific streaming
│   │   └── index.js           # Unified interface
│   │
│   ├── search/                # Web search implementations
│   │   ├── google-search.js   # Google SERP scraping
│   │   ├── duckduckgo-search.js # DuckDuckGo HTML parsing
│   │   └── index.js           # Search exports
│   │
│   ├── mcp-tools/             # Browser automation tools (12 tools)
│   │   ├── automation.js      # click, type, fill, hover, etc.
│   │   ├── navigation.js      # visit, back, forward, scroll
│   │   ├── observation.js     # screenshot, ARIA snapshot
│   │   ├── search.js          # Search tool wrapper
│   │   └── index.js           # Tool registry & dispatcher
│   │
│   └── config/
│       └── defaults.json      # Default settings (centralized)
│
├── ui/
│   ├── sidepanel/             # React app for side panel
│   │   ├── App.jsx           # Main chat UI
│   │   ├── main.jsx          # Entry point
│   │   └── index.html        # HTML template
│   │
│   ├── options/               # React app for options page
│   │   ├── App.jsx           # Settings UI
│   │   ├── main.jsx          # Entry point
│   │   └── index.html        # HTML template
│   │
│   ├── styles.css            # Shared global styles
│   └── themes.css            # Theme variables
│
├── mcp/
│   └── search-server/         # Optional MCP server (TypeScript)
│       ├── src/
│       │   ├── index.ts      # WebSocket server entry
│       │   ├── tools/        # MCP tool implementations
│       │   └── utils/        # ARIA snapshot, bridge utils
│       └── README.md         # MCP server documentation
│
├── manifest.json             # Chrome extension manifest (MV3)
├── vite.config.js            # Build configuration
└── package.json              # Dependencies & scripts
```

### Key Architectural Changes (January 2025 Refactor)

**Before**: Single 2,912-line `background.js` with everything mixed together
**After**: 18 focused modules with clear responsibilities (81% reduction!)

**Benefits for contributors:**
- 🎯 **Easy to find code**: Clear module boundaries by feature
- 🧪 **Easier to test**: Each module can be tested independently
- 📦 **Reusable utilities**: Shared code in `lib/`
- 🛠️ **Simple to extend**: Add new MCP tools by creating a new file in `mcp-tools/`
- 📖 **Self-documenting**: File names reflect their purpose

### Development Workflow

#### Build Commands

```bash
# Extension only
npm run build              # Production build
npm run dev:ext            # Watch mode (auto-rebuild)

# MCP server only
npm run build:mcp          # Build TypeScript → JavaScript
npm run dev:mcp            # Watch mode
npm run start:mcp          # Run production build

# Everything together (recommended)
npm run build:all          # Build extension + MCP server
npm run dev:all            # Watch both in parallel
```

#### Testing

```bash
# Run all tests
npm run test:run           # or: bun run test:run

# Watch mode
npm test                   # or: bun test

# E2E tests (Playwright)
npx playwright install     # First time only
npm run test:e2e
```

#### Debugging

**Service Worker (background.js):**
1. `chrome://extensions` → This extension → **Service worker** → Inspect
2. Console logs appear here

**Content Script (content.js):**
1. Open any webpage → Right-click → **Inspect**
2. Console tab → Filter by filename: `content.js`

**Side Panel UI:**
1. Open side panel → Right-click inside → **Inspect**

**MCP Bridge:**
1. Run `npm run dev:mcp` in terminal
2. Check service worker console for `[MCP Bridge] connected`

### Adding New Features

#### Add a New MCP Tool

1. Create a new file in `src/mcp-tools/` (e.g., `my-tool.js`)
2. Export a handler function:
   ```javascript
   export async function handleMyTool(params) {
     // Your tool logic
     return { ok: true, data: { ... } };
   }
   ```
3. Register in `src/mcp-tools/index.js`:
   ```javascript
   import { handleMyTool } from './my-tool.js';

   export const mcpToolHandlers = {
     // ... existing tools
     my_tool: handleMyTool,
   };
   ```

#### Add a New Message Type

1. Add constant to `src/constants.js`:
   ```javascript
   export const MessageTypes = {
     // ... existing types
     MY_NEW_MESSAGE: 'MY_NEW_MESSAGE',
   };
   ```
2. Add handler in `src/background.js`:
   ```javascript
   if (message?.type === MessageTypes.MY_NEW_MESSAGE) {
     // Handle message
     sendResponse({ ok: true });
     return true;
   }
   ```

#### Add a New Provider

1. Edit `src/config/defaults.json`:
   ```json
   {
     "providers": {
       "my-provider": {
         "apiBase": "https://api.example.com/v1"
       }
     }
   }
   ```
2. Rebuild and reload extension

### Code Style & Guidelines

- **Imports**: Use ES6 modules (`import/export`)
- **Constants**: Define in `src/constants.js`
- **Error handling**: Always use try-catch for async operations
- **Logging**: Use `console.log/warn/error` with clear prefixes
- **Comments**: Explain *why*, not *what*
- **Functions**: Keep them small and focused (< 50 lines)

### Important Files to Know

| File | Purpose | When to Edit |
|------|---------|--------------|
| `src/background.js` | Message routing, lifecycle events | Add new message handlers |
| `src/constants.js` | All constants & message types | Add new constants |
| `src/settings.js` | API configuration & testing | Modify API logic |
| `src/mcp-tools/index.js` | MCP tool registry | Register new tools |
| `src/streaming/index.js` | Streaming router | Add new streaming providers |
| `manifest.json` | Extension permissions & metadata | Change permissions, version |
| `vite.config.js` | Build configuration | Add new build targets |

### Common Tasks

**Change default settings:**
```bash
# Edit this file
src/config/defaults.json
```

**Add a timeout constant:**
```javascript
// In src/constants.js
export const MY_TIMEOUT = 5000;
```

**Debug streaming issues:**
```javascript
// Check: src/streaming/openai-stream.js or anthropic-stream.js
// Add console.log in the SSE parsing loop
```

**Fix tab selection logic:**
```javascript
// Check: src/lib/tab-manager.js
// The selectTab() function handles all tab selection
```

---

## MCP Bridge (Optional)

The extension includes an optional **MCP (Model Context Protocol)** server that exposes browser automation tools to LLM clients like Claude Desktop.

### Quick Setup

```bash
# Build & run MCP server
npm run build:mcp
npm run start:mcp

# Or watch mode
npm run dev:mcp
```

The server runs at `ws://127.0.0.1:17389` and connects to the extension automatically.

### Available Tools (12 total)

**Automation:**
- `click`, `type`, `hover`, `fill_form`, `select_option`, `execute_script`

**Navigation:**
- `visit`, `go_back`, `go_forward`, `scroll`

**Observation:**
- `screenshot`, `snapshot` (ARIA tree for LLM-friendly page structure)

See [`mcp/search-server/README.md`](mcp/search-server/README.md) for detailed documentation.

---

## Documentation

- **[agents.md](agents.md)** - Architecture, message flow, extending agents
- **[behavior.md](behavior.md)** - Tab/session/context behavior with code pointers
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Setup, test scripts, PR guidelines
- **[mcp/search-server/README.md](mcp/search-server/README.md)** - MCP bridge setup & tools

---

## Releases

### Stable Releases (Tags)

```bash
# Create a new release
git tag v0.1.3
git push origin v0.1.3
```

CI automatically creates a GitHub Release with:
- `jan-extension-v0.1.3.zip` (Chrome extension)
- `search-mcp-server-v0.1.3-dist.zip` (MCP server)

### Nightly Prereleases

Every push to `main` updates the `nightly` tag with:
- `jan-extension-nightly-<run>-<sha>.zip`
- `search-mcp-server-nightly-<run>-<sha>-dist.zip`

### Local Testing

```bash
# Test packaging locally (doesn't create a tag)
npm run release:local

# Or with custom tag
TAG=v0.1.3 npm run release:local
```

Outputs to `pack/` directory.

---

## Troubleshooting

### Extension won't load
- Ensure you ran `npm run build` first
- Check `dist/` folder exists and has files
- Reload the extension: `chrome://extensions` → Reload button

### API connection fails
- Click **Test** in Options to see the error
- Check your API base URL format (must end with `/v1`)
- For local servers, ensure they're running
- Check API key is correct

### MCP bridge won't connect
- Start the server: `npm run dev:mcp`
- Check service worker console for `[MCP Bridge] connected`
- Ensure port 17389 is not in use: `lsof -iTCP:17389`

### Changes not appearing
- **Extension code**: Reload extension + refresh webpage
- **Service worker**: Click "Service worker" link to restart
- **UI changes**: Hard refresh the side panel (Cmd+Shift+R)

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes** (see "For Contributors" section above)
4. **Test your changes**: `npm run test:run`
5. **Build**: `npm run build` (ensure no errors)
6. **Commit**: Use clear, descriptive commit messages
7. **Push**: `git push origin feature/my-feature`
8. **Create a Pull Request**

**Good first issues:**
- Add a new MCP tool (see `src/mcp-tools/` examples)
- Improve error messages
- Add unit tests for utilities
- Update documentation

---

## License

Apache License 2.0 - see [LICENSE](./LICENSE)

---

## Need Help?

- 📖 Read [CLAUDE.md](CLAUDE.md) for detailed codebase documentation
- 🐛 Found a bug? [Open an issue](https://github.com/janhq/jan-browser/issues)
- 💬 Questions? Check [existing issues](https://github.com/janhq/jan-browser/issues) first
- 🤝 Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md)
