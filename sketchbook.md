Jan Extension — Sketchbook

Purpose: A working notebook to think through mental models and alternate implementations before coding. Capture options, pros/cons, and sketchy pseudocode so future changes are intentional and reversible.

How to use: Treat each section as a design space. Pick an option, note trade‑offs, and link commits/PRs that realize it. Keep this pragmatic, not academic.

1) Tabs ↔ Sessions Model
- Option A — Auto‑follow + single active tab (current default)
  - Behavior: Session follows the currently active tab unless user pins others.
  - Pros: Predictable, minimal UI state; easy mental model.
  - Cons: Power users want multi‑tab context and pinning; switching tabs can move context unexpectedly when pinned is off.
  - Sketch: `selectedTabIds = [activeTabId]` when `autoFollowActiveTab = true`.

- Option B — Pinned tabs override active tab
  - Behavior: If `selectedTabIds.length > 0`, never auto‑follow. User must re‑enable.
  - Pros: Stable multi‑tab context; explicit control.
  - Cons: Easy to forget Auto‑follow is off; needs clear affordance to reset.
  - Sketch: Toggle Auto‑follow OFF on first manual add/remove; show subtle banner “Following: Manual (Reset)”.

- Option C — Workspace per window
  - Behavior: A “workspace” binds a session to a browser window, not just a tab.
  - Pros: Window as scope feels natural for research flows.
  - Cons: State complexity; cross‑window handling.
  - Sketch: `windowId -> sessionId` map; on window focus, switch session if mapped.

2) Context Acquisition Strategy
- Strategy 1 — On‑send fresh scrape (current)
  - Re‑scrape selected tabs on each send; retry once; prompt if missing content.
  - Pros: Freshness; simple invariants.
  - Cons: Latency spike at send; redundant work.

- Strategy 2 — Idle refresh + TTL cache
  - Maintain `contextCache[tabId]` with `ts` and `ttlMs` (e.g., 60s). Refresh on tab activation or when stale.
  - Pros: Lower send latency; smoother UX.
  - Cons: Background work; risk of using slightly stale data.
  - Sketch:
    ```js
    if (Date.now() - cache[tabId].ts > ttl) refresh(tabId)
    ```

- Strategy 3 — Event‑driven diffs
  - Listen to `selectionchange`, URL changes, DOM mutations for large text shifts; patch cache incrementally.
  - Pros: Very fresh; fewer full scrapes.
  - Cons: Complexity; noisy signals; perf considerations.

- Strategy 4 — Readability/structured extraction
  - Use Readability.js or site‑specific strategies; produce sections (title, byline, headings, body).
  - Pros: Cleaner summaries; better token use.
  - Cons: Script weight; occasional mis‑extraction.

3) Prompt Construction (with Context)
- Pattern A — Concise per‑tab blocks
  - One block per tab with `Title/URL/Selection/Excerpt`. Cap characters per tab.
  - Pros: Deterministic token budget; easy to audit.

- Pattern B — First summarize, then ask
  - Summarize each tab with a small LLM pass; feed the summaries into the final ask.
  - Pros: Large context, smaller tokens for the final model.
  - Cons: Two calls; need streaming or background concurrency to keep UX snappy.

- Pattern C — Structured JSON context
  - Wrap context in JSON with types and counts; the system prompt explains how to use it.
  - Pros: Better grounding; easier to diff/log.
  - Cons: Some models ignore structure; need robust fallbacks.

- Pattern D — Retrieval‑style chunking (future)
  - Chunk page, embed locally or via provider, select top‑k relevant chunks.
  - Pros: Scales to long pages.
  - Cons: Infra/latency; privacy; adds dependencies.

4) Streaming & Routing
- Approach A — Port per tab (current)
  - Map `tabId -> port`; UI re‑registers on activation; background routes deltas by `tabId` + `reqId`.
  - Pros: Precise routing; scales with tabs.
  - Cons: Requires diligent re‑registration on tab changes.

- Approach B — Single global port + UI filter
  - Broadcast all deltas; UI drops non‑matching `reqId`/session.
  - Pros: Simpler background.
  - Cons: Risk of flicker; wasted messages.

- Approach C — Session‑keyed channels
  - Generate `sessionId` and tag stream messages; port registration optional.
  - Pros: Stable across tab moves; supports window‑scoped workspaces.
  - Cons: Higher coupling between UI and BG; session lifecycle management.

5) Inline Assistant UX
- Variant A — Floating pill near selection (current)
  - Pros: Immediate; low friction.
  - Cons: Can cover content; needs careful placement.

