# SPEC v2: Inline Writing Assistant (Grammarly-like) via Tooltip

- Version: v2 (Draft)
- Date: 15 Aug 2025
- Scope: Chrome MV3 extension inline writing assistant that appears on inputs and contenteditable fields. Uses model completions via the extension’s background to provide rewrites and suggestions.

## Goals

- Provide in-place writing assistance without leaving the page.
- Offer quick actions: Rewrite, Improve Clarity, Fix Grammar, Shorten, Expand, Change Tone (Formal/Friendly), Summarize, and Translate.
- Minimal friction and respectful UX: small tooltip/toolbar near the caret/selection.
- Respect privacy: never read or transmit sensitive fields (passwords, credit cards), and only process explicit user-selected text or the active field’s content, based on settings.

## Non-Goals

- Full document collaboration.
- Heavy editor features (track changes, comments). Keep it lightweight.

## User Stories

- As a user, I can select text in an input/textarea/contenteditable and click the tooltip to get rewrite options.
- As a user, I can accept a suggestion to replace the selection (or insert as new text).
- As a user, I can open an “advanced” mini-popover to tweak tone/length.
- As a user, I can disable inline assistant for specific sites or fields.

## UX Overview

- Trigger
  - Focus on an eligible field and type 3+ characters, or select text.
  - Keyboard: Alt+J (configurable) opens the tooltip when a field is focused.
- Tooltip
  - Small pill near caret/selection with an icon and label (e.g., “Rewrite”).
  - Click opens an action bar with quick actions.
  - On hover/focus-out rules to avoid flicker; ESC closes.
- Actions
  - One-tap presets: Rewrite, Fix Grammar, Shorten, Expand, Tone (Formal/Friendly), Summarize, Translate.
  - “More…” opens a compact popover with a prompt box for custom instructions.
- Apply
  - Replaces the selection or inserts result at caret.
  - Undo via native Ctrl/Cmd+Z where possible (use `execCommand`/InputEvent and selection APIs to integrate with history).
- Theming
  - Uses the same theme preference as Options/Side Panel (`themePref` via `chrome.storage.sync`) and `dark` class on `<html>`.

## Architecture

- Content Script (`src/content.js`)
  - Detects eligible fields (inputs, textareas, `[contenteditable=true]`).
  - Observes focus/selection/caret movements to position the tooltip.
  - Injects a shadow-DOM based tooltip/toolbar UI for style isolation.
  - On action, sends a message to background to perform a model call.
- Background (`src/background.js`)
  - Uses existing OpenAI-compatible `chatCompletions`/`chatCompletionsStream` to fulfill requests.
  - Sanitizes inputs; enforces maximum text size; optional streaming back to content script for progressive UI.
- Side Panel (optional)
  - Can display full suggestions history and advanced prompts; not required for MVP.

## Implementation Status vs Current Codebase

- The summarizer side panel and OpenAI-compatible calls are implemented today in `src/background.js` (`CHAT_COMPLETION`, `CHAT_COMPLETION_STREAM_START`) and the side panel UI.
- The Google Search + SERP scrape flow exists (`GOOGLE_SEARCH_AND_SCRAPE` in background and `SCRAPE_GOOGLE_SERP` in `src/content.js`).
- Inline Assistant specific pieces are NOT implemented yet:
  - No tooltip UI in the content script.
  - No `INLINE_ASSIST_*` message handlers in the background.
  - No Options toggles specific to Inline Assistant.
- MVP will ship as one-shot (non-streaming) calls first; streaming can reuse the existing streaming infra later if needed.

## Integration with MCP Bridge (context)

- The MCP bridge (WebSocket from background to `ws://127.0.0.1:17389`) is used for tools like `search` and is orthogonal to the Inline Assistant.
- Inline Assistant uses the same model provider settings as the side panel and does not require the MCP bridge.
- See `docs/adr-004-mcp-bridge-security.md`: optional token (`useBridgeToken`, default Off). Options should expose the toggle consistently across features but Inline Assistant itself does not depend on it.

## Data Flow

1) Content script captures selected text and the chosen action (e.g., Fix Grammar).
2) Sends `{ type: 'INLINE_ASSIST_START', mode, text, context }` to background.
3) Background crafts a prompt (system+user) based on mode and returns a result (streamed or single-shot).
4) Content script displays the result in the tooltip; user can Apply/Copy/Dismiss.

## Permissions

