# TEST REPORT V0.7.22
Environment: Linux container, headless Chromium, phone viewport 390x780. AI provider mocked. No Android device, no Gradle build.
Run: python3 tests/v0722-test.py
Covers: slim file card, document area height, no sideways scroll, PDF toolbar fit, Full + Back on slides, pinch zoom, Word/Excel Full, Summarize/Extract tasks/Continue/Auto-tag, failed AI call, no key, Add audio, play/pause/seek, hide/show per note, remove.
NOT verified: a real phone, a live AI provider, real Android file picker, GitLab CI. YouTube audio saving is not built.
