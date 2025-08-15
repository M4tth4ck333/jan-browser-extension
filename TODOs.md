# TODOs

A concise roadmap to finish and polish the unified Chrome extension + MCP Search bridge workflow.

## Immediate

- [ ] Try unified dev: `npm run dev:all` (or `bun run dev:all`), load extension from `dist/`, confirm background connects to bridge.
- [ ] In MCP client, call `server_info` and verify version prints; run `bridge_status` to see `connected: true`.
- [ ] Run a `search` and confirm:
  - [ ] Serper-like JSON in `content[0].text` includes `urls` array.
  - [ ] `_meta.urls` also present.
  - [ ] `visit_tool` works on a result URL and falls back to HTTP fetch if needed.
- [ ] Document quick troubleshooting in README (port in use, extension not connected, etc.).

## MCP Search Server

- [ ] Add structured Zod types to output shapes for `search`/`visit_tool` to reduce unknown casts.
- [ ] Improve error surfaces: include cause codes (timeout, no-bridge, bad-args) and retry suggestions.
- [ ] Timeouts/backoff tuning between server and extension bridge.
- [ ] Add optional request `userAgent` and `Accept-Language` pass-through for fetch fallback.
- [ ] Add configurable `maxContentLength` for `visit_tool` content.
- [ ] Optional: expose a `health` tool returning version + bridge status.

## MCP Client (`mcp/search-server/client.ts`)

- [ ] Parse `content[0].text` JSON and robustly handle `urls` vs `_meta.urls`.
- [ ] Add small CLI flags for query, numResults, and visit to a specific index.
- [ ] Better pretty-printing of results and errors.

## Extension

- [ ] Background: robust reconnect/backoff to WebSocket bridge; log concise state transitions.
- [ ] Side panel: surface MCP bridge connection status + quick troubleshooting link.
- [ ] Restrict host permissions for production build; keep wide perms for dev only.
- [ ] Optional: auto-reload extension on `dist` changes during dev (helper script) to reduce manual reloads.

## Scripts & DX

- [ ] Add `lint` and `typecheck` scripts (root + MCP server), wire to CI.
- [ ] Consider `prebuild` in MCP server to clean `dist`.
- [ ] Optional: `npm run start:claude` that prints exact Claude config snippet and validates the path.

## Docs

- [ ] Add GIF/screenshot of Side Panel, Options page, and a sample MCP `search` round-trip.
- [ ] Troubleshooting section: port already in use; service worker inactive; restricted pages; bridge not connected.
- [ ] Example prompts for `search` + `visit_tool`.

## CI/CD

- [ ] GitHub Actions: build extension (Vite) + build MCP server (tsc) + typecheck + lint.
- [ ] Publish MCP server as an NPM package (optional); expose bin pointing to `dist/src/index.js`.

## Security & Privacy

- [ ] Clarify storage scopes (`chrome.storage.sync` vs `local`), remind not to commit secrets.
- [ ] Sanitize logs; avoid dumping full page content in logs.

## Release

- [ ] Versioning strategy for MCP server (`SERVER_VERSION`) and extension.
- [ ] Changelog automation.
- [ ] Draft a release checklist (build, test, docs, tag, upload).
