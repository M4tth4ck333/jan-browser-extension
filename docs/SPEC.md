Jan Browser — Product Spec

The browser is where everything piles up: 12 tabs for one task, a few rabbit holes, and a “come back later” mental note. This extension keeps you in flow. You ask. It looks at the page (and a couple more if you want). It answers in the side panel. No context switching, no vendor lock‑in — your stack, your pace.

## Goal
> Why are we doing this? 1‑liner value proposition

- Like a Dia but on the Jan stack. Connects to both Jan Desktop + Jan Server (or any OpenAI‑compatible API). Answers inside the tab.

## Success Criteria
> When do we consider this done? Limit to 3.

- You can replace a “Search MCP” locally with this side panel and not miss it.

## Non Goals
> What is out of scope?

- Advanced model controls beyond temp/model for v1.
- Accounts or third‑party sync (Chrome sync is enough for now).

## User Research (if any)
> Links to user messages and interviews

- Placeholder to collect links to threads, DMs, and demo notes that shaped the UX.

## Design Inspo
> Links

- Placeholder for side‑panel/chat patterns we like and want to borrow (clean typography, clear affordances, zero‑friction setup).

## Open Questions
> What are we not sure about?

- Why do people keep so many tabs open? Can we help them “come back” (clusters, recap, nudges)?
- What language barriers can we reduce while navigating (inline translate, quick glossary)?
- “Read later” with AI assistance (save + summarize + remind me)?
- Resume review presets for HR?
- Counter‑balancing news sources (gentle blind‑spot hints)?
- Meeting transcription + summarization inside the browser (strict opt‑in)?

## What We Shipped
You pin it, open the panel, and type. We stream back answers. If you’ve highlighted text, we prioritize that. If you toggle context, we bring in one or more tabs you picked. There’s a button that pulls quick Google context when you need fresh results. Sessions stick around so you can pick up the thread later.

- Side panel (React): chat UI, Markdown, code copy.
- Content script: visible text or selection extraction.
- Works with OpenAI‑compatible endpoints (Jan Server, Cerebras, etc.). SSE streaming.
- “Ask with Google”: temporary tab → SERP scrape → tidy summary.
- Sessions saved locally; provider settings in Chrome sync.
- Keyboard shortcut; reliable side‑panel opening.

## How It Works
Under the hood, it’s a pragmatic MV3 setup. The background worker handles settings, opens the panel on the right tab, and talks to your model. The content script scrapes the page cleanly. The UI keeps a live Port to stream tokens in as they arrive.

- MV3 manifest: `storage`, `activeTab`, `tabs`, `scripting`, `sidePanel` (wide host perms for dev; narrow before publishing).
- Background (`src/background.js`): settings, side‑panel open, chat calls, SSE parser, SERP scrape, streaming port routing.
- Content (`src/content.js`): title/URL/lang/meta/visible text/selection; Google SERP scrape.
- UI/sidepanel: React app; streams via `jan-stream` Port; session storage; tab picker for context.
- UI/options: provider preset + base URL + key + model + temp + theme. “Test” button.
- Build: Vite multi‑page → `dist/ui/sidepanel` + `dist/ui/options`.

## A Day In The Panel (Primary Flows)
- Install → open Options → pick preset (Jan/Cerebras/Custom) → set base URL/key/model → Test.
- Click toolbar or shortcut → side panel opens on an http/https tab.
- Type a prompt → stream begins. If selection/context is on, we include it.
- Pick tabs as context → re‑scrape to refresh the text when needed.
- Tap “Ask with Google” when you want fresh results → we prepend a compact SERP summary and keep streaming.
- Sessions → new/switch/delete. All state saves automatically.

## Messages (Internal)
- Content: `GET_PAGE_CONTENT` (page fields), `SCRAPE_GOOGLE_SERP` (SERP data).
- Background: `CHAT_COMPLETION`, `CHAT_COMPLETION_STREAM_START/STOP`, `SUMMARIZE` (legacy).
- Streaming Port: `jan-stream` with `REGISTER_PORT` and `CHAT_STREAM_*` events.

## Prompting
We keep it simple and legible. The chat history is the base. If you’ve selected tabs for context, we add one system message with the titles/URLs/meta/snippets. If you used Google, we add one more system message summarizing the top results. Models do better when the context is tidy.

## Performance
We take care not to fight the browser. 120s SSE timeout with graceful aborts. We wait for tabs to finish loading before we message them. SERP scraping gets a tiny settle delay so results are consistent.

## Privacy
Keys live in `chrome.storage.sync`. Don’t share profiles; never commit secrets. We only target http/https tabs and only read visible text. Host perms are broad for dev but should be narrowed before shipping.

## Accessibility & UX
Keyboard focus is sane. Markdown is sanitized. Theme can follow system or be forced (Light/Dark) and stays in sync with Options.

## Shortcut
`open_sidepanel`: Alt+J (Windows/Linux), Cmd+Shift+Y (Mac). See `manifest.json`.

## Files You’ll Touch
`manifest.json`, `src/background.js`, `src/content.js`, `ui/sidepanel/*`, `ui/options/*`. Extra: `docs/mcp-spec.md` for MCP tools sketch.

## Acceptance
Point to Jan: `apiBase = http://localhost:1337/v1`, set model/key, open panel, ask. If you’re not missing Search MCP, we’re good.

## Roadmap / TODO
- MCP inside the extension
  - Expose two tools: `scrape` and `search` via a tiny JSON‑RPC in the background worker. Reuse current extract/SERP. Return sanitized HTML as a single text part. See `docs/mcp-spec.md`.
  - Rate‑limit/backoff Google. Configurable number of results.
- Better extraction
  - Readability.js path with caps/fallbacks.
- Read‑later
  - Queue + summaries + reminders; export.
- Per‑site auto‑summarize
  - Opt‑in rules; don’t be annoying.
- Multilingual
  - Translate + bilingual summaries.
- Bias counter
  - Surface diverse sources (user‑controlled).
- Meeting capture
  - Tab audio → ASR → summary. Clear privacy indicators.
- Cross‑browser
  - Test Edge/Brave/Arc; side panel alternatives where needed.
- Tests & logs
  - Unit tests for SSE/parser; local debug logs only; no telemetry by default.
- Packaging
  - Zip task + publish checklist (narrow host perms).

## Appendix: MCP TL;DR
- Tools: `scrape(url?, selectionOnly?, maxChars?)` and `search(query, numResults=8)`.
- Output: sanitized HTML string (nice to render). Transport can be JSON‑RPC over a Port/HTTP — TBD. Spec sketch in `docs/mcp-spec.md`.
