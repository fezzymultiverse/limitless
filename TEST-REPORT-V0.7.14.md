# Limitless Notepad V0.7.14 — verification report

## Changes in this release
- Preserve the active editor's note ID, Markdown view mode, scroll offset and selection across a same-tab WebView/page reload using session-scoped state.
- Add quick double-tap detection for file rows (for touch devices) and a `dblclick` handler. Both open the file and switch Markdown notes into Edit mode. Folder rows retain expand/collapse behaviour.
- Clarify in Settings that connected-folder sync is copy-based and two-way; Sync now imports folder changes and then copies vault changes to the folder. Delete mirroring remains separately controlled.
- Bump package and README version to V0.7.14.

## Checks run
- `node --check www/js/app.js` — PASS
- `node --check www/js/editor.js` — PASS
- `node --check www/js/tree.js` — PASS
- `node --check www/js/settings.js` — PASS
- `node tests/multifolder-thumbnail-test.js` — PASS, 14/14
- `node tests/v079-test.js` — PASS, 10/10
- ZIP integrity check — run on final archive after packaging.

## Not verified in this environment
- Android WebView lifecycle and scroll/selection restoration on a physical device.
- Actual double-tap timing across Android devices/accessibility settings.
- Android Storage Access Framework permission grants, provider-specific copying and folder changes made externally.
- Full native Android/Gradle build and Playwright browser smoke tests.

Folder sync copies files; it is not a continuous cloud sync service. Folder Watch runs only while the app is open, as documented in Settings.
