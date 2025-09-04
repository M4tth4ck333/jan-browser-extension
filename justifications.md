# Permission Justifications (Jan Browser Extension)

This document explains why the Jan extension requests each permission and how access is scoped to explicit user actions. No analytics, no third‑party sharing.

## contextMenus
Used to add right‑click menu items that the user can invoke on demand, such as:
- Summarize selection or page in the side panel
- Rewrite/translate selected text with Inline Assistant
- Open Jan side panel with page context

Behavior and safeguards:
- Only appears on user right‑click; no background monitoring of pages.
- Operates on the current page/selection only when the user clicks a menu item.
- Reads minimal context (selection + small visible text excerpt) and routes it to the side panel/background to fulfill the explicit command.
- No persistent logging; no data sent anywhere except the user‑configured OpenAI‑compatible endpoint.

## scripting
Required to programmatically inject or execute small scripts in the active tab in response to explicit user actions. We use it to:
- Extract minimal page context (selection, trimmed visible‑text excerpt, title/URL/lang/meta) to build better prompts.
- Support Inline Assistant tooltip rendering in editable fields where a declared content script may need augmentation.
- Run lightweight DOM probes during optional search flows (e.g., wait for hydration before scraping a temporary results tab).

Scoping and safeguards:
- Only executed against the active tab in response to a user gesture (toolbar click, keyboard shortcut, context menu, or side‑panel action).
- No persistent or continuous injection; scripts run and return immediately for the target action.
- No cross‑site tracking; no history access.

## storage
Store user settings and optional chats in chrome.storage.sync. We save API base URL, API key, model, temperature, and optional MCP bridge token, plus chat/session state for convenience. No analytics, no third‑party sharing. Data is only used locally by the extension’s side panel (ui/sidepanel/) and background (src/background.js).

## activeTab
The extension uses `activeTab` only in response to an explicit user gesture (opening the side panel, clicking the toolbar icon, or using a keyboard shortcut). On that gesture we:
  - Read the active tab’s URL and title and request a small snippet from the content script (selection and a trimmed visible‑text excerpt) to provide context.
  - Message only the active tab; other tabs are not queried or scanned.
  - Scope access to that tab and that user action; it is not persisted across other tabs or sessions.
  - Avoid reading browsing history or analytics; nothing is stored beyond user settings in `chrome.storage.sync`.

This enables user‑initiated features such as “summarize selection” and inline writing help on the current page while keeping access minimal and ephemeral.

## tabs
We use `chrome.tabs` to: (1) enumerate current tabs to show small selectable “open tab” chips in the side panel; (2) optionally open and then close a temporary search results tab on user request to gather brief context; (3) map the streaming port to the correct active tab before sending deltas. We do not track browsing history or persist tab data, and no background crawling occurs.

## clipboardWrite
Allows users to copy generated responses/summaries to the clipboard from the side panel UI. Only occurs on explicit user action (Copy button).

## host permissions
We request access on all sites so the content script can read the current page’s selected text and minimal metadata (title/URL/language/description) to provide contextual assistance and render the inline tooltip. This enables:
  - Inline writing help on any site with editors (Gmail, forums, docs) where we cannot pre‑enumerate domains.
  - Keyboard shortcuts and side‑panel actions to work immediately without asking the user to re‑grant access on every page.
  - Support for pages that place editors inside iframes (`all_frames: true`), which is common on large sites.

  Safeguards:
  - No background crawling; the content script is inert until user interaction (selection, tooltip/menu, or explicit command).
  - Only minimal context is read (title, URL, language, meta description, selection/visible text snippet) and used to fulfill the user’s request.
  - Data is sent only to the user‑configured OpenAI‑compatible endpoint; no analytics or third‑party sharing.
