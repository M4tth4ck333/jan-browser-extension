# Draft PR Title and Description

## Proposed Title
Refactor automation tooling with debugger-driven input, ref-only targeting, and cached snapshots

## Proposed Description
### Summary
- Consolidated automation around debugger-driven mouse and keyboard helpers so clicks and typing are emitted as real pointer/key events with human-like movement and delays.
- Reworked action targeting to rely solely on snapshot refs, validate element capabilities via a centralized map, and return rich metadata (tag, role, bounds, click point) for every action response.
- Added ref-map stabilization and snapshot caching so snapshot IDs persist alongside their element maps without automatic recapture after each action.

### Testing
- Not run (environment lacks the @tailwindcss/postcss dependency required for the build).
