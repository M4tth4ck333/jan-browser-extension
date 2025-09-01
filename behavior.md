Jan Extension — Behavior Guide

Purpose: Describe how tabs, sessions, context, and streaming behave, and point to the exact places in code so you can jump straight to implementations.

Quick Answers
- Same‑tab context: Yes by default. The side panel auto‑follows the active tab and reads context from it unless you pick others.
- Multiple tabs: Add tabs (chips or @mentions). Context comes from all selected tabs, not only the active one.
- Reset behavior: Start a new chat, re‑enable Auto‑follow, or toggle chips back to just the active tab. “Scrape” refreshes cached content from selected tabs.

Mental Model
- Background (service worker): routes messages/streams and hosts tools; keeps a long‑lived port per active tab for streaming.
- Content script: runs in the page; extracts selection/page content; hosts inline UI; forwards selection updates.
- Side panel UI: chat surface; maintains sessions, selected tabs, and per‑session context cache.

Tab ↔ Session Mapping
- Long‑lived port registration:
  - Side panel posts `{ type: 'REGISTER_PORT', tabId }` when mounted and on tab activation.
  - In code: `src/background.js` lines ~40–60 (port `onConnect`, `REGISTER_PORT` handling) and `ui/sidepanel/App.jsx` lines ~850, ~980, ~1250, ~1365, ~1480, ~1515 (posts to register the current tab).
  - Search: `REGISTER_PORT`, `jan-stream`.
- Per‑tab session map:
  - Stored as `{ [tabId]: sessionId }` in `chrome.storage.local` and applied on activation.
  - In code (helpers): `ui/sidepanel/App.jsx` lines ~580–620 (`loadTabSessionMap`, `setTabSessionForTab`).
  - Switch on tab activation: `ui/sidepanel/App.jsx` lines ~1460–1510 (activation listener uses the map to switch sessions).
  - Search: `tabSessionMap`, `chrome.storage.local.set({ tabSessionMap`.
- New chat / delete chat:
  - Initialization and persistence of sessions live in `ui/sidepanel/App.jsx` lines ~780–900 (create first session), ~1060–1100 (`saveSessions`).
  - Search: `sessions`, `activeSessionId`, `chrome.storage.local.set({ sessions`.

Context Gathering (What text is read?)
- Content script responder:
  - Message: `{ type: 'GET_PAGE_CONTENT' }` returns `{ ok, url, title, lang, metaDescription, content, selection }`.
  - In code: `src/content.js` lines ~100–150 (handler); Gmail/YouTube extractors lines ~30–110.
  - Search: `GET_PAGE_CONTENT`, `extractGmailContent`, `extractYouTubeContent`.
- Side panel readers/caching:
  - First read of active tab: `ui/sidepanel/App.jsx` `readPage()` lines ~770–810.
  - Multi‑tab scrape: `scrapeSelectedTabs(ids)` lines ~1100–1130.
  - Context cache: `contextCache` state and updates lines ~472–474, ~1166–1172, ~1305–1317.
  - Selected tabs and auto‑follow: `selectedTabIds`, `autoFollowActiveTab` state lines ~472–474; activation sync lines ~952–1000 and ~1460–1510.
  - Search: `scrapeSelectedTabs`, `contextCache`, `selectedTabIds`, `useContextDefault`.
- Tab selection via @mention:
  - Type `@` + query in chat input to trigger mention popup with LIFO-sorted tabs (unpinned first, then by lastAccessed desc, fallback to index desc).
  - Arrow keys navigate, Enter/Tab/click selects tab and adds to context while keeping mention text in input.
  - In code: `ui/sidepanel/App.jsx` `handleMentionSelect()`, `updateMentions()`, `filteredTabs` useMemo with LIFO sorting.
  - Search: `mentionOpen`, `mentionResults`, `handleMentionSelect`, `@mention`.
- Before sending chat/search:
  - Determine tabs, re‑scrape, enforce minimum content, and prepend context messages.
  - In code: `ui/sidepanel/App.jsx` `sendChat()` lines ~1194–1273 and `askWithGoogle()` lines ~1386–1470.
  - Search: `buildContextMessages`, `tabsToUse`, `minChars`, `missing`.

