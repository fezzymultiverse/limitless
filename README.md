# LIMITLESS NOTEPAD

Obsidian-style notepad and vault for Android. White and black with a neon orange accent (`#FF6A00`) and a blinking cursor.

**Version: V0.7.21**

> Strategy Over Impulse. Plan the vault before the plugins.

## Repo layout (read this before pushing)

The files in this zip sit at the TOP LEVEL: `www/`, `package.json`, `.gitlab-ci.yml`, `tools/` and the rest, with no wrapper folder. GitLab CI builds whatever is at the repo root, so `www/js/settings.js` must be at `www/js/settings.js` in the repo, not `somefolder/www/js/settings.js`.

- Earlier zips unpacked into a folder called `ln712/`. Pushing that as a subfolder left the old V0.7.7 app at the root, and every pipeline kept building it. That is why V0.7.8 to V0.7.17 never appeared on the phone.
- Check before you push: `grep -n "var VERSION" www/js/settings.js` must print the version in this README.
- After a pipeline: the job log must show `Version set: versionName <this version>`, and Settings > About in the app must match.
- Not tested on GitLab CI or on a phone.

## V0.7.21 — Back button, no reload when you leave, real spinner, roomy loading and login screens

- **Phone Back button:** closes what is open first (a dialog or sheet, a settings page then Settings, the AI chat, a full-screen PDF, the left panel). With nothing open it sends the app to the background instead of closing it. Needs the new `MainActivity.java` (CI copies it).
- **No reload when you leave and come back:** locking no longer reloads the page. The PIN screen is drawn over the page you were on, so after unlocking you are on the same note, panel and scroll position. Back no longer closes the app, which was the other cause of a restart.
- **Spinner:** a 60 px ring on the loading screen that turns continuously (animation engine, plus a hand-turned backup if the phone refuses to start the animation). It keeps turning with "remove animations" on.
- **Loading (welcome) screen and PIN screen:** re-laid out with real spacing (clock, logo, spinner, message and quote each have their own room; small screens scroll instead of squashing).
- Not run on a device; native Java not compiled here.

## V0.7.20 — fast folder sync, resume without restart, real spinner, permissions first, Edit order, 999 story

- **Folder sync is fast.** Connecting a folder (and adding extra folders) no longer walks the whole folder first; it checks access, returns, and the first sync runs in the background with a live "Syncing 120 / 800" line. The native lister (`LNFolderPlugin`) now lists folders in parallel (6 threads, level by level); the JS engine reads 5 files at a time, applies changes one at a time, and skips files whose size and time are unchanged.
- **More content is picked up.** Every dotfile used to be skipped and the native walk stopped at depth 8. Now only app/OS noise is skipped (`.git`, `.trash*`, `.thumbnails`, `.nomedia`, `.obsidian`, `.stfolder`, `.sync*`, `*.tmp`) and depth is 40. The sync summary names files over 25 MB and files that failed.
- **No restart when you leave the app.** `MainActivity` keeps page timers running when backgrounded; the manifest patch adds `configChanges` and `singleTask` if missing; state is saved on hide, pagehide and freeze. If Android still ends the page, it restores the same note, scroll and caret and shows only "Back where you left off" with the spinner (resume within 30 min). Android can kill any background app under memory pressure; that cannot be prevented without a permanent foreground-service notification, which is not built.
- **Spinner spins.** It was switched off by `prefers-reduced-motion` (Android "Remove animations"). It now always turns (slower under reduced motion), scripts are `defer`red and `start()` waits a frame, so the loading screen paints first.
- **Loading screen:** greeting (Good Morning / Afternoon / Evening / Late Night), live clock and date, and a different Juice WRLD quote on every launch (walks the whole list before repeating). New `js/quotes.js`, `js/splash.js`.
- **Permissions first:** on the first start of the installed app, before the vault opens: Notifications, Files, Photos, Music, Microphone, Camera, Battery. "Allow all" asks one at a time. `LN.access.onboard()`.
- **Order:** new notes and folders land at the bottom (`ord` on each node). **Edit order** (button in the file panel toolbar) puts up/down arrows on every row. Order is saved per vault and never touches sync. Older unordered items stay above, folders first, A-Z.
- **Home:** greeting, clock, welcome line and a rotating work quote (tap for the next).
- **999 story:** tap the home logo twice (a third tap hands over to the five-tap Bojack egg). Seven chapters, sources listed, every claim tagged CONFIRMED or PLAUSIBLE, orange glowing 999 logo at the bottom. `js/juice.js`.
- **Quotes policy:** spoken words from interviews and his own posts only, each with its source. No song lyrics.
- Tests: `node tests/v0720-test.js` (10), `tests/sync-test.js` updated for the dotfile rule (22). Not device-tested; native Java not compiled here. See `TEST-REPORT-V0.7.20.md`.

