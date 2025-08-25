# Jan Extension — Options Models Refresh Fix

## Summary
Fixes a bug where the Options page required a hard refresh before the model list updated after changing provider/API settings.

## Root Cause
`LIST_MODELS` in the background read from `chrome.storage.sync` only, while the Options UI had unsaved local state. The UI would fetch models before saving, and the background saw stale values, leading to "Missing API Base URL" or empty results until a reload.

## Files Changed
```
src/background.js
ui/options/App.jsx
```

## Changes Overview
- **Background (`src/background.js`)**: `LIST_MODELS` now accepts overrides in `message.payload` (`apiBase`, `apiKey`, `useApiKey`). Falls back to `getSettings()` only when overrides are not provided.
- **Options UI (`ui/options/App.jsx`)**: Model fetch effect now sends overrides to `LIST_MODELS` with current config values, adds guards to avoid errors while editing, and immediately refetches models after Save.

## Type of Change
- [x] Bug fix (non-breaking change which fixes an issue)
- [ ] Hotfix (critical fix requiring immediate deployment)
- [ ] New feature
- [ ] Breaking change
- [x] Code refactoring
- [ ] TypeScript migration

## Testing Checklist
- [ ] Changes tested locally
- [ ] Model list updates immediately after changing settings without hard refresh
- [ ] No error messages flash while typing in Options
- [ ] Save functionality works correctly
- [ ] Refresh button works as expected
- [ ] Extension reload not required

## Deployment Notes
Standard deployment process; extension reload required for users to see the fix.

## Additional Context 
This fix addresses a UX issue in the Jan extension Options page where users had to reload the extension to see updated model lists after changing API settings. The changes are backward-compatible and only affect the Options page model fetching behavior.

## Reviewer Focus Areas
- [ ] Background message handling changes
- [ ] Options UI state management
- [ ] Error handling improvements
- [ ] Backward compatibility

---

**Ready for review and deployment** 🚀