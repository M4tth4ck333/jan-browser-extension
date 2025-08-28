Title: Firefox support + Nightly/Release artifacts + bump to 0.12.14

Summary
- Add official Firefox build and attach Firefox zips in Nightly and tagged Releases.
- Keep Chrome build unchanged, but publish separate artifacts for clarity.
- Bump versions to 0.12.14 across root package and both manifests.

What’s included
- CI: Add Firefox to Nightly and Release workflows
  - Nightly: builds Firefox and uploads `jan-extension-firefox-nightly-<run>-<sha>.zip`.
  - Release: builds Firefox and uploads `jan-extension-firefox-<tag>.zip`.
  - Chrome artifacts are now explicitly `jan-extension-chrome-*.zip` to avoid confusion.
- Version bumps
  - package.json → 0.12.14
  - manifest.json → 0.12.14
  - manifest.firefox.json → 0.12.14
- Local packaging
  - `scripts/package-local.sh` now builds Firefox and produces a Firefox zip alongside Chrome.
- Docs
  - `RELEASE.md` updated to reflect Chrome/Firefox artifact names and Nightly behavior.

Rationale
- Provide first-class Firefox support: a reproducible build and downloadable artifact.
- Clear artifact naming (`-chrome-` / `-firefox-`) removes ambiguity for users and CI consumers.

Files changed
- .github/workflows/nightly.yml
- .github/workflows/release.yml
- scripts/package-local.sh
- package.json
- manifest.json
- manifest.firefox.json
- RELEASE.md

How to test locally
1) Firefox build
   - `bun run build:firefox` (or `npm run build:firefox`)
   - Verify `dist-firefox/` contains: `manifest.json`, `icons/`, `src/`, `ui/`, `assets/`.
2) Load in Firefox (temporary add-on)
   - Open `about:debugging#/runtime/this-firefox` → Load Temporary Add-on… → select any file in `dist-firefox/`.
   - Sanity checks:
     - Sidebar opens and renders side panel UI.
     - Inline Assistant shows on text selection and can Apply/Copy.
     - Commands/shortcuts respond (e.g., open panel, custom prompt, toggle autocomplete).
     - Page summarization works and streams output.
3) Chrome sanity (unchanged flow)
   - `bun run build` then load `dist/` via `chrome://extensions` → Load unpacked.
4) Local packaging
   - `TAG=test-local bash scripts/package-local.sh`
   - Inspect `pack/jan-extension-chrome-test-local.zip` and `pack/jan-extension-firefox-test-local.zip` contents.

CI/Release behavior
- Nightly (push to main):
  - Uploads: Chrome and Firefox nightly zips, plus MCP zip if present.
- Tagged release (push tag):
  - Uploads: `jan-extension-chrome-<tag>.zip`, `jan-extension-firefox-<tag>.zip`, and `search-mcp-server-<tag>-dist.zip` (if present).

Release notes (proposed)
- Firefox support: Official Firefox build and downloadable artifact on Releases and Nightlies.
- Chrome + Firefox artifacts: Explicit platform suffixes for clarity.
- Version: 0.12.14.

Compatibility / migration
- No changes to runtime behavior for Chrome users.
- Artifact names changed; any downstream automation that expected `jan-extension-<tag>.zip` should update to `jan-extension-chrome-<tag>.zip`.

Checklist
- [ ] Firefox: sidebar opens and renders side panel UI
- [ ] Firefox: Inline Assistant operates on selected text
- [ ] Firefox: Page summarization streams and completes
- [ ] Chrome: basic sanity unchanged
- [ ] Release artifact names validated in CI logs

