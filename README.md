# Jan Summarizer (Chrome Extension)

A Manifest V3 Chrome extension that summarizes the current page (or selected text) using any OpenAI-compatible API, including Cerebras and Jan Server.

- Side Panel UI to trigger summaries
- Content script extracts visible page text (or your selection)
- Background service worker calls `/v1/chat/completions`

## Quick Start

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/jan-browser-extension.git
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

A standalone MCP server that exposes a `search` tool (Google) lives in `mcp/search-server/`.

- Install & build:
  ```bash
  cd mcp/search-server
  npm install
  npm run build
  ```
- Configure your MCP client (e.g., Claude Desktop) to launch `node mcp/search-server/dist/index.js`.
- Optional env for Google CSE: `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`.

See `mcp/search-server/README.md` for detailed usage and client configuration.

## License

MIT
