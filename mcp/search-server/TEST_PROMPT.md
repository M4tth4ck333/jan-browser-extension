# MCP Tool Validation Prompt

This prompt is designed to test all available MCP tools exactly once and provide a summary. When run with a tool-use capable LLM, it should produce consistent results on each execution.

## Instructions for LLM

You are testing a Model Context Protocol (MCP) server that provides browser automation and observation tools. Your task is to:

1. **Call each tool exactly once** in the order specified below
2. **Use the exact parameters** provided for deterministic results
3. **Report the result** of each tool call (success/failure)
4. **Provide a final summary** with pass/fail counts

**IMPORTANT**: Use `https://example.com` for all tests to ensure consistent, deterministic results across runs.

---

## Test Sequence

### Test 1: Bridge Status
**Tool**: `bridge_status`
**Parameters**: `{}`
**Expected**: Connection status with `connected: true`
**Report**: "✅ bridge_status" or "❌ bridge_status: [error]"

---

### Test 2: Navigate to Example Site (keep tab open)
**Tool**: `navigate_browser`
**Parameters**:
```json
{
  "url": "https://example.com",
  "mode": "markdown",
  "closeTab": false
}
```
**Expected**: Page content in markdown format, with `tabId` returned, tab stays open
**Report**: "✅ navigate_browser (closeTab=false)" or "❌ navigate_browser: [error]"

---

### Test 3: Snapshot
**Tool**: `snapshot`
**Parameters**: `{}`
**Expected**: Comprehensive page snapshot including:
- ARIA accessibility tree
- Interactive elements array
- Links array
- Images array
- Forms array
- Headings array
- Full HTML
- Viewport dimensions

**Report**: "✅ snapshot - Found [N] links, [M] interactive elements" or "❌ snapshot: [error]"

---

### Test 4: Screenshot
**Tool**: `screenshot`
**Parameters**: `{}`
**Expected**: Base64-encoded PNG image starting with `data:image/png;base64,`
**Report**: "✅ screenshot - [N] chars" or "❌ screenshot: [error]"

---

### Test 5: Scroll Down
**Tool**: `scroll`
**Parameters**:
```json
{
  "direction": "down",
  "amount": 300
}
```
**Expected**: Page scrolls down 300 pixels, returns snapshot after scrolling
**Report**: "✅ scroll (down)" or "❌ scroll: [error]"

---

### Test 6: Scroll to Top
**Tool**: `scroll`
**Parameters**:
```json
{
  "direction": "top"
}
```
**Expected**: Page scrolls to top, returns snapshot
**Report**: "✅ scroll (top)" or "❌ scroll: [error]"

---

### Test 7: Hover Over Link
**Tool**: `hover`
**Parameters**:
```json
{
  "selector": "a"
}
```
**Expected**: Mouse hovers over the first link element, returns snapshot
**Report**: "✅ hover" or "❌ hover: [error]"

---

### Test 8: Navigate to Wikipedia Form Page (for automation tests)
**Tool**: `navigate_browser`
**Parameters**:
```json
{
  "url": "https://en.wikipedia.org/wiki/Special:Search",
  "mode": "markdown",
  "closeTab": false
}
```
**Expected**: Wikipedia search page loaded, tab stays open
**Report**: "✅ navigate_browser (Wikipedia)" or "❌ navigate_browser: [error]"

---

### Test 9: Type into Search Box
**Tool**: `type`
**Parameters**:
```json
{
  "selector": "input[name='search']",
  "text": "Model Context Protocol",
  "clear": true,
  "pressEnter": false
}
```
**Expected**: Text typed into search input, returns snapshot
**Report**: "✅ type" or "❌ type: [error]"

---

### Test 10: Click Search Button
**Tool**: `click`
**Parameters**:
```json
{
  "selector": "button[type='submit']",
  "waitForNavigation": true
}
```
**Expected**: Search button clicked, navigates to results page, returns snapshot
**Report**: "✅ click" or "❌ click: [error]"

---

### Test 11: Go Back
**Tool**: `go_back`
**Parameters**: `{}`
**Expected**: Browser navigates back to search page, returns snapshot
**Report**: "✅ go_back" or "❌ go_back: [error]"

---

### Test 12: Go Forward
**Tool**: `go_forward`
**Parameters**: `{}`
**Expected**: Browser navigates forward to results page, returns snapshot
**Report**: "✅ go_forward" or "❌ go_forward: [error]"

---

### Test 13: Web Search
**Tool**: `web_search`
**Parameters**:
```json
{
  "query": "example domain",
  "numResults": 3,
  "format": "serper"
}
```
**Expected**: Search results with `organic` array containing titles, URLs, and snippets
**Report**: "✅ web_search - [N] results" or "❌ web_search: [error]"

---

