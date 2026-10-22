(function (LN) {
  'use strict';

  var VERSION = 'V0.7.21';
  var sheet = null;
  var headTitle = null;
  var backBtn = null;
  var body = null;
  var view = 'root';
  var query = '';
  var aiNote = '';
  var modelLists = { groq: [], gemini: [], mistral: [] };

  var ACCENTS = {
    orange: ['Neon orange', '#ff6a00'],
    cyan: ['Cyan', '#00c2ff'],
    green: ['Green', '#2bd96b'],
    pink: ['Pink', '#ff3d9a'],
    yellow: ['Yellow', '#ffd60a']
  };

  // V0.7.9: font choices. Only fonts already on the phone are used (the app loads nothing from the internet).
  var FONTS = {
    mono: ['Monospace', 'var(--mono)'],
    sans: ['Sans-serif', 'var(--ui)'],
    serif: ['Serif', 'Georgia,"Noto Serif","Times New Roman",Times,serif'],
    typewriter: ['Typewriter', '"Courier New","Courier Prime",Courier,monospace'],
    condensed: ['Condensed', '"Roboto Condensed","Arial Narrow",sans-serif-condensed,sans-serif'],
    clear: ['Easy to read', 'Verdana,"Atkinson Hyperlegible","Trebuchet MS",Tahoma,sans-serif'],
    hand: ['Handwriting', '"Segoe Print","Bradley Hand","Comic Neue","Comic Sans MS",cursive'],
    system: ['Phone default', 'system-ui,sans-serif']
  };
  function fontOpts() { return Object.keys(FONTS).map(function (k) { return [k, FONTS[k][0]]; }); }
  function sizeOpts(list, def) { return list.map(function (n) { return [n, n === def ? n + ' (default)' : String(n)]; }); }
  var UI_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22];
  var ED_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 32, 36, 40];
  var PV_SIZES = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28];

  var RESET = {
    theme: 'light', accent: 'orange', fontSize: 15, editorFont: 'mono', editorSize: 14, lineWrap: true,
    cursorBlink: true, lineNumbers: false, spellcheck: false, editorLine: 1.7, uiFont: 'default', previewFont: 'auto', previewSize: 16, editorWeight: 400, editorTrack: 0, defaultExt: 'md', autosaveMs: 500, confirmDelete: true, showStatus: true, viewMode: 'edit', collapsed: false
  };

  // ---------- applying appearance ----------
  function applyAppearance() {
    var root = document.documentElement;
    var a = ACCENTS[LN.store.get('accent')] || ACCENTS.orange;
    root.style.setProperty('--accent', a[1]);
    root.style.setProperty('--fs', (Number(LN.store.get('fontSize')) || 15) + 'px');
    root.style.setProperty('--efs', (Number(LN.store.get('editorSize')) || 14) + 'px');
    var ef = FONTS[LN.store.get('editorFont')] || FONTS.mono;
    root.style.setProperty('--efont', ef[1]);
    var uf = FONTS[LN.store.get('uiFont')];
    root.style.setProperty('--ufont', uf ? uf[1] : 'var(--ui)');
    root.style.setProperty('--pfs', (Number(LN.store.get('previewSize')) || 16) + 'px');
    var pf = FONTS[LN.store.get('previewFont')] || FONTS[LN.store.get('editorFont') === 'mono' ? 'sans' : (LN.store.get('editorFont') || 'sans')] || FONTS.sans;
    root.style.setProperty('--pfont', pf[1]);
    root.style.setProperty('--ewt', String(Number(LN.store.get('editorWeight')) || 400));
    root.style.setProperty('--etrack', (Number(LN.store.get('editorTrack')) || 0) + 'em');
    root.setAttribute('data-green', 'off');
    var wm = LN.store.get('watermark');
    root.setAttribute('data-wm', wm === 'off' ? 'off' : 'leaf');
    var wop = Number(LN.store.get('watermarkOp'));
    root.style.setProperty('--wm-op', String((wop >= 3 && wop <= 30 ? wop : 12) / 100));
    root.setAttribute('data-wrap', LN.store.get('lineWrap') === false ? 'off' : 'on');
    if (LN.editprefs) LN.editprefs.refresh();
    root.setAttribute('data-cursor', LN.store.get('cursorBlink') === false ? 'off' : 'on');
    var app = document.getElementById('app');
    if (app) {
      app.classList.toggle('no-status', LN.store.get('showStatus') === false);
      app.classList.toggle('collapsed', !!LN.store.get('collapsed'));
    }
  }

  function fail(e) { LN.toast(e && e.message ? e.message : 'Something went wrong'); }

  // ---------- setting definitions ----------
  // V0.7.9: more folders (extra.js). Each one mirrors with its own folder inside the vault.
  function extraItems() {
    var X = LN.extra;
    var items = [{ type: 'head', label: 'More folders' }];
    items.push({ type: 'info', text: 'Add as many extra folders as you like. Each one is mirrored with its own folder inside the vault, named after it, and follows the same rules as the main folder (watch, sync changes, conflicts, excluded names). Remove a folder here and its files stay both in the vault and on the phone.' });
    X.list().forEach(function (r) {
      items.push({ type: 'status', label: r.label + '  →  vault folder "' + r.mount + '"', text: function () { var c = X.list().filter(function (x) { return x.id === r.id; })[0]; return c ? (c.err || c.last || 'Not synced yet') : ''; } });
      items.push({ type: 'button', label: 'Sync "' + r.label + '"', desc: '', run: function () {
        return X.syncOne(r.id).then(function (o) { var message = o.failed.length ? o.failed.join('; ') : (o.done ? 'Synced ' + r.label : 'Nothing synced'); LN.toast(message); LN.tree.render(); show(view, true); });
      } });
      items.push({ type: 'button', label: 'Rename vault folder "' + r.mount + '"', desc: 'Only changes the name inside the vault.', run: function () {
        var n = window.prompt('Vault folder name', r.mount);
        if (!n || !n.trim()) return null;
        return X.rename(r.id, n.trim()).then(function () { show(view, true); });
      } });
      items.push({ type: 'button', label: 'Remove "' + r.label + '"', desc: '', run: function () {
        if (!window.confirm('Stop syncing "' + r.label + '"? Files stay in the vault and in the folder.')) return null;
        X.remove(r.id);
        LN.folder.startWatch();
        LN.toast('Removed');
        show(view, true);
        return null;
      } });
    });
    var kind = LN.folder.available();
    var done = function (r) { LN.toast('Added "' + r.label + '". Tap Sync now.'); LN.folder.startWatch(); show(view, true); };
    var quiet = function (e) { if (e && e.message === 'No folder picked') return null; throw e; };
    if (kind === 'cap' && LN.folder.pickAvailable()) {
      items.push({ type: 'button', label: 'Add a folder', desc: 'Pick any folder with the Android folder picker: Documents, Downloads, an SD card, Termux shared storage or any other.', run: function () { return X.addPicked().then(done).catch(quiet); } });
    }
    if (kind === 'cap') {
      items.push({ type: 'button', label: 'Add a folder inside Documents by name', desc: 'Type a name; the folder is created in Documents if it is missing.', run: function () {
        var n = window.prompt('Folder name inside Documents');
        if (!n || !n.trim()) return null;
        return X.addNamed(n.trim()).then(done);
      } });
    } else if (kind === 'fsa') {
      items.push({ type: 'button', label: 'Add a folder', desc: 'Pick a folder on this computer.', run: function () { return X.addBrowser().then(done).catch(function (e) { if (e && e.name === 'AbortError') return null; throw e; }); } });
    }
    return items;
  }

  function folderItems() {
    var kind = LN.folder.available();
    var items = [];
    items.push({ type: 'status', label: 'Folder', text: function () { return LN.folder.status() || 'No folder chosen'; } });
    if (!kind) {
      items.push({ type: 'info', text: 'This device can\'t open folders from inside the app. In a desktop browser, use Chrome or Edge. On Android, use the installed app.' });
      return items;
    }
    if (kind === 'cap') {
      items.push({
        type: 'text', key: 'capFolder', label: 'Folder name inside Documents',
        desc: 'The app mirrors your vault into Documents/<this name>. Change it before you connect.',
        placeholder: 'LimitlessNotepad',
        after: function () {
          if (!LN.folder.connected() || LN.store.get('folderMode') !== 'cap') return;
          LN.folder.disconnect();
          LN.toast('Folder name changed. Connect again to use it.');
          show(view, true);
        }
      });
    }
    if (LN.folder.needsPermission()) {
      items.push({ type: 'button', label: 'Reconnect folder', desc: 'The browser asks again after a restart.', run: function () { return LN.folder.reconnect().then(function (n) { LN.toast('Connected: ' + n); }); } });
    }
    items.push({
      type: 'button',
      label: LN.folder.connected() ? 'Change folder' : (kind === 'cap' ? 'Connect Documents folder' : 'Choose folder'),
      desc: kind === 'cap' ? 'Creates the folder if it is missing.' : 'Pick a folder on this computer.',
      run: function () {
        return LN.folder.choose().then(function (n) { LN.toast('Connected: ' + n); });
      }
    });
    if (kind === 'cap' && LN.folder.pickAvailable()) {
      items.push({
        type: 'button',
        label: 'Pick any folder',
        desc: 'Choose where the vault syncs with the Android folder picker: Documents, Downloads, an SD card, Termux shared storage or any other folder. The app keeps access after a restart.',
        run: function () {
          return LN.folder.choosePicked().then(function (n) { LN.toast('Connected: ' + n); show(view, true); }).catch(function (e) {
            if (e && e.message === 'No folder picked') return null;
            throw e;
          });
        }
      });
    }
    if (kind === 'cap') {
      items.push({
        type: 'info',
        text: 'Android 11 and newer only let an app read files that other apps put in Documents when "All files access" is on. Turn it on in Android Settings, Apps, Limitless Notepad, Permissions (or Special app access). Without it, the app can still write its own files, but Folder watch won\'t see files you add from Termux or a file manager.'
      });
    }
    return items;
  }

  // ---------- Conflict copies (V0.7.0 WIP9) ----------
  var COPY_RE = /\((vault|folder|backup) copy\)/i;
  function showConflictCopies() {
    var s = LN.ui.sheet('Conflict copies');
    function draw() {
      s.body.textContent = '';
      var list = LN.vault.all().filter(function (n) { return n.type === 'file' && COPY_RE.test(n.name); });
      if (!list.length) { s.body.appendChild(el('p', 'sub', 'No conflict copies. Nothing is waiting for you.')); return; }
      s.body.appendChild(el('p', 'sub', list.length + (list.length === 1 ? ' copy' : ' copies') + '. Compare each with the note it belongs to, then delete the one you do not need. Deleted copies go to the Recycle bin.'));
      list.sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (n) {
        var row = el('div', 'set-row');
        var lab = el('div', 'set-info');
        lab.appendChild(el('div', 'set-label', n.name));
        lab.appendChild(el('div', 'set-desc', LN.vault.path(n.id)));
        row.appendChild(lab);
        var open = el('button', 'btn', 'Open');
        open.type = 'button';
        open.addEventListener('click', function () { s.close(); close(); LN.tabs.open(n.id); LN.tree.select(n.id, true); });
        var del = el('button', 'btn', 'Delete');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!window.confirm('Delete "' + n.name + '"?')) return;
          LN.bin.discard(n).then(function () { LN.tree.render(); LN.tabs.render(); draw(); }, fail);
        });
        row.appendChild(open);
        row.appendChild(del);
        s.body.appendChild(row);
      });
    }
    draw();
  }

  // ---------- Editor page (V0.7.0 WIP8) ----------
  var edPrev = null;
  function updEdPrev() {
    if (edPrev) edPrev.setAttribute('data-nums', LN.store.get('lineNumbers') ? 'on' : 'off');
  }
  function edAfter() { applyAppearance(); updEdPrev(); }
  function editorPreview() {
    var box = el('div', 'ed-prev');
    var nums = el('div', 'ed-prev-nums', '1\n2\n3');
    nums.setAttribute('aria-hidden', 'true');
    var txt = el('div', 'ed-prev-text', '# Preview\nThe quick brown fox jumps\nChange a setting to see it');
    box.appendChild(nums);
    box.appendChild(txt);
    edPrev = box;
    updEdPrev();
    return box;
  }
  function editorItems() {
    return [
      { type: 'custom', label: 'Editor preview', build: editorPreview },
      { type: 'select', key: 'editorFont', label: 'Editor font', desc: 'Monospace lines up code and tables. The others read better for prose. Only fonts already on the phone are used; if one looks the same as another, your phone does not have it.', options: fontOpts(), after: edAfter },
      { type: 'select', key: 'editorSize', num: true, label: 'Editor text size', desc: '10 to 40.', options: sizeOpts(ED_SIZES, 14), after: edAfter },
      { type: 'select', key: 'editorWeight', num: true, label: 'Editor text weight', desc: 'Thin text is hard to read in sunlight.', options: [[300, 'Light'], [400, 'Normal (default)'], [500, 'Medium'], [700, 'Bold']], after: edAfter },
      { type: 'select', key: 'editorTrack', num: true, label: 'Letter spacing', desc: 'Space between letters.', options: [[0, 'Normal (default)'], [0.02, 'Slightly wide'], [0.05, 'Wide'], [0.1, 'Extra wide']], after: edAfter },
      { type: 'select', key: 'previewFont', label: 'Preview font', desc: 'The rendered note in Preview and Split. Auto follows the editor font (monospace shows as sans-serif).', options: [['auto', 'Auto']].concat(fontOpts()), after: edAfter },
      { type: 'select', key: 'previewSize', num: true, label: 'Preview text size', desc: 'The rendered note in Preview and Split.', options: sizeOpts(PV_SIZES, 16), after: edAfter },
      { type: 'select', key: 'editorLine', num: true, label: 'Line spacing', desc: 'Space between lines of text.', options: [[1.4, 'Tight (1.4)'], [1.5, 'Snug (1.5)'], [1.7, 'Normal (1.7)'], [1.9, 'Roomy (1.9)'], [2.1, 'Wide (2.1)']], after: edAfter },
      { type: 'toggle', key: 'lineWrap', label: 'Wrap long lines', desc: 'Off keeps each line on one row and scrolls sideways.', after: edAfter },
      { type: 'toggle', key: 'lineNumbers', label: 'Line numbers', desc: 'Shows a number beside each line. Wrapped rows stay blank. Turns itself off for files over 20,000 lines.', after: edAfter },
      { type: 'toggle', key: 'spellcheck', label: 'Spellcheck and autocorrect', desc: 'Uses your keyboard\'s own dictionary. Off is better for code.', after: edAfter },
      { type: 'select', key: 'watermark', label: 'Watermark', desc: 'A faint leaf behind the blank screen, the editor and the preview.', options: [['leaf', 'Leaf'], ['off', 'Off']], after: edAfter },
      { type: 'select', key: 'watermarkOp', num: true, label: 'Watermark strength', desc: 'How visible the watermark is.', options: [[6, 'Faint (6%)'], [12, 'Normal (12%)'], [18, 'Clear (18%)'], [26, 'Strong (26%)']], after: edAfter },
      { type: 'toggle', key: 'htmlScripts', label: 'Run scripts in HTML preview', desc: 'Lets JavaScript in an .html note run so buttons and tabs work. The page is isolated: it cannot see your notes or settings and cannot use the network. Off shows the page without scripts.' },
      { type: 'select', key: 'newDest', label: 'New files go to', desc: 'Folder you tapped: the last folder you tapped in the file panel (or Top level). Open note\'s folder: next to the note you are reading. Top level: always the root of the vault. The new file prompt always shows where it will land.', options: [['tapped', 'Folder you tapped'], ['current', 'Open note\'s folder'], ['top', 'Top level']] },
      { type: 'select', key: 'defaultExt', label: 'Default file type', desc: 'Added to a new file name when you type none.', options: [['md', 'Markdown (.md)'], ['txt', 'Plain text (.txt)'], ['html', 'HTML (.html)'], ['csv', 'CSV (.csv)'], ['sh', 'Shell script (.sh)'], ['json', 'JSON (.json)']] }
    ];
  }

  function securityItems() {
    var L = LN.lock;
    var has = L.hasPin();
    var items = [
      { type: 'status', label: 'Protection', text: function () { return L.summary(); } }
    ];
    if (!has) {
      items.push({ type: 'button', label: 'Set PIN', desc: '4 to 12 digits. The app asks for it when it starts and when you come back to it.', run: function () { return L.setPinFlow(); } });
    } else {
      items.push({ type: 'button', label: 'Change PIN', desc: 'Notes stay as they are; only the PIN changes.', run: function () { return L.changePinFlow(); } });
      items.push({ type: 'select', key: 'lockAuto', num: true, label: 'Lock after leaving the app', desc: 'Immediately also locks when you return from the camera, file picker or a permission screen.', options: [[0, 'Immediately'], [30000, '30 seconds'], [60000, '1 minute (default)'], [300000, '5 minutes'], [900000, '15 minutes'], [-1, 'Only when the app restarts']] });
      items.push({ type: 'toggle', key: 'lockBg', label: 'Lock as soon as the app goes to the background', desc: 'Overrides the time above. Also locks when you return from the camera or file picker.' });
      items.push({ type: 'select', key: 'lockIdle', num: true, label: 'Lock after no use', desc: 'Locks while the app is open but you have not touched it.', options: [[0, 'Off'], [60000, '1 minute'], [300000, '5 minutes'], [900000, '15 minutes'], [1800000, '30 minutes']] });
      items.push({ type: 'button', label: 'Lock now', desc: '', run: function () { return L.lockNow(); } });
      items.push({ type: 'button', label: L.bioOn() ? 'Turn off fingerprint' : 'Turn on fingerprint', desc: 'Opens the app with your fingerprint. The PIN always works too. Needs the installed Android app and a fingerprint set up in Android.', run: function () { return L.setBiometric(!L.bioOn()); } });
      items.push({ type: 'button', label: L.encOn() ? 'Turn off encryption' : 'Turn on encryption', desc: 'Encrypts the text and files of every vault on this device (AES-256). File and folder names stay readable. There is no recovery if the PIN is lost.', run: function () { return L.setEncryption(!L.encOn()); } });
      items.push({ type: 'toggle', key: 'lockSecure', label: 'Hide the app in recent apps and block screenshots', desc: '', after: function () { L.applySecure(); } });
      items.push({ type: 'toggle', key: 'exportWarn', label: 'Warn before sending a note out', desc: 'Backups, exports and sharing leave the app as plain, readable files. This asks first.' });
      items.push({ type: 'button', label: 'Remove PIN', desc: 'Turns off the lock, fingerprint and encryption.', run: function () { return L.removePinFlow(); } });
    }
    items.push({ type: 'select', key: 'clipClear', num: true, label: 'Clear copied text', desc: 'Empties the clipboard after you copy from the app, but only if it still holds what the app copied.', options: [[0, 'Off'], [30, 'After 30 seconds'], [60, 'After 1 minute'], [120, 'After 2 minutes']] });
    items.push({ type: 'info', text: 'Clearing the clipboard can fail while the app is in the background, because Android does not let it touch the clipboard then. It is best effort.' });
    items.push({ type: 'info', text: 'Not covered: Sync to folder writes readable copies into the folder you pick, and AI keys, settings and music are stored unencrypted. Turn folder sync off if the notes are sensitive.' });
    return items;
  }


  // ---------- About and Privacy pages (V0.6.1) ----------
  var LINKS = [
    ['GitHub', 'github.com/philfesters', 'https://github.com/philfesters', 'GitHub'],
    ['GitLab', 'gitlab.com/grantboy.festers089', 'https://gitlab.com/grantboy.festers089', 'GitLab'],
    ['Project Portal', 'philfesters.github.io', 'https://philfesters.github.io/Grant-Fezzy-Portal-Atake', 'Portal'],
    ['SoundCloud', 'hiphopfezzy', 'https://soundcloud.com/hiphopfezzy', 'Music'],
    ['Audiomack', 'f3zzy', 'https://audiomack.com/f3zzy', 'Music']
  ];

  var FEATURES = [
    ['Markdown editor', 'Edit, split and preview, with a full formatting bar, tables, checklists and note links'],
    ['Open anything', 'View and edit PDF, DOCX, XLSX, PPTX, CSV, HTML and images inside your vault'],
    ['AI assistant', 'Ask, rewrite and continue with Groq, Gemini or Mistral, with chat memory for each note and a vault for many API keys'],
    ['Folder sync and watch', 'Mirror your vault to a folder and import files dropped in by Termux or a file manager'],
    ['Security', 'PIN, fingerprint and AES-256 encryption of notes at rest'],
    ['Device tools', 'Reminders, calendar, location, contacts, camera, music player and sharing']
  ];

  function chip(text, cls) { return el('span', 'about-chip' + (cls ? ' ' + cls : ''), text); }

  function aboutHero() {
    var box = el('div', 'about');

    var hero = el('div', 'about-hero');
    var img = document.createElement('img');
    img.className = 'about-icon';
    img.src = 'img/icon.png';
    img.alt = 'Limitless Notepad icon';
    img.width = 96;
    img.height = 96;
    hero.appendChild(img);
    var word = el('div', 'about-word');
    word.appendChild(el('span', 'about-word-text', 'LIMITLESS NOTEPAD'));
    word.appendChild(el('span', 'cursor'));
    hero.appendChild(word);
    hero.appendChild(el('div', 'about-soi', 'Strategy Over Impulse'));
    hero.appendChild(el('div', 'about-tag', 'Write without limits. Your vault stays on your device.'));
    var chips = el('div', 'about-chips center');
    chips.appendChild(chip(VERSION, 'accent'));
    chips.appendChild(chip('Offline first'));
    chips.appendChild(chip('Private by default'));
    chips.appendChild(chip('Android'));
    hero.appendChild(chips);
    box.appendChild(hero);

    box.appendChild(el('div', 'about-h', 'About the app'));
    box.appendChild(el('p', 'about-p',
      'Limitless Notepad is a notes app built for people who live in the terminal and on their phone. It keeps everything in a local vault of files and folders, opens real documents instead of only plain text, and puts an AI assistant one tap away while you write.'));
    var feats = el('div', 'about-feats');
    FEATURES.forEach(function (f) {
      var r = el('div', 'about-feat');
      r.appendChild(el('div', 'about-feat-t', f[0]));
      r.appendChild(el('div', 'about-feat-d', f[1]));
      feats.appendChild(r);
    });
    box.appendChild(feats);

    box.appendChild(el('div', 'about-h', 'The builder'));
    var me = el('div', 'about-me');
    me.appendChild(el('div', 'about-name', 'Grant “Fezzy” Festers'));
    me.appendChild(el('div', 'about-role', 'Independent Developer · Security Tool Builder · Mobile-First Systems Architect'));
    var tags = el('div', 'about-chips');
    ['Ethical Hacker', 'Developer', 'Self-Taught'].forEach(function (t) { tags.appendChild(chip(t, 'accent')); });
    me.appendChild(tags);
    me.appendChild(el('div', 'about-loc', 'Cape Town, South Africa'));
    me.appendChild(el('p', 'about-p',
      'Self-taught, no team and no bootcamp. I build practical software, security utilities and modular digital systems with an Android-first workflow: Termux, rootless Android tooling, GitHub, GitLab and AI-assisted development.'));
    me.appendChild(el('p', 'about-p',
      'The philosophy is S.O.I., Strategy Over Impulse: think before moving, then build with intention. It is on the home screen, in the footer and here, and Bojack keeps watch over all of it.'));
    box.appendChild(me);

    box.appendChild(el('div', 'about-h', 'Find me'));
    var links = el('div', 'about-links');
    LINKS.forEach(function (l) {
      var a = document.createElement('a');
      a.className = 'about-link';
      a.href = l[2];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var ic = el('span', 'set-ico');
      ic.innerHTML = LN.icon('link', 18);
      a.appendChild(ic);
      var t = el('span', 'about-link-t');
      t.appendChild(el('span', 'about-link-n', l[0]));
      t.appendChild(el('span', 'about-link-u', l[1]));
      a.appendChild(t);
      var ch = el('span', 'set-chev');
      ch.innerHTML = LN.icon('chevron', 16);
      a.appendChild(ch);
      links.appendChild(a);
    });
    box.appendChild(links);

    box.appendChild(el('div', 'about-foot', 'Strategy Over Impulse. 999.'));
    box.appendChild(el('div', 'about-foot sub', 'Made in Cape Town. LIMITLESS NOTEPAD ' + VERSION));
    return box;
  }

  function privacyCard() {
    var box = el('div', 'about');
    var hero = el('div', 'about-hero compact');
    var ic = el('div', 'priv-ico');
    ic.innerHTML = LN.icon('shield', 34);
    hero.appendChild(ic);
    hero.appendChild(el('div', 'about-word-text', 'Your notes stay yours'));
    hero.appendChild(el('div', 'about-tag', 'No account. No ads. No analytics. No trackers. Nothing is sent anywhere unless you choose to send it.'));
    box.appendChild(hero);
    return box;
  }

  function privacyBlock(title, lines) {
    var box = el('div', 'about priv-block');
    box.appendChild(el('div', 'about-h', title));
    lines.forEach(function (l) {
      var r = el('div', 'priv-line');
      r.appendChild(el('span', 'priv-dot'));
      r.appendChild(el('span', 'priv-text', l));
      box.appendChild(r);
    });
    return box;
  }

  function privacyItems() {
    return [
      { type: 'custom', label: 'Privacy summary', build: privacyCard },
      { type: 'custom', label: 'What stays on your device', build: function () {
        return privacyBlock('What stays on your device', [
          'Your notes, folders and files are stored in a vault inside the app on this phone.',
          'Settings, AI keys (including everything in the API key vault), reminders and the music list are stored on this phone too.',
          'There are no accounts, no sign-in, no ads, no analytics and no tracking. The app is only allowed to connect to three addresses: api.groq.com, generativelanguage.googleapis.com and api.mistral.ai, and only for the AI feature.'
        ]);
      } },
      { type: 'custom', label: 'What leaves your device', build: function () {
        return privacyBlock('What leaves your device, only when you do it', [
          'Ask AI: the question, the selected text or the whole note, and the last 20 messages of that note’s chat go to the provider you picked (Groq, Gemini or Mistral) using your own key. Their privacy policies apply from there. Nothing else is sent.',
          'API key vault: Check and Test send a key to its own provider and nowhere else. Finding keys in pasted text or files happens on the phone and sends nothing.',
          'Share link: the whole note is put inside the link itself. It goes wherever you send that link.',
          'Share file and Share text: go through the Android share sheet to the app you choose.',
          'Sync to folder: writes readable copies of your notes into the Documents folder you pick. Other apps with file access can read them.',
          'My location: only adds a map link as text. It opens a map only if you tap it.'
        ]);
      } },
      { type: 'custom', label: 'Permissions', build: function () {
        return privacyBlock('Permissions', [
          'Android asks when you tap the feature: location, contacts, microphone, calendar, camera, photos, notifications, music files and files access. On first start the app also offers photo and camera access once, and you can say Not now.',
          'Photos are only read when you pick one to add to a note. They are never uploaded, except text you send to AI.',
          'You can see and change each one in Device access. Denying one only switches that feature off.'
        ]);
      } },
      { type: 'custom', label: 'Not protected', build: function () {
        return privacyBlock('Not protected, so you know', [
          'AI keys (main key and key vault), settings and the music list are stored unencrypted on the phone.',
          'Folder sync copies are plain files, even when encryption is on.',
          'Clearing the app’s data deletes the vault. If the PIN is lost with encryption on, the notes cannot be recovered.',
          'AI chats are kept in memory only and disappear when the app closes.'
        ]);
      } },
      { type: 'head', label: 'Your controls' },
      { type: 'toggle', key: 'aiConfirm', label: 'Ask before sending to AI', desc: 'Shows how many characters will leave the device and waits for a yes.' },
      { type: 'button', label: 'Clear AI chats', desc: 'Forget every AI conversation held in memory right now.', run: function () { LN.ai.clearChats(); LN.toast('AI chats cleared'); return null; } },
      { type: 'button', label: 'Remove saved AI keys', desc: 'Deletes every Groq, Gemini and Mistral key from this phone, including the API key vault and its stats.', run: function () {
        if (!LN.keys.count('groq') && !LN.keys.count('gemini') && !LN.keys.count('mistral')) { LN.toast('No keys are saved'); return null; }
        if (!window.confirm('Delete every saved Groq, Gemini and Mistral API key from this device, including the key vault?')) return null;
        LN.keys.clearAll();
        LN.toast('AI keys removed');
        return null;
      } },
      { type: 'button', label: 'PIN, fingerprint and encryption', desc: 'Lock the app and encrypt your notes.', run: function () { show('security'); return null; } },
      { type: 'button', label: 'Device access', desc: 'Review what the app may use on this phone.', run: function () { show('device'); return null; } },
      { type: 'info', text: 'Privacy page last updated 18 October 2026, for ' + VERSION + '.' }
    ];
  }

  // ---------- Backup and Diagnostics pages (V0.7.0) ----------
  var storageNote = '';

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error('Copy is not available here'));
    });
  }

  function backupItems() {
    var B = LN.backup;
    return [
      { type: 'button', label: 'Back up now', desc: 'Saves every vault as one .zip. On Android it goes to Documents/LimitlessNotepad-Backups; in a browser it downloads. A copy is also kept inside the app.', run: function () {
        return B.manual().then(function (r) { if (r) LN.toast('Backed up: ' + r.files + ' files'); });
      } },
      { type: 'status', label: 'Last backup', text: function () {
        var t = Number(LN.store.get('lastBackup')) || 0;
        return t ? LN.diag.stamp(t).slice(0, 16) + ' · ' + (LN.store.get('lastBackupNote') || '') : 'Never';
      } },
      { type: 'status', label: 'Last error', text: function () { return LN.store.get('lastBackupError') || 'None'; } },
      { type: 'select', key: 'backupAuto', label: 'Automatic backup', desc: B.nextText() + '. Background execution requires the native WorkManager integration; this build does not claim that integration is verified.', options: [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']], after: function () { show('backup', true); } },
      { type: 'select', key: 'backupKeep', num: true, label: 'Backups to keep', desc: 'Older ones are deleted, inside the app and in Documents.', options: [[1, '1'], [3, '3'], [5, '5 (default)'], [10, '10'], [20, '20']] },
      { type: 'button', label: 'Restore from a backup file', desc: 'Pick a backup .zip. You see what will change before anything does, and a safety copy is made first.', run: function () { return B.restoreFile(); } },
      { type: 'button', label: 'Restore from a backup kept in the app', desc: 'Lists the copies stored inside the app, including safety copies made before a restore.', run: function () { return B.pickInternal(); } },
      { type: 'info', text: 'Backups are plain zip files so they open anywhere. They are not encrypted, even when the PIN and encryption are on. A restore never overwrites a note that is newer than the backup: the backup version is added next to it as \"name (backup copy)\".' }
    ];
  }

  function showLog() {
    var s = LN.ui.sheet('Log');
    var pre = el('pre', 'diag-log', LN.log.text() || 'The log is empty.');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:12px;margin:0;user-select:text';
    s.body.appendChild(pre);
  }

  function deleteEverything() {
    if (!window.confirm('Delete ALL data on this device? Every vault, backup kept in the app, music list, setting, PIN and key. Files already in Documents or a synced folder stay.')) return Promise.resolve();
    var step = window.confirm('Save a backup first?\n\nOK = back up now, then continue.\nCancel = skip the backup.') ?
      LN.backup.manual().then(function (r) { return !!r; }) : Promise.resolve(true);
    return step.then(function (go) {
      if (!go) { LN.toast('Nothing was deleted'); return null; }
      return LN.ui.form({
        title: 'Delete all my data', ok: 'Delete everything',
        note: 'This cannot be undone. Type DELETE to confirm.',
        fields: [{ key: 'word', label: 'Type DELETE', required: true, placeholder: 'DELETE' }],
        validate: function (v) { return v.word === 'DELETE' ? '' : 'Type DELETE in capital letters.'; }
      }).then(function (r) {
        if (!r) { LN.toast('Nothing was deleted'); return null; }
        LN.wiping = true;
        return LN.diag.deleteAllData().then(function () { window.location.reload(); }, function (e) { LN.wiping = false; throw e; });
      });
    });
  }

  function diagItems() {
    return [
      { type: 'status', label: 'Version', text: function () { return VERSION; } },
      { type: 'status', label: 'Storage', text: function () { return storageNote || 'Checking…'; } },
      { type: 'head', label: 'Permissions' }
    ].concat(LN.access.defs.map(function (d) { return { type: 'perm', id: d.id, label: d.label, desc: d.desc }; })).concat([
      { type: 'head', label: 'Log' },
      { type: 'button', label: 'View log', desc: 'The last 300 events kept on this phone. Keys and notes are never written to it.', run: function () { showLog(); return null; } },
      { type: 'button', label: 'Copy log', desc: '', run: function () { return copyText(LN.log.text() || '(empty)').then(function () { LN.toast('Log copied'); }); } },
      { type: 'button', label: 'Clear log', desc: '', run: function () { LN.log.clear(); LN.toast('Log cleared'); return null; } },
      { type: 'button', label: 'Copy full report', desc: 'Version, platform, storage, protection, last backup and sync, permissions, safe settings and the recent log. No notes, keys or PIN.', run: function () {
        return LN.diag.report().then(copyText).then(function () { LN.toast('Report copied'); });
      } },
      { type: 'head', label: 'Reset' },
      { type: 'button', label: 'Reset settings', desc: 'Puts every setting back to its default. Notes, vaults, AI keys, music list, reminders, PIN and encryption stay.', run: function () {
        if (!window.confirm('Reset all settings to their defaults? Your notes are not touched.')) return null;
        return LN.diag.resetSettings().then(function () { LN.theme.apply(LN.store.get('theme')); applyAppearance(); LN.toast('Settings reset'); });
      } },
      { type: 'button', label: 'Delete all my data', desc: 'Erases every vault and everything the app stores on this device. Asks for a backup first.', run: deleteEverything }
    ]);
  }

  function pages() {
    return [
      {
        id: 'general', label: 'General', icon: 'sliders', items: [
          { type: 'toggle', key: 'collapsed', invert: true, label: 'Show the file list on wide screens', desc: 'On a phone the list always opens from the menu button.', after: applyAppearance },
          { type: 'toggle', key: 'confirmDelete', label: 'Ask before deleting', desc: 'Show a confirmation when you delete a file or folder. With the Recycle bin on, it asks to move it there.' },
          { type: 'select', key: 'autosaveMs', num: true, label: 'Autosave delay', desc: 'How long after you stop typing the note is saved.', options: [[300, '0.3 seconds'], [500, '0.5 seconds'], [1000, '1 second'], [2000, '2 seconds']] },
          { type: 'select', key: 'viewMode', label: 'Markdown view', desc: 'What markdown files show when you open them.', options: [['edit', 'Edit'], ['split', 'Split'], ['preview', 'Preview']] },
          { type: 'toggle', key: 'showStatus', label: 'Show the status bar', desc: 'File path, word count and save state at the bottom.', after: applyAppearance },
          { type: 'status', label: 'Vault', text: function () {
            var all = LN.vault.all();
            var f = all.filter(function (n) { return n.type === 'file'; }).length;
            return f + ' files, ' + (all.length - f) + ' folders';
          } },
          { type: 'button', label: 'Reset general and appearance', desc: 'Your files, API keys and folder settings stay as they are.', run: function () {
            if (!window.confirm('Reset general and appearance settings to the defaults?')) return null;
            Object.keys(RESET).forEach(function (k) { LN.store.set(k, RESET[k]); });
            LN.theme.apply('light');
            applyAppearance();
            LN.toast('Settings reset');
            return null;
          } }
        ]
      },
      {
        id: 'appearance', label: 'Appearance', icon: 'palette', items: [
          { type: 'select', key: 'theme', label: 'Theme', desc: 'Light or dark.', options: [['light', 'Light'], ['dark', 'Dark']], after: function (v) { LN.theme.apply(v); } },
          { type: 'select', key: 'accent', label: 'Accent colour', desc: 'Used for selection, tabs and the cursor.', options: Object.keys(ACCENTS).map(function (k) { return [k, ACCENTS[k][0]]; }), after: applyAppearance },
          { type: 'select', key: 'fontSize', num: true, label: 'Interface text size', desc: 'Menus, file list and tabs.', options: sizeOpts(UI_SIZES, 15), after: applyAppearance },
          { type: 'select', key: 'uiFont', label: 'Interface font', desc: 'Menus, file list and tabs. These are fonts already on your phone.', options: [['default', 'Default']].concat(fontOpts()), after: applyAppearance },
          { type: 'toggle', key: 'cursorBlink', label: 'Blinking cursor in the title bar', desc: '', after: applyAppearance },
          { type: 'info', text: 'Editor font, size, spacing, line numbers and spellcheck are on the Editor page.' }
        ]
      },
      { id: 'editor', label: 'Editor', icon: 'code', items: editorItems() },
      {
        id: 'ai', label: 'AI', icon: 'spark', items: [
          { type: 'select', key: 'aiProvider', label: 'Provider', desc: 'Used by the AI button in the title bar.', options: [['groq', 'Groq'], ['gemini', 'Gemini'], ['mistral', 'Mistral']] },
          { type: 'info', text: 'Keys are stored on this device only and are sent only to the provider you pick. They are never included in exports, folder sync or the project files.' },
          { type: 'text', key: 'groqKey', secret: true, label: 'Groq API key (main)', desc: 'Create one in the Groq console. Add more keys in the API key vault below.', placeholder: 'gsk_…', after: function () { return LN.keys.checkNew(); } },
          { type: 'text', key: 'groqModel', label: 'Groq model', desc: 'Type a model name, or tap the button below to pick from the full list.', placeholder: 'llama-3.3-70b-versatile' },
          { type: 'button', label: 'Choose Groq model', desc: 'Loads every model your key can use. Free ones are listed first, and you can test which ones answer.', run: function () { openModelPicker('groq'); return null; } },
          { type: 'text', key: 'geminiKey', secret: true, label: 'Gemini API key (main)', desc: 'Create one in Google AI Studio. Starts with AIza or AQ. Add more keys in the API key vault below.', placeholder: 'AIza… or AQ.…', after: function () { return LN.keys.checkNew(); } },
          { type: 'text', key: 'geminiModel', label: 'Gemini model', desc: 'Type a model name, or tap the button below to pick from the full list.', placeholder: 'gemini-flash-latest' },
          { type: 'button', label: 'Choose Gemini model', desc: 'Loads every model your key can use. Free ones are listed first, and you can test which ones answer.', run: function () { openModelPicker('gemini'); return null; } },
          { type: 'text', key: 'mistralKey', secret: true, label: 'Mistral API key (main)', desc: 'Create one in the Mistral console (La Plateforme). 32 letters and digits, no prefix. Add more keys in the API key vault below.', placeholder: 'Mistral key', after: function () { return LN.keys.checkNew(); } },
          { type: 'text', key: 'mistralModel', label: 'Mistral model', desc: 'Type a model name, or tap the button below to pick from the full list.', placeholder: 'mistral-small-latest' },
          { type: 'button', label: 'Choose Mistral model', desc: 'Loads every model your key can use and lets you test which ones answer.', run: function () { openModelPicker('mistral'); return null; } },
          { type: 'head', label: 'API key vault' },
          { type: 'status', label: 'Keys saved', text: function () { return LN.keys.summary(); } },
          { type: 'button', label: 'Open API key vault', desc: 'Paste text or upload files and every Groq, Gemini and Mistral key in them is added. See each key\'s health, test it and watch its use. Calls rotate across healthy keys.', run: function () { LN.keys.openVault(); return null; } },
          { type: 'select', key: 'aiKeyWatch', label: 'Spot keys in pasted text and imported files', desc: 'When a note you paste into, or a file you import, contains API keys.', options: [['ask', 'Ask me (default)'], ['auto', 'Add them automatically'], ['off', 'Off']] },
          { type: 'select', key: 'aiTemp', num: true, label: 'Creativity', desc: 'Lower is more literal, higher is looser.', options: [[0, '0 (precise)'], [0.3, '0.3 (default)'], [0.7, '0.7'], [1, '1 (loose)']] },
          { type: 'textarea', key: 'aiSystem', label: 'Standing instructions', desc: 'Added to every request, for example "Reply in plain English. Keep markdown formatting."', placeholder: 'Optional' },
          { type: 'button', label: 'Test connection', desc: 'Sends one short message to the selected provider, using the same key rotation as Ask AI.', run: function () {
            var id = LN.ai.providers[LN.store.get('aiProvider')] ? LN.store.get('aiProvider') : 'groq';
            aiNote = 'Testing ' + id + '…';
            refreshStatus();
            return LN.ai.test(id).then(function (r) {
              aiNote = LN.ai.providers[id].label + ' answered in ' + r.ms + ' ms.';
              LN.toast(aiNote);
            }).catch(function (e) { aiNote = e.message; throw e; });
          } },
          { type: 'status', label: 'Last test', text: function () { return aiNote || 'Not tested yet'; } }
        ]
      },
      {
        id: 'watch', label: 'Folder watch', icon: 'eye', items: folderItems().concat([
          { type: 'toggle', key: 'watchOn', label: 'Watch the folder for changes', desc: 'New and edited files in the folder are imported into the vault.', needsFolder: true, after: function () { LN.folder.startWatch(); } },
          { type: 'select', key: 'watchSec', num: true, label: 'Check every', desc: 'Only runs while the app is open and in front.', options: [[5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute']], after: function () { LN.folder.startWatch(); } },
          { type: 'button', label: 'Check now', desc: '', run: function () { return LN.folder.checkNow(false).then(function (r) { if (!(r.created + r.updated + r.conflicts)) LN.toast('No changes in the folder'); }); } },
          { type: 'status', label: 'Last check', text: function () { return LN.store.get('lastCheck') || 'Not checked yet'; } },
          { type: 'info', text: 'If a file changed in both the vault and the folder, the winner is set under Sync to folder, Conflicts and rules (default: the folder version, and your vault version is kept as "name (vault copy)"). Deleting a file in the folder never deletes it from the vault. Dotfiles and files over 25 MB are ignored.' }
        ])
      },
      {
        id: 'sync', label: 'Sync to folder', icon: 'sync', items: folderItems().concat(extraItems()).concat([
          { type: 'toggle', key: 'syncOut', label: 'Copy new and edited notes to the connected folder', desc: 'Keeps a copy in both places: changes from Limitless Notepad are copied to the folder, and Sync now or Folder watch imports folder changes back into your vault.', needsFolder: true, after: function (v) { if (v) return LN.folder.syncNow().catch(fail); return null; } },
          { type: 'toggle', key: 'mirrorDeletes', label: 'Also delete in the folder', desc: 'When you delete a file or folder in the vault, remove it from the folder too.', needsFolder: true, confirmOn: 'Files you delete in the vault will also be deleted from the folder. Turn this on?' },
          { type: 'button', label: 'Sync both ways by copying now', desc: 'Copies folder changes into Limitless Notepad, then copies vault changes into the connected folder. It does not move or remove files unless you explicitly enable delete mirroring.', needsFolder: true, run: function () { return LN.folder.syncNow().then(function (s) { LN.toast(s); }); } },
          { type: 'status', label: 'Last sync', text: function () { return LN.store.get('lastSync') || 'Not synced yet'; } },
          { type: 'status', label: 'Last successful sync', text: function () { var t = Number(LN.store.get('lastSyncOk')) || 0; return t ? new Date(t).toLocaleString() : 'Never'; } },
          { type: 'status', label: 'Last error', text: function () { return LN.folder.lastError() || 'None'; } },
          { type: 'button', label: 'Retry now', desc: 'Runs a full sync again and restarts the automatic retries.', needsFolder: true, run: function () { return LN.folder.retryNow().then(function (s) { LN.toast(s); show(view, true); }); } },
          { type: 'toggle', key: 'syncRetry', label: 'Retry automatically after an error', desc: 'Tries again after 30 seconds, 1, 2 and 5 minutes, up to 5 times. Only while the app is open.' },
          { type: 'head', label: 'Conflicts and rules' },
          { type: 'select', key: 'conflictMode', label: 'When a note changed on both sides', desc: 'The version that loses is never thrown away: it is kept as a copy next to the winner.', options: [['folder', 'Folder wins (default)'], ['vault', 'Vault wins'], ['newest', 'Newest edit wins']] },
          { type: 'textarea', key: 'syncExclude', label: 'Excluded folders and files', desc: 'One per line. A name such as node_modules matches anywhere; a path such as Work/private matches that folder and everything in it. Sync never reads, writes or deletes these.', placeholder: 'node_modules\nWork/private' },
          { type: 'button', label: 'Review conflict copies', desc: 'Lists every note ending in (vault copy), (folder copy) or (backup copy), with Open and Delete.', run: function () { showConflictCopies(); return null; } },
          { type: 'info', text: 'An empty file in the folder never replaces a note that has text. If a sync has file errors, nothing is written to the folder and "Also delete in the folder" is skipped until the errors clear. "Newest edit wins" treats a folder time of 0 as unknown and keeps both versions.' },
          { type: 'button', label: 'Disconnect folder', desc: 'Stops watching and syncing. Files already in the folder stay there.', needsFolder: true, run: function () {
            if (!window.confirm('Disconnect the folder? Watching and syncing will turn off.')) return null;
            LN.folder.disconnect();
            LN.toast('Folder disconnected');
            return null;
          } }
        ])
      },
      {
        id: 'device', label: 'Device access', icon: 'shield', items: [
          { type: 'info', text: 'Each switch asks Android once. If you pick Don\'t allow, the button turns into Open settings. The app offers photo and camera access once on first start; everything else is asked only when you tap.' }
        ].concat(LN.access.defs.map(function (d) { return { type: 'perm', id: d.id, label: d.label, desc: d.desc }; })).concat([
          { type: 'button', label: 'Allow everything', desc: 'Goes through the list above one by one.', run: function () {
            return LN.access.allowAll().then(function (r) { LN.toast(r.done + ' of ' + r.total + ' allowed'); });
          } },
          { type: 'toggle', key: 'wakeLock', label: 'Keep the screen awake', desc: 'Stops the screen from timing out while the app is open.', after: function () { return LN.access.applyWake(); } },
          { type: 'toggle', key: 'permanentNote', label: 'Permanent notification', desc: 'An ongoing notification with a New note button. Needs Notifications allowed.', after: function () {
            return LN.notify.applyPermanent().catch(function (e) { fail(e); show('device', true); });
          } }
        ])
      },
      {
        id: 'share', label: 'Share', icon: 'share', items: [
          { type: 'text', key: 'shareBase', label: 'Viewer address', desc: 'The hosted viewer page that share links open. After the pages job runs on the default branch, copy your GitLab Pages address and add /view/ at the end.', placeholder: 'https://<username>.gitlab.io/<project>/view/' },
          { type: 'info', text: 'Share link puts the whole note in the link itself, after the #. Nothing is uploaded or stored anywhere; the viewer page only reads what is already in the link. Very long notes make a very long link - "Share as a web page" and "Share file" don\'t have that limit.' }
        ]
      },
      {
        id: 'notes', label: 'Notes tools', icon: 'more', items: [
          { type: 'text', key: 'musicFolder', label: 'Music folder', desc: 'Folder on the phone that Scan Music reads.', placeholder: 'Music' },
          { type: 'text', key: 'photoFolder', label: 'Photo folder', desc: 'Where photos taken from a note are saved.', placeholder: 'Photos' },
          { type: 'toggle', key: 'locationLink', label: 'Add a map link with my location', desc: 'Inserting your location also adds a link that opens it on a map.' },
          { type: 'select', key: 'calAlert', num: true, label: 'Calendar alert', desc: 'How long before an event you add from a note.', options: [[0, 'At the time'], [10, '10 minutes before'], [30, '30 minutes before'], [60, '1 hour before']] },
          { type: 'button', label: 'Manage reminders', desc: 'See and cancel upcoming reminders.', run: function () { LN.notify.manage(); return null; } }
        ]
      },
      {
        id: 'bin', label: 'Recycle bin', icon: 'bin', items: [
          { type: 'toggle', key: 'binOn', label: 'Use the Recycle bin', desc: 'Deleted files and folders wait in the bin so you can get them back. Off means delete for good.' },
          { type: 'select', key: 'binDays', num: true, label: 'Empty items after', desc: 'Older items are deleted for good when the app opens.', options: [[0, 'Never'], [7, '7 days'], [14, '14 days'], [30, '30 days (default)'], [60, '60 days'], [90, '90 days']] },
          { type: 'status', label: 'In this vault', text: function () { return LN.bin.summary(); } },
          { type: 'button', label: 'Open Recycle bin', desc: 'See what was deleted, restore it or remove it for good.', run: function () { LN.bin.open(); return null; } },
          { type: 'button', label: 'Empty Recycle bin', desc: '', run: function () { return LN.bin.emptyAll(); } },
          { type: 'info', text: 'Each vault has its own bin. A restored item goes back to its old folder; if that folder is gone it is made again. Items in the bin stay encrypted when encryption is on, and are not included in backups. With Sync to folder and Also delete in the folder on, a deleted file leaves the folder right away and comes back when you restore it.' }
        ]
      },
      { id: 'security', label: 'Security', icon: 'lock', items: securityItems() },
      { id: 'backup', label: 'Backup', icon: 'upload', items: backupItems() },
      { id: 'diag', label: 'Diagnostics', icon: 'sliders', items: diagItems() },
      { id: 'privacy', label: 'Privacy', icon: 'eye-off', items: privacyItems() },
      {
        id: 'about', label: 'About', icon: 'file', items: [
          { type: 'custom', label: 'About Limitless Notepad, Grant Festers, ethical hacker, developer, GitHub, GitLab', build: aboutHero },
          { type: 'info', text: 'Your vault lives on this device. Clearing the app\'s data deletes it, so turn on Sync to folder if you want a copy outside the app.' }
        ]
      }
    ];
  }

  function loadModels(id) {
    return LN.ai.listModels(id).then(function (list) {
      modelLists[id] = list;
      LN.toast(list.length + ' models loaded');
      return list;
    });
  }

  // V0.7.7: a tappable list of every model (the old dropdown only showed names matching what was already typed).
  var probes = { groq: {}, gemini: {}, mistral: {} };   // model name -> { ok, ms, msg } from the last test this session
  function openModelPicker(id) {
    var P = LN.ai.providers[id];
    var s = LN.ui.sheet('Choose ' + P.label + ' model');
    var busy = false, stop = false;
    var note = el('p', 'hint', 'Loading models…');
    var filter = document.createElement('input');
    filter.type = 'search';
    filter.className = 'set-ctl set-input';
    filter.placeholder = 'Filter models';
    filter.setAttribute('aria-label', 'Filter models');
    filter.autocomplete = 'off';
    filter.spellcheck = false;
    var acts = el('div', 'ai-row');
    var reload = el('button', 'btn small', 'Reload list');
    reload.type = 'button';
    var testBtn = el('button', 'btn small primary', 'Test free models');
    testBtn.type = 'button';
    acts.appendChild(reload);
    acts.appendChild(testBtn);
    var box = el('div', 'mp-list');
    s.body.appendChild(note);
    s.body.appendChild(filter);
    s.body.appendChild(acts);
    s.body.appendChild(box);

    function alive() { return s.el && s.el.isConnected; }
    function names() { return modelLists[id].length ? modelLists[id] : LN.ai.fallbackModels(id); }
    function rank(n) { var p = probes[id][n]; return p ? (p.ok ? 0 : 2) : 1; }

    function item(n, cur) {
      var p = probes[id][n];
      var b = el('button', 'mp-item' + (n === cur ? ' on' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'mp-name', n));
      b.appendChild(el('span', 'mp-tag' + (p ? (p.ok ? ' ok' : ' bad') : ''), p ? (p.ok ? 'Works · ' + p.ms + ' ms' : p.msg) : (n === cur ? 'Selected' : '')));
      b.addEventListener('click', function () {
        LN.store.set(P.modelKey, n);
        LN.toast(P.label + ' model: ' + n);
        s.close();
        show(view, true);
      });
      return b;
    }
    function group(title, arr, cur) {
      if (!arr.length) return;
      box.appendChild(el('div', 'mp-head', title + ' (' + arr.length + ')'));
      arr.forEach(function (n) { box.appendChild(item(n, cur)); });
    }
    function draw() {
      if (!alive()) return;
      box.textContent = '';
      var q = filter.value.trim().toLowerCase();
      var cur = String(LN.store.get(P.modelKey) || '');
      var all = names().filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; });
      var byRank = function (a, b) { return (rank(a) - rank(b)) || (a < b ? -1 : 1); };
      var free = all.filter(function (n) { return LN.ai.isFree(id, n); }).sort(byRank);
      var other = all.filter(function (n) { return !LN.ai.isFree(id, n); }).sort(byRank);
      group('Free tier', free, cur);
      group(id === 'gemini' ? 'Other (may need billing)' : 'Other', other, cur);
      if (!all.length) box.appendChild(el('div', 'set-note', 'No models match.'));
    }
    function load() {
      note.textContent = 'Loading models…';
      return LN.ai.listModels(id).then(function (list) {
        modelLists[id] = list;
        var f = list.filter(function (n) { return LN.ai.isFree(id, n); }).length;
        note.textContent = list.length + ' models loaded from ' + P.label + ', ' + f + ' look free. Free status is a best guess because ' + P.label + ' does not report it.';
      }, function (e) {
        note.textContent = (e && e.message ? e.message : 'Could not load the list.') + ' Showing the built-in list instead.';
      }).then(draw);
    }
    function setBusy(on) { busy = on; reload.disabled = on; testBtn.textContent = on ? 'Stop' : 'Test free models'; }

    testBtn.addEventListener('click', function () {
      if (busy) { stop = true; return; }
      var todo = names().filter(function (n) { return LN.ai.isFree(id, n); }).slice(0, 20);
      if (!todo.length) { LN.toast('No models to test.'); return; }
      stop = false;
      setBusy(true);
      var done = 0, why = '';
      var chain = Promise.resolve();
      todo.forEach(function (n) {
        chain = chain.then(function () {
          if (stop || why || !alive()) return null;
          note.textContent = 'Testing ' + (done + 1) + ' of ' + todo.length + ': ' + n + '…';
          return LN.ai.test(id, null, n).then(function (r) {
            probes[id][n] = { ok: true, ms: r.ms };
          }, function (e) {
            probes[id][n] = { ok: false, msg: String(e && e.message || 'Failed').replace(/\s+/g, ' ').slice(0, 60) };
            if (e && (e.kind === 'bad' || e.kind === 'net' || e.kind === 'limit')) why = e.message;
          }).then(function () { done++; draw(); });
        });
      });
      chain.then(function () {
        if (!alive()) return;
        setBusy(false);
        var okN = todo.filter(function (n) { return probes[id][n] && probes[id][n].ok; }).length;
        note.textContent = (why ? 'Stopped: ' + why + ' ' : '') + okN + ' of ' + done + ' tested models answered. Tap one to use it.';
      });
    });
    reload.addEventListener('click', function () { if (!busy) load(); });
    filter.addEventListener('input', draw);
    draw();
    load();
  }

  // ---------- value access ----------
  function getVal(it) {
    var v = LN.store.get(it.key);
    return it.invert ? !v : v;
  }
  function setVal(it, v) {
    LN.store.set(it.key, it.invert ? !v : v);
    if (it.after) {
      var r = it.after(v);
      if (r && r.then) r.then(null, function () {});
    }
  }

  // ---------- rendering ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function labelBlock(it) {
    var wrap = el('div', 'set-info');
    wrap.appendChild(el('div', 'set-label', it.label));
    if (it.desc) wrap.appendChild(el('div', 'set-desc', it.desc));
    return wrap;
  }

  function disabledFor(it) { return !!it.needsFolder && !LN.folder.connected() && !(LN.extra && LN.extra.count()); }

  function renderItem(it) {
    var row = el('div', 'set-row set-' + (it.type === 'status' ? 'stat' : it.type));
    var dis = disabledFor(it);
    if (it.type === 'custom') {
      row.className = 'set-row set-custom';
      row.appendChild(it.build());
      return row;
    }
    if (it.type === 'info') {
      row.appendChild(el('div', 'set-note', it.text));
      return row;
    }
    if (it.type === 'head') {
      row.appendChild(el('div', 'set-label', it.label));
      return row;
    }
    if (it.type === 'perm') {
      row.appendChild(labelBlock(it));
      var side = el('div', 'set-perm');
      var badge = el('div', 'set-status', 'Checking…');
      var pb = el('button', 'btn small', 'Allow');
      pb.type = 'button';
      pb.hidden = true;
      side.appendChild(badge);
      side.appendChild(pb);
      row.appendChild(side);
      LN.access.status(it.id).then(function (s) {
        badge.textContent = LN.access.label(s);
        pb.hidden = s === 'granted' || s === 'na';
        pb.textContent = s === 'denied' ? 'Open settings' : 'Allow';
      });
      pb.addEventListener('click', function () {
        pb.disabled = true;
        LN.access.ask(it.id).catch(fail).then(function () { if (sheet && !sheet.hidden && (view === 'device' || view === 'diag')) show(view, true); });
      });
      return row;
    }
    if (it.type === 'status') {
      row.appendChild(el('div', 'set-label', it.label));
      var st = el('div', 'set-status', it.text());
      st.setAttribute('data-status', '1');
      st._text = it.text;
      row.appendChild(st);
      return row;
    }
    if (it.type === 'toggle') {
      row.appendChild(labelBlock(it));
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'switch';
      cb.setAttribute('role', 'switch');
      cb.setAttribute('aria-label', it.label);
      cb.checked = !!getVal(it);
      cb.disabled = dis;
      cb.addEventListener('change', function () {
        if (cb.checked && it.confirmOn && !window.confirm(it.confirmOn)) { cb.checked = false; return; }
        setVal(it, cb.checked);
      });
      row.appendChild(cb);
      if (dis) row.classList.add('off');
      return row;
    }
    if (it.type === 'select') {
      row.appendChild(labelBlock(it));
      var sel = document.createElement('select');
      sel.className = 'set-ctl';
      sel.setAttribute('aria-label', it.label);
      var cur = String(getVal(it));
      it.options.forEach(function (o) {
        var op = document.createElement('option');
        op.value = String(o[0]);
        op.textContent = o[1];
        if (String(o[0]) === cur) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { setVal(it, it.num ? Number(sel.value) : sel.value); });
      row.appendChild(sel);
      return row;
    }
    if (it.type === 'text' || it.type === 'textarea') {
      row.classList.add('stack');
      row.appendChild(labelBlock(it));
      var inp = document.createElement(it.type === 'textarea' ? 'textarea' : 'input');
      inp.className = 'set-ctl set-input';
      inp.setAttribute('aria-label', it.label);
      if (it.type === 'textarea') inp.rows = 3;
      else inp.type = it.secret ? 'password' : 'text';
      inp.value = String(LN.store.get(it.key) || '');
      if (it.placeholder) inp.placeholder = it.placeholder;
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.setAttribute('autocapitalize', 'off');
      if (it.list) {
        var dl = document.createElement('datalist');
        dl.id = 'dl-' + it.key;
        (modelLists[it.list] || []).forEach(function (m) {
          var o = document.createElement('option');
          o.value = m;
          dl.appendChild(o);
        });
        inp.setAttribute('list', dl.id);
        row.appendChild(dl);
      }
      inp.addEventListener('change', function () { setVal(it, inp.value.trim()); });
      var line = el('div', 'set-line');
      line.appendChild(inp);
      if (it.secret) {
        var reveal = el('button', 'btn small', 'Show');
        reveal.type = 'button';
        reveal.addEventListener('click', function () {
          var on = inp.type === 'password';
          inp.type = on ? 'text' : 'password';
          reveal.textContent = on ? 'Hide' : 'Show';
        });
        line.appendChild(reveal);
      }
      row.appendChild(line);
      return row;
    }
    if (it.type === 'button') {
      row.classList.add('tap');
      var info = el('div', 'set-info');
      if (it.desc) info.appendChild(el('div', 'set-desc', it.desc));
      else info.hidden = true;
      var b = el('button', 'btn', it.label);
      b.type = 'button';
      b.disabled = dis;
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        var p;
        try { p = it.run(); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).catch(fail).then(function () { if (sheet && !sheet.hidden) show(view, true); });
      });
      row.appendChild(info);
      row.appendChild(b);
      return row;
    }
    return row;
  }

  function group(items) {
    var g = el('div', 'set-group');
    items.forEach(function (it) { g.appendChild(renderItem(it)); });
    return g;
  }

  function section(title) { return el('div', 'set-section', title); }

  function rootList() {
    var g = el('div', 'set-group nav');
    pages().forEach(function (p) {
      var r = el('button', 'set-nav');
      r.type = 'button';
      var ic = el('span', 'set-ico');
      ic.innerHTML = LN.icon(p.icon, 18);
      r.appendChild(ic);
      r.appendChild(el('span', 'set-nav-label', p.label));
      var ch = el('span', 'set-chev');
      ch.innerHTML = LN.icon('chevron', 16);
      r.appendChild(ch);
      r.addEventListener('click', function () { show(p.id); });
      g.appendChild(r);
    });
    return g;
  }

  function searchResults(q) {
    var frag = document.createDocumentFragment();
    var l = q.toLowerCase();
    var any = false;
    pages().forEach(function (p) {
      var hits = p.items.filter(function (it) {
        if (it.type === 'info' || it.type === 'head' || it.type === 'custom') return false;
        return (it.label + ' ' + (it.desc || '') + ' ' + p.label).toLowerCase().indexOf(l) >= 0;
      });
      if (!hits.length) return;
      any = true;
      frag.appendChild(section(p.label));
      frag.appendChild(group(hits));
    });
    if (!any) frag.appendChild(el('div', 'set-empty', 'No settings match "' + q + '"'));
    return frag;
  }

  function show(id, keepScroll) {
    var top = body.scrollTop;
    view = id;
    body.textContent = '';
    backBtn.hidden = id === 'root';
    if (id === 'root') {
      headTitle.textContent = 'Settings';
      var s = el('div', 'set-search');
      var inp = document.createElement('input');
      inp.type = 'search';
      inp.placeholder = 'Search settings…';
      inp.setAttribute('aria-label', 'Search settings');
      inp.value = query;
      var results = el('div', 'set-results');
      var nav = rootList();
      function paint() {
        results.textContent = '';
        if (query) { nav.hidden = true; results.appendChild(searchResults(query)); }
        else nav.hidden = false;
      }
      inp.addEventListener('input', function () { query = inp.value.trim(); paint(); });
      s.appendChild(inp);
      body.appendChild(s);
      body.appendChild(section('Options'));
      body.appendChild(nav);
      body.appendChild(results);
      paint();
    } else {
      var page = pages().filter(function (p) { return p.id === id; })[0];
      headTitle.textContent = page ? page.label : 'Settings';
      if (page) body.appendChild(group(page.items));
    }
    body.scrollTop = keepScroll ? top : 0;
    if (id === 'diag') {
      LN.diag.storage().then(function (s) { storageNote = LN.diag.storageLine(s); refreshStatus(); }, function () {});
    }
  }

  function refreshStatus() {
    if (!body) return;
    var list = body.querySelectorAll('[data-status]');
    for (var i = 0; i < list.length; i++) {
      if (list[i]._text) list[i].textContent = list[i]._text();
    }
  }

  function build() {
    sheet = el('div', 'sheet settings-sheet');
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Settings');
    var card = el('div', 'sheet-card');
    var head = el('div', 'sheet-head');
    backBtn = el('button', 'sheet-back');
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', 'Back to settings');
    backBtn.innerHTML = LN.icon('back', 18);
    backBtn.hidden = true;
    headTitle = el('div', 'sheet-title', 'Settings');
    var x = el('button', 'sheet-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close settings');
    x.innerHTML = LN.icon('x', 18);
    head.appendChild(backBtn);
    head.appendChild(headTitle);
    head.appendChild(x);
    body = el('div', 'sheet-body');
    card.appendChild(head);
    card.appendChild(body);
    sheet.appendChild(card);
    document.getElementById('app').appendChild(sheet);
    backBtn.addEventListener('click', function () { show('root'); });
    x.addEventListener('click', close);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    LN.folder.onStatus(refreshStatus);
  }

  function open(page) {
    if (!sheet) build();
    query = '';
    show(page || 'root');
    sheet.hidden = false;
    if (LN.app && LN.app.closeDrawer) LN.app.closeDrawer();
  }

  function close() { if (sheet) sheet.hidden = true; }

  // V0.7.21: the phone's Back button. In a settings page: up to the list. In the list: close Settings.
  function back() {
    if (!sheet || sheet.hidden) return false;
    if (view !== 'root') { show('root'); return true; }
    close();
    return true;
  }

  // coming back from Android's permission screens: repaint the Device access page
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && sheet && !sheet.hidden && (view === 'device' || view === 'diag')) show(view, true);
  });

  LN.settings = { open: open, close: close, back: back, sheetEl: function () { return sheet; }, applyAppearance: applyAppearance, version: VERSION };
})(window.LN = window.LN || {});
