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

## Data Flow

1) Content script captures selected text and the chosen action (e.g., Fix Grammar).
2) Sends `{ type: 'INLINE_ASSIST', mode, text, context }` to background.
3) Background crafts a prompt (system+user) based on mode and returns a result (streamed or single-shot).
4) Content script displays the result in the tooltip; user can Apply/Copy/Dismiss.

## Permissions

- `activeTab`, `storage`, `scripting` (for injecting UI as needed), `clipboardWrite` (copy to clipboard from tooltip).
- No host permissions beyond what is necessary; prefer programmatic injection.

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

## API: Message Shapes

- Content → Background
  - `INLINE_ASSIST_START`: `{ mode: 'rewrite'|'shorten'|'expand'|'fix_grammar'|'tone_formal'|'tone_friendly'|'summarize'|'translate', text: string, lang?: string, tabId?: number }`
  - Optional streaming variant: `INLINE_ASSIST_STREAM_START` with `reqId`.
- Background → Content
  - For streaming: `INLINE_ASSIST_BEGIN`, `INLINE_ASSIST_DELTA`, `INLINE_ASSIST_DONE`, `INLINE_ASSIST_ERROR`.
  - For one-shot: `{ ok: boolean, text?: string, error?: string }`.

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