### Test 14: Navigate and Close Tab
**Tool**: `navigate_browser`
**Parameters**:
```json
{
  "url": "https://example.com",
  "mode": "html",
  "closeTab": true
}
```
**Expected**: Page content in HTML format, tab closed after extraction
**Report**: "✅ navigate_browser (closeTab=true)" or "❌ navigate_browser: [error]"

---

### Test 15: Snapshot (should fail - no active tab)
**Tool**: `snapshot`
**Parameters**: `{}`
**Expected**: **ERROR** - "No active tab" because we closed the tab in Test 14
**Report**: "✅ snapshot correctly failed (no active tab)" or "❌ snapshot: unexpected behavior"

---

### Test 16: Screenshot (should fail - no active tab)
**Tool**: `screenshot`
**Parameters**: `{}`
**Expected**: **ERROR** - "No active tab"
**Report**: "✅ screenshot correctly failed (no active tab)" or "❌ screenshot: unexpected behavior"

---

## Final Summary Format

After completing all tests, provide a summary in this exact format:

```
=== MCP Tool Validation Summary ===

Total Tests: 16
Passed: [N]
Failed: [M]

Tool Results:
1. bridge_status: [PASS/FAIL]
2. browser_navigate (closeTab=false): [PASS/FAIL]
3. snapshot: [PASS/FAIL]
4. screenshot: [PASS/FAIL]
5. scroll (down): [PASS/FAIL]
6. scroll (top): [PASS/FAIL]
7. hover: [PASS/FAIL]
8. browser_navigate (Wikipedia): [PASS/FAIL]
9. type: [PASS/FAIL]
10. click: [PASS/FAIL]
11. go_back: [PASS/FAIL]
12. go_forward: [PASS/FAIL]
13. web_search: [PASS/FAIL]
14. browser_navigate (closeTab=true): [PASS/FAIL]
15. snapshot (no active tab - expected fail): [PASS/FAIL]
16. screenshot (no active tab - expected fail): [PASS/FAIL]

Overall Status: [PASS/FAIL]

Tool Coverage:
✓ Observation tools: bridge_status, snapshot, screenshot, web_search
✓ Navigation tools: browser_navigate, go_back, go_forward, scroll
✓ Automation tools: click, type, hover
✗ Disabled tools: wait (not meaningful), execute_script (security concern)
✗ Not tested: select_option, fill_form (require specific form structures)

Key Findings:
- Agentic workflow (navigate → snapshot → screenshot → interact): [WORKING/BROKEN]
- Tab management (closeTab flag): [WORKING/BROKEN]
- Browser history navigation: [WORKING/BROKEN]
- Form interaction: [WORKING/BROKEN]
- Error handling (no active tab): [WORKING/BROKEN]
```

---

## Available Tools Summary

### Observation Tools (4)
1. **bridge_status** - Check connection status
2. **snapshot** - ARIA tree + page analysis
3. **screenshot** - Capture visual screenshot
4. **web_search** - DuckDuckGo search with structured results

### Navigation Tools (4)
1. **browser_navigate** - Load URL and extract content
2. **go_back** - Navigate browser history back
3. **go_forward** - Navigate browser history forward
4. **scroll** - Scroll page (up/down/top/bottom)

### Automation Tools (5)
1. **click** - Click element by selector
2. **type** - Type text into input field
3. **hover** - Hover over element
4. **select_option** - Select dropdown option (not tested)
5. **fill_form** - Fill multiple form fields (not tested)

### Disabled Tools (2)
1. **wait** - Disabled: not meaningful for agentic workflows
2. **execute_script** - Disabled: security concern

**Total Active Tools: 13 (11 tested in this suite)**

---

## Determinism Requirements

To ensure consistent results across runs:

1. **Always use `https://example.com`** for basic tests - This is a stable, simple page maintained by IANA
2. **Use Wikipedia for form tests** - Stable, public site with consistent structure
3. **Call tools in the specified order** - Order matters for tab state management
4. **Use exact parameters** - Do not add or modify parameters
5. **Do not perform additional tool calls** - Only the 16 tests above
6. **Report numeric counts** - Links, elements, result counts for comparison

---

## Expected Behavior

### Agentic Workflow (Tests 2-7, 8-12)
These tests demonstrate the agentic pattern:
- Navigate opens a tab and **keeps it open** (closeTab=false)
- Subsequent observation tools (snapshot, screenshot) operate on the **same tab**
- Automation tools (scroll, hover, type, click) modify the **same tab**
- Navigation tools (go_back, go_forward) use browser history on the **same tab**

**This pattern matches browsermcp architecture** where tools operate on the current tab state, not by opening new tabs for each operation.

### Tab Management (Tests 2, 14-16)
- Test 2: Tab stays open when closeTab=false
- Test 14: Tab closes when closeTab=true
- Tests 15-16: Tools fail gracefully with "No active tab" error after tab is closed