Same‑Tab vs Multi‑Tab Behavior
- Default single‑tab: Auto‑follow ON keeps `selectedTabIds = [activeTab]`; panel reads from that tab on send and on demand.
  - In code: `ui/sidepanel/App.jsx` lines ~940–1000 (set selectedTabIds to active tab if supported).
- Multi‑tab: Adding chips turns Auto‑follow OFF for that session. Panel reads all selected tabs until you remove them or re‑enable Auto‑follow.
  - In code: `ui/sidepanel/App.jsx` lines ~1470–1565 (persist session context including `selectedTabIds`, `autoFollowActiveTab`).
  - Search: `autoFollowActiveTab`, `selectedTabIds`, `persistContext`.

Streaming & Routing
- Stream lifecycle events:
  - Background emits `CHAT_STREAM_BEGIN`, `CHAT_STREAM_DELTA`, `CHAT_STREAM_DONE`, `CHAT_STREAM_ERROR` to the registered port.
  - In code: `src/background.js` lines ~220–330 and ~906–996 (SSE and chunked streaming paths).
  - Search: `CHAT_STREAM_BEGIN`, `CHAT_STREAM_DELTA`, `CHAT_STREAM_DONE`.
- UI stream handling:
  - Appends assistant message on begin; concatenates deltas; persists on done or error.
  - In code: `ui/sidepanel/App.jsx` lines ~862–925 (port message listener).
- Starting/stopping streams:
  - Start: `CHAT_COMPLETION_STREAM_START` with `{ reqId, tabId, messages }` from `sendChat()` lines ~1240–1270.
  - Stop: `CHAT_COMPLETION_STREAM_STOP` from UI lines ~505; handled in background at `src/background.js` lines ~706 (abort controller via `reqId`).
- Routing to correct tab:
  - Background chooses the port by `tabId`, falling back to a global port if needed.
  - In code: `src/background.js` lines ~286–321 (target selection in `post`).

Selection Updates
- Forward selection from page:
  - Debounced `selectionchange` and related events forward `{ type: 'SELECTION_UPDATED', selection, url, title }`.
  - In code: `src/content.js` lines ~1208–1290 (debounce + sender at ~1284).
- Background → side panel:
  - Forwards to the tab’s registered port.
  - In code: `src/background.js` lines ~798–808.
- Side panel state:
  - Mirrors text in `selectionText`.
  - In code: `ui/sidepanel/App.jsx` lines ~925–930.

Inline Assistant (in‑page)
- Trigger/UI:
  - The content script shows the “Jan ✨” tooltip near selection and hosts Apply/Copy/Regenerate.
  - In code: `src/content.js` UI helpers and DOM ops throughout lines ~300–1200 (see `showTooltipAt`, `applyResultToEditable`).
- Message building + provider call:
  - Background builds messages with `buildInlineAssistMessages({ mode, text, lang })` and calls provider (one‑shot, not streaming).
  - In code: `src/background.js` lines ~470–480 (call site) and ~1290 (function definition).
  - Search: `INLINE_ASSIST_START`, `buildInlineAssistMessages`.

Controls & Reset
- Auto‑follow active tab:
  - Stored/persisted per session as `context.autoFollowActiveTab`.
  - In code: `ui/sidepanel/App.jsx` state at lines ~472–474 and persistence at ~1470–1565.
- Use context toggle:
  - Global default and per‑message toggle; if OFF, no page snippets are prepended.
  - In code: `ui/sidepanel/App.jsx` state at ~470s and usage in `sendChat()`/`askWithGoogle()` around ~1194–1470.
- Hamburger menu navigation:
  - Opens as full-screen overlay with semi-transparent scrim covering conversation area.
  - Fixed-position animated slide-in panel (320px width) with click-outside-to-close behavior.
  - In code: `ui/sidepanel/App.jsx` overlay scrim and fixed positioning with z-index layering.
  - Search: `sidebarOpen`, `setSidebarOpen`, `fixed inset-0 z-40`.
- Sticky footer positioning:
  - Input composer uses sticky positioning to remain at bottom while content scrolls above.
  - Prevents text overlap with input area that was occurring with absolute positioning.
  - In code: `ui/sidepanel/App.jsx` footer with `sticky bottom-0` classes.
  - Search: `sticky bottom-0`, `composer shadow-lg`.
