# TEST REPORT V0.7.20

Date: 2026-10-20. Environment: Linux container, Node, headless Chromium (phone viewport 390x780). No Android device, no Gradle build.

## Passed
- `node tests/v0720-test.js`: 10/10 (new items at bottom, imports at bottom, reorder up/down/ends, order survives restart, reorder is silent for sync, move goes to bottom of new folder, legacy unordered items stay first, parallel pull: 60 files, folders created once, reads capped at 5, progress reported, unchanged second pull reads nothing, greeting hours, quote rotation and wrap).
- `node tests/sync-test.js`: 22/22 (the dotfile test now expects the V0.7.20 rule).
- `node tests/v074/v075/v079/bin/multifolder`: all pass.
- `node --check` on every `www/js/*.js`; `bash -n` on every `tools/*.sh`.
- Chromium: loading screen shows greeting, clock, date, quote; spinner reports an animation in state `running` with reduced motion ON; home shows greeting + quote; two taps on the logo open the 999 story; scroll, close and the orange 999 logo render; Edit order mode shows arrows and a tap on Down swaps Data and Scripts. No page errors.
- Manifest patch run on a sample manifest: `configChanges` and `singleTask` added.

## Known failures that existed before this version
- `tests/v078-test.js`: 2 Mistral key-parsing tests fail on the original V0.7.19 zip too.

## NOT verified (needs a phone)
- Native Java (`LNFolderPlugin` parallel walk, `MainActivity` keep-alive) was not compiled. CI will compile it.
- Real SAF speed on a big folder; real "no restart" behaviour; Android permission prompts and their order; haptics.
- Whether missing content on the phone was the dotfile/depth rule or something else. Check the sync line after the first sync: it now lists failures and skipped sizes.
- Song counts: ~2,000 unreleased is a reported estimate from unnamed sources; the 3,000+ figure is not verified anywhere. The story says so.
