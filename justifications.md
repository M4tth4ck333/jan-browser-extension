## Why site access (broad host permissions) is needed

- **Single experience across the web** — The inline assistant needs to surface on the sites the user actually writes on. These are diverse and often use embedded editors/iframes, so pre‑listing hosts would break the experience.
- **User‑initiated only** — We do not crawl or collect in the background. The script reads only small, relevant context when the user asks for help or selects text.
- **ActiveTab alone is insufficient** — ActiveTab grants temporary access only after clicking the action per tab. That would force an extra click before every selection/inline action and breaks keyboard‑first flows. We require seamless shortcuts and selection‑driven UI.
- **Minimal scope of data** — Title, URL, language, meta description, selection, and a trimmed visible‑text snippet; nothing more.

If reviewers prefer, we can provide a build that:
- Limits site access to `https://*/*` (drop `http://*/*`).
- Allows the user to opt‑in per‑site (Chrome’s site access controls) and documents this in the listing.
- Disables debug diagnostics for search by default.

### Reviewer‑friendly alternatives we support

- **Per‑site opt‑in (optional_host_permissions)** — Ship with optional host permissions and request access the first time the user enables Jan on a site. This removes broad site access at install time while preserving functionality.
- **ActiveTab + programmatic injection (scripting)** — For flows that are explicitly user‑initiated (e.g., “Ask with web”), we can inject a lightweight script into the current tab only after an action. This keeps inline assistance behind the user’s gesture when desired.
- **Scope search helper to a single results host** — Limit the on‑demand results helper to a specific results page host, while keeping general site access optional. The helper only reads small portions of the results page and closes the tab.
- **HTTPS‑only** — Remove `http://*/*` and document that local servers require the user to add an exception or use HTTPS.

## On‑demand search helper (non‑alarming)

When the user clicks “Ask with web,” the extension may open a temporary search results tab, read a small snippet of the results page to add brief context, and then close it. There is no background web crawling or automated queries, and this occurs only on explicit user request. The results are treated as data, never as executable code.
# Chrome Web Store — Permissions and Remote Code Justifications

This document contains copy‑ready answers for the Chrome Web Store submission, tailored to this codebase.

## Copy‑ready answers (paste into the form)

- **storage justification**
  Store user settings and optional chats in `chrome.storage.sync`. We save API base URL, API key, model, temperature, and optional MCP bridge token, plus chat/session state for convenience. No analytics or third‑party sharing. Data is used only by the side panel UI and background logic locally.

- **activeTab justification**
  The extension uses `activeTab` only in response to an explicit user gesture (opening the side panel, clicking the toolbar icon, or using a keyboard shortcut). On that gesture we:
  - Read the active tab’s URL and title and request a small snippet from the content script (selection and a trimmed visible‑text excerpt) to provide context.
  - Message only the active tab; other tabs are not queried or scanned.
  - Scope access to that tab and that user action; it is not persisted across other tabs or sessions.
  - Avoid reading browsing history or analytics; nothing is stored beyond user settings in `chrome.storage.sync`.

  This enables user‑initiated features such as “summarize selection” and inline writing help on the current page while keeping access minimal and ephemeral.

  Extended (paste into the form if more space is available):
  When the user opens the side panel, clicks the toolbar icon, or uses a keyboard shortcut, the extension gains temporary access to the current tab via `activeTab`. On that explicit gesture we read only minimal context—URL, title, page language, meta description, and the user’s selection plus a trimmed visible‑text excerpt—by messaging the content script in that tab. No other tabs are queried and access is not persisted across tabs or sessions. We do not read browsing history, track navigation, or run analytics. The captured context is used immediately to fulfill the user’s request (for example, summarizing the selection or providing inline writing help) and is not stored by the extension beyond user settings in `chrome.storage.sync`.

- **tabs justification**
  We use `chrome.tabs` to: (1) enumerate current tabs to show small selectable “open tab” chips in the side panel; (2) optionally open and then close a temporary search results tab on user request to gather brief context; (3) map the streaming port to the correct active tab before sending deltas. We do not track browsing history or persist tab data, and no background crawling occurs.

- **sidePanel justification**
  Required to render the extension UI as a Chrome side panel (`side_panel.default_path`). This is where the user chats with Jan and views results.

- **clipboardWrite justification**
  Allows users to copy generated responses/summaries to the clipboard from the side panel UI. Only occurs on explicit user action (Copy button).