- Enhanced error messaging:
  - Error messages now use consistent design system styling with emoji and markdown formatting.
  - Format: `🚨 **Error**: [message]` for better visual hierarchy and user recognition.
  - In code: `ui/sidepanel/App.jsx` error handling in stream and chat functions.
  - Search: `🚨 **Error**:`, `CHAT_STREAM_ERROR`.
- Rescrape selected tabs:
  - Button wired to `rescrapeSelected()`.
  - In code: `ui/sidepanel/App.jsx` lines ~1624–1635 (button) and ~1162–1172 (handler).
- New/Delete chat:
  - In code: `ui/sidepanel/App.jsx` session init/persist at ~780–900 and ~1050–1100.

Restricted Pages & Fallbacks
- Blocked pages: `chrome://`, `edge://`, `chrome-extension://`, Chrome Web Store, and `file://`.
  - In code (UI check): `ui/sidepanel/App.jsx` `isRestrictedUrl()` lines ~760–770; guards in `readPage()` and debug preview.
- Opening the side panel over a supported tab:
  - On action/command, background finds a supported http(s) tab or creates one, then opens the panel.
  - In code: `src/background.js` lines ~352–460 (action/commands, `isSupportedUrl` checks, `sidePanel.setOptions/open`).

Where This Lives in Code (Index)
- Background routing/streaming: `src/background.js` (see: `onConnect` + `REGISTER_PORT`, stream emitters, `CHAT_COMPLETION_STREAM_STOP`).
- Content extraction + inline UI: `src/content.js` (see: `GET_PAGE_CONTENT`, selection forwarding, tooltip/DOM helpers).
- Side panel sessions/context/ports: `ui/sidepanel/App.jsx` (see: session init/persist, `readPage`, `scrapeSelectedTabs`, activation handler, `REGISTER_PORT`).

Dev Tips (Fast Grep Targets)
- Port routing: `REGISTER_PORT`, `jan-stream`, `sidepanelPorts`.
- Streaming: `CHAT_STREAM_`, `reqId`, `AbortController`.
- Context: `scrapeSelectedTabs`, `contextCache`, `selectedTabIds`, `useContextDefault`.
- Selection: `SELECTION_UPDATED`, `selectionchange`.
- Inline Assistant: `buildInlineAssistMessages`, `INLINE_ASSIST_START`.

Grep Cheatsheet (Stable Tags)
- `[JAN-BEHAVIOR:PORT-REGISTER]`: side panel port registration and routing map
  - Files: `src/background.js`, `ui/sidepanel/App.jsx` (UI side marked as `PORT-REGISTER-UI`)
- `[JAN-BEHAVIOR:STREAM-EMIT]`: background routing of `CHAT_STREAM_*` events to the UI
- `[JAN-BEHAVIOR:STREAM-STOP]`: cancel stream via `CHAT_COMPLETION_STREAM_STOP`
- `[JAN-BEHAVIOR:SELECTION-FWD]`: content script forwarding selection to background
- `[JAN-BEHAVIOR:SELECTION-FWD-BG]`: background forwarding selection to side panel
- `[JAN-BEHAVIOR:GET-PAGE-CONTENT]`: content script responder producing page payload
- `[JAN-BEHAVIOR:CONTEXT-READ]`: side panel first-read of active tab into cache
- `[JAN-BEHAVIOR:CONTEXT-SCRAPE]`: side panel multi-tab scrape for fresh context
- `[JAN-BEHAVIOR:RESCRAPE]`: manual refresh of selected tabs’ context
- `[JAN-BEHAVIOR:SEND-CHAT]`: compose messages + context and start streaming
- `[JAN-BEHAVIOR:ASK-GOOGLE]`: run search+scrape, merge, then stream
- `[JAN-BEHAVIOR:ACTIVATION-HANDLER]`: on tab activation, re-register, refresh, and switch session
- `[JAN-BEHAVIOR:SESSION-PERSIST]`: load/save sessions to storage
- `[JAN-BEHAVIOR:AUTO-FOLLOW]`: default single-tab follow behavior
- `[JAN-BEHAVIOR:RESTRICTED-URL]`: guards for non-scriptable pages
- `[JAN-BEHAVIOR:SIDEPANEL-OPEN]`: ensure side panel opens on a supported tab
- `[JAN-BEHAVIOR:INLINE-ASSIST-START]`: inline assist request from content to background
- `[JAN-BEHAVIOR:INLINE-ASSIST-BUILD]`: background message builder for inline assist
- `[JAN-BEHAVIOR:INLINE-ASSIST-APPLY]`: apply inline result into editable elements

