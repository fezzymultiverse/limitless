# V0.7.12 test report

Date: 2026-10-18

## Passed

- `node --check` on every `www/js/*.js` file: passed.
- `node tests/bin-test.js`: 10/10 passed.
- `node tests/md-test.js`: 19/19 passed.
- `node tests/share-test.js`: 8/8 passed.
- `node tests/sync-test.js`: 22/22 passed.
- `node tests/v074-test.js`: 49 checks, 0 failed.
- `node tests/v075-test.js`: 33 tests, 0 failed.
- `node tests/v078-test.js`: 10 tests, 0 failed.
- `node tests/v079-test.js`: 10/10 passed, including the new `syncOne` regression test.
- Icon generation: `bash tools/icons/build_icons.sh` completed and regenerated launcher mipmaps, adaptive foregrounds, monochrome assets, Play Store icon and `www/img/icon.png` from `tools/icons/launcher.svg`.
- Aggregate logic-test count: 161 checks/tests passed.

## Blocked or not verified

- Playwright smoke test `tests/smoke-media.js` could not start because the `playwright` package is not installed (`Cannot find module 'playwright'`). This is an environment/setup blocker, not a test failure result. Other Playwright-based smoke scripts were not represented as passing.
- Real Android SAF folder selection, provider-specific nested operations, revoked permissions and provider failures require testing on an Android device.
- The app was not installed or compiled as an Android package in this environment. The new icon assets are packaged, but a rebuild/reinstall is required for the device launcher icon to change.
- PDF first-page thumbnails use the existing bundled PDF.js assets; browser/device rendering was not end-to-end tested here. Invalid PDFs fall back to a PDF type tile.

## V0.7.12 changes verified in source

- Added `LN.extra.syncOne(id)` so the per-folder Settings button syncs only the selected extra folder. Existing full sync still processes all configured folders sequentially and records failures independently.
- Added validation that the SAF picker returns a folder URI before saving it.
- Switched `tools/icons/launcher.svg` to the newer launcher design and regenerated all icon outputs.
- Added an attachment preview strip: image thumbnails use object URLs that are revoked when the preview changes; PDFs render page one to a small canvas; other binary documents show a type tile, filename and size.
- Updated README, handover, package version and this report to V0.7.12.

## Focused multi-folder and attachment-preview regression checks

- `node tests/multifolder-thumbnail-test.js`: 14/14 source-level checks passed. Covers persistent extra-folder settings/indexes, duplicate rejection, per-folder status, targeted sync, isolated failures, nested-path ordering, conflict-copy paths, permission-error messaging, image preview wiring, PDF first-page thumbnail and fallback wiring, generic document type tiles, object URL cleanup, and the 25 MiB sync limit.
- `node tests/sync-test.js`: 22/22 behavioural logic tests passed, including nested import and conflict preservation.
- These are automated logic/source checks only. They do **not** establish real Android SAF provider compatibility, permission revocation behaviour on device, cold-start restoration of browser folder handles, or actual PDF canvas rendering on a device. Those remain explicitly unverified.
