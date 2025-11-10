# browsermcp/mcp tool parity audit

The Jan Browser MCP bridge now mirrors the upstream [`browsermcp/mcp`](https://github.com/browsermcp/mcp) tool catalog. Every automation, navigation, observation, and search handler emits MCP-native envelopes (`content`, `_meta`, `isError`) and automatically attaches accessibility snapshots so responses can flow directly into the protocol without post-processing.

## Highlights

* **MCP-compliant envelopes** – All browser tools now return rich `content` payloads (text or images) with optional `_meta` data such as tab identifiers and citation URLs.【F:src/mcp-tools/automation.js†L15-L690】【F:src/mcp-tools/navigation.js†L1-L330】【F:src/mcp-tools/observation.js†L1-L155】【F:src/mcp-tools/search.js†L1-L142】 Upstream servers receive the same structures, so parity is maintained both in-browser and on the bridge.【F:mcp-server/src/tools/automation.ts†L1-L210】【F:mcp-server/src/tools/navigation.ts†L1-L210】【F:mcp-server/src/tools/observation.ts†L1-L210】
* **Automatic ARIA snapshots** – Clicks, typing, scrolling, history navigation, and explicit snapshot calls all route through the shared `captureSnapshotResponse` helper, producing YAML summaries identical to the upstream MCP implementation.【F:src/mcp-tools/snapshot-utils.js†L1-L420】【F:src/mcp-tools/automation.js†L52-L680】【F:src/mcp-tools/navigation.js†L150-L322】 The server side detects and forwards these envelopes without re-requesting data.【F:mcp-server/src/utils/aria-snapshot.ts†L7-L120】
* **Unified error handling** – Validation and runtime failures now surface as `isError` responses with human-readable messages inside `content`, matching the upstream protocol expectations.【F:src/mcp-tools/snapshot-utils.js†L6-L45】【F:src/mcp-tools/automation.js†L15-L690】【F:src/mcp-tools/navigation.js†L13-L330】【F:src/mcp-tools/search.js†L1-L142】
* **Search parity** – The web search bridge formats both structured JSON and human-readable summaries, including citation metadata, so upstream `web_search` consumers see the same output regardless of backend (DuckDuckGo or Google).【F:src/mcp-tools/search.js†L1-L142】【F:mcp-server/src/tools/observation.ts†L122-L210】

## Remaining differences

* **GitHub helper utilities** – Jan Browser no longer bundles the experimental repository browsing helpers, restoring a one-to-one tool list with `browsermcp/mcp`. Any future GitHub integration should live in a dedicated MCP service rather than the browser extension.【F:src/mcp-tools/index.js†L1-L90】

With these changes in place, an upstream MCP server can consume Jan Browser tool responses without additional translation, and Jan’s in-browser handlers provide the same accessibility context, error semantics, and metadata that browsermcp/mcp agents expect.
