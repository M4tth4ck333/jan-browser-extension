# browsermcp/mcp tool parity audit

Jan Browser MCP now ships the same `browser_*` tool catalog that upstream [`browsermcp/mcp`](https://github.com/browsermcp/mcp) exposes. Every automation or navigation call triggers the action in the extension and then asks the browser for a fresh ARIA snapshot, so the envelopes match upstream responses byte-for-byte: a short action line followed by the YAML snapshot with `- Page Snapshot` heading.

## What matches

* **Tool names** – The MCP server advertises the canonical tools: `browser_navigate`, `browser_click`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_drag`, `browser_snapshot`, `browser_screenshot`, `browser_go_back`, `browser_go_forward`, and `browser_scroll`. Custom helper (`fill_form`) remains available as an add-on.
* **Element references** – `browser_snapshot` now emits the same `ref` strings upstream uses (`css:body > …`). Automation tools accept `{ element, ref }` payloads, so prompts can copy/paste directly from the snapshot just like in browsermcp.
* **Response shape** – Actions return two text blocks just like upstream: an action summary and a YAML snapshot built on the server via `captureAriaSnapshot`. Navigation (`browser_navigate`) returns only the snapshot, matching `common.navigate(true)` from upstream.
* **Snapshot formatting** – The server rebuilds every snapshot response into the upstream format (`- Page URL`, `- Page Title`, `- Page Snapshot`), so automation tools, navigation tools, and the explicit `browser_snapshot` tool all render identical context blocks.
* **Extension behavior** – Automation and navigation handlers no longer capture their own snapshots; they simply perform the action and return lightweight status text, just like the Browser MCP extension. The ARIA capture happens once per tool from the server layer, reducing duplicate work.

## Intentional differences

* **Console logs** – The upstream `browser_get_console_logs` tool is still omitted because Jan workflows rarely need it. Everything else in the core catalog is present.
* **Extra utilities** – Jan Browser keeps `fill_form` for Jan-specific workflows. Upstream does not ship this helper, but it remains optional alongside the canonical catalog.

With these adjustments, MCP clients (Claude, Cursor, Jan Desktop, etc.) can swap between Jan Browser MCP and browsermcp/mcp without changing prompts: tool names, descriptions, and response envelopes are aligned, and element targeting now relies on the same ARIA references.