### Error Cases (Tests 15-16)
After Test 14 closes the tab, Tests 15-16 should **fail gracefully** with "No active tab" errors. This validates proper state management.

---

## Running the Test

1. Ensure the MCP server is running: `npm run start:mcp` or `npm run dev:mcp`
2. Ensure the Chrome extension is installed and connected
3. Provide this prompt to an MCP-compatible LLM client (Claude, Cursor, Windsurf, etc.)
4. The LLM should execute all tools and provide the summary

---

## Notes on Tool Selection

### Why These Tools Are Included

**Observation Tools**: Essential for understanding page state
- `bridge_status`: Validates connection before other operations
- `snapshot`: Provides structured page analysis for LLMs
- `screenshot`: Visual confirmation of page state
- `web_search`: External search capability

**Navigation Tools**: Core browsing functionality
- `browser_navigate`: Primary tool for loading pages
- `go_back`/`go_forward`: Browser history navigation
- `scroll`: Common interaction for revealing content

**Automation Tools**: Enable page interaction
- `click`: Most common interaction (buttons, links)
- `type`: Text input (forms, search boxes)
- `hover`: Triggers dropdowns, tooltips

### Why Some Tools Are Not Tested

**select_option** and **fill_form**: These require specific form structures that may vary. They're tested in integration but not in this validation suite.

**wait**: Disabled as it's not meaningful for agentic workflows. Pages should be ready after navigation.

**execute_script**: Disabled due to security concerns. Custom JavaScript execution should be avoided.

---

## Troubleshooting

If tests fail:

1. **"Connection refused"** → Ensure MCP server is running (`npm run start:mcp`)
2. **"Extension not connected"** → Install and activate Chrome extension, verify bridge connection in service worker console
3. **"Timeout"** → Increase timeout or check network connectivity
4. **"No active tab"** for Tests 15-16 → **Expected behavior** - should PASS if error occurs
5. **Snapshot/screenshot fail on Tests 3-4** → May indicate tab wasn't kept open properly
6. **Different results on each run** → Check if example.com or Wikipedia are being used (not live sites with changing content)

---

## Expected Output Example

```
Let me test all MCP tools systematically.

Test 1: Checking bridge status...
✅ bridge_status - Connected: true

Test 2: Navigating to example.com with closeTab=false...
✅ browser_navigate (closeTab=false) - Title: "Example Domain", tabId: 123456

Test 3: Taking snapshot of active tab...
✅ snapshot - Found 1 links, 5 interactive elements, 2 headings

Test 4: Taking screenshot of active tab...
✅ screenshot - 45678 chars

Test 5: Scrolling down 300 pixels...
✅ scroll (down)

Test 6: Scrolling to top...
✅ scroll (top)

Test 7: Hovering over first link...
✅ hover

Test 8: Navigating to Wikipedia search page...
✅ browser_navigate (Wikipedia) - Title: "Search - Wikipedia"

Test 9: Typing into search box...
✅ type

Test 10: Clicking search button...
✅ click - Navigated to search results

Test 11: Going back in history...
✅ go_back

Test 12: Going forward in history...
✅ go_forward

Test 13: Performing web search...
✅ web_search - 3 results returned

Test 14: Navigating with closeTab=true...
✅ browser_navigate (closeTab=true, html mode) - HTML content captured

Test 15: Attempting snapshot without active tab...
✅ snapshot correctly failed (no active tab)

Test 16: Attempting screenshot without active tab...
✅ screenshot correctly failed (no active tab)

=== MCP Tool Validation Summary ===

Total Tests: 16
Passed: 16
Failed: 0

Tool Results:
1. bridge_status: PASS
2. browser_navigate (closeTab=false): PASS
3. snapshot: PASS
4. screenshot: PASS
5. scroll (down): PASS
6. scroll (top): PASS
7. hover: PASS
8. browser_navigate (Wikipedia): PASS
9. type: PASS
10. click: PASS
11. go_back: PASS
12. go_forward: PASS
13. web_search: PASS
14. browser_navigate (closeTab=true): PASS
15. snapshot (no active tab - expected fail): PASS
16. screenshot (no active tab - expected fail): PASS

Overall Status: PASS

Tool Coverage:
✓ Observation tools: bridge_status, snapshot, screenshot, web_search
✓ Navigation tools: browser_navigate, go_back, go_forward, scroll
✓ Automation tools: click, type, hover
✗ Disabled tools: wait (not meaningful), execute_script (security concern)
✗ Not tested: select_option, fill_form (require specific form structures)

Key Findings:
- Agentic workflow (navigate → snapshot → screenshot → interact): WORKING
- Tab management (closeTab flag): WORKING
- Browser history navigation: WORKING
- Form interaction: WORKING
- Error handling (no active tab): WORKING
```
