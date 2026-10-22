# V0.7.13 test report

## Changes
- Added an accessible startup overlay with spinner and descriptive phase text for unlock, vault initialization, and workspace preparation.
- Startup errors hide the loading overlay before showing the fatal error message.
- Confirmed attachment preview UI exists above the editor: images use object URLs, PDFs use the bundled PDF.js thumbnail helper with fallback, and other document types use a file-type card.
- Bumped package/README/handover version to V0.7.13.

## Checks
- JavaScript syntax checks: run during packaging.
- ZIP integrity: run during packaging.
- Android WebView/device rendering and full Playwright smoke tests: not run in this environment; do not treat as passed.