- Variant B — Context menu only
  - Pros: Minimal DOM; no overlays.
  - Cons: Hidden; slower discoverability.

- Variant C — Mini toolbar pinned to caret
  - Pros: Predictable position; accessible.
  - Cons: More DOM; tricky on complex editors.

Apply strategies (DOM):
- Prefer native `setRangeText` for inputs/textarea; for contenteditable, try `execCommand('insertText')`, else range replace, else append; always dispatch `input`/`change` for controlled frameworks.

6) Web Search Integration
- Path A — SERP scrape (current)
  - DDG first, Google fallback. Headless tab, readiness wait, scrape structured results.
  - Pros: No API keys; good quality; resilient with dual path.
  - Cons: Fragile to DOM changes; TOS considerations.

- Path B — API‑based search
  - e.g., Google Custom Search, SerpAPI.
  - Pros: Stable schema; fewer DOM changes to track.
  - Cons: Keys/quotas; cost.

- Path C — MCP tools (local)
  - Expose `search` + `visit_tool` over MCP; let external LLM agents orchestrate.
  - Pros: Reuse across apps; consistent protocol.
  - Cons: Requires local server; adds moving parts.

7) Provider Abstraction
- Keep OpenAI‑compatible default (`/chat/completions`), with:
  - Anthropic shim: map to `/messages` with `anthropic-version` and stream via SSE mapping.
  - Custom full URL override for nonstandard endpoints.
  - Future: Per‑session provider config and model presets.

8) Error Handling, Timeouts, Cancels
- Stream timeouts: 120s guard for SSE; 15s for non‑stream ping.
- User stop: `AbortController` keyed by `reqId`.
- Fallback: Non‑stream JSON parse path if server doesn’t stream.
- UI: Append an assistant “Error: …” message; clear streaming state.

9) Persistence & Migration
- Schema (local): `sessions[]`, `activeSessionId`, `tabSessionMap`, per‑session `context` with `selectedTabIds`, `contextCache`, `autoFollowActiveTab`.
- Migrations: Version key in storage; upgrade functions on load.
- Backup/restore: Export/import sessions as JSON.

10) Privacy & Permissions
- Keys: Stored in `chrome.storage.sync` (optional); never persist secrets beyond what’s necessary.
- Permissions: `tabs`, `activeTab`, `sidePanel`, `storage`, wide host perms in dev; restrict in prod.
- Logs: Sanitize; toggle verbose logs in dev only.

11) Firefox Notes
- Side panel: Use `sidebar_action` with `ui/sidepanel/index.html`.
- Background: `background.scripts` instead of MV3 service worker.
- Messaging & streaming: Same mental model; ensure port still re‑registers on tab activation.
- Build: `npm run build:firefox` → `dist-firefox/` with `manifest.firefox.json` copied to `manifest.json`.

12) “Reset to Single‑Tab Follow” UX
- Trigger: Button in the session header or context chip area.
- Action: `selectedTabIds = [activeTabId]`, `autoFollowActiveTab = true`, clear non‑active entries from `contextCache`.
- Copy: “Back to following current tab”.

13) Future Enhancements
- Per‑message tool choice: let user opt to include search, visit, or neither.
- Per‑session provider/model presets.
- Quick “Add all tabs from this domain”.
- Long doc handling: background summarization pipeline (Pattern B) with streaming UI updates per phase.

14) Micro Pseudocode Snippets
- TTL cache refresh
  ```js
  const ttlMs = 60000
  async function getContext(tabId) {
    const c = cache[tabId]
    if (!c || Date.now() - c.ts > ttlMs) cache[tabId] = await scrape(tabId)
    return cache[tabId]
  }
  ```

- Stream with session key
  ```js
  const key = { sessionId, reqId }
  bg.stream(key, msgs)
  ui.onDelta = (m) => { if (m.sessionId === sessionId && m.reqId === reqId) append(m.delta) }
  ```

- Reset to single‑tab follow
  ```js
  const t = await getActiveTab()
  updateSession(s => ({
    ...s,
    context: { ...s.context, autoFollowActiveTab: true, selectedTabIds: [t.id], contextCache: { [t.id]: s.context.contextCache[t.id] } }
  }))
  ```

15) Decision Notes (fill in as we choose)
- Tabs/Sessions: A (default) + B (manual override) — shipped.
- Context: Strategy 1 (now); consider Strategy 2 if send latency becomes a pain.
- Prompt: Pattern A (now); explore B for long contexts.
- Streaming: Approach A (now); session‑keyed channel considered if we add window workspaces.

