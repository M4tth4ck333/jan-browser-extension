Jan Extension — Human-Centered Considerations

Purpose: Practical defaults and edge-case heuristics that match user intent, plus pointers for where to change them in code.

Human-Centered Defaults
- Intent preservation: Favor not surprising users; follow the active tab by default, but never silently discard manually selected tabs. Manual selection implies intent to stay multi-tab until changed.
- Fresh start vs continue: “New Chat” should mean new context (no selected tabs, empty cache) while keeping the old session intact for reference.
- Selection wins: When there is a non-empty selection, prefer it over the full page for summaries and inline actions; fall back to page when selection is empty.
- Fast feedback: Stream early; append errors into the chat as a final assistant message rather than modal-blocking the user.
- Safe scraping: Re-scrape targeted tabs on send to avoid stale context; warn once if content is missing or too short rather than silently sending.

Scenarios To Be Mindful Of
- New active tab while composing: If the user switches tabs mid-draft, auto-follow can update the target tab. Preserve the current draft text and selected tabs; do not clear the message box. If Auto-follow is OFF, keep the previous selection of tabs.
- Opening links in a new tab: Users often want the original tab's context. Offer a lightweight hint to "Keep previous tab in context" the first time after a link-open. If clicked, pin the previous tab (add it to `selectedTabIds`).
- Research flows (multi-tab): When users add tabs, keep Auto-follow OFF and persist `selectedTabIds` per session until they remove them or re-enable Auto-follow.
- @mention tab selection: Users expect LIFO ordering (most recent tabs first) when typing @mention to quickly find relevant tabs. Keep mention text in input after selection to allow multiple @mentions in one message.
- Hamburger menu navigation: Full-screen overlay should feel prominent but not jarring. Click outside to close, ESC key support, and smooth animations maintain user flow.
- Summarize this page vs multi-page: Default to single-tab for summarize; for compare/research prompts that include "compare"/"across these", suggest adding more tabs.
- Restricted pages: If the active page is restricted (Chrome Web Store, chrome://, file://), show a non-blocking banner with a one-click "Open in supported tab" action.
- Long pages and short selections: If selection < N chars but page is very long, consider summarizing selection first and offering an inline "Expand to whole page" option in the result.
- Switching sessions on tab activation: If a tab has a mapped session, switch; otherwise remain in the current session but update `selectedTabIds` to the active tab (Auto-follow ON) or keep manual selection (Auto-follow OFF).
- Cancel vs Send again: On cancel, keep the partial assistant message out of history; on re-send, re-use the same assembled context, freshly scraped.

Recommended Defaults
- Auto-follow: ON by default; toggles OFF automatically when the user manually adds a tab. Clearly surface when Auto-follow is OFF.
- Use Context: ON by default for the session and per-message; after every send, reset the per-message toggle back to the session default to avoid confusion.
- Minimum usable content: Require ~200 characters from either selection or page; present a one-time proceed confirmation when missing.
- Persist sessions: Save after significant state changes (message added, stream done, context refreshed). Avoid frequent writes during streaming.

Optional Heuristics (Nice-to-Have)
- Keep-previous-tab-on-link-open: If the user opens a new tab from the current page and returns to the side panel within ~30s, offer a one-click “Keep previous tab in context” toast.
- Sticky selection: When the selection changes shortly before sending (<10s), surface “Use selection” emphasis; otherwise use page.
- Gentle nudge for multi-tab prompts: Detect “compare”, “synthesize from these”, “across tabs” and show the tab adder popover pre-opened.

Implementation Notes (Where in Code)
- Auto-follow and selected tabs: `ui/sidepanel/App.jsx` `[JAN-BEHAVIOR:AUTO-FOLLOW]`, `[JAN-BEHAVIOR:ACTIVATION-HANDLER]`.
- Context assembly and thresholds: `ui/sidepanel/App.jsx` `[JAN-BEHAVIOR:SEND-CHAT]`, `[JAN-BEHAVIOR:ASK-GOOGLE]` (see `minChars`, `missing`).
- Selection vs page: `src/content.js` `[JAN-BEHAVIOR:GET-PAGE-CONTENT]` (selection and content), forwarded via `[JAN-BEHAVIOR:SELECTION-FWD]`.
- Pin/Unpin tabs UI: `ui/sidepanel/App.jsx` chips UI around tab selection and `selectedTabIds` persistence.
