# V0.7.11 test report

Date: 2026-10-18

## Completed locally

- ZIP source archive extracted and the original ZIP integrity check passed before edits.
- `node --check` run on every `www/js/*.js` file: all passed.
- `tests/sync-test.js`: 22/22 passed.
- `tests/share-test.js`: 8/8 passed.
- `tests/md-test.js`: 19/19 passed.
- `tests/v074-test.js`: 49 checks, 0 failed.
- `tests/v075-test.js`: 33 tests, 0 failed.
- `tests/v078-test.js`: 10 tests, 0 failed.
- `tests/v079-test.js`: 9/9 passed.
- Three Python Playwright smoke tests were attempted using system Chromium. They did **not** pass: navigation to the local test server returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`, and one run also reported the Playwright-managed browser was not installed. These are environment failures, not passing smoke tests.

## Not verified / incomplete

- Real Android Storage Access Framework picker, persisted permissions, nested operations, and provider-specific failures: requires an Android device and provider testing.
- Native Android compilation: this ZIP has native Java source snippets but no generated `android/` Gradle project, so compilation cannot be truthfully reported.
- WorkManager background backups: **not implemented as a verified end-to-end background backup**. The backup builder reads WebView IndexedDB. A WorkManager worker cannot directly access that database; a native export/transfer bridge and Android project dependency wiring are required before background backup can be correct. The UI and handover do not claim this is complete.
- Clipboard clearing: code-level race hardening is included. Real clipboard permission/timing behaviour remains unverified on Android. If clipboard reads are blocked, clearing now fails safely instead of blindly clearing potentially newer content.

## Release checks

- Package version: `0.7.11` in `package.json`.
- UI version: `V0.7.11` in `www/js/settings.js`.
- README and current handover headings updated to `V0.7.11`.
- Final ZIP integrity and stale active-version scan performed after packaging.