## V0.7.18 — real logo everywhere, universal edge swipe, + in tab strip, Calendar, Templater, Dataview
See HANDOVER.md (V0.7.18 section) and TEST-REPORT-V0.7.18.md. Menu: Note tools > Plugins; tab strip has Calendar and + buttons.

## V0.7.17 — fuller home screen, dock, Strategy Over Impulse, Bojack Easter egg

- **Home screen (no file open):** logo, LIMITLESS NOTEPAD, **Strategy Over Impulse**, watermark behind. Last five opened notes (tap to open; falls back to most recently edited until you have opened some; kept per vault in `recentNotes`). One summary row: notes, folders, last sync, sync status (tap to sync). New `js/home.js`.
- **Dock:** New, Search, Voice, Music, AI, Sync. Shows only while no file is open; the editing bar replaces it when a note opens. Voice makes a fresh "Voice note" first, then records. AI opens your most recent text note, then the chat. Search opens the file panel and focuses the search box.
- **Footer:** "No file open" replaced by `S.O.I. × Bojack Security · 999`.
- **Strategy Over Impulse:** home screen, footer, Settings, About (tagline in the hero).
- **Bojack Easter egg:** tap the LIMITLESS NOTEPAD logo (header or home) 5 times within 2.5 s. Paw prints walk across, then a "Bojack Security: on watch" card with a bark animation and a close button. Respects reduced motion. New `js/bojack.js`.
- **Fix:** the About page and Settings showed V0.7.11; now V0.7.17.
- Not device-tested. See `TEST-REPORT-V0.7.17.md`.

## V0.7.16 — instant loading screen, Add menu (links, voice notes, music, documents)

- **Loading screen:** painted straight from `index.html` with the logo, a spinner and the current step, so a reload is never blank. The saved theme is applied first (`js/boot.js`). If the vault is slow (12 s) or fails, the screen says so and offers Retry.
- **Add menu:** new + button first in the editing bar (and in Note tools). Link (clipboard prefill, web/email/phone only), Voice note (record, stop, saved to `Attachments/Voice`, embedded with a player), Music (audio files copied to `Attachments/Music`, embedded), Document (any file copied to `Attachments/Documents`, linked with `[[name]]`), plus photo, gallery, date, location and contact.
- **Resume:** also brings back the open file panel or AI chat. Position restore from V0.7.15 is unchanged.
- **Folder sync:** unchanged (Settings, Sync to folder). Attachments sync like any other file.
- Not device-tested. See `TEST-REPORT-V0.7.16.md`.

## V0.7.15 — resume, orange highlights, new-file destination, swipe panel, AI model switch

- **Resume:** note, view mode, scroll, preview scroll and caret are saved to the vault's own state (not session storage) a moment after each change and when the app is hidden, so reloads and leaving the app return you to the same spot.
- **Highlights:** back to orange. The Green highlights setting is removed; saved green choices are migrated once.
- **New files:** go to the folder you last tapped, or the new Top level row. Settings, General, New files go to offers Open note's folder or Top level. The new-file prompt shows the destination and the tapped folder shows a NEW FILES tag.
- **Double-tap:** the file panel now waits for the second tap before closing, so double-tap opens the note in Edit. Double-tap on the preview also enters Edit. Tapping the already-open note no longer reloads it.
- **Typing:** fewer page writes per key (save label, tab dot, undo buttons, keyboard layout), native thin scrollbar on the editor, watermark on its own layer, preview keeps its scroll while you type, AI input grows once per frame.
- **Swipe right** from the left edge (or a long flat swipe elsewhere) opens the file panel; swipe left closes it on phones.
- **AI panel:** provider and model pickers, key status per provider, refresh models, and a tap-through to Settings when a key is missing.
- Not device-tested. See `TEST-REPORT-V0.7.15.md`.

