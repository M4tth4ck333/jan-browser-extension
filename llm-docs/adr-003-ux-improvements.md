# ADR-003: UX Improvements for Tab Context and Navigation

## Status
Accepted

## Context
The Jan browser extension needed several UX improvements to enhance user productivity and streamline the tab context workflow:

1. **@mention Tab Selection Bug**: Users couldn't add tabs to context via @mention in the chat input due to undefined function references
2. **Tab Selection UX**: The "Add context" popup showed tabs in arbitrary order, making it difficult to find recently accessed tabs when working with many open tabs
3. **Hamburger Menu UX**: The sidebar hamburger menu opened as a narrow side drawer that didn't provide sufficient visual prominence for navigation

## Decision
We implemented three key UX improvements:

### 1. Fixed @mention Tab Context Addition
- **Problem**: `insertMentionTab` function was undefined, preventing tab selection via @mention
- **Solution**: Wired @mention selection to existing `handleMentionSelect` function
- **Behavior**: When user types `@` + query and selects a tab, the tab is added to context AND the mention text remains in the input field with proper cursor positioning

### 2. LIFO Tab Ordering in Add Context Popup
- **Problem**: Tabs appeared in arbitrary order, making recent tab selection inefficient
- **Solution**: Implemented Last-In-First-Out (LIFO) sorting with priority logic:
  - Unpinned tabs first (more likely to be working context)
  - Then by `lastAccessed` timestamp (descending)
  - Fallback to tab `index` (descending, rightmost tabs first)
- **Benefit**: Most recently accessed tabs appear at the top, improving selection speed

### 3. Full-Screen Overlay Hamburger Menu
- **Problem**: Narrow sidebar drawer provided insufficient visual prominence
- **Solution**: Redesigned as full-screen overlay with:
  - Semi-transparent scrim covering the entire conversation area
  - Fixed-position animated slide-in panel (320px width)
  - Click-outside-to-close behavior
  - Smooth animation using `motion.animate`
- **Benefit**: Clear visual hierarchy and improved accessibility

## Implementation Details

### Code Changes
- **File**: `ui/sidepanel/App.jsx`
- **@mention fix**: Replaced undefined `insertMentionTab` calls with `handleMentionSelect`
- **LIFO sorting**: Updated `filteredTabs` useMemo with custom sort logic
- **Overlay menu**: Added scrim div and converted sidebar to fixed positioning with z-index layering

### State Management
- Moved `mentionResults` state declaration to proper location to fix initialization order
- Preserved existing theme system compatibility (`ds-bg`, `ds-border`, etc.)
- Maintained keyboard navigation and accessibility patterns

## Consequences

### Positive
- **Improved Productivity**: LIFO tab ordering reduces time to find relevant tabs
- **Fixed Functionality**: @mention tab selection now works as expected
- **Better Visual Hierarchy**: Full-screen overlay provides clear navigation context
- **Consistent UX**: Maintains design system tokens and theme compatibility

### Neutral
- **Animation Performance**: Added motion animations with minimal performance impact
- **Code Complexity**: Slight increase in component logic for sorting and overlay management

### Risks Mitigated
- **Accessibility**: Maintained keyboard navigation and focus management
- **Theme Compatibility**: Preserved existing design system integration
- **Mobile Responsiveness**: Overlay scales appropriately on different screen sizes

## Alternatives Considered

### Tab Sorting
- **Alphabetical**: Rejected - doesn't reflect user workflow patterns
- **Most Used**: Rejected - would require usage tracking implementation
- **MRU (Most Recently Used)**: Chosen LIFO approach is simpler and equally effective

### Menu Design
- **Slide-out drawer**: Original implementation, insufficient prominence
- **Modal dialog**: Rejected - too heavy for navigation
- **Full-screen overlay**: Chosen for optimal visual hierarchy

## References
- [ADR-001: React for UI](./adr-001-react-for-ui.md)
- [ADR-002: Side Panel for UX](./adr-002-side-panel-for-ux.md)
- Chrome Extension Side Panel API documentation
- Radix UI accessibility guidelines

## Date
2025-09-01
