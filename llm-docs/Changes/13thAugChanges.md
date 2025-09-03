# 13th Aug Changes

Date: 2025-08-13

This document summarizes all UI/UX and logic tweaks made to the side panel chat experience today.

## Highlights

- Minimalist chat UI with cleaner bubbles and fewer distractions
- Copy action moved to a bottom action bar on assistant messages (ChatGPT-like)
- Responsive behavior improved for very narrow panels
- Context tabs shown as removable chips above the input
- Removed "Jan" branding and icon; neutral bot avatar
- Message timestamps added to data model (then visually hidden for minimal mode)
 - Inline Popover Tab Picker with search and checkboxes (no sidebar bounce)
 - One-click Google Search button next to Send

## UI/UX Changes

- Message bubbles
  - Assistant/user bubble grouping with adjusted rounding per group head/tail.
  - Avatars at group tail; avatars hidden on small screens.
  - Removed shadows for minimal look; kept rounded corners.
  - Timestamps stored but hidden in UI for minimal mode.
  - Assistant copy action moved to a bottom bar (always visible on small screens, on hover for desktop).
  - Code blocks retain their own "Copy code" button at top-right.

- Header
  - Removed app branding and Jan hand icon.
  - Header shows only the session title (fallback: "Chat").
  - Header actions removed for now to keep UI minimal.

- Footer/Input
  - Textarea is vertically resizable (`resize-y`) with larger max height on `sm+`.
  - Footer stacks on small screens; input remains full width.

- Context tabs as chips
  - Selected tabs now render as small chips above the input with an X to remove.
  - "Add" opens an inline Popover picker with search + checkboxes (stays in context; no sidebar reopen).

- Responsiveness
  - Bubbles expand to 100% width on very small panels; 75% on larger.
  - Header and action areas wrap; layout uses `min-w-0` to prevent overflow clipping.
  - Smooth scrolling via Radix ScrollArea.

## Interaction/Streaming Changes

- Message timestamps (`ts`) added when creating new messages in various flows:
  - Initial assistant message for a new chat.
  - User messages (sendChat, summarize page/selection).
  - Assistant placeholder message on `CHAT_STREAM_BEGIN`.
  - Assistant error message on `CHAT_STREAM_ERROR`.
- Auto title generation: first user message sets the session title.
- Streaming logic remains intact (port re-registration etc.).

## Branding

- Removed `Jan` icon and label from header and sidebar.
- Assistant avatar uses `Bot` icon from `lucide-react`.

## Components/Libraries

- Added Radix ScrollArea for message list smoothing: `@radix-ui/react-scroll-area`.
- Added Radix Popover for inline picker: `@radix-ui/react-popover`.
- Icons via `lucide-react`: `User`, `Send`, `Copy`, `Bot`, `X`, `Plus`, `Search`, `RefreshCw`, `Check`.
- Continued shadcn/ui usage (`Button`, `Textarea`, `Input`).

## Files Touched

- `ui/sidepanel/App.jsx`
  - Message UI: grouping, avatars (neutral Bot), bottom copy bar, hidden timestamps, no shadow.
  - Scroll container replaced with Radix ScrollArea.
  - Auto session title; `ts` fields added across message creation paths.
  - Header simplified; actions removed.
  - Footer responsive; textarea `resize-y`; context chips with X and Popover-based Add picker.
  - Removed `Jan` branding and `../assets/jan-hand.svg` import.
  - Added inline Popover Tab Picker with search/refresh/done controls.
  - Added `openGoogleSearch()` and a minimal Search icon button next to Send.

- `ui/components/ui/textarea.jsx`
  - No functional change today; referenced as the unified textarea component.
  
- `ui/components/ui/input.jsx`
  - Used by the Tab Picker search field.

## Build Notes

- Built successfully with Vite after each change.
  - Example output (latest):
    - dist/ui/sidepanel/index.html ~0.59 kB
    - dist/assets/sidepanel.js ~1,008 kB (gzip ~218 kB)

## How to Use

- Add context tabs: click "Add" to open the picker; search and toggle checkboxes, then click Done.
- Remove a context tab: click the X on the chip above the input.
- Copy assistant reply: use the bottom Copy action. Copy code blocks via the in-block button.
 - Search Google: click the magnifying glass button next to Send (uses current input text).

## Potential Next Steps

- Scroll-to-bottom FAB when not near bottom.
- Typing indicator while streaming begins.
- Optional compact mode toggle and day separators.
- Collapse header actions into a single menu for very tight widths.