## V0.7.14 — reload position, double-tap editing and clearer folder copying

- Reload restoration now captures the active note, Markdown view mode, editor scroll position and selection for the current WebView session. The editor restores that position after the vault opens.
- Double-clicking or quickly double-tapping a file in the tree opens it and switches Markdown notes to Edit mode. Single taps retain the existing open/select behaviour; folders still expand/collapse.
- Folder sync settings now state plainly that syncing is copy-based and two-way: Sync now imports folder changes and then copies vault changes back. Delete mirroring remains a separate, explicit option.
- Validation: see `TEST-REPORT-V0.7.14.md`. Android WebView touch timing, SAF access and real-device reload flows still require device testing.

## V0.7.13 — attachment strip and vault loading feedback

- Attachment previews appear in the strip above the editor/input area, with image thumbnails, PDF first-page previews where PDF.js succeeds, and file-type fallback cards for other documents.
- Startup now shows a spinner and named phases for unlocking, loading the vault, and preparing the workspace; failures dismiss the spinner and show an error instead of leaving a blank loading overlay.

## V0.7.12 — multi-folder sync, refreshed launcher icon and attachment previews

- **Multiple sync folders:** Settings → Sync to folder → More folders can add multiple independent folders. Each folder has its own vault mount, sync index and status; one folder failing does not stop the others. Use each folder's own Sync button to sync only that folder. Removing a connection stops syncing but deliberately leaves existing files in both locations.
- **Launcher icon:** `tools/icons/launcher.svg` is now the canonical new icon source. `tools/icons/build_icons.sh` regenerates Android legacy/adaptive mipmaps, themed monochrome artwork, the Play Store icon and `www/img/icon.png` from that source.
- **Attachment previews:** opening an imported binary attachment shows a preview strip above the viewer. Images display an image thumbnail; PDFs render their first page with the bundled PDF.js engine; other document types show a format tile, filename and size. The preview is a visual aid, not an editable document conversion.

**Validation:** JavaScript syntax and repository logic tests are recorded in `TEST-REPORT-V0.7.12.md`. Icon assets were regenerated from the canonical SVG. Multi-folder permissions and actual SAF/provider behaviour still require device testing; no Android installation was available in this build environment.

## V0.7.11 — clipboard race safety and release verification

This maintenance release hardens recursive deletion for Android Storage Access Framework (SAF) providers and rejects parent-folder path segments. It also updates the handover so historical V0.7.0 notes cannot be mistaken for current instructions.

**Validation status:** See `TEST-REPORT-V0.7.11.md` for the exact commands and results. Clipboard clearing now refuses to clear when clipboard contents cannot be read and guards against stale asynchronous timeout callbacks. Android SAF provider behaviour and native compilation require a real Android/Gradle project and device. The current backup payload lives in WebView IndexedDB, so a native WorkManager worker cannot independently create/verify a full backup without a deliberate native data-export bridge; this release does not falsely claim background backup execution.

### V0.7.9 feature history — sync button, typing speed, grounded AI chat, Mistral, scrolling PDFs

**Status: logic tests pass (`node tests/v078-test.js`, 10 tests, plus the older suites) and the screens were driven in headless Chromium at 360 px with the network mocked. Not yet run on a phone or against the live Mistral service.**

