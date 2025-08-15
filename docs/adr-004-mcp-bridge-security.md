# ADR-004: MCP Bridge Security – Optional Token (Default Off)

- Status: Accepted
- Date: 15 Aug 2025
- Owners: Jan Summarizer team

## Context

The extension connects to a local MCP bridge via WebSocket at `ws://127.0.0.1:17389` to forward tool calls (e.g., `search`) to the browser for scraping and results. We previously supported an optional shared secret via `BRIDGE_TOKEN` and appended it as a query string (e.g., `?t=...`). However, always attempting tokenized connections adds friction during local development and is unnecessary in many single-user environments.

## Decision

- Introduce a user-facing toggle `useBridgeToken` in `ui/options/App.jsx` that controls whether the browser includes the token when connecting to the bridge.
- Default: `useBridgeToken = false` (do not send a token unless explicitly enabled).
- When `useBridgeToken` is true and `bridgeToken` is set, the background service worker (`src/background.js`) appends `?t=<token>` to the WebSocket URL.
- The background reconnects when either `bridgeToken` or `useBridgeToken` changes to apply the new policy immediately.
- The Options UI and “Check bridge” status line reflect whether a token is actually being used (`usingToken`).

## Rationale

- Local, single-machine dev often does not require a token; removing default token usage reduces setup overhead.
- Keeping the token path as an opt-in supports teams that want extra safety (e.g., multiple browser profiles, shared machines, or other apps probing the port).
- Minimizes accidental leakage of a token in logs/commands when it’s not needed.

## Alternatives Considered

1. Always require a token
   - Pros: strongest stance by default.
   - Cons: worse DX; more friction for quick testing and demos.

2. Never use a token
   - Pros: simplest.
   - Cons: reduced protection if the local port is accidentally exposed or multiple users share the environment.

3. IP allowlist or OS-level socket permissions
   - Pros: stronger protection without shared secrets.
   - Cons: complexity, cross-platform variability, and additional setup burden.

## Consequences

- UI: A new “Use token for bridge auth (default: off)” toggle appears in the Bridge section of Options.
- Background behavior: Connection URL includes the token only when both the toggle is On and a token exists.
- Status reporting: `GET_BRIDGE_STATUS` reports `usingToken = true` only when both conditions are met.
- Commands: The “Copy server command” button adapts to include `BRIDGE_TOKEN=...` only when the toggle is On.

## Security Notes

- A token bounds who can use the bridge, but it is not a silver bullet.
- The token must be delivered securely to the MCP server process (shell env).
- The token should not be committed; use env variables and local .env files as needed.
- If the port is ever exposed beyond `127.0.0.1`, a token (or stronger controls) is recommended.

## Implementation Pointers

- Options UI: `ui/options/App.jsx`
  - `DEFAULTS` now includes `useBridgeToken: false` and `bridgeToken`.
  - Toggle persists immediately to `chrome.storage.sync`.
  - Copy button adapts based on `useBridgeToken` and presence of `bridgeToken`.

- Background: `src/background.js`
  - Reads `{ bridgeToken, useBridgeToken }` before connecting.
  - Appends `?t=...` only when eligible.
  - Reconnects on changes to `bridgeToken` or `useBridgeToken`.
  - `GET_BRIDGE_STATUS` computes `usingToken` from both values.

## Migration

- Existing users with a token set will continue to connect without sending it until they enable the toggle.
- No breaking changes; the bridge server behaves as before when no token is provided.

## Rollout & Testing

- Manual: toggle on/off, verify connection and `usingToken` flag in Options via “Check bridge”.
- Verify “Copy server command” adapts the presence of `BRIDGE_TOKEN` accordingly.
- Confirm reconnect occurs automatically on toggle or token changes.
