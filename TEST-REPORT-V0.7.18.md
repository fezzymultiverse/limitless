# Test report V0.7.18
- tests/v0718-test.py in headless Chromium, 360 px: 11/11 passed (header logo, + in tab strip, edge strip, edge swipe opens panel, hidden while open, daily note from template, starter templates, dataview blocks render, calendar day marker, + creates a note, no console errors).
- Node logic checks for Dataview (FROM folder/tag, TASK, WHERE, SORT, LIMIT) and Templater date/prompt tags passed.
- Header measured: full title fits at 360 px and 320 px.
- Not tested: real device, Android back-gesture overlap at the screen edge, icon rendering in the launcher, CI build.