- `storage`, `activeTab`, `tabs` (already present in `manifest.json`).
- `clipboardWrite` (optional; only if copying without user gesture via `navigator.clipboard`/`execCommand`).
- `scripting` (optional; only if we choose programmatic script injection instead of static `content_scripts`).
- No extra host permissions needed beyond `<all_urls>` already used by the existing content script.
- Note: current `manifest.json` includes `sidePanel` for the summarizer; Inline Assistant does not require it but can coexist.

## Privacy & Safety

- Never operate on `input[type=password]`, secure payment fields, or similar sensitive widgets; hard block.
- Domain controls:
  - Global enable/disable toggle in Options.
  - Per-site allow/deny (stored in `chrome.storage.sync`).
- Minimize data sent to the model:
  - Only selected text or active field content up to a size limit.
  - Show a clear disclosure in Options about what is sent.
- Redaction (optional advanced): remove emails/phone numbers if desired.

## Settings (Options UI)

- Toggle: Enable Inline Assistant (default On).
- Keyboard Shortcut: Alt+J (configurable).
- Actions enabled: checkboxes for Rewrite, Shorten, Expand, Fix Grammar, Tone, Summarize, Translate.
- Site Controls: per-site allow/deny list.
- Provider: reuse existing provider/base/key/model/temperature + theme.

## API: Message Shapes (Proposed)

- Content → Background
  - `INLINE_ASSIST_START` (MVP): `{ mode: 'rewrite'|'shorten'|'expand'|'fix_grammar'|'tone_formal'|'tone_friendly'|'summarize'|'translate', text: string, lang?: string, tabId?: number }`
  - (Later) `INLINE_ASSIST_STREAM_START`: `{ reqId: string, ...INLINE_ASSIST_START }`
- Background → Content
  - One-shot (MVP): response to sender `{ ok: boolean, text?: string, error?: string }`.
  - (Later streaming): `INLINE_ASSIST_BEGIN`, `INLINE_ASSIST_DELTA`, `INLINE_ASSIST_DONE`, `INLINE_ASSIST_ERROR` to the originating tab via `chrome.tabs.sendMessage`.

## Prompting (Baseline)

- System prompt: "You are a concise writing assistant. Follow the user’s instruction precisely. Keep meaning."
- Mode templates (examples):
  - Fix Grammar: "Fix grammar and spelling, keep the original tone."
  - Shorten: "Rewrite more concisely while preserving meaning."
  - Expand: "Elaborate slightly and improve clarity, avoid fluff."
  - Tone Formal/Friendly: "Rewrite in a [formal/friendly] tone without changing meaning."
  - Summarize: "Summarize in 1–3 sentences."
  - Translate: "Translate into <lang>. Keep names and terms."

## MVP Scope

- Detect inputs/contenteditables and show tooltip on selection/focus.
- Actions: Fix Grammar, Rewrite, Shorten, Expand (4 presets).
- One-shot flow (no streaming) for simpler UI.
- Apply result back into the field; support Undo.
- Options toggles + keyboard shortcut.

## Implementation Plan (Actionable Tasks)

- UI in page (`src/content.js`):
  - Detect eligible fields and selection; render tooltip/toolbar in a shadow root.
  - Wire quick actions to post `INLINE_ASSIST_START` to background; display result and offer Apply/Copy.
  - Apply result using Selection/Range APIs to preserve undo (use InputEvent where available).
- Background (`src/background.js`):
  - Add handler for `INLINE_ASSIST_START` to craft prompts per mode and call existing `chatCompletions()` (one-shot).
  - Enforce max text size and basic sanitization per this spec.
- Options (`ui/options/App.jsx`):
  - Add “Enable Inline Assistant”, shortcut config, and action toggles.
  - Reuse provider/base/key/model settings.
- Manifest (`manifest.json`):
  - Keep static `content_scripts` for now. Add `clipboardWrite` only if needed.
- Testing:
  - Manual: focus/select flows, undo, per-site disable, and copy.
  - Non-regression: ensure side panel summarizer and MCP bridge continue working.

## Roadmap

- Streaming results with progressive display.
- Tone controls and custom instruction box.
- Per-site controls UI polish and import/export.
- History view and integration with the Side Panel.
- Multi-locale support and language detection.
- Accessibility: keyboard-only flow and screen-reader labels.

## Open Questions

- How to best avoid interfering with site-native tooltips/overlays?
- Should we provide a small draggable toolbar for dense editors?
- Opt-in model for sending full field content vs selection only?
- Add an allowlist mode by default for privacy-sensitive environments?
