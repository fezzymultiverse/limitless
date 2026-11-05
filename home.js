(function (LN) {
  'use strict';
  // V0.7.17 home screen. Shown on the empty stage (no file open): hero, last five opened notes, one vault summary row.
  // The dock (New, Search, Voice, Music, AI, Sync) is plain markup in index.html and is wired here.
  // Everything is built with textContent, never innerHTML with note names, so a hostile file name stays text.

  var MAX = 5;          // notes shown
  var KEEP = 12;        // notes remembered (extra ones cover files that were deleted since)
  var rootEl = null;
  var recentEl = null;
  var sumEl = null;
  var syncing = false;
  var timer = null;
  var pending = 0;
  var narrow = window.matchMedia('(max-width: 759px)');

  function el(tag, cls, text) { return LN.ui.el(tag, cls, text); }
  function stageEmpty() {
    var s = document.getElementById('stage');
    return !!(s && s.getAttribute('data-empty') === '1');
  }

  // ---------- recent notes ----------
  function ids() {
    var l = LN.store.get('recentNotes');
    return Array.isArray(l) ? l : [];
  }
  // Called by the editor whenever a file is loaded. Cheap: skips the write when it is already first.
  function touch(id) {
    if (!id) return;
    var l = ids();
    if (l[0] === id) return;
    l = l.filter(function (x) { return x !== id; });
    l.unshift(id);
    LN.store.set('recentNotes', l.slice(0, KEEP));
  }
  function recent() {
    var out = [];
    ids().forEach(function (id) {
      var n = LN.vault.get(id);
      if (n && n.type === 'file' && out.length < MAX) out.push(n);
    });
    if (out.length) return out;
    // Nothing opened yet in this vault: show the files edited most recently instead.
    return LN.vault.all().filter(function (n) { return n.type === 'file'; })
      .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).slice(0, MAX);
  }

  function ago(ts) {
    if (!ts) return '';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    var d = Math.round(h / 24);
    if (d < 14) return d + ' d ago';
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return ''; }
  }

  function folderOf(n) {
    if (!n.parent) return 'Top level';
    try { return LN.vault.path(n.parent) || 'Top level'; } catch (e) { return 'Top level'; }
  }

  function openNote(id) {
    if (!LN.vault.get(id)) { refresh(); return; }
    LN.tabs.open(id);
    if (LN.tree && LN.tree.select) LN.tree.select(id, true);
  }

  function renderRecent() {
    if (!recentEl) return;
    recentEl.textContent = '';
    var list = recent();
    if (!list.length) {
      recentEl.appendChild(el('div', 'home-none', 'No notes yet. Tap New to start your first one.'));
      return;
    }
    list.forEach(function (n) {
      var b = el('button', 'home-note');
      b.type = 'button';
      b.setAttribute('aria-label', 'Open ' + n.name);
      var ic = el('span', 'home-note-ic');
      ic.innerHTML = LN.icon('file', 18);
      var tx = el('span', 'home-note-tx');
      tx.appendChild(el('span', 'home-note-n', n.name));
      var meta = folderOf(n);
      var when = ago(n.updated);
      tx.appendChild(el('span', 'home-note-m', when ? meta + ' · ' + when : meta));
      var ch = el('span', 'home-note-ch');
      ch.innerHTML = LN.icon('chevron', 16);
      b.appendChild(ic);
      b.appendChild(tx);
      b.appendChild(ch);
      b.addEventListener('click', function () { openNote(n.id); });
      recentEl.appendChild(b);
    });
  }

  // ---------- vault summary ----------
  function linked() {
    var f = LN.folder;
    if (!f) return false;
    try { return !!(f.connected() || (LN.extra && LN.extra.count && LN.extra.count())); } catch (e) { return false; }
  }
  function syncInfo() {
    var lastOk = LN.store.get('lastSyncOk') || 0;
    var last = lastOk ? ago(lastOk) : 'Not yet';
    if (!linked()) return { cls: 'off', text: 'Off', last: 'Never' };
    if (syncing) return { cls: 'busy', text: 'Syncing', last: last };
    var needs = false;
    try { needs = !!LN.folder.needsPermission(); } catch (e) { needs = false; }
    if (needs) return { cls: 'warn', text: 'Reconnect', last: last };
    var err = '';
    try { err = LN.folder.lastError(); } catch (e) { err = ''; }
    if (err) return { cls: 'bad', text: 'Error', last: last };
    return { cls: 'ok', text: 'OK', last: last };
  }

  function cell(value, label, extra) {
    var c = el('span', 'hs-cell' + (extra ? ' ' + extra : ''));
    c.appendChild(el('span', 'hs-v', value));
    c.appendChild(el('span', 'hs-l', label));
    return c;
  }

  function renderSummary() {
    if (!sumEl) return;
    // Count only; LN.vault.usage() also measures every file's size, which is wasted work for two numbers.
    var u = { files: 0, folders: 0 };
    try { LN.vault.all().forEach(function (n) { if (n.type === 'folder') u.folders++; else u.files++; }); } catch (e) { /* keep zeros */ }
    var si = syncInfo();
    sumEl.textContent = '';
    sumEl.className = 'home-sum sync-' + si.cls;
    sumEl.setAttribute('aria-label', u.files + ' notes, ' + u.folders + ' folders, last sync ' + si.last + ', sync ' + si.text + '. Tap to sync now.');
    sumEl.appendChild(cell(String(u.files), u.files === 1 ? 'Note' : 'Notes'));
    sumEl.appendChild(cell(String(u.folders), u.folders === 1 ? 'Folder' : 'Folders'));
    sumEl.appendChild(cell(si.last, 'Last sync', 'hs-last'));
    var st = cell(si.text, 'Sync', 'hs-status');
    var dot = el('span', 'hs-dot');
    dot.setAttribute('aria-hidden', 'true');
    st.firstChild.insertBefore(dot, st.firstChild.firstChild);
    sumEl.appendChild(st);
  }

  // Cheap enough to call often; does nothing while a note is open.
  function refresh() {
    if (!rootEl || !stageEmpty()) return;
    renderRecent();
    renderSummary();
    setDockBusy();
  }
  function refreshSoon() {
    if (pending) return;
    pending = setTimeout(function () { pending = 0; refresh(); }, 180);
  }

  // ---------- dock actions ----------
  function openSidebar() {
    if (LN.app && LN.app.openSidebar) LN.app.openSidebar();
  }

  function doSearch() {
    openSidebar();
    setTimeout(function () {
      var s = document.getElementById('search');
      if (s) { try { s.focus(); } catch (e) { /* focus is best effort */ } }
    }, narrow.matches ? 280 : 60);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '-' + p(d.getMinutes());
  }

  // Voice needs a note to put the recording in, so the dock makes a fresh one first.
  function doVoice() {
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      LN.toast('Voice recording is not available on this device');
      return Promise.resolve();
    }
    var parent = LN.tree && LN.tree.destParent ? LN.tree.destParent() : null;
    return LN.vault.create('file', 'Voice note ' + stamp() + '.md', parent).then(function (n) {
      LN.tree.render();
      LN.tabs.open(n.id);
      return LN.addmenu.voice();
    });
  }

  // AI works on a note, so the dock opens the most recent text note first.
  function doAi() {
    var list = recent().filter(function (n) { return !LN.isBin(LN.kindOfNode(n)); });
    if (!list.length) { LN.toast('Create a note first. AI works on the note you have open.'); return; }
    openNote(list[0].id);
    LN.toast('Opened ' + list[0].name + ' for AI');
    LN.ai.openPanel();
  }

  function setDockBusy() {
    var b = document.querySelector('#dock [data-d="sync"]');
    if (b) b.classList.toggle('busy', syncing);
  }

  function sync() {
    if (syncing) return;
    if (!linked()) {
      LN.toast('No sync folder yet. Pick one under Sync to folder.');
      LN.settings.open('sync');
      return;
    }
    syncing = true;
    refresh();
    setDockBusy();
    var first = Promise.resolve();
    try { if (LN.folder.needsPermission()) first = LN.folder.reconnect(); } catch (e) { first = Promise.resolve(); }
    Promise.resolve(first).then(function () { return LN.folder.syncNow(); }).then(function (s) {
      LN.toast('Synced · ' + s);
    }, function (e) {
      LN.toast(e && e.message ? e.message : 'Sync failed');
    }).then(function () { syncing = false; refresh(); setDockBusy(); });
  }

  function dockClick(e) {
    var b = e.target.closest ? e.target.closest('[data-d]') : null;
    if (!b) return;
    var p;
    try {
      switch (b.getAttribute('data-d')) {
        case 'new': LN.tree.newItem('file'); break;
        case 'search': doSearch(); break;
        case 'voice': p = doVoice(); break;
        case 'music': LN.music.open(); break;
        case 'ai': doAi(); break;
        case 'sync': sync(); break;
        default: break;
      }
    } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).catch(function (err) { LN.toast(LN.native && LN.native.msg ? LN.native.msg(err) : (err && err.message) || 'Something went wrong'); });
  }

  // ---------- build ----------
  function build() {
    var empty = document.querySelector('#stage .empty');
    if (!empty) return null;
    empty.textContent = '';
    var home = el('div', 'home');

    // V0.7.20: greeting, clock, welcome line and a rotating work quote above the logo
    if (LN.juice && LN.quotes) home.appendChild(LN.juice.build());
    var hero = el('div', 'home-hero');
    var wrap = el('div', 'home-logo-wrap');
    var img = document.createElement('img');
    img.className = 'home-logo';
    img.src = 'img/leaf.png';
    img.alt = '';
    img.draggable = false;
    wrap.appendChild(img);
    hero.appendChild(wrap);
    var name = el('div', 'home-name');
    name.appendChild(el('span', 'home-name-t', 'LIMITLESS NOTEPAD'));
    var cur = el('span', 'cursor');
    cur.setAttribute('aria-hidden', 'true');
    name.appendChild(cur);
    hero.appendChild(name);
    hero.appendChild(el('div', 'home-soi', 'Strategy Over Impulse'));
    home.appendChild(hero);

    var sec = el('div', 'home-sec', 'Recent notes');
    home.appendChild(sec);
    recentEl = el('div', 'home-recent');
    home.appendChild(recentEl);

    sumEl = el('button', 'home-sum');
    sumEl.type = 'button';
    sumEl.addEventListener('click', sync);
    home.appendChild(sumEl);

    empty.appendChild(home);
    // Bojack: the hero logo takes the same five taps as the header logo.
    if (LN.bojack && LN.bojack.bind) LN.bojack.bind(wrap);
    // V0.7.20: two quick taps open the 999 story (a third tap right after hands over to the five-tap Bojack egg)
    if (LN.juice && LN.juice.bind) LN.juice.bind(wrap);
    return home;
  }

  function init() {
    rootEl = build();
    var dock = document.getElementById('dock');
    if (dock) dock.addEventListener('click', dockClick);
    LN.vault.onChange(refreshSoon);
    if (LN.folder && LN.folder.onStatus) LN.folder.onStatus(refreshSoon);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    // The "5 min ago" text goes stale while the screen sits open.
    timer = setInterval(function () { if (!document.hidden) refresh(); }, 60000);
    refresh();
  }

  LN.home = { init: init, refresh: refresh, touch: touch, recent: recent, sync: sync };
})(window.LN = window.LN || {});
