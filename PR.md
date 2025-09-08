Title: Side Panel UX + Settings Page — Composer Refactor, Suggestion Pills, Theming, and New Components

Summary
- Introduces a dedicated Settings panel in the side panel UI to configure provider, model, and behavior without leaving the flow.
- Adds Suggestion Pills for quick-start prompts and common actions in the composer.
- Refactors Composer and ComposerInput for cleaner structure, better shortcuts, and more predictable behavior.
- Adds Tooltip and ScrollArea UI components; standardizes global theming with new tokens and a Settings icon.
- Tightens auto-follow active tab behavior in `App.jsx` and streamlines state management.

What’s Included
- Side Panel
  - Settings panel UI (`ui/sidepanel/components/Settings.jsx`).
  - Suggestion pills component (`ui/sidepanel/components/SuggestionPills.jsx`).
  - Add Context modal (`ui/sidepanel/components/AddContextModal.jsx`).
  - Composer refactors (`ui/sidepanel/components/composer/Composer.jsx`, `ui/sidepanel/components/ComposerInput.jsx`).
  - App state/auto-follow adjustments (`ui/sidepanel/App.jsx`).
- UI Components
  - Tooltip (`ui/components/ui/tooltip.tsx`) and ScrollArea (`ui/components/ui/scroll-area.tsx`).
  - Button and Input refinements (`ui/components/ui/button.jsx`, `ui/components/ui/input.jsx`).
  - Settings icon (`ui/sidepanel/components/icons/SettingsIcon.jsx`).
- Theming & Styles
  - Theme tokens (`ui/themes.css`) and global tweaks (`ui/styles.css`).

Rationale
- Improve onboarding and control with an integrated Settings panel.
- Speed common tasks with Suggestion Pills and better keyboard ergonomics.
- Prepare for future UI scale with reusable Tooltip/ScrollArea primitives.
- Consolidate theme tokens for consistent styling and easier iteration.

How to Test
1) Build and load the extension
   - `npm run build` (or `bun run build`) and load `dist/` via `chrome://extensions` → Load unpacked.
2) Settings Panel
   - Open side panel → gear icon. Verify provider, model, and options render and persist.
   - Toggle relevant options and confirm they affect new sessions where applicable.
3) Suggestion Pills
   - In the side panel composer, confirm pills render and insert text/context when clicked.
   - Verify keyboard focus/selection works with Tab/Enter.
4) Composer/ComposerInput
   - Type, submit, and edit messages. Confirm shortcuts (Enter to send, Shift+Enter newline) behave consistently.
   - Validate streaming, cancel, and retry work without focus loss.
5) Auto-follow Active Tab
   - Switch browser tabs with auto-follow enabled; confirm session follows active tab without losing state.
6) Tooltip/ScrollArea
   - Confirm tooltips render on hover/focus in updated UI. Validate long lists scroll smoothly.
7) Theming/Styles
   - Sanity-check themes and global styles; ensure contrast and spacing look consistent.

Files Touched (high-level)
- `ui/sidepanel/App.jsx`
- `ui/sidepanel/components/ComposerInput.jsx`
- `ui/sidepanel/components/composer/Composer.jsx`
- `ui/sidepanel/components/SuggestionPills.jsx`
- `ui/sidepanel/components/AddContextModal.jsx`
- `ui/sidepanel/components/Settings.jsx`
- `ui/components/ui/button.jsx`, `ui/components/ui/input.jsx`
- `ui/components/ui/tooltip.tsx`, `ui/components/ui/scroll-area.tsx`
- `ui/sidepanel/components/icons/SettingsIcon.jsx`
- `ui/themes.css`, `ui/styles.css`

Behavioral Notes
- Auto-follow reads from `context.autoFollowActiveTab`; side panel re-registers active tab as needed.
- Composer shortcuts and focus handling are more predictable; streaming remains cancellable.

Screenshots
- Add Settings panel, Suggestion Pills, and composer before/after screenshots (attach).

Checklist
- [x] Builds cleanly and loads in Chromium.
- [x] Settings persist and apply in new sessions.
- [x] Suggestion pills insert as expected; accessible via keyboard.
- [x] Composer shortcuts correct; streaming is responsive and cancellable.
- [x] Tooltip/ScrollArea render and behave consistently.
- [x] Theming tokens apply without regressions.

Breaking Changes
- None expected. UI-only additions and refactors; no storage schema changes.

Release Notes
- Side panel Settings, Suggestion Pills, and composer refactors improve UX and configurability. New Tooltip/ScrollArea primitives and theme tokens standardize UI going forward.

