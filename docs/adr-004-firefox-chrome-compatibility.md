# ADR-004: Firefox vs Chrome Extension Compatibility

**Date:** 2025-08-28  
**Status:** Accepted  
**Context:** Cross-browser extension support for Jan browser extension

## Problem

The Jan browser extension was initially built for Chrome using Manifest V3 with Chrome-specific APIs like `chrome.sidePanel`. To support Firefox, we need to handle browser API differences and UI paradigm differences while maintaining a single codebase.

## Key Differences

### 1. Side Panel vs Sidebar
- **Chrome:** Uses `side_panel` permission and `chrome.sidePanel` API
- **Firefox:** Uses `sidebar_action` in manifest, no equivalent API

### 2. Background Scripts
- **Chrome:** Service worker with `background.service_worker` and `type: "module"`
- **Firefox:** Traditional background scripts with `background.scripts` array (no ESM support in some environments)

### 3. Browser API Namespace
- **Chrome:** `chrome.*` namespace
- **Firefox:** `browser.*` namespace (with `chrome.*` as fallback)

## Solution

### Dual Manifest Strategy
- `manifest.json` - Chrome version with `side_panel` and service worker
- `manifest.firefox.json` - Firefox version with `sidebar_action` and background scripts

### Cross-Browser API Shim
```javascript
// Minimal browser/chrome API shim for cross-browser compatibility
try {
  if (typeof window !== 'undefined' && !window.browser && window.chrome) {
    window.browser = window.chrome;
  }
} catch (_) {}
try {
  if (typeof globalThis !== 'undefined' && !globalThis.browser && globalThis.chrome) {
    globalThis.browser = globalThis.chrome;
  }
} catch (_) {}
```

### Runtime Guards for Chrome-Specific APIs
```javascript
// Safe sidePanel usage with optional chaining
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
chrome.sidePanel?.setOptions?.({ tabId, path, enabled: true });
```

### Build System
- `npm run build` - Chrome build to `dist/`
- `npm run build:firefox` - Firefox build to `dist-firefox/` with Firefox manifest

## Implementation Details

### File Structure
```
manifest.json              # Chrome manifest
manifest.firefox.json      # Firefox manifest
src/background.js          # Unified background (with inline shim for Firefox)
src/content.js            # Unified content script (with inline shim)
ui/sidepanel/             # Shared UI components
```

### Key Changes Made
1. **Firefox Manifest:**
   - `sidebar_action` instead of `side_panel`
   - `background.scripts` instead of `background.service_worker`
   - Removed `sidePanel` permission

2. **Background Script Compatibility:**
   - Inlined browser shim (no ESM imports for Firefox)
   - Added runtime guards around `chrome.sidePanel` calls
   - Graceful degradation when sidePanel API unavailable

3. **Content Script Compatibility:**
   - Inlined browser shim for cross-browser API access
   - No Chrome-specific APIs used

4. **UI Paths:**
   - Chrome: `dist/ui/sidepanel/index.html`
   - Firefox: `ui/sidepanel/index.html` (relative to extension root)

## Trade-offs

### Pros
- Single codebase for both browsers
- Minimal code duplication
- Graceful degradation of Chrome-specific features
- Shared UI components and business logic

### Cons
- Dual manifest maintenance overhead
- Runtime guards add slight complexity
- Firefox lacks equivalent to Chrome's side panel auto-open behavior

## Testing Strategy

### Chrome Testing
- Load `dist/` via Developer Mode
- Test side panel auto-open on action click
- Verify service worker functionality

### Firefox Testing
- Load `dist-firefox/manifest.json` via about:debugging
- Test sidebar via View → Sidebar → Jan
- Verify background script functionality

## Future Considerations

1. **Safari Support:** Would require additional manifest format and API adaptations
2. **Manifest V2 Fallback:** For older Firefox versions if needed
3. **Feature Parity:** Consider implementing Firefox sidebar auto-open alternatives

## Decision

We accept this dual-manifest approach as it provides the best balance of:
- Code reuse and maintainability
- Browser-specific optimization
- User experience consistency where possible
- Development workflow simplicity

The implementation maintains feature parity while respecting each browser's UI paradigms and API constraints.
