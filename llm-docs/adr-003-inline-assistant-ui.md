# ADR-003: Inline Assistant UI in the Content Script

## Status

Accepted — 15 August 2025

## Context

We want a lightweight, fast inline writing assistant directly in the page for quick edits: rewrite, fix grammar, shorten, expand, tone shifts, summarize, and translate. This must work in diverse editors (contenteditable controls, inputs, textareas, React/Vue controlled inputs, iframes), avoid breaking page UX, and feel modern and polished.

## Decision

Implement a Shadow DOM based inline UI owned by `src/content.js` with three primitives:

- Tooltip (entry): A small floating pill near the text selection. Click to open actions.
- Menu (actions): A compact list of actions (Rewrite, Fix grammar, Shorten, Expand, Formal/Friendly tone, Summarize, Translate → English) filtered by user settings.
- Result card: A floating card showing the generated result with Apply, Regenerate, Copy, and Close. It anchors near the selection and clamps within the viewport.

Key interaction and UX decisions:

- Shadow DOM: All UI is isolated under a high z-index shadow root to avoid CSS conflicts and to simplify hit-testing.
- Selection anchoring: Position the tooltip/menu/result near the saved selection range with viewport clamping.
- Deferred cleanup: Defer UI teardown until the tick after Apply to avoid race conditions with selection restoration.
- Event robustness: Suppress selectionchange while interacting with the UI to avoid unwanted dismissals.
- Cross-realm input handling: Use the element’s own window prototypes and event constructors for setting values and dispatching events (React/Vue/iframe compatibility).
- Keyboard shortcuts: On the result card, Enter = Apply, Esc = Close, Cmd/Ctrl+C = Copy, Cmd/Ctrl+R = Regenerate.
- Regenerate: Quickly request another variation with the same mode and selection context.
- Draggable tooltip: The tooltip can be dragged; menus open relative to its current position.
- Light/dark polish: Subtle shadows, focus rings, and light/dark adaptation for modern feel.

## Consequences

### Positive

- Discoverable and fast: Low-friction editing near the selection.
- Resilient: Works across contenteditable, inputs, textareas, and many controlled inputs/iframes.
- Non-invasive: Shadow DOM isolation prevents page style conflicts.
- Efficient workflow: Regenerate and keyboard shortcuts reduce pointer travel.

### Negative / Trade-offs

- Restricted pages: chrome://, Web Store, and file:// pages are unsupported by content scripts.
- Editor quirks: Some complex editors may still constrain execCommand; robust fallbacks mitigate but cannot cover all custom runtime behaviors.
- Positioning limits: Anchoring to selection rects can be imprecise in some virtualized editors; viewport clamping helps.

## Alternatives Considered

- Browser action popup: Less context-aware and dismisses on blur; poorer ergonomics for in-place text editing.
- Full side-panel only: Good for long-form chat, but slower for quick rewrites; we kept the side panel for broader tasks and added this inline UI for speed.

## References

- Implementation: `src/content.js` (tooltip/menu/result, drag, positioning, applyReplacement).
- Prompting: `src/background.js` (`buildInlineAssistMessages` with clearer constraints).
- Options & storage: `ui/options/App.jsx` (enable toggle and action selection).
