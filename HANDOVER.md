# LIMITLESS NOTEPAD V0.7.11 HANDOVER

## Current release: V0.7.11 (2026-10-18)

This is the current handover. Do not follow the old V0.7.0 continuation instructions below; those notes are historical development records only. The current app version is defined in `www/js/settings.js` and must match the README and this heading.

## V0.7.19 (2026-10-18): Mistral keys now load from pasted text
Cause: a Mistral key has no prefix, and `scan()` only accepted a 32-character token when the word "mistral" was on the same line, so a key under a "Mistral" heading, or pasted alone, was skipped (keys.js).
Fix: `ctxOf()` looks at the key's line and the 3 non-blank lines above it; the nearest provider word decides (a Groq or Gemini heading blocks it). In the key vault's own paste box and file import (`scan(text, {loose:true})`) a mixed letter-and-digit 32-character token with no provider named near it is taken as Mistral. Pasting into a note stays strict. Node test: same line, heading above, blank line between, bare (strict and loose), under Groq/Gemini, mixed list.
Not tested on a device or against the live Mistral API.

## V0.7.18 (2026-10-18): real logo everywhere, universal edge swipe, + in tab strip, Calendar / Templater / Dataview
Request from Fezzy: the feather-and-pen logo must be the app icon and appear everywhere; the left-edge swipe that opens the left panel must work on every screen, with a flashing transparent hint; a + in the top document strip to add a note; Calendar, Templater, Dataview.
| Item | Files |
|------|-------|
| Icons rebuilt from `www/img/leaf.png` (the real logo) with Pillow; adaptive background is warm white `#FFF7F0`, foreground and themed icon are the logo. Run `python3 tools/icons/build_icons.py`; `build_icons.sh` now just calls it. Logo also in header (`.logo-mark`) and as favicon | tools/icons/*, www/img/icon.png, index.html, css |
| Edge strip `#edge` (26 px, fixed, above viewers/PDF/settings/AI chat). Swipe right 28 px or tap opens the panel, closing AI chat, sheets, settings and full-screen PDF first. Glow and pill flash until used 6 times (`edgeUsed`), then stay faint | app.js, index.html, css |
| `+` (new note) and calendar buttons at the right of the tab strip; the strip now always shows | tabs.js, css |
| `js/plugins.js` (`LN.plugins`): Calendar sheet with daily notes (`Daily/YYYY-MM-DD.md`, from `Templates/Daily.md`); Templater (`Templates` folder, starters Daily, Meeting, Dashboard; tags `tp.date.now/today/tomorrow/yesterday(fmt, offsetDays)`, `tp.file.title/folder`, `tp.system.prompt("q","default")`, `tp.system.clipboard()`); Dataview ```` ```dataview ```` blocks (LIST, TABLE, TASK; FROM "folder" / #tag with and/or/-; WHERE with = != > < >= <= contains and !field; SORT; LIMIT; fields file.name/link/path/folder/ctime/mtime/size/tags, frontmatter keys, inline `key:: value`). Menu: Note tools > Plugins | plugins.js, md.js (placeholder), editor.js (hydrate), tools.js |
Limits: no eval (CSP), so JavaScript templates (`<% await ... %>`), `dataviewjs`, GROUP BY, FLATTEN and date functions are not supported; unknown `<% %>` tags are left as written. Dataview reads text notes only. Not tested on a device. Browser test: tests/v0718-test.py (11/11 in headless Chromium at 360 px).

## V0.7.17 BUILD FIX (2026-10-18): why the phone never showed V0.7.8 to V0.7.17
Cause: nothing in the repo set versionCode, so `npx cap add android` left every APK at versionCode 1 / versionName "1.0". Android will not replace an installed app with the same or a lower versionCode, so the phone kept the first build. The code was fine.
Fix: tools/ci-set-version.sh (versionCode = (major*10000 + minor*100 + patch)*1000 + pipeline number; versionName from package.json), run in build-apk before `cap sync`; a new step reads the finished APK with aapt2 and fails the build if versionCode is under 1000. Tested on mock build.gradle files (both Groovy formats, missing-line failure); not run on real GitLab CI.
Check on the phone: Settings > Apps > Limitless Notepad > version must read 0.7.17, and Settings > About in the app must read V0.7.17.
If Android says "App not installed": the new APK is signed with a different key than the installed one. Export or sync your vault first, because uninstalling deletes the app data.

## V0.7.17 (2026-10-18): home screen, dock, S.O.I., Bojack egg
Request from Fezzy: fuller empty screen (hero, recent notes, vault summary, dock, footer line), Strategy Over Impulse in home/footer/About, Bojack Easter egg (5 logo taps).
| Item | Files |
|------|-------|
| Home: hero, last 5 opened notes (`recentNotes`, per vault, recorded in `editor.load`), summary row, `LN.home` | js/home.js, editor.js, store.js, css |
| Dock `#dock` (sibling after `#btb`, shown by `.stage[data-empty="1"]~.dock`) | index.html, home.js, css |
| Footer idle line `IDLE_LINE` | editor.js, index.html |
| Easter egg `LN.bojack` (header `.logo` + home logo, 5 taps in 2.5 s) | js/bojack.js, app.js (swipe guard), css |
| `LN.app.openSidebar`; VERSION in settings.js corrected to V0.7.17 (was stale V0.7.11); About tagline | app.js, settings.js |
NOT tested in a browser or on a device. tests/smoke-home.py exists but has not been run (needs `bypass_csp=True`, already set).

### V0.7.11 changes
- Bumped the package/app release version to V0.7.11.
- Hardened clipboard clearing against stale timeout callbacks and newer clipboard contents. Clearing is skipped if the clipboard cannot be read; it no longer falls back to blindly writing an empty value.
- Added a release test report with explicit local results and limitations.

### Outstanding validation / implementation
1. **Playwright:** run all three intended browser smoke tests on a machine with Playwright Chromium installed. A system Chromium executable may be used with `executable_path='/usr/bin/chromium'` and `--no-sandbox` in this environment.
2. **Android SAF:** native `LNFolderPlugin` code exists, but real folder-picker persistence, nested operations and provider-specific errors remain device-only validation.
3. **Scheduled backups:** the current backup data is stored in WebView IndexedDB and the backup builder is JavaScript. A WorkManager worker alone cannot access this data. Proper background backups require an explicit native export/transfer design, plus Gradle dependency wiring, compilation and device verification. Not claimed complete in this archive.
4. **Clipboard:** automated race checks and device clipboard access are separate; Android clipboard restrictions and background behaviour need device verification.
5. **Native build:** this source archive does not contain an `android/` Gradle project, so native compilation cannot be performed from this ZIP alone. Generate/sync the Capacitor Android project and compile with the Android SDK before release.


## V0.7.9 (2026-10-18) PARTIAL: fonts, more sync folders
Request from Fezzy: more font settings and sizes; more folders to sync; new app icon; thumbnail on attach; share link viewer address; vault loading indicator; add links; voice notes; music; documents.
DONE: (1) fonts: 8 system font choices for editor, preview and interface, editor size 10-40, weight, letter spacing, preview size (settings.js FONTS, css vars --ufont --pfont --pfs --ewt --etrack). (2) More folders: new www/js/extra.js, Settings > Sync to folder > More folders; each extra folder mirrors with its own vault folder; hooks in folder.js (syncNow, watch, push, _int export). tests/v079-test.js 9/9, sync-test 22/22.
NOT DONE: icon (new design in tools/icons/launcher_new.svg, PNGs NOT rendered, sandbox has no rsvg-convert; run build_icons.sh in Termux after copying it over launcher.svg), thumbnails, share viewer address, vault loading screen, links, voice notes, music attach, documents attach.
NOT tested: device, headless browser for the new settings rows.


## V0.7.8 (2026-10-18): sync button, typing lag, grounded AI chat, Mistral, scrolling PDFs
Request from Fezzy: Sync button next to the vault in the panel; typing freezes a bit; AI gives random answers; bigger and better chat; PDFs full screen and scrollable top to bottom; add Mistral.
| Item | Files |
|------|-------|
| vault-bar Sync button (`.vault-sync`), calls `LN.folder.syncNow()`; no folder opens Settings page `sync`; `needsPermission` triggers `reconnect()` first | vaults.js, css |
| Typing lag causes: preview rebuilt per key (`renderPreviewSoon`, 120-700 ms, html 450+), stats split whole text 3x per key (`stats()` is a scan, `statsSoon` throttles 150 ms), `editprefs.refresh` rewrote a CSS var per key and re-measured every line (`changed()` waits 160 ms, MAX_MEASURE 4000), undo history kept 300 full copies (capped at about 6M characters) | editor.js, editprefs.js |
| AI drift causes: history stored the question without the note, so follow-ups had no context; temperature 0.7; no instructions. Now the note is in the system prompt each turn with grounding rules (`GROUND`), default `aiTemp` 0.3 with one-time migration (`aiTempV`), note capped at 60000 chars around the cursor | ai.js, store.js, settings.js |
| Chat UI rewritten as `.aichat` (full screen, `bottom:var(--kb)`), markdown via `LN.md.render` (escapes HTML), per-answer Insert, Replace selection, Copy, Retry; failed question is replaced on the next send so two user turns never follow each other | ai.js, icons.js (send, plus), css |
| Mistral: `PROVIDERS.mistral`, `OPENAI_STYLE` (Groq and Mistral share the chat-completions code), `/models` filtered for embed, moderation, ocr, transcription and non-chat; keys.js `RX_MISTRAL` needs the word Mistral on the line plus a letter and a digit; settings, store, diag (Bearer scrub), CSP adds `https://api.mistral.ai` | ai.js, keys.js, settings.js, store.js, diag.js, index.html |
| PDF viewer rewrite: one column, per-page fit to width (a landscape page no longer shifts the rest), IntersectionObserver draws pages within 1.5 screens and frees canvases beyond, canvas capped at 16M pixels, generation counter stops stale draws, pinch zoom (touch events, `touch-action:pan-x pan-y`), Full = `.pdf-full` fixed overlay | pdfv.js, css |
| tests/v078-test.js (10 tests: Mistral scan, add, call shape, failover, model list, fallbacks) | tests |
Tested: node --check on every js file; v074 49, v075 33, v078 10, sync 22; headless Chromium 360 px with mocked Mistral: sync button present and shows the no-folder message, chat sends the note in the system prompt and keeps it on follow-ups, `<script>` in an answer stays text, 12-page PDF (page 7 landscape) lays out, draws only 4 canvases, jumps to 12/12, full screen covers 360x780, zoom keeps drawing, 40 keystrokes in a 3000 line split-mode note about 5 ms each.
NOT tested: a device, the live Mistral service, native HTTP headers for Mistral, pinch on a real touchscreen, Android back button inside the chat or full screen PDF (no Capacitor App plugin in the project, use the on-screen Back and Exit).
Open point: the CSP and privacy page now name three hosts (Groq, Google, Mistral). Keep them in step if a provider is added.


## V0.7.7 (2026-10-18): key health, AQ keys, model picker
- keys.js: Gemini scanner and paste watch now accept Google's new `AQ.` auth keys beside `AIza`. Keys never checked (main key typed in Settings, older keys) are checked automatically when the vault opens or the main key changes (`checkNew`). Health bar fill is green when healthy, amber when limited/error, red when rejected.
- ai.js: `listModels` follows Gemini pages. Free-tier guess (`isFree`), built-in fallback lists, `pickDefault`. A 404 on the chosen model loads the live list, switches to a working one and retries once. `test(id, key, model)` can test any model. Clear message for Google's ACCESS_TOKEN_TYPE_UNSUPPORTED.
- settings.js: the model text box + filtering dropdown (showed only the typed name) is replaced by a tappable picker: free models first, filter box, Test free models button.
- Known: some Google accounts get 401 ACCESS_TOKEN_TYPE_UNSUPPORTED for every AQ. key. That is Google's side, not the app.


## V0.7.6 stage 2 (2026-10-18): music, images, watermark
Request from Fezzy: LIMITLESS watermark on blank and editor screens, music and image compatibility, more settings, more editing options, green highlights, icon (keep orange). Staged: stage 2 (music + images) first, watermark added right after. Green highlights DONE (below). STILL TO DO: stage 3 (more settings, more editing options).
| Item | Files |
|------|-------|
| Watermark: leaf only (img/leaf.png, cut from the launcher icon mono layer), orange, transparent, large (78vw, max 380px), centred behind the blank screen, md and text editors and preview. Settings, Editor: Watermark (Leaf / Off) and strength 6-26 percent. Replaces the old V0.7.3 bottom text mark | index.html, css/style.css, store.js (watermark, watermarkOp), settings.js applyAppearance |
| Image viewer rewrite: previous/next image in the same folder (buttons and swipe), pinch zoom, double-tap zoom, rotate left/right (view only, canvas), slideshow (setting imgSlideSec, default 3 s), image count in the info line. New formats: jpe, pjpeg, pjp, tif, tiff, heic, heif (stored and exported; the WebView usually cannot draw tif/heic, so the viewer says so plainly) | www/js/imgv.js, kinds.js |
| Note embeds: ![[song.mp3]] or ![[clip.mp4]] now render an audio/video player in the preview, ![[pic.png]] unchanged | imgv.js hydrate, css |
| Music: playback speed (0.5-2x), sleep timer (15/30/60), search, resume last song and position, lock screen/headset controls (Media Session), shuffle and repeat remembered, duplicate songs skipped on add, can't-play check with auto-skip (max 3 in a row), more formats (m4b, wma, mka, mid, midi, aif, aiff) | www/js/music.js, anyv.js, kinds.js, store.js |
| Fixes in music.js: opening the sheet re-ran buildQueue and lost the playing position; each open leaked a listener; every timeupdate rebuilt the whole list; removing the playing song left it playing | music.js |
| Green highlights: --green #5FFF00 (--green-deep for text on white), setting Settings, Editor: Green highlights (greenHi, default on; off maps green back to orange). Used on: save dot, active format buttons, switches, playing song, shuffle/repeat/speed/sleep on, active tab and view-mode underline, text selection, checklist boxes, wiki-link underline, toast edge, scroll bars, search focus | css/style.css (end of file), store.js, settings.js |
Tested: node --check on every js file; sync 22/22, share 8/8, md 19/19, bin 10/10, v074 49, v075 31/31; tests/smoke-media.js (new, Playwright, 360 px): 16 checks pass, no console errors, no horizontal overflow; watermark screenshots light and dark.
NOT tested: a device, real mp3/flac/m4a playback, Media Session on Android, pinch and swipe on a real touchscreen (code written, not exercised), HEIC.
Icon: kept the orange note-and-pen (pipeline unchanged: tools/ci-add-icons.sh). If the launcher still shows the old icon after installing: uninstall first (Android caches launcher icons), and confirm the CI log line "Launcher icon installed" appears.

## V0.7.5 (2026-10-18) API key vault - READ THIS FIRST
Request from Fezzy: paste or upload a document and have it pick up multiple API keys by itself, with a health check, test and use bar per provider key list.
| Item | Files |
|------|-------|
| New LN.keys: pool of keys per provider (settings `aiKeys`, stats `aiKeyMeta` filed by a hash of the key, never the key), scanner (gsk_ and AIza patterns, label from the line, other providers counted and skipped), file reader (text, utf-16, binary strings, zip and nested zip with XML flattening, pdf text), add/remove/pause/rename, candidates() ordering, report(), health(), usage(), check(), testKey(), checkAll(), testAll(), paste and import watch, the vault sheet | www/js/keys.js (new) |
| ai.js: request2 returns data plus Groq rate limit headers; errors carry kind (bad, limit, net, other), status, retryAfter; ask() walks keys best first and fails over only on bad or limit; opts.key forces one key (Test); listModels(id, key) is the Check; max_tokens 16 on Groq tests only (Gemini thinking models return no text with a tiny token cap); the single main key path and every old message still work when LN.keys is absent (sync-test loads ai.js alone) | www/js/ai.js |
| pdfv.js text(bytes) for the scanner | www/js/pdfv.js |
| store defaults aiKeys, aiKeyMeta, aiKeyWatch ('ask'); resetSettings keeps the new keys | www/js/store.js |
| Settings, AI: head, Keys saved, Open API key vault, spot-keys select; Remove saved AI keys clears the vault; privacy text; VERSION V0.7.5 | www/js/settings.js |
| Note tools, AI group row; tree.js import calls LN.keys.watchFile; app.js LN.keys.init() (editor paste and input listeners); index.html loads keys.js before ai.js; diag report prints key counts only | tools.js, tree.js, app.js, index.html, diag.js |
| CSS block .kv-*; green, amber, red health dots; bar goes red under 10 percent left | css/style.css |
| tests/v075-test.js (31 tests, mocked fetch, real zip code), tests/smoke-keys.js (Playwright for Node, 360 px, network mocked) | tests |
Tested: node --check on every js file; sync-test 22/22, share-test 8/8, md-test 19/19, bin-test 10/10, v074-test 49, v075-test 31/31. Headless Chromium 360 px: paste auto-adds (3 found, OpenAI skipped), file upload adds, Test all shows Healthy, Rejected and the reported Groq quota bar, no horizontal overflow, only the two mocked 401s in the console.
NOT tested: a device, the live Groq and Gemini services, real Groq headers through CapacitorHttp, a real docx/xlsx/pdf from a phone, PDF text reading inside the Capacitor WebView.
Decisions to confirm with Fezzy: (1) only Groq and Gemini keys are stored because the CSP and privacy page allow only those two hosts; keys for other providers are reported as skipped. Adding a provider means a CSP change, a PROVIDERS entry in ai.js and keys.js, and a privacy text change. (2) Keys found in a note you paste into are offered, not added silently, unless Settings, AI is set to Add automatically. (3) The vault holds at most 25 extra keys per provider.
Next ideas: per-feature provider fallback (Groq first, Gemini when every Groq key is resting), export the key list as a masked report, a "rest until midnight" state for keys that hit a daily quota.

## Earlier notes (V0.7.0 WIP6 header kept)

V0.7.2: HTML reader fix. Cause: the preview iframe was sandbox="" under a page CSP of script-src 'self', so every script in an .html note was blocked (buttons, tabs, calculators were dead; static pages looked fine). Fix: www/htmlrun.html (own CSP: inline script/style, data:/blob: media, connect-src none) loaded in sandbox="allow-scripts" (no allow-same-origin); editor.js showHtml posts the note text to it and falls back to the old static frame after 2.5 s. Same runner in viewer/htmlrun.html, viewer.js renderHtml, and the pages job copies it. New setting htmlScripts (default on). Browser-tested at 360 px (button click runs, parent/localStorage/network blocked, live edit updates); sync/share/md/bin tests pass. Not run on a device: confirm the runner loads inside the Capacitor WebView. Known limit: external CSS, fonts, images and CDN scripts in a note stay blocked.

HISTORICAL NOTE: the following V0.7.0/WIP sections are retained as project history. They are not current release instructions. See the V0.7.10 current-release section at the top first.

## WIP6 (latest, read first): Recycle bin
Done: delete now moves to a per-vault Recycle bin (setting `binOn`, default on; `binDays` auto-empty, default 30, 0 = never).
| Item | Files |
|------|-------|
| Trashed nodes stay in the same IndexedDB store, flagged `n.trash = {at,batch,top,from,path}`; kept in a separate in-memory `bin` map so search, tree, tabs, sync, stats never see them. Encryption and re-encrypt cover them automatically | www/js/vault.js |
| API: trash, restore (old folder, else path re-made by name, `(2)` on clash, folder merges into a live folder of the same name), purge, emptyBin, purgeOlder, binItems/binCount/binUsage/binPaths; `readVault(id, withBin)` leaves the bin out by default so backup and restore ignore it | vault.js |
| Writes now run through one queue in call order, so an older autosave cannot land after a trash and undo it | vault.js write() |
| Listeners (folder sync, vault stats) are told a trash is a delete and a restore is a put, so mirrorDeletes behaves as before | vault.js |
| Bin screen (Restore, Preview, Delete, Restore all, Empty bin), sidebar bin button with count badge, Note tools row, Undo toast after delete, auto-empty at start and on return after 1 h | www/js/bin.js (new), app.js (LN.toast(msg, {label, run, ms})), tools.js, css/style.css, icons.js (bin, restore) |
| Settings > Recycle bin page; Diagnostics report line; tree.js delete confirm says "Move to the Recycle bin" | settings.js, diag.js, tree.js, store.js |
| tests/bin-test.js (10 tests, fake IndexedDB) | tests, .gitlab-ci.yml |
Tested: `node --check` on every js file, tests/bin-test.js 10/10. NOT run: sync-test, share-test, md-test, any browser or device run (skipped on request). First things to check on a device: delete a file then Undo, the bin button badge in the drawer at 360 px, restore a folder, Settings > Recycle bin.
Known limits: bin items are not in backups; pull with mirrorDeletes off can re-import a trashed file from the folder as a new note (restore then gives it `(2)`); auto-empty only runs for the open vault.

## WIP5 (latest, read first): syntax highlighting + Markdown styling
Done and tested (node tests/md-test.js 19/19, sync 16/16, share 8/8, Chromium 360 px smoke tests/smoke-md.py, light + dark, no console errors):
| Item | Files |
|------|-------|
| Syntax highlighter, no libraries: js/ts/jsx, json, html/xml, css, sh/bash/termux, python, yaml/toml, sql, md, diff, plus a generic C-family set (java, kotlin, c, cpp, c#, go, rust, swift, php, dart, scala). Everything is escaped before wrapping; unknown language, over 30,000 chars, or a regex the WebView cannot build = plain text | www/js/hl.js (new) |
| Code blocks: language label, accent edge, Copy button (preview in the app only), horizontal scroll | md.js codeBlock, css/md.css, hl.js bind() |
| Callouts: `> [!note|tip|warning|danger|success|question|quote] Title`, many aliases (info, bug, faq...), `+` / `-` after `]` makes it fold open / closed, body is full markdown (lists, code) | md.js callout() |
| Quotes now render as real blockquotes with paragraphs and line breaks; nested lists by indentation, `<ol start>`, task items | md.js |
| Tables: rounded border, zebra rows, accent header that stays put (table scrolls inside 70vh) | css/md.css |
| Preview fade-in when switching Edit / Split / Preview; callout fade; all off with prefers-reduced-motion | css/md.css |
| Share page (asPage) carries light token + callout CSS; viewer loads hl.js + md.css; CI `pages` job copies hl.js and md.css | share.js, viewer/*, .gitlab-ci.yml |
Loaded in index.html: css/md.css after style.css, js/hl.js before md.js. md.js still works without hl.js.
NOT done yet from the "visual upgrade" list: animated bottom formatting bar (press ripple, active-format highlight, slide-in), live highlighting INSIDE the editor textarea (preview only for now, overlay is risky with the unwired line-number gutter), and the whole Interactive File Explorer item (animated folder expand, per-type colored icons and tags, `#tag` chips, search highlight + staggered results, selection glow).
Known limits: no `==mark==` or inline `#tag` chips (they can corrupt URL / wiki-link attributes with the current regex inliner, needs a tokenizer); the code regexes are line heuristics, not real parsers (JS regex literals, template `${}` nesting, HTML inside script tags are not special-cased). Nothing here has run on a device.

State: V0.4.0 code complete. Vault switcher, images, device access (access/notify/insert), tools sheet, music player, share (link, web page, file, text), share viewer for GitLab Pages, native helper (LNDevice), launcher icon, CI (tests, manifest, native, icons, pages job). Checked by node --check, 15/15 sync tests, 8/8 share tests and browser loads. NOTHING has run on a device and the CI Gradle build has not been seen yet.
Next session: upload this zip and say "continue from HANDOVER.md".

## V0.5.0 SECURITY (added this session, user asked for no testing)
Syntax-checked only (node --check, bash -n). NOT run in a browser or on a device. NOT compiled against the real Android SDK.
| Item | Files |
|------|-------|
| PIN lock (4-12 digits, PBKDF2-SHA256 250k, lockout 30s/60s/5m/15m after every 5 wrong PINs), lock screen, auto-lock on return (default 1 min, reloads the page), cover while in background | www/js/lock.js, css/style.css, index.html |
| Encryption at rest: random AES-GCM notes key wrapped by the PIN key; text and file bytes of every vault encrypted in IndexedDB (names stay readable); changing PIN only re-wraps the key; turning on/off re-writes all vaults | www/js/lock.js, vault.js (decodeOne/encodeOne/recode/reencryptAll) |
| Fingerprint: Android Keystore key needing a fingerprint per use (platform BiometricPrompt + CryptoObject, Android 10+), seals the notes key; PIN always works | tools/native/LNSecurePlugin.java, MainActivity.java, tools/ci-add-native.sh, ci-patch-manifest.sh (USE_BIOMETRIC) |
| Block screenshots and recents preview (FLAG_SECURE) via LNSecure.setSecure | lock.js applySecure, LNSecurePlugin.java |
| Settings > Security page, store defaults lockAuto/lockSecure | settings.js, store.js |
| Vault switch keeps the session (key stashed in sessionStorage for 15 s across the reload) | vaults.js, lock.js keep() |
First things to check on a device: lock screen shows on start, wrong-PIN lockout, fingerprint prompt and unlock, turn encryption on then off and confirm notes still open, vault switch does not re-ask the PIN, camera/file picker return (set Lock after to 1 minute or more).
Known limits: folder sync writes plain copies; AI keys/settings/music not encrypted; file names not encrypted; no PIN recovery; auto-lock relies on visibilitychange.
Likeliest CI failure: LNSecurePlugin.java (written against the platform BiometricPrompt API from memory).

## Request from Fezzy
1. Device access features: Share link, Notification, Files access, Locations, Calendar, Wake lock,
   Battery optimiser, Contacts, Camera, Music, Permanent.
2. Vault switcher at the bottom of the file panel (Obsidian style).

Assumptions made: "Permanent" = ongoing notification + persistent storage.
Share link = needs a hosted viewer page (GitLab Pages) plus a no-hosting "share as .html page" option.

## DONE
| Item | Files | Status |
|------|-------|--------|
| Vault switcher (list, open, rename, delete, create; per-vault files, tabs, folder sync) | www/js/vaults.js, store.js, vault.js, folder.js, app.js, index.html, css | Browser-tested, 14/14 old tests pass. Not run on device |
| Fix: Capacitor.Plugins.X is empty without a bundler, so folder sync never found Filesystem | www/js/native.js (registerPlugin proxy), folder.js capPlugin() | Done, not run on device |
| native.js, ui.js | bridge helpers, sheets, forms | Loaded in index.html, syntax-checked |
| Images: png/jpg/jpeg/gif/webp as binary kind `img`, viewer, `![[name.jpg]]` embeds, import accept list | kinds.js, imgv.js, md.js, editor.js, index.html, css | Browser smoke-tested at 360 px: import, view, embed, reload. sync-test fixture pic.png changed to pic.bin (png is now a real kind); new test added. 15/15 pass |
| access.js, notify.js, insert.js loaded; LN.access.init() and LN.notify.init() called in app.js; store defaults added; icons added; CSP media-src added | index.html, app.js, store.js, icons.js | Load with no console errors in a browser. Features themselves untested: they need the Capacitor plugins and a device |
| tools.js (⋯ sheet: Insert, Plan, Device groups), header btn-tools, Settings pages Device access (perm rows with live status, Allow everything, wake lock, permanent notification) and Notes tools, perm/head item types, VERSION V0.4.0 | tools.js, settings.js, index.html, app.js, css | Browser-tested at 360 px: sheet rows, date insert, status badges, toggles, no console errors, header fits. 15/15 sync tests still pass |
| Native helper: tools/native/LNDevicePlugin.java (status, requestBattery, requestAllFiles, requestAudio, openAppSettings), MainActivity.java (registerPlugin before super.onCreate), ic_stat_ln.xml; tools/ci-add-native.sh copies them after `cap add android`; .gitlab-ci.yml runs it before `cap sync` | tools/native/*, tools/ci-add-native.sh, .gitlab-ci.yml | Compiled with javac (jdk.compiler) against HAND-WRITTEN STUBS of the Android and Capacitor classes, so it only proves my code is self-consistent. NOT compiled against the real Capacitor 7 / Android 35 SDK: first real check is the CI gradle build. Copy script tested on a fake android tree, twice and with a missing dir |
| package.json 0.4.0 with the 7 plugin dependencies (Capacitor 7); tools/ci-patch-manifest.sh rewritten with all permissions + marker | package.json, tools/ci-patch-manifest.sh | Script run twice on a sample manifest: idempotent, XML valid |
| Launcher icon: orange tile, white note, dark pen. Adaptive, round, legacy and themed (Android 13) variants at all densities; tools/ci-add-icons.sh copies them in and points the manifest at them; runs in CI after ci-add-native.sh | tools/icons/build_icons.py, tools/icons/res/*, tools/icons/play-store-512.png, tools/ci-add-icons.sh, .gitlab-ci.yml | Rendered and checked by eye. Script run twice on a fake android tree and after ci-patch-manifest.sh: idempotent, manifest icon + roundIcon updated. NOT built into a real APK: first real check is the CI gradle build |
| Music player: sheet player, add songs, scan Music folder, shuffle, repeat | www/js/music.js | Syntax-checked, loads in a browser. Needs a device for the folder scan and playback |
| Share: link, web page, file, text. Link has the note inside it after the `#` (deflate-raw, base64url, `z.` prefix, `u.` fallback). Viewer address is validated before use | www/js/sharecodec.js, share.js, tools.js, settings.js (Share page) | Codec and md-embed logic: 8/8 tests. Share sheet and Pages link not run on a device |
| Share viewer for GitLab Pages: renders md, csv, text, sandboxed html; reads the link only | viewer/index.html, viewer.js, viewer.css | Not opened from a real Pages URL yet |
| CI: share-test, `bash -n` on every script, icons step, `pages` job (default branch only) copying viewer plus md.js and sharecodec.js to public/view/ | .gitlab-ci.yml | Pipeline not seen yet |
| tests/share-test.js | tests/share-test.js | 8/8 pass |
| Bottom editing bar above the keyboard (replaces the top format row): undo/redo with own history, checklist, bullet/numbered list, heading cycle, bold/italic/strike with toggle-off, code, quote, link, wiki link, tag, divider, indent/outdent, photo, Options (opens tools sheet). Bar keeps editor focus on tap. Hides the status line while the keyboard is open | www/index.html (#btb), www/js/editor.js, icons.js, css/style.css | Syntax-checked only. NOT run in a browser or on a device (user asked for no testing). First thing to check: bar position above the keyboard, buttons keep the keyboard open, undo/redo steps, list and checklist toggles on multi-line selections |
| PDF load error now says what is actually missing (www/vendor/pdfjs) instead of pointing at a script that does not exist | www/js/pdfv.js | Done |
| README updated to V0.4.0: feature table, share setup, permissions, layout, CI | README.md | Done |

## WIRED, BROWSER-TESTED, NEVER RUN ON A DEVICE (access.js, notify.js, insert.js)
- www/js/access.js  permission registry (notify, files, location, calendar, contacts, camera, music, battery, persist), ask(), allowAll(), wake lock
- www/js/notify.js  reminders (LocalNotifications), permanent ongoing notification, tap handler, quick note
- www/js/insert.js  location, contact, today's events, add event, camera photo, date/time

## STILL OPEN, in this order
0. Test the new bottom editing bar (see its row in DONE). It has never been run.
1. Run the pipeline. If `build-apk` fails, the likeliest places are LNDevicePlugin.java (Capacitor API names written from memory, only compiled against stubs) and the `^7.0.0` plugin versions in package.json (not checked against npm).
2. Install the debug APK and test on the phone: every row in Settings > Device access, reminders, permanent notification, location, contact, calendar, camera, music scan, share file/text, folder sync.
3. Publish the viewer: push to the default branch so `pages` runs, then paste the Pages address plus `/view/` into Settings > Share > Viewer address and test a share link on a second device.
4. Commit a package-lock.json (run `npm install` once somewhere with network) so `^7.0.0` ranges cannot drift between pipeline runs.
5. Splash screen (the launcher icon is done).
6. Release signing is written (scripts/sign.sh + sign-apk job) but never run: create the keystore, add KEYSTORE_BASE64 and KEYSTORE_PASSWORD (and KEY_ALIAS if needed) as masked, protected CI variables, push to the default branch, check the `apksigner verify` output.
7. Converter (md to pdf, html, docx, pptx), moved to V0.4.x in the README roadmap.

Original spec items 1 to 15 are all done; their notes are kept below for reference.

## Original spec (all done, kept for reference)
1. index.html: add script tags (after ui.js): access.js, notify.js, insert.js, then music.js, share*.js, tools.js, imgv.js. Add CSP `media-src 'self' blob:`. Add header button `btn-tools` (icon `more`). Add `.png,.jpg,.jpeg,.gif,.webp` to the import accept list.
2. icons.js: add more, bell, pin, music, share, camera, calendar, battery, user, shield, image.
3. kinds.js: add png/jpg/jpeg/gif/webp as binary kind `img`. editor.js VIEWERS: `img: 'imgv'`.
4. www/js/imgv.js: `mount(pv, bytes, api)` returns `{bytes(), destroy()}`; `hydrate(root)` turns `img[data-ln-img]` into blob URLs from the vault. Call hydrate after md render in editor.renderPreview.
5. md.js: `![[name.jpg]]` before the `[[wiki]]` replace, output `<img data-ln-img="name" alt="name">`.
6. www/js/music.js: sheet player with one <audio> element. Add songs via file input (blobs in own IndexedDB), Scan Music folder via Filesystem.readdir (directory EXTERNAL_STORAGE, path = setting musicFolder), play with `Capacitor.convertFileSrc(uri)` from Filesystem.getUri. Shuffle, repeat, prev/next.
7. Share: www/js/sharecodec.js (JSON {v,n,k,t} -> deflate-raw via CompressionStream -> base64url, prefix `z.`; fallback `u.`), www/js/share.js (share link = setting `shareBase` + `#` + data, warn over 20000 chars; share as self-contained .html page with images inlined; share file via Filesystem CACHE + Share plugin; share text), viewer/index.html + viewer.js + viewer.css (renders md with md.js, csv table, text in pre, html in sandbox="" iframe; preventDefault on `a.wl`).
8. tools.js: ⋯ sheet with groups Share, Insert, Plan, Media; every row calls LN.share.* / LN.insert.* / LN.notify.* / LN.music.open.
9. settings.js: new item types `perm` (label, async status badge, Allow/Open settings button) and `head`; pages Device access (all rows + Allow everything + wake lock toggle + permanent notification toggle), Notes tools (musicFolder, photoFolder, locationLink, calAlert), Share (shareBase). Refresh the page on `visibilitychange` (returning from Android settings). Bump VERSION to V0.4.0.
10. store.js defaults to add: shareBase '', wakeLock false, permanentNote false, musicFolder 'Music', photoFolder 'Photos', locationLink true, calAlert 10, reminders [], musicList []. app.js: call LN.access.init(), LN.notify.init() after LN.vault.init().
11. package.json: version 0.4.0 and dependencies (keep Capacitor 7; "latest" is Capacitor 8 and needs Capacitor >=8):
   @capacitor/local-notifications ^7.0.0, @capacitor/geolocation ^7.0.0, @capacitor/camera ^7.0.0, @capacitor/share ^7.0.0,
   @capacitor-community/contacts ^7.0.0, @capacitor-community/keep-awake ^7.0.0, @ebarooni/capacitor-calendar ^7.0.0 (Kotlin plugin, needs Java 21 which CI already has).
12. tools/ci-patch-manifest.sh: plugin manifests are EMPTY of permissions, so add them all (idempotent, marker comment):
   POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION,
   READ_CALENDAR, WRITE_CALENDAR, READ_CONTACTS, WRITE_CONTACTS (contacts plugin asks for both), CAMERA, READ_MEDIA_AUDIO,
   READ_EXTERNAL_STORAGE (maxSdkVersion 32), WRITE_EXTERNAL_STORAGE (maxSdkVersion 29), MANAGE_EXTERNAL_STORAGE,
   REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, plus `<uses-feature android:name="android.hardware.camera" android:required="false"/>`. Keep requestLegacyExternalStorage.
13. Native helper (needed for battery, all-files and audio permission screens): tools/native/LNDevicePlugin.java in package com.fezzy.limitlessnotepad, plugin name "LNDevice",
   methods status() -> {sdk, battery, allFiles, audio}, requestBattery(), requestAllFiles(), requestAudio() (alias audio = READ_MEDIA_AUDIO on API 33+, audioLegacy = READ_EXTERNAL_STORAGE below), openAppSettings().
   Intents: ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS with `package:` URI, ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION (fallback ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), ACTION_APPLICATION_DETAILS_SETTINGS.
   MainActivity.java must call `registerPlugin(LNDevicePlugin.class)` BEFORE `super.onCreate`. CI copies both files after `npx cap add android`.
   Also write a vector `res/drawable/ic_stat_ln.xml` (notification small icon, name used in notify.js) and set it in the script.
   No Android SDK or Maven here: check Java with stub classes, then rely on CI.
14. .gitlab-ci.yml: add steps `node --check` for new js, `bash -n` for new shell, `node tests/share-test.js`; add a `pages` job copying viewer/*, www/js/md.js, www/js/sharecodec.js to public/view/.
15. tests/share-test.js (codec round trip incl. unicode and 100 KB, md embed output). README: V0.4.0 section, honest status ("not run on a device").

## Facts to keep
- Plugin names for registerPlugin: LocalNotifications, Geolocation, Camera, Share, Filesystem, Contacts, KeepAwake, CapacitorCalendar, LNDevice.
- Permission result keys: notifications `display`, location `location`, camera `camera`, contacts `contacts`, calendar uses `checkPermission({scope:'readCalendar'|'writeCalendar'})` -> `{result}`.
- Calendar createEvent uses the default calendar; if the phone has none, fall back to createEventWithPrompt (already coded in insert.js).
- LocalNotifications action buttons on Android open the app; `foreground` is iOS only.
- Android 14: Honor MagicOS also needs Settings > Battery > App launch > manage manually (shown in the battery row text).
- Header is tight at 360 dp; CSS already shrinks the logo under 420 px. Re-check after adding the ⋯ button.
- Smoke test pattern: serve www with python http.server, drive with Playwright at /opt/pw-browsers/chromium, open the drawer (#btn-menu) first on a narrow viewport.
- Never touch: FEZZY ASCII art, welcome screen, rotating quotes, Control Hub portal, Maze portal (none are in this project).

## V0.5.1 (AI in the note toolbar, chat memory)
- Bottom editing bar: new first button (spark) opens the Ask AI panel (`data-b="ai"` handled in `editor.js` act()). Options sheet has an "Ask AI about this note" row.
- `ai.js` panel is now a chat: follow-up questions remember the last 20 messages per note. The note text (or selection) is attached to the newest question only, so the model always sees current text.
- Chat threads are in memory only, on purpose (notes can be encrypted at rest). "New chat" clears the thread for the open note.
- Each AI answer has Insert at cursor, Replace selection, Copy. Ctrl/Cmd+Enter sends.
- Not done: AI create-note and whole-note edit modes, extra toolbar items (table, find/replace).

## V0.6.0 (more AI chips, more toolbar, tables)
- AI quick chips: Expand, Translate, Make checklist, Title ideas, Change tone (added to the original four).
- Bottom bar: Table, Code block (markdown only), Find and replace, Select all. Find and replace is a form: Replace all, Replace next or Find next, with match case. `ui.form` trims every field, so leading and trailing spaces cannot be searched.
- `md.js` now renders pipe tables (header, separator row with optional :--- alignment, body). Before this a table was shown as plain text.
- Still not built: AI create-note and whole-note edit modes (step 2 of the plan).

## V0.6.1 (About and Privacy)
- Settings, About: centred app icon (`www/img/icon.png`, from the launcher icon), wordmark, version, app description, feature list, builder card (ethical hacker, developer, self-taught, Cape Town), links (GitHub, GitLab, project portal, SoundCloud, Audiomack). Edit the `LINKS` array in `settings.js`.
- Settings, Privacy: plain statements of what stays on the device, what leaves and when, permissions, what is not protected; controls: Ask before sending to AI (`aiConfirm`), Clear AI chats, Remove saved AI keys, shortcuts to Security and Device access.
- `ui` type `custom` added to settings (a page item that builds its own node).
- The privacy text is only true while the CSP in `index.html` allows just api.groq.com and generativelanguage.googleapis.com. Update the text if that changes.

## V0.6.2 (image support and photo permissions)
- New permission "Photos and images" (`images` in `access.js`): READ_MEDIA_IMAGES on Android 13+, READ_MEDIA_VISUAL_USER_SELECTED on 14+ (shows as Limited when only some photos are shared), READ_EXTERNAL_STORAGE up to Android 12. Added to `tools/ci-patch-manifest.sh` (marker bumped to V0.6.2) and `LNDevicePlugin.java` (`status().images`, `requestImages()`). The Java was compiled against stubs only; the real check is the CI build.
- First start (native app only): one sheet offers photo and camera access (`LN.access.firstRun`, flag `permsIntro`). Android's own prompt only shows after the person taps Allow. Not now is respected and never repeated.
- Image from gallery: toolbar button and Note tools row; saved in the Photos folder and embedded as `![[name]]`. The picker also works when access is declined.
- Image viewer: Fit, zoom out and in, 100%, copy embed, size and dimensions. New formats: svg, bmp, avif, ico (heic is not supported by the Android webview).

## V0.6.3 (real gear icon, read any file)
- `gear` icon in `icons.js` is now a real 8-tooth cog with a hub (top right settings button and the left panel vault gear share it).
- Import no longer filters by extension (`accept` removed from `#t-file`). `LN.decodeText` (kinds.js): UTF-8, UTF-16 with BOM, else Windows-1252 if it looks like text, else binary (NUL in the first 8 KB means binary). A non-UTF-8 read shows a toast naming the encoding.
- New kinds in `kinds.js`: `doc` (odt, ods, odp, epub, rtf), `media` (mp3, wav, ogg, m4a, aac, flac, opus, mp4, webm, mkv, mov, 3gp), `bin` (zip, apk, 7z, exe, legacy doc/xls/ppt, fonts, and any unknown extension that held binary data). Aliases: docm/dotx to docx, xlsm/xltx to xlsx, pptm/ppsx/potx to pptx. `LN.kindOfNode(n)` returns `bin` for a stored file that has bytes but a text-looking name.
- New `www/js/anyv.js`: `LN.docv` (text out of ODF, EPUB chapter by chapter, RTF; Save as text note), `LN.mediav` (audio/video player, error message if the codec is not supported), `LN.binv` (Info with type detection and zip listing, readable Text strings, paged Hex). All read only.
- foldersync pull now reads every file (previously non-UTF-8 files were skipped). Tests: sync-test 16/16 (old "non-text skipped" test replaced, decodeText/kinds test added), share-test 8/8.
- Browser smoke test at 360 px (Chromium): odt, epub (next chapter), rtf, latin-1 txt, random binary (hex), wav, zip all open. Not run on a device. Video, large files and legacy .doc text are untested; mp4 playback depends on the phone WebView codecs.

## V0.6.3 addendum (permissions and music)
- Device access order is now: Notifications, Music, Files access, Location, Contacts, Microphone, then Calendar, Camera, Photos, Battery, Permanent storage.
- New Microphone permission: `micDef` in access.js (native via `LNDevice.requestMic`, web via getUserMedia), `mic` alias + `status().mic` + `requestMic()` in LNDevicePlugin.java, RECORD_AUDIO + MODIFY_AUDIO_SETTINGS + optional microphone feature in ci-patch-manifest.sh (marker LN-PERMISSIONS-V0.6.3; script run twice on a sample manifest, idempotent, XML valid). Nothing in the app records audio yet; this is the permission only. The Java was NOT compiled against the real SDK (CI build is the check).
- Music player: add-songs picker and the Music folder scan now take mp3, m4a, m4b, aac, ogg, oga, opus, wav, flac, weba, amr, wma, mka, mid, midi, aif, aiff, 3gp, mp4, m4v, webm, mkv, mov, ogv (music.js EXTS/MIME/SCAN). Playback depends on the phone WebView codecs: wma, mid and aiff may not play.

## HISTORICAL: V0.7.0 IN PROGRESS (5 priority tasks) - ARCHIVE ONLY
WIP4 UPDATE: tasks 1 (backup and restore) and 2 (security) are now WIRED and browser-tested, see the WIP4 block below. Tasks 3, 4 and 5 are still as described. Older status line follows. Status then: NEW MODULES WRITTEN AND SYNTAX-CHECKED ONLY. NOT loaded in index.html, NOT wired into settings, NOT run in a browser or on a device. The shipped, usable build is V0.6.3. Tests at this point: sync-test 16/16, share-test 8/8 (unchanged, they do not cover the new modules).
Historical next-session note (superseded): do not continue V0.7.0; use the current release section at the top.

### WIP4 (this session): tasks 1 and 2 wired
Done: index.html loads diag.js (after store.js), secure.js (after lock.js), backup.js (after vault.js); app.js calls LN.secure.init() and LN.backup.init() after music.init(); lock.js visibilitychange uses lockBg (0 wait) else lockAuto; editor.flush() does nothing while LN.wiping is true (set during Delete all my data); tree.js exportSelected and share.js link/asPage/file/text go through LN.secure.warnExport; secure.js warning text reworded to fit links and text; settings.js has new Backup and Diagnostics pages and the Security page gained lockBg, lockIdle, exportWarn (PIN only) and clipClear (always) plus the clipboard honesty note. Diagnostics: version, storage line, permission rows with Allow buttons, View/Copy/Clear log, Copy full report, Reset settings, Delete all my data (confirm, offer backup, type DELETE, wipe, reload).
Tested in Chromium at 360 px (tests/smoke-backup.py and tests/smoke-security.py, need Python Playwright and `python3 -m http.server 8765 --directory www`): loads with no console errors; backup builds and verifies; internal copy listed; Back up now downloads a valid zip; identical data restores nothing; corrupt and foreign zips rejected; newer local note kept and backup version added as "(backup copy)"; safety backup made before restore; Backup, Diagnostics and Security pages render and fit 360 px; report has no notes or keys; PIN set through the real flow; lockBg locks on instant return, and does not when off; idle lock fires; export warns when PIN is on, cancels when declined, silent when exportWarn is off; Delete all my data refuses a wrong word, then wipes notes, PIN and backups. sync-test 16/16 and share-test 8/8 still pass.
NOT tested: anything on a device; Documents write and old-file cleanup (native only); clipboard clearing actually emptying the clipboard (only that copy does not throw); fingerprint; encryption on/off with the new pages; scheduled backup firing by itself; Delete all with the "back up first" option accepted.
Not done on purpose: VERSION in settings.js still V0.6.3, package.json version, privacy page text (wiring checklist items 3 and 4). editprefs.js is NOT loaded yet (task 3), nothing for task 4 (sync) or the Editor page.

### The five tasks and where each stands
| # | Task | Done | Still to do |
|---|------|------|-------------|
| 1 | Backup and restore | `www/js/backup.js`: zip builder (manifest.json + every file at vaults/<id>/files/<path>), post-build verify (re-parses zip, compares sizes) before the "last backup" timestamp is set, internal copies in IndexedDB `limitless-notepad-backups` (keep N, safety copies kept separately, max 2), Documents/LimitlessNotepad-Backups on Android with size check and old-file cleanup, browser download, daily/weekly schedule (runs only while the app is open: 6 s after start, every 15 min, on return to front), restore plan (new / replace if backup newer / keep local and add "(backup copy)" if local newer or different / identical), confirm summary, automatic safety backup before restore, optional settings restore (whitelist, never PIN/keys/folder links), reload after restore. Supporting code: `vault.js` readVault/putVault/usage/close/newId, `zip.js` create(), store defaults. | Settings > Backup page (Back up now, Restore from file, Restore from in-app backup, schedule, keep count, last backup time + last error, warning that backups are unencrypted). Load backup.js, call LN.backup.init() from app.js after vault init. Tests: build then restore round trip, newer local note is never overwritten, corrupt/foreign zip rejected. |
| 2 | Security and auto-lock | `www/js/secure.js`: idle auto-lock timer (lockIdle), clipboard clearing (clipClear; wipes only if clipboard still holds the app's copied text; wraps navigator.clipboard.writeText and copy/cut events), `warnExport(what)` (only asks when a PIN or encryption is on, setting exportWarn). Existing in lock.js: lock-after-leaving timer, cover when backgrounded, fingerprint, encryption. | Patch lock.js visibilitychange: `wait = LN.store.get('lockBg') ? 0 : Number(lockAuto)` (the lockBg toggle). Hook warnExport into tree.js exportSelected and share.js link/asPage/file/text (wrap exported functions). Call LN.secure.init() in app.js. Security settings page: lockIdle select (Off, 1, 5, 15, 30 min), lockBg toggle, clipClear select (Off, 30 s, 1 min, 2 min), exportWarn toggle, honest note that clearing can fail while the app is in the background. |
| 3 | Editor preferences | `www/js/editprefs.js`: line numbers gutter (mirror div measures wrapped rows, scroll synced, off above 20000 lines for wrap alignment), spellcheck + autocorrect attribute, line spacing var --elh. Store defaults: lineNumbers, spellcheck, editorLine, defaultExt. Word wrap (lineWrap) and font size (editorSize) already existed. | CSS: `.ln-gutter{position:absolute;overflow:hidden;pointer-events:none;text-align:right;color:var(--muted);background:var(--panel);border-right:1px solid var(--line)}`, `.ln-inner{white-space:pre;padding-right:6px}`, `.ln-mirror{position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word}`, and change `.editor` line-height to `var(--elh,1.7)`. Call LN.editprefs.refresh() from settings.applyAppearance, from editor.js textChanged() and at the end of editor.load() (undo/redo and file loads set ta.value without an input event). Call LN.editprefs.init() in app.js. tree.js newItem: use `'.' + defaultExt` instead of hard-coded `.md` and in the prompt hint. New "Editor" settings page: word wrap, line numbers, spellcheck, font size (12-24), line spacing (1.4-2.2), default file type (md, txt, html, csv, sh, json). Move the editor items out of Appearance or duplicate them. Test the gutter at 360 px with wrap on and off. |
| 4 | Sync and conflicts | Store defaults + per-vault keys: conflictMode ('folder' default = current behaviour), syncExclude, syncRetry, lastSyncOk, lastSyncError. | NOT STARTED in code. Plan: (a) foldersync.js `isExcluded(path)` from options().excluded (lines, trimmed, lowercase; match full path, path prefix + '/', or a bare name equal to any folder segment) applied in pull (with hidden()), push, and mirrorDeletes (excluded files never deleted). (b) conflictMode folder / vault / newest in pullOne where `localChanged` is computed: loser is always kept as a copy ("(vault copy)" existing, "(folder copy)" new); vault mode leaves the vault note and imports the folder version as "(folder copy)"; newest compares e.mtime with node.updated. (c) protection: skip push when pull had errors; do not overwrite a non-empty vault note with an empty (0 byte) folder file (count as skipped, record a warning); mirrorDeletes off for a sync whose pull failed. (d) folder.js: set lastSyncOk (ms) on success, lastSyncError on failure, auto retry with backoff 30 s / 1 / 2 / 5 min (max 5 tries) when syncRetry is on, retryNow(), lastError(). (e) options() must pass excluded and conflict. (f) Sync settings: status, last sync time, last error, Retry now, auto retry toggle, conflict select, excluded folders textarea, "Review conflict copies" (list nodes whose name matches / \((vault|folder|backup) copy\)/ with Open and Delete). Add tests to tests/sync-test.js for exclude, each conflict mode, empty-file guard, push skipped after pull error. Existing test 16/16 must keep passing with the default mode. |
| 5 | Diagnostics and reset | `www/js/diag.js`: LN.log (300 lines, localStorage, keys scrubbed, window error and unhandledrejection hooks), LN.diag.report() (version, platform, storage, protection, last backup/sync, permission status, safe settings, last 100 log lines), storageLine(), resetSettings() (LN.store.resetSettings keeps vault list, active vault, AI keys, music list, reminders, PIN/encryption), deleteAllData() (all vault DBs, fs handle DB, music DB, backups DB, every localStorage key starting `ln.`, sessionStorage, pending notifications). | Load diag.js right after store.js in index.html (so error hooks start early). Settings > Diagnostics page: version, storage line (async), permission list with status, View log (sheet), Copy log, Clear log, Copy full report. SEPARATE buttons: "Reset settings" (confirm) and "Delete all my data" (confirm, offer a backup first, then require typing DELETE, then call deleteAllData and reload immediately; do not let the editor flush after deletion). Add LN.log calls in folder.js sync failures and lock events. |

### Wiring checklist (nothing below is done)
1. index.html: DONE for diag.js, secure.js, backup.js. STILL TO DO: `editprefs.js` (after editor.js).
2. app.js start(): DONE for LN.secure.init(), LN.backup.init(). STILL TO DO: LN.editprefs.init().
3. settings.js: bump VERSION to V0.7.0; new pages Backup, Editor, Diagnostics; extend Security and Sync pages; update RESET list with the new editor keys; applyAppearance calls LN.editprefs.refresh().
4. package.json version 0.7.0, privacy page text (what backups contain, that they are unencrypted, log stays on device).
5. Run: node --check on every file, tests, Chromium smoke at 360 px (backup then restore round trip, line numbers with wrap, Diagnostics page, reset and delete flows on a throwaway vault).

### Known risks and decisions to confirm with Fezzy
- Scheduled backup cannot run in the background: Android would need a native WorkManager job. Written as "runs when the app is open".
- Clipboard clearing cannot read the clipboard while the app is in the background, so a wipe after the timer is best effort. Documented in the setting text.
- Backups are plain zips by design (so they open anywhere). Warned in the UI when a PIN or encryption is on.
- Delete all data does not touch folder-sync copies or files already saved to Documents.
- Reset settings keeps AI keys. Remove them with Privacy > Remove saved AI keys.
- None of this has touched a device. The CI Gradle build has still never been seen.

## WIP7 (2026-10-18)
- Sync location: new native plugin tools/native/LNFolderPlugin.java (name LNFolder, Storage Access Framework): pick (system folder picker, persisted grant), check, list, stat, read, write, mkdir, remove. Registered in MainActivity.java, copied by tools/ci-add-native.sh. JS: folder.js safBackend + choosePicked(), folderMode 'saf', store key safUri (per vault), init re-checks the grant and shows Reconnect if lost. Settings > Sync to folder / Folder watch: new "Pick any folder" button (Android only); the old Documents/<name> option is unchanged.
- Animated toolbars: style.css + editor.js placeSeg(). Top Edit/Split/Preview gets a sliding highlight; bottom editing bar slides up, buttons pop in staggered, tap spring, AI icon glow. All off under prefers-reduced-motion.
- Tested: node --check on all js, sync-test 16/16, bin-test 10/10, Chromium 360 px (highlight moves, no new console errors). NOT tested: LNFolderPlugin.java was never compiled (no Android SDK here), nothing run on a device. First check is the CI Gradle build, then pick a folder on the phone, sync, watch, delete mirror.
- Known risk: some SAF providers rename or reject createDocument names; write() renames back when the name differs. Android may report mtime 0 on some providers, which makes watch re-read those files each check.

## WIP8 (2026-10-18) Editor page
- New Settings > Editor page: live preview, editor font, size (12-24), line spacing (1.4-2.1), wrap, line numbers, spellcheck/autocorrect, default file type (md, txt, html, csv, sh, json). Editor font/size/wrap moved out of Appearance.
- editprefs.js now loaded (after editor.js) and init()ed in app.js; refresh() runs from applyAppearance, editor textChanged() and the end of editor.load(). Gutter CSS added, .editor line-height uses var(--elh). tree.js new files use defaultExt. RESET list has the new keys.
- Tested: node --check all js, sync-test 16/16, bin-test 10/10, Chromium 360 px: gutter numbers align with a wrapped 9-row line (1, 2, blanks, 3, 4, 5), line spacing change applies (23.8px to 29.4px), Editor page renders, no new console errors. NOT tested: device fonts, wrap off, files over 20,000 lines, dark theme.
- Not done by choice: tab size, typewriter scroll, current-line highlight.

## WIP9 (2026-10-18) Sync conflicts and safety
- foldersync.js: options().conflict ('folder' default, 'vault', 'newest'), options().excluded (lines; bare name matches anywhere, a path with / matches that path and below; applied in pull, push and mirror delete), empty-file guard (empty folder file never replaces a non-empty note; idx v:0 so a push puts the note back), pull with errors => sync() skips push (push.held) and mirror deletes are skipped until a clean pull. Copies are "(vault copy)" for the folder-wins loser and "(folder copy)" for the vault-wins loser. Newest uses folder mtime vs note.updated; mtime 0 = unknown => folder wins and the vault copy is kept.
- folder.js: options() passes excluded and conflict; noteOk/noteFail set lastSyncOk and lastSyncError, log through LN.log, auto retry 30 s, 1, 2, 5, 5 min (5 tries, syncRetry toggle), retryNow(), lastError(). Retry runs only while the app is open. A sync with file errors counts as failed and retries.
- Settings > Sync to folder: Last successful sync, Last error, Retry now, retry toggle, conflict mode, excluded folders box, Review conflict copies sheet (Open, Delete to bin), info text.
- Tests: sync-test 22/22 (6 new: exclude, vault mode, newest mode, empty-file guard, pull error holds push and deletes, parse/match). bin-test 10/10. Chromium 360 px: sync page rows present, conflict sheet lists and opens a copy, no new console errors.
- NOT done: dry run, conflicts badge, per-vault junk presets. Not tested on a device or against the real folder providers.


## V0.7.12 handover — 2026-10-18

### Delivered in this archive
- Multiple extra folder connections remain supported; each connection has its own mount folder and index. The per-folder Sync action now syncs only the selected connection instead of triggering every extra folder. SAF picker results are validated before saving a connection.
- `tools/icons/launcher.svg` is now sourced from `launcher_new.svg`; all launcher, adaptive, monochrome, Play Store and in-app icon outputs were regenerated by `tools/icons/build_icons.sh`.
- Added an attachment preview strip above the viewer: image thumbnails use object URLs with cleanup, PDF thumbnails render page 1 through bundled PDF.js, and other binary formats show a format tile and metadata.

### Verification limits
- Syntax and logic tests can be run in Node; they do not prove Android SAF permission persistence or actual folder-provider behaviour. Test adding at least two unrelated folders, syncing both, disconnect/reconnect, nested files, duplicate selection, provider permission revocation and a provider error on a physical Android device.
- PDF thumbnails need the bundled `www/vendor/pdfjs/pdf.min.mjs` and worker files; if a PDF is corrupt or the engine is missing, the preview falls back to a PDF tile while the normal viewer reports its own error.
- Launcher assets are generated and packaged, but the installed Android launcher icon changes only after rebuilding/reinstalling the Android app.


## V0.7.13 handover — 2026-10-18

- Added an accessible vault startup overlay with spinner and explicit phase text (unlocking, vault load, workspace preparation). The overlay is dismissed after initialization and on fatal startup errors.
- Attachment preview strip is positioned directly above the editor area. It shows image previews, attempts PDF first-page rendering through the bundled PDF.js helper, and uses a safe type badge fallback for other documents or failed PDF rendering.
- Validation still required: run all browser smoke tests and verify attachment previews/loading transitions in the Android WebView on a real device.


## V0.7.14 — reload position, double-tap editing and folder-copy wording

- Reload state captures active note ID, Markdown view mode, editor scroll position and selection in sessionStorage and restores it after startup.
- Tree file rows support quick double-tap (touch) and double-click (mouse) to open and enter Markdown Edit mode.
- Sync settings clarify two-way copy behaviour; delete mirroring remains a separate opt-in.
- Validation is recorded in `TEST-REPORT-V0.7.14.md`; Android device-specific behavior remains unverified.
