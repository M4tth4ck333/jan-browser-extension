Title: UX Improvements: @mention Tab Selection, LIFO Sorting, Full-Screen Overlay Menu + Jan API Default

Summary
- Fix @mention tab selection bug preventing tabs from being added to context via chat input
- Implement LIFO (Last-In-First-Out) sorting for Add context popup to prioritize recent tabs
- Redesign hamburger menu as full-screen overlay with animated slide-in panel
- Set Jan API (https://api.jan.ai/v1) as default endpoint with jan-v1-4b model
- Update documentation with new UX patterns and behavior

What's included
- **@mention Tab Selection Fix**
  - Fixed undefined `insertMentionTab` references by wiring to existing `handleMentionSelect`
  - Tab selection now adds to context AND keeps mention text in input with proper cursor positioning
  - Supports multiple @mentions in single message
- **LIFO Tab Sorting**
  - Add context popup now shows unpinned tabs first, then by lastAccessed (desc), fallback to index (desc)
  - Improves tab selection UX when working with many open tabs
  - Enhanced search includes title, URL, and tab ID matching
- **Full-Screen Overlay Menu**
  - Hamburger menu opens as fixed overlay with semi-transparent scrim covering conversation area
  - 320px animated slide-in panel with click-outside-to-close behavior
  - Smooth motion animations and proper z-index layering
- **Jan API as Default**
  - Default provider changed from "custom" to "jan" 
  - Default endpoint: https://api.jan.ai/v1 (was empty)
  - Default model: jan-v1-4b (was empty)
  - API key disabled by default (useApiKey: false)
- **Documentation Updates**
  - New ADR-003 documenting UX improvement decisions and implementation
  - Updated behavior.md with @mention and overlay menu patterns
  - Enhanced considerations.md with new UX scenarios

Rationale
- **Productivity**: LIFO tab sorting reduces time to find relevant tabs in multi-tab workflows
- **Functionality**: @mention tab selection was broken due to undefined function references
- **Visual Hierarchy**: Full-screen overlay provides clear navigation context vs narrow sidebar
- **Onboarding**: Jan API default eliminates initial setup friction for new users
- **Consistency**: Maintains design system tokens and theme compatibility

Files changed
- src/background.js (default settings, Jan API endpoints)
- ui/sidepanel/App.jsx (mention fix, LIFO sorting, overlay menu)
- docs/adr-003-ux-improvements.md (new ADR)
- behavior.md (@mention and overlay documentation)
- considerations.md (UX scenarios)

How to test locally
1) **@mention Tab Selection**
   - Type `@` in chat input to trigger mention popup
   - Verify tabs appear in LIFO order (unpinned first, then by lastAccessed desc)
   - Use arrow keys to navigate, Enter/Tab/click to select
   - Confirm tab is added to context AND mention text remains in input
   
2) **Add Context Popup LIFO Sorting**
   - Click "Add context" button
   - Verify tabs show unpinned first, then most recently accessed
   - Search should match title, URL, and tab ID
   
3) **Full-Screen Overlay Menu**
   - Click hamburger menu (☰)
   - Verify full-screen overlay with scrim covers conversation area
   - Test click-outside-to-close behavior
   - Check smooth slide-in animation
   
4) **Jan API Default**
   - Fresh install should default to Jan provider with https://api.jan.ai/v1
   - Model should default to jan-v1-4b
   - API key should be disabled by default

5) **Build and Load Extension**
   - `npm run build` then load `dist/` via `chrome://extensions` → Load unpacked
   - Test all above functionality in browser

Behavioral Changes
- **@mention**: Now functional - adds tabs to context while preserving mention text
- **Tab Sorting**: LIFO ordering prioritizes recently accessed tabs for faster selection
- **Menu UX**: Full-screen overlay provides better visual hierarchy than narrow sidebar
- **Default Config**: Jan API eliminates setup friction for new users

Technical Implementation
- Fixed undefined function references in mention system
- Added LIFO sort logic with unpinned-first priority
- Implemented fixed-position overlay with scrim and animations
- Updated default settings in background.js
- Preserved theme system compatibility

Checklist
- [x] @mention tab selection adds to context and keeps text in input
- [x] Add context popup shows LIFO-sorted tabs
- [x] Hamburger menu opens as full-screen overlay with animations
- [x] Jan API set as default endpoint with jan-v1-4b model
- [x] Documentation updated (ADR-003, behavior.md, considerations.md)
- [x] Build succeeds without errors

