# Jan Browser Extension MCP Tools

## Overview
This simplifies the MCP spec to the two tools the agent actually needs and already uses. Both tools return a single inner‑HTML string of nice, readable text (not a big JSON object). The HTML is sanitized and suitable to render directly in the UI.

Tools exposed via MCP:
- scrape — get readable content (current tab by default, or a provided URL)
- search — run a Google search and return a readable results snippet

The extension remains Manifest V3 (service worker) and uses existing content scripts and side panel UI. Tools are implemented in `src/background.js` and content scripts, wrapped by a thin JSON‑RPC interface compatible with Model Context Protocol (MCP).

## Permissions
- host_permissions: ["https://*/*", "http://*/*", "https://www.google.com/*"]
- permissions: ["activeTab", "tabs", "scripting", "storage"]

## Tools

### scrape
- description: Return readable inner HTML from the current tab (or from a specific URL if provided). Uses the existing extraction pipeline and selection when available.
- input (arguments object):
  - url: string (optional) — when provided, open/sandbox and extract that page; otherwise use the active tab
  - selectionOnly: boolean (optional, default false) — prefer the user’s selection when present
  - maxChars: number (optional, default 16000) — soft cap for extracted text
- output (MCP):
  - result.content: one text part where `text` is sanitized inner HTML (paragraphs, headings, links, lists). No extra JSON envelope.

Example response content text (truncated):
```
<article>
  <h1>Page Title</h1>
  <p>Cleaned, readable text…</p>
  <p><a href="https://example.com">Source</a></p>
</article>
```

### search
- description: Run a Google search by opening `https://www.google.com/search?q=…` and parsing the results in a hidden tab (DOM mode only). No external APIs.
- input (arguments object):
  - query: string (required)
  - numResults: number (optional, default 8, max 20)
- output (MCP):
  - result.content: one text part where `text` is sanitized inner HTML representing a neat list of results (title, URL, snippet).

Example response content text (truncated):
```
<section>
  <h2>Google Results</h2>
  <ol>
    <li>
      <a href="https://example.com">Example Title</a>
      <div class="snippet">A short summary of the page…</div>
    </li>
    …
  </ol>
</section>
```

## MCP Surface
- tools/list returns only two tools: `scrape` and `search`.
- tools/call returns `result.content` with a single text part (the HTML string). No additional machine‑readable payload is required.

## Notes and Constraints
- Output is sanitized HTML intended for direct rendering as “nice text”.
- For `scrape` without `url`, restrict to http/https tabs and respect user selection when available.
- For `search`, rate‑limit navigation to Google and add small randomized backoff.

## Acceptance Criteria
- tools/list exposes exactly `scrape` and `search`.
- `scrape` returns readable inner HTML for the active tab or a provided URL.
- `search` returns an ordered list of results as inner HTML, reliably yielding at least 5 items for common queries.