| Change | What it does |
|--------|--------------|
| Sync button | A round Sync button sits between the vault name and the gear at the bottom of the file panel. One tap runs the full sync (folder to vault, then vault to folder) and spins while it works. With no folder linked it opens Settings, Sync to folder. If the folder needs permission again it asks first |
| Typing no longer freezes | The preview (and the html page) now waits for a short pause instead of rebuilding on every key, the word and character count is a plain scan that runs at most every 150 ms, line numbers re-measure only after a pause, and undo history is capped by size so a big note cannot eat memory |
| AI answers stay on the note | The note now travels in the system prompt on every turn (before, follow-up questions lost it, which is why answers drifted). The prompt tells the model to answer only from the note, say "That is not in the note" and never invent facts. Default creativity is now 0.3 (an old saved 0.7 moves to 0.3 once). Very long notes send 60,000 characters around the cursor and say so |
| Bigger AI chat | Full screen chat: provider switch in the header, markdown answers with copyable code blocks, Insert, Replace selection, Copy and Retry on each answer, quick actions in a scrolling strip, a chip that shows whether the selection, the whole note or nothing is sent, a box that grows as you type, and a thinking indicator |
| Mistral | Third provider beside Groq and Gemini: main key and model in Settings, AI, model picker, entry in the key vault with health, rotation and failover. Mistral keys have no prefix, so the scanner takes a 32 letter and digit token as a Mistral key only when the word Mistral is on the same line (`MISTRAL_API_KEY=...`). The app may now also connect to `api.mistral.ai` |
| PDFs | Every page sits in one column you scroll from top to bottom, each fitted to the screen width. Pages draw only near the screen and free their memory when far away. Pinch or + and - zoom, Fit resets, tap the page number to jump, Full takes the whole screen (Exit or Escape to leave) |

Known limits: Mistral and Gemini do not report their quota to the page, so their use bar shows this app's own count. PDF text selection is not drawn on the pages (use the Text button). Scanned PDFs have no text to extract.

## Core (V0.1.0)

| Module | Status |
|--------|--------|
| Vault (folders and files, stored on the device in IndexedDB) | Done |
| Tree view: new file, new folder, rename, move, delete, drag and drop | Done |
| Search by file name and text | Done |
| Tabs: multi-file, unsaved dot, restored on launch | Done |
| Markdown editor with toolbar, Split and Preview modes | Done |
| Note links with `[[Note name]]` (creates the note if missing) | Done |
| Plain text editing for `.sh`, `.csv`, `.html` and other files | Done |
| Theme: white and black, neon orange accent, blinking cursor | Done |
| Autosave | Done |

## V0.7.5 API key vault

**Status: logic tests pass (`node tests/v075-test.js`, 31 tests) and the vault was driven in headless Chrome at 360 px with the network mocked (`tests/smoke-keys.js`). Not yet run on a phone or against the live Groq and Gemini services.**

Open it from Settings, AI, Open API key vault, or the Note tools sheet (AI group).

