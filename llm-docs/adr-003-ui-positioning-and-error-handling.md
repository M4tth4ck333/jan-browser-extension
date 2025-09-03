# ADR-003: UI Positioning and Error Handling Improvements

## Status
Accepted

## Context
During development of the Jan browser extension, we encountered several UX issues that required architectural decisions:

1. **Sticky Footer Problem**: The input composer was using absolute positioning, causing text content to appear behind/below the input area, making it unreadable and breaking the scrolling experience.

2. **Inconsistent Error Messaging**: Error messages were displayed as plain text without visual hierarchy, making them difficult to distinguish from regular content and reducing user awareness of issues.

3. **Layout Flexibility**: The main container was using CSS Grid which was causing layout constraints and squishing issues in the sidepanel.

## Decision

### 1. Sticky Footer Implementation
We decided to implement a sticky footer approach for the input composer:
- Changed from `absolute bottom-0` to `sticky bottom-0` positioning
- Removed dynamic padding calculations (`pb-40` → `pb-3`) from ScrollArea viewport
- This ensures the input remains accessible at the bottom while content scrolls naturally above it

### 2. Enhanced Error Message Styling
We standardized error message formatting across the application:
- Format: `🚨 **Error**: [message]` with emoji indicator and markdown bold styling
- Applied consistently across all error handling locations (stream errors, chat errors, API errors)
- Provides immediate visual recognition and improves content scannability

### 3. Layout System Simplification
We simplified the main container layout:
- Changed from CSS Grid (`grid grid-cols-3`) to Flexbox (`flex`)
- Added `flex-1` to main content area to prevent squishing
- Maintains responsive behavior while providing more predictable layout

## Consequences

### Positive
- **Better UX**: Content no longer overlaps with input area, improving readability
- **Consistent Error Handling**: Users can immediately identify and understand errors
- **Improved Accessibility**: Sticky positioning works better with screen readers and keyboard navigation
- **Maintainable Layout**: Flexbox is more predictable and easier to debug than complex grid layouts

### Negative
- **Minor Performance**: Sticky positioning may have slight performance implications on very long conversations
- **Browser Compatibility**: Sticky positioning requires modern browsers (not an issue for Chrome extensions)

## Implementation Details

### Files Modified
- `ui/sidepanel/App.jsx`: Footer positioning, error message formatting, layout container
- `ui/options/App.jsx`: Jan-server API endpoint correction

### Code Locations
- Footer positioning: `ui/sidepanel/App.jsx` line ~1840
- Error formatting: `ui/sidepanel/App.jsx` lines ~976, ~1109, ~1345, ~1459
- Layout container: `ui/sidepanel/App.jsx` line ~1679

### Design System Integration
- Uses existing design system classes (`sticky`, `bottom-0`, `ds-border`, etc.)
- Maintains theme compatibility with blue/yellow theme system
- Preserves backdrop blur and shadow effects for visual hierarchy

## Alternatives Considered

### 1. Fixed Positioning
- **Rejected**: Would break scroll behavior and require complex z-index management
- **Issue**: Content would still appear behind fixed elements

### 2. Dynamic Padding Calculation
- **Rejected**: Complex to maintain and doesn't solve root cause
- **Issue**: Still relies on absolute positioning which causes overlap

### 3. Modal-style Error Dialogs
- **Rejected**: Would interrupt user flow and block interaction
- **Issue**: Goes against "fast feedback" principle in our design philosophy

## References
- [CSS Sticky Positioning MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky)
- Design System Documentation: `ui/styles.css`
- Behavior Guide: `behavior.md` (updated with new positioning details)
- Considerations: `considerations.md` (updated with UX rationale)
