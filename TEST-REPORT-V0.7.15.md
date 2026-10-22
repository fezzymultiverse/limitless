# V0.7.15 test report

## Changes
See README V0.7.15.

## Checks
- JavaScript syntax (`node --check`) run on every www/js file after the patch.
- Existing logic suites (sync, share, md, bin, v074, v075, v078, v079, multifolder) were run once and passed before packaging.
- NOT run: Android WebView, SAF folder access, touch gestures (double-tap, swipe), reload/restore flows, launcher icon on a device. Owner is testing on the phone.