- **Host permission justification**
  We request access on all sites so the content script can read the current page’s selected text and minimal metadata (title/URL/language/description) to provide contextual assistance and render the inline tooltip. This enables:
  - Inline writing help on any site with editors (Gmail, forums, docs) where we cannot pre‑enumerate domains.
  - Keyboard shortcuts and side‑panel actions to work immediately without asking the user to re‑grant access on every page.
  - Support for pages that place editors inside iframes (`all_frames: true`), which is common on large sites.

  Safeguards:
  - No background crawling; the content script is inert until user interaction (selection, tooltip/menu, or explicit command).
  - Only minimal context is read (title, URL, language, meta description, selection/visible text snippet) and used to fulfill the user’s request.
  - Data is sent only to the user‑configured OpenAI‑compatible endpoint; no analytics or third‑party sharing.

  If requested by review, we can narrow scope (e.g., HTTPS‑only or specific sites). Broad access is requested primarily to ensure the inline assistant works consistently anywhere the user chooses to write or read.

- **Are you using remote code?**
  No, I am not using remote code.

- **Remote code justification**
  All logic is bundled with the extension (MV3). We do not load or execute remote JS/WASM and do not use `eval` to run downloaded code. The extension fetches data from user‑configured OpenAI‑compatible APIs (e.g., Jan Server or Cerebras) and may open a temporary search results tab on user request for context; responses are treated as data, not executed as code. An optional local MCP bridge is a developer feature; the extension exchanges JSON over WebSocket and does not execute it.

## Reviewer references (where in code)

- `manifest.json` — requests `storage`, `activeTab`, `tabs`, `sidePanel`, `clipboardWrite`, and `<all_urls>` host permissions.
- `src/background.js` — orchestrates prompts, streaming model calls, optional search helper (opens a search results tab on request), MCP bridge client, and tab operations.
- `src/content.js` — extracts selection/page text and hosts the inline assistant tooltip.
- `ui/sidepanel/` — side panel React app (entries under `ui/sidepanel/`).

## Data safety notes

- Settings are stored in `chrome.storage.sync`.
- Only user‑initiated content (page snippets/selection) is sent to the configured model endpoint.
- No analytics or tracking libraries; no third‑party sharing.

## Data usage (form selections)

Use these selections in the Chrome Web Store Data usage section.

- **What user data do you collect?**
  - Website content — Yes (user‑initiated page snippets/selection and minimal metadata used to provide assistance).
  - All other categories — No (we do not collect PII, health, financial, authentication info, location, web history, or keystrokes).

- **Data handling purpose**
  - App functionality (only to provide the requested assistance in the side panel/inline tooltip).

- **Is data sold?**
  - No.

- **Is data shared with third parties?**
  - No (the extension sends requests only to the user‑configured OpenAI‑compatible endpoint to fulfill the user’s request; no other sharing).

- **Is data processed ephemerally?**
  - Yes. Content is processed on demand and not retained by the extension; settings are stored in `chrome.storage.sync`.

- **Is data encrypted in transit?**
  - Yes, when using HTTPS endpoints (e.g., Cerebras or other HTTPS OpenAI‑compatible services). If the user explicitly configures an `http://` local server (e.g., Jan Server on localhost), traffic remains local to the device.

- **User deletion request**
  - Users can delete all extension‑stored data via Options → Reset (or by clearing `chrome.storage.sync` for this extension). The extension does not store processed page content.

- **Certifications**
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes unrelated to my item’s single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Optional tightening (if requested by review)

- Narrow host permissions (e.g., `https://*/*`) or allow‑list specific sites.
- Disable debug diagnostics related to search in production if requested.

## Single purpose (paste into the form)

Bring Jan into Chrome as a single, focused companion: side‑panel chat and inline writing assistance that uses the current page/selection and optional on‑demand web results at the user’s request.

## Store listing (copy/paste)

- **Title**
  Jan — Browser Extension

- **Short description** (≤ 132 chars)
  Bring Jan into your browser: side‑panel chat, inline writing help, and optional on‑demand web results.

- **Long description**
  Jan Browser Extension brings Jan into Chrome. Chat in the side panel with page or selection context, get inline writing help on any site, and optionally pull quick web results when you ask. Works with your Jan service and any OpenAI‑compatible endpoint.

  Features:
  • Side‑panel chat with page/selection context
  • Inline assistant for selected text (rewrite, simplify, translate)
  • Optional on‑demand web results opened in a temporary tab
  • Copy responses to clipboard
  • Configurable provider (Jan Server/local, Cerebras, or custom OpenAI‑compatible)

  Privacy:
  • Settings live in chrome.storage.sync
  • Content is processed only on user request; no background crawling
  • No analytics or third‑party sharing
  • Requests go only to your configured endpoint; you can reset data in Options

  Permissions (why we need them):
  • storage — save settings and optional chat/session state
  • activeTab/tabs — read active page title/URL/selection for context; manage a temporary results tab on request
  • sidePanel — show the app UI in Chrome’s side panel
  • clipboardWrite — let you copy generated text
  • Site access — read selection and minimal metadata to help on any site you choose

- **Category**
  Workflow & Planning

- **Language**
  English (United States)