Tip: For a quick survey, run ripgrep or grep recursively, for example:
- `rg "\[JAN-BEHAVIOR:" -n` or `grep -R "\[JAN-BEHAVIOR:" -n` to list all tagged blocks.
 

**Human-Centered Defaults**
- Intent preservation: Favor not surprising users; follow the active tab by default, but never silently discard manually selected tabs. Manual selection implies intent to stay multi-tab until changed.
- Fresh start vs continue: “New Chat” should mean new context (no selected tabs, empty cache) while keeping the old session intact for reference.
- Selection wins: When there is a non-empty selection, prefer it over the full page for summaries and inline actions; fall back to page when selection is empty.
- Fast feedback: Stream early; append errors into the chat as a final assistant message rather than modal-blocking the user.
- Safe scraping: Re-scrape targeted tabs on send to avoid stale context; warn once if content is missing or too short rather than silently sending.

**Scenarios To Be Mindful Of**
- New active tab while composing: If the user switches tabs mid-draft, auto-follow can update the target tab. Preserve the current draft text and selected tabs; do not clear the message box. If Auto-follow is OFF, keep the previous selection of tabs.
- Opening links in a new tab: Users often want the original tab’s context. Offer a lightweight hint to “Keep previous tab in context” the first time after a link-open. If clicked, pin the previous tab (add it to `selectedTabIds`).
- Research flows (multi-tab): When users add tabs, keep Auto-follow OFF and persist `selectedTabIds` per session until they remove them or re-enable Auto-follow.
- Summarize this page vs multi-page: Default to single-tab for summarize; for compare/research prompts that include “compare”/“across these”, suggest adding more tabs.
- Restricted pages: If the active page is restricted (Chrome Web Store, chrome://, file://), show a non-blocking banner with a one-click “Open in supported tab” action.
- Long pages and short selections: If selection < N chars but page is very long, consider summarizing selection first and offering an inline “Expand to whole page” option in the result.
- Switching sessions on tab activation: If a tab has a mapped session, switch; otherwise remain in the current session but update `selectedTabIds` to the active tab (Auto-follow ON) or keep manual selection (Auto-follow OFF).
- Cancel vs Send again: On cancel, keep the partial assistant message out of history; on re-send, re-use the same assembled context, freshly scraped.

**Recommended Defaults**
- Auto-follow: ON by default; toggles OFF automatically when the user manually adds a tab. Clearly surface when Auto-follow is OFF.
- Use Context: ON by default for the session and per-message; after every send, reset the per-message toggle back to the session default to avoid confusion.
- Minimum usable content: Require ~200 characters from either selection or page; present a one-time proceed confirmation when missing.
- Persist sessions: Save after significant state changes (message added, stream done, context refreshed). Avoid frequent writes during streaming.

**Optional Heuristics (Nice-to-Have)**
- Keep-previous-tab-on-link-open: If the user opens a new tab from the current page and returns to the side panel within ~30s, offer a one-click “Keep previous tab in context” toast.
- Sticky selection: When the selection changes shortly before sending (<10s), surface “Use selection” emphasis; otherwise use page.
- Gentle nudge for multi-tab prompts: Detect “compare”, “synthesize from these”, “across tabs” and show the tab adder popover pre-opened.

Implementation Notes (Where in Code)
- Auto-follow and selected tabs: `ui/sidepanel/App.jsx` `[JAN-BEHAVIOR:AUTO-FOLLOW]`, `[JAN-BEHAVIOR:ACTIVATION-HANDLER]`.
- Context assembly and thresholds: `ui/sidepanel/App.jsx` `[JAN-BEHAVIOR:SEND-CHAT]`, `[JAN-BEHAVIOR:ASK-GOOGLE]` (see `minChars`, `missing`).
- Selection vs page: `src/content.js` `[JAN-BEHAVIOR:GET-PAGE-CONTENT]` (selection and content), forwarded via `[JAN-BEHAVIOR:SELECTION-FWD]`.
- Pin/Unpin tabs UI: `ui/sidepanel/App.jsx` chips UI around tab selection and `selectedTabIds` persistence.