| Module | What it does |
|--------|--------------|
| Auto-add from paste | Paste text or a whole document into the vault box: every Groq (`gsk_`) and Gemini (`AIza`) key in it is found, labelled from the line it sat on (for example `GROQ_API_KEY_2`), de-duplicated and added. Keys of other providers are counted as skipped and never stored |
| Auto-add from files | Upload txt, md, json, env, csv, html, rtf, docx, xlsx, pptx, odt, epub, pdf, zip (zips inside zips too) or any binary. Office files are opened and read paragraph by paragraph so a key split across formatting runs still reads whole. Max 25 MB per file |
| Spot keys while you write | Pasting into a note, or importing a file into the vault, offers to add any keys in it (Settings, AI: Ask me, Add automatically or Off) |
| Health | Check (list models, free) and Test (one tiny message with your model, timed) per key, plus Check all and Test all. States: Healthy with latency, Resting (rate limited, with a countdown), Rejected, Error, Paused, Not checked. New keys are checked automatically |
| Use bar | One bar per key. Groq reports its own request limit in headers, so the bar shows used against the real limit and turns red under 10 percent left. Gemini reports nothing, so its bar shows that key's share of the Gemini calls made through this app today, and says so |
| Rotation and failover | Ask AI and every other AI call use the healthy key with the fewest calls today. A rejected key (401, 403, or Gemini's 400 invalid or expired key) or a rate limited one (429) hands the call to the next key. A resting key sits out for the provider's Retry-After, else 1 minute, at most 15. Network errors and bad model names never burn through your keys |
| Housekeeping | Pause, Name and Remove per key. Up to 25 keys per provider. The main key in the AI settings box still works and is always first. Remove saved AI keys clears the vault too |

Keys stay on the phone in the app settings, unencrypted like the main key always was. They are never logged, backed up, synced or put in the diagnostics report (which shows only counts). The only network addresses are still api.groq.com and generativelanguage.googleapis.com.

Known limits: the Groq limit headers can be hidden from the page in a plain browser by CORS; the installed app uses native HTTP, so they should arrive there. A PDF that is only scanned images has no text to read. Keys typed into a note are only spotted on paste or import, not while typing character by character.

## V0.7.4 charts, csv tools, json and xml tree, xlsx dates

**Status: logic tests pass (`node tests/v074-test.js`, 49 checks) and the screens were driven in headless Chrome at phone width. Not yet run on a phone.**

| Module | What it does |
|--------|--------------|
| Charts | A Chart button in csv and xlsx. Bar, line or pie, pick the label column and the value column, first row header or data. Tap a bar, point or slice for its value. Drawn as SVG, no library. Bar and line show the first 40 rows, pie groups small slices as Other |
| csv sort | A-Z and Z-A on the column you last tapped. Numbers sort as numbers, text sorts naturally and ignores case, blanks always go last. The Header button keeps the first row on top |
| csv filter | Filter rows box hides rows that don't contain the text. On screen only, the file is not changed |
| xlsx dates | Date cells show as dates (built-in and custom formats, 1900 and 1904 systems). Tapping a date cell shows `yyyy-mm-dd`, and typing a date back keeps it a real date |
| json and xml | New Tree tab next to Text. Collapsible, opens lazily, 200 children at a time. Format, Minify (json), Validate, Expand, Collapse. Errors show the line and column |
| Safety | Format and Minify refuse a json file with a number over 15 digits, because JSON would round it. XML with text mixed between elements is written back unchanged |

Known limits: a date typed in another layout (for example `15 Mar 2023`) is saved as text, use `yyyy-mm-dd`. Expand stops after about 3000 nodes on big files. xlsx sheet tabs were already there.

Next on the list: docx mixed formatting, folder and tab colours, note icons, epub themes and bookmarks, image OCR (needs a library added to `www/vendor`).

## V0.5.0 security
PIN lock, fingerprint unlock and encryption of notes at rest. Settings > Security. Status: syntax-checked only, not run on a device.
- PIN: 4 to 12 digits, asked at start and when you return after the chosen time (default 1 minute). Five wrong PINs in a row add a wait that grows.
- Encryption: AES-256-GCM on the text and files of every vault. Names stay readable. The key is wrapped by your PIN; there is no recovery if you lose it. Use 8 or more digits.
- Fingerprint: Android Keystore key that needs a fingerprint every time (Android 10 or newer, installed app only). The PIN always works.
- Screenshots and the recent-apps preview can be blocked.
- Not covered: Sync to folder (plain copies), AI keys, settings and music.

## V0.4.0 device access, vaults and sharing

**Status: written, covered by logic tests, and loaded in a browser. Not yet run on a phone.** The first real check of the native side is the CI Gradle build, then a device install.

| Module | What it does |
|--------|--------------|
| Vault switcher | Several vaults, each with its own files, tabs and folder sync. Switch, create, rename and delete from the bottom of the file panel |
| Images | `png`, `jpg`, `jpeg`, `gif` and `webp` open in an image viewer. `![[name.jpg]]` embeds an image in a note |
| Bottom editing bar | A bar above the keyboard with undo, redo, checklist, bullet and numbered lists, heading (tap again for a smaller one), bold, italic, strikethrough, code, quote, link, note link, tag, divider, outdent, indent and photo. Scrolls sideways. The Options button opens the tools sheet. For html and csv files it shows undo, redo and indent only. Tapping Bold on text that is already bold removes it |
| Tools sheet | The ⋯ button in the title bar: Share, Insert, Plan, Media and Device groups |
| Device access | Settings, Device access: one row per permission (notifications, files, location, calendar, contacts, camera, music, battery) with live status, an Allow everything button, a keep-screen-awake toggle and a permanent notification |
| Insert into a note | Date and time, my location (with a map link), a contact, today's calendar events, a photo from the camera |
| Plan | Add a calendar event, set and manage reminders, quick note |
| Music player | Add songs or scan the Music folder, shuffle, repeat, previous and next |
| Share | Share link (the note travels inside the link after the `#`), share as a self-contained web page, share the file, share the text |
| Share viewer | A read-only page published to GitLab Pages at `/view/`. It renders what is in the link and sends nothing anywhere |
| Launcher icon | Neon orange tile with a white leaf and pen tip. Adaptive, round, legacy and themed versions |
| Native helper | `LNDevice` plugin for the screens the stock plugins can't open: battery optimiser, all files access, audio access, app settings |

### Setting up share links

1. Push to the default branch. The `pages` job publishes the viewer.
2. Open the project's Pages address in GitLab (Deploy, Pages). The viewer is that address plus `/view/`.
3. In the app, open Settings, Share, and paste it into Viewer address, including the trailing `/view/`.

Until the address is set, Share link shows a message and does nothing. Share as a web page, Share file and Share text work without it.

### Permissions

The Capacitor plugins don't declare any Android permissions, so `tools/ci-patch-manifest.sh` adds all of them to the manifest in CI. On Android 11 and newer, turn on All files access for the app in Android Settings (the Device access page opens the right screen). On Honor MagicOS also set Battery, App launch, manage manually.

## V0.3.1 vertical slides

| Change | Status |
|--------|--------|
| `.pptx` files open as one long vertical scroll of stacked slides (default). A Single / Vertical button switches back to one slide at a time, and the choice is remembered. Prev and Next scroll to the slide, the counter follows your scroll, zoom applies to every slide | Implemented, syntax-checked. Not run on a device |
| Share a link to view a document | Planned, waiting on how the link should work |

## V0.3.0 settings, AI and folder sync

Open Settings with the gear button in the title bar. Pages: General, Appearance, AI, Folder watch, Sync to folder, About. The search box at the top finds any setting.

| Module | Status |
|--------|--------|
| Settings screen with search | Implemented, syntax-checked. Not yet run on a device |
| General: autosave delay, confirm delete, markdown view, status bar, file list | Implemented, not yet run on a device |
| Appearance: theme, accent colour, interface and editor text size, editor font, line wrap, cursor blink | Implemented, not yet run on a device |
| AI: Groq and Gemini keys, model boxes, load model list, creativity, standing instructions, test connection | Request building, parsing and error handling tested in Node with a mocked network. Not tested against the live services |
| Ask AI panel (spark button): summarize, fix writing, shorter, continue, ask; insert, replace selection, copy | Implemented, not yet run on a device |
| Folder watch: imports new and edited files from the folder | Engine tested in Node against a fake folder (9 tests). Android folder access not yet tested on a device |
| Sync to folder: writes the vault to the folder, optional mirrored deletes, Sync now | Engine tested in Node against a fake folder. Android folder access not yet tested on a device |

How the folder works:

- **Android app:** the vault is mirrored to `Documents/<folder name>` (default `LimitlessNotepad`), using the Capacitor Filesystem plugin. Termux can read and write the same folder through `~/storage/shared/Documents/LimitlessNotepad` after `termux-setup-storage`.
- **Android permission:** on Android 11 and newer, turn on "All files access" for Limitless Notepad in Android Settings. Without it the app can write files but can't see files added by other apps. CI adds the permission to the manifest with `tools/ci-patch-manifest.sh`.
- **Desktop browser (Chrome or Edge):** Choose folder opens the browser's folder picker. The browser asks for access again after a restart (tap Reconnect).
- **Conflicts:** if a file changed in both the vault and the folder, the folder version wins and the vault version is kept as `name (vault copy).ext`.
- **Deletes:** deleting in the folder never deletes from the vault (the file is written back on the next sync). Deleting in the vault removes it from the folder only if "Also delete in the folder" is on.
- **Ignored:** dotfiles, files over 25 MB, and files that are neither a supported document type nor valid UTF-8 text.
- **First connect:** files that already exist on both sides with different content produce a `(vault copy)` file, so nothing is lost.

AI keys are stored on the device only (app settings in the WebView storage), are sent only to the provider you pick, and are never written to the folder or included in the project files. The app allows network access to `api.groq.com` and `generativelanguage.googleapis.com` only. Native HTTP (CapacitorHttp) is switched on in `capacitor.config.json` so the WebView's CORS rules don't block these calls.

Run the logic tests with `node tests/sync-test.js` and `node tests/share-test.js` (no install needed). CI runs both on every push.

## V0.2.0 file support

| Format | Open | Edit | Notes |
|--------|------|------|-------|
| `.md` | Preview, split | Yes | `[[links]]`, toolbar |
| `.sh` `.txt` `.json` `.js` `.css` and other text | Yes | Yes | Plain editor |
| `.csv` `.tsv` | Table | Yes | Text or Table mode, add/delete rows and columns |
| `.html` | Live preview | Yes | Preview runs with scripts off |
| `.docx` | Yes | Text, new paragraphs | Edited paragraphs lose mixed bold/italic inside that paragraph |
| `.xlsx` | Yes | Cells, formulas | Shows stored values, dates appear as serial numbers |
| `.pptx` | Yes | Text on slides | No add/delete slide, no layout editing. Theme colours are approximated |
| `.pdf` | Yes | No | Pages, zoom, Extract text to a `.txt` note |

Google Docs, Sheets and Slides: export as docx, xlsx, pptx and import them. New `.docx` and `.xlsx` files can be created from the new file button.

Import and Export buttons sit in the sidebar toolbar. Export uses a browser download, so it works in a browser now. The Android app needs the Capacitor Filesystem plugin for this, planned for V0.3.

Needs a WebView or browser from 2022 or newer (Chrome 105+).

PDF engine: `www/vendor/pdfjs` (pdf.js, Apache 2.0, licence file included).

## Roadmap

| Version | Scope |
|---------|-------|
| V0.2 | Viewers and editors: html, pdf, pptx, docx, xlsx, csv table (done) |
| V0.3 | Settings, AI keys (Groq, Gemini), folder watch, sync to folder (done; device test pending). Cloud folders move to V0.3.x |
| V0.4 | Vault switcher, images, device access, reminders, music, sharing (done; device test pending) |
| V0.4.x | Converter: md to pdf, html, docx, pptx (moved here from V0.4) |
| V0.5 | Plugin loader, manifest, plugin screen |
| V0.6 | AI panel upgrades: ask the whole vault, chat history (a basic Ask AI panel shipped in V0.3) |

## Project layout

```
limitless-notepad/
├── capacitor.config.json
├── package.json
├── .gitlab-ci.yml
├── HANDOVER.md
├── tests/ (sync-test.js, share-test.js, md-test.js, bin-test.js, v074-test.js, v075-test.js)
├── tools/
│   ├── serve.sh, ci-patch-manifest.sh, ci-add-native.sh, ci-add-icons.sh
│   ├── native/ (MainActivity.java, LNDevicePlugin.java, ic_stat_ln.xml)
│   └── icons/ (build_icons.sh, launcher.svg, res/, play-store-512.png)
├── viewer/ (index.html, viewer.js, viewer.css)   share viewer for GitLab Pages
└── www/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── icons.js   inline SVG icons (works offline)
        ├── kinds.js   file type detection
        ├── zip.js     zip reader and writer (docx, xlsx, pptx)
        ├── csv.js     csv parser and table editor (sort, filter)
        ├── chart.js   bar, line and pie charts as SVG (csv, xlsx)
        ├── datav.js   json and xml tree, format, validate
        ├── docx.js xlsx.js pptx.js pdfv.js   viewers and editors
        ├── store.js   settings (theme, open tabs, expanded folders)
        ├── md.js      markdown renderer (escapes all HTML)
        ├── vault.js   files and folders in IndexedDB
        ├── tree.js    tree view and file actions
        ├── tabs.js    tab strip
        ├── editor.js  editor, toolbar, preview, autosave
        ├── theme.js   light and dark
        ├── settings.js   settings screen and appearance
        ├── ai.js      Groq, Gemini and Mistral clients, key rotation and failover, full screen Ask AI chat
        ├── keys.js    API key vault: find keys in text and files, health, use bars
        ├── vaults.js  vault switcher
        ├── imgv.js    image viewer
        ├── native.js  Capacitor plugin bridge helpers
        ├── ui.js      sheets and forms
        ├── lock.js    PIN, fingerprint and encryption
        ├── access.js  permission registry and wake lock
        ├── notify.js  reminders, permanent notification, quick note
        ├── insert.js  location, contact, events, photo, date and time
        ├── music.js   music player
        ├── sharecodec.js share link encoder and decoder
        ├── share.js   share link, web page, file, text
        ├── tools.js   the ⋯ tools sheet
        ├── foldersync.js   sync engine (folder to vault, vault to folder)
        ├── folder.js  folder backends (Android Documents, browser picker), watch loop
        └── app.js     startup, drawer, shortcuts, toasts
```

## Run in a browser (quick check)

Run `bash tools/serve.sh` in Termux, or serve the `www` folder with any static server, then open it. IndexedDB needs `http://localhost` or `https`, not `file://`.

## Build the Android app

```bash
npm install
npx cap add android
npx cap sync android
```

Then build the APK with Android Studio (`npx cap open android`) or in CI. Termux can't run the Android build tools on a rootless device, so build in CI or on another machine.

## Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+N | New file |
| Ctrl+S | Save now |
| Ctrl+B / Ctrl+I | Bold / italic (markdown files) |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo |
| Tab | Indent two spaces |
| F2 | Rename selected item (tree focused) |
| Delete | Delete selected item (tree focused) |
| Esc | Close the file drawer |

## Notes

- Data lives on the device. Clearing app data deletes the vault. Turn on Sync to folder to keep a copy outside the app.
- A strict content security policy blocks all scripts except the app's own, and all network requests except the two AI hosts. Inline styles are allowed so the HTML preview can show styled pages. The HTML preview runs scripts only inside `www/htmlrun.html`, a sandboxed page with no access to the app and no network (Settings > Editor > Run scripts in HTML preview).
- The app uses no external fonts or CDNs, so it works offline.

## CI build (GitLab)

`.gitlab-ci.yml` has two jobs.

**build-apk** runs on every push. It installs Node 20, JDK 21 and the Android SDK, then:

1. `node --check` on every JS file and `bash -n` on every shell script
2. `node tests/sync-test.js` and `node tests/share-test.js`
3. `npm install`, then `npx cap add android`
4. `tools/ci-patch-manifest.sh` (permissions), `tools/ci-add-native.sh` (LNDevice plugin), `tools/ci-add-icons.sh` (launcher icon)
5. `npx cap sync android`, then `gradlew assembleRelease` (unsigned)

The `android/` folder is generated in CI and is git-ignored.

**sign-apk** runs on the default branch and tags. It aligns and signs the unsigned APK with `scripts/sign.sh` (zipalign, then apksigner, then a verify). Download `limitless-notepad-<version>.apk` from this job's artifacts. Add these in Settings, CI/CD, Variables (masked and protected):

| Variable | Value |
|----------|-------|
| `KEYSTORE_BASE64` | `base64 -w0 release.jks` (one line) |
| `KEYSTORE_PASSWORD` | the keystore password |
| `KEY_ALIAS` | optional, only if the keystore holds several keys |
| `KEY_PASSWORD` | optional, defaults to the keystore password |

Branch pipelines other than the default branch build the unsigned APK only. Keep the keystore backed up: a lost keystore means you can't ship updates that install over the old app.

**pages** runs on the default branch only. It publishes `viewer/` plus `md.js` and `sharecodec.js` to `public/view/` for share links.


## V0.7.1 — Converter

The Tools sheet now includes **Export / Convert**:
- **Export as PDF** renders the current Markdown note using the existing Markdown renderer and opens the platform print dialog, where Android can save it as a PDF. The bundled PDF.js files are a PDF viewer, not a PDF-generation engine.
- **Export as DOCX** creates a Word-compatible `.docx` package from the active Markdown text, preserving headings and paragraphs.
- **Export as PPTX** creates a PowerPoint `.pptx` with one slide per Markdown heading section (or a single slide when no headings exist).

Exports use the current editor contents and trigger a browser/Android download. On Android, download handling depends on the WebView and device configuration.

## Multi-folder sync and attachment preview validation

Run `node tests/multifolder-thumbnail-test.js` for source-level regression checks covering persisted extra-folder records, duplicate rejection, per-folder indexes/status, single-folder sync targeting, isolated failures, nested paths, conflict-copy handling, permission-error messaging, image/PDF/document preview wiring, stale preview URL cleanup, and the sync engine's 25 MiB file limit. Run `node tests/sync-test.js` for behavioural tests of the sync engine including nested files and conflict handling.

These automated checks do not replace Android device validation. Real Storage Access Framework (SAF) provider behaviour, revoked native permissions, browser folder-handle restoration after a cold restart, and actual PDF.js canvas rendering on target devices remain device-test items. Corrupt PDFs are expected to fall back to a PDF type tile rather than breaking the editor.
