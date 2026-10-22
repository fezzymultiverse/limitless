(function (LN) {
  'use strict';

  var appEl = null;
  var toastEl = null;
  var toastTimer = null;
  var narrow = window.matchMedia('(max-width: 759px)');

  // LN.toast(msg) or LN.toast(msg, { label: 'Undo', run: fn, ms: 7000 }) for a toast with one action button.
  LN.toast = function (msg, act) {
    if (!toastEl) return;
    toastEl.textContent = '';
    toastEl.appendChild(document.createTextNode(msg));
    toastEl.classList.toggle('has-act', !!(act && act.run));
    if (act && act.run) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-act';
      b.textContent = act.label || 'Undo';
      b.addEventListener('click', function () {
        toastEl.classList.remove('show');
        var p;
        try { p = act.run(); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).catch(function (e) { LN.toast(e && e.message ? e.message : 'Something went wrong'); });
      });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, (act && act.ms) || 2600);
  };

  function closeDrawer() {
    if (appEl) appEl.classList.remove('drawer-open');
  }

  function toggleMenu() {
    if (narrow.matches) {
      appEl.classList.toggle('drawer-open');
    } else {
      var c = appEl.classList.toggle('collapsed');
      LN.store.set('collapsed', c);
    }
  }

  // V0.7.17: opens the file panel (phone drawer or desktop sidebar). Used by the home dock Search button.
  function openSidebar() {
    if (!appEl) return;
    if (narrow.matches) appEl.classList.add('drawer-open');
    else { appEl.classList.remove('collapsed'); LN.store.set('collapsed', false); }
  }

  function bindChrome() {
    document.getElementById('btn-menu').addEventListener('click', toggleMenu);
    document.getElementById('backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') { closeDrawer(); LN.settings.close(); LN.ai.closePanel(); LN.ui.closeAll(); }
      else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        LN.tree.newItem('file');
      }
    });
  }

  // V0.7.15: swipe right to open the file panel, swipe left on the open panel to close it.
  // Starts at the left edge always count. Starts elsewhere need a longer, flatter, quicker swipe, and never count on
  // anything that scrolls sideways (tables, code, tab strip, toolbars) or inside a sheet / the AI chat.
  function bindSwipe() {
    var st = null;
    var EDGE = 40, MIN = 64, FAR = 110;
    var STOP = '.aichat,.sheet,.bj-egg,.btb,.tabs,.toolbar,.vw-bar,.tbl,table,pre,.csv-wrap,.pdf-wrap,input[type="range"],.music-scrub,.lock,.vault-loading';
    function blocked(t) {
      if (!t || !t.closest) return false;
      if (t.closest(STOP)) return true;
      for (var n = t; n && n !== document.body; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 4) {
          var ox = '';
          try { ox = window.getComputedStyle(n).overflowX; } catch (e) { ox = ''; }
          if (ox === 'auto' || ox === 'scroll') return true;
        }
      }
      return false;
    }
    function isOpen() { return narrow.matches ? appEl.classList.contains('drawer-open') : !appEl.classList.contains('collapsed'); }
    function openPanel() {
      if (narrow.matches) appEl.classList.add('drawer-open');
      else { appEl.classList.remove('collapsed'); LN.store.set('collapsed', false); }
    }
    document.addEventListener('touchstart', function (e) {
      st = null;
      if (!e.touches || e.touches.length !== 1 || !appEl) return;
      if (document.body.classList.contains('aic-open') || document.querySelector('.sheet') || document.querySelector('.bj-egg')) return;
      var t = e.touches[0];
      st = { x: t.clientX, y: t.clientY, at: Date.now(), edge: t.clientX <= EDGE, el: e.target, open: isOpen() };
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      var s = st;
      st = null;
      if (!s || !e.changedTouches || !e.changedTouches[0]) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - s.x, dy = t.clientY - s.y;
      var ms = Date.now() - s.at;
      var flat = Math.abs(dy) <= Math.abs(dx) * 0.5;
      try {
        if (s.open) {
          // swipe left on the open phone panel closes it
          if (narrow.matches && dx <= -MIN && flat && ms < 700) closeDrawer();
          return;
        }
        if (dx >= MIN && flat && s.edge && ms < 800) { openPanel(); return; }
        if (dx >= FAR && flat && ms < 600 && !blocked(s.el)) openPanel();
      } catch (err) { /* a gesture must never break the app */ }
    }, { passive: true });
    document.addEventListener('touchcancel', function () { st = null; }, { passive: true });

    // V0.7.18: a strip on the very left edge that sits above every screen (viewers, PDFs, settings, AI chat, sheets),
    // so the swipe that opens the left panel works everywhere. Its glow flashes softly until you have used it a few times.
    var edge = document.getElementById('edge');
    if (!edge) return;
    var used = +LN.store.get('edgeUsed') || 0;
    if (used >= 6) edge.classList.add('still');
    var es = null;
    function openFromEdge() {
      try { if (document.body.classList.contains('aic-open') && LN.ai) LN.ai.closePanel(); } catch (e) { /* best effort */ }
      try { LN.ui.closeAll(); } catch (e) { /* best effort */ }
      try { if (LN.settings && LN.settings.close) LN.settings.close(); } catch (e) { /* best effort */ }
      var pdf = document.querySelector('.preview.pdf-full');
      if (pdf) pdf.classList.remove('pdf-full');
      openPanel();
      used++;
      LN.store.set('edgeUsed', used);
      if (used >= 6) edge.classList.add('still');
    }
    edge.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      es = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, done: false } : null;
    }, { passive: true });
    edge.addEventListener('touchmove', function (e) {
      if (!es || es.done) return;
      var t = e.touches[0];
      var dx = t.clientX - es.x, dy = t.clientY - es.y;
      if (dx >= 28 && Math.abs(dy) <= Math.abs(dx) * 0.8) { es.done = true; openFromEdge(); }
    }, { passive: true });
    edge.addEventListener('touchend', function () { es = null; }, { passive: true });
    edge.addEventListener('click', function () { openFromEdge(); });
  }

  function setVaultLoading(title, detail) {
    var panel = document.getElementById('vault-loading');
    if (!panel) return;
    panel.hidden = false;
    var heading = document.getElementById('vault-loading-title');
    var sub = document.getElementById('vault-loading-detail');
    if (heading) heading.textContent = title || 'Loading vault…';
    if (sub) sub.textContent = detail || 'Preparing your notes and attachments';
  }

  function hideVaultLoading() {
    var panel = document.getElementById('vault-loading');
    if (!panel || panel.hidden) return;
    panel.classList.add('boot-out');
    setTimeout(function () { panel.hidden = true; }, 220);
  }

  function fatal(e) {
    // keep the loading screen up, switch it to a clear message and offer Retry, so a failed start is never a blank page
    var panel = document.getElementById('vault-loading');
    if (panel) {
      panel.hidden = false;
      panel.classList.remove('boot-out');
      var ttl = document.getElementById('vault-loading-title');
      var det = document.getElementById('vault-loading-detail');
      var rt = document.getElementById('boot-retry');
      var sp = panel.querySelector('.vault-loading-spinner');
      if (ttl) ttl.textContent = 'The vault could not open';
      if (det) det.textContent = (e && e.message ? e.message : 'Something went wrong while starting.') + ' Your notes are still on this device.';
      if (rt) rt.hidden = false;
      if (sp) sp.hidden = true;
    }
    var t = document.getElementById('tree');
    if (!t) return;
    t.textContent = '';
    var d = document.createElement('div');
    d.className = 'tree-empty';
    d.textContent = 'The vault couldn\'t open. ' + (e && e.message ? e.message : 'Restart the app and try again.');
    t.appendChild(d);
  }

  function start() {
    appEl = document.getElementById('app');
    toastEl = document.getElementById('toast');
    LN.paintIcons();
    if (LN.store.get('collapsed')) appEl.classList.add('collapsed');
    LN.settings.applyAppearance();
    bindChrome();
    bindSwipe();
    document.getElementById('btn-settings').addEventListener('click', function () { LN.settings.open(); });
    document.getElementById('btn-tools').addEventListener('click', function () { LN.tools.open(); });
    document.getElementById('btn-ai').addEventListener('click', function () { LN.ai.openPanel(); });
    setVaultLoading('Unlocking Limitless Notepad…', 'Checking local security and storage');
    LN.lock.boot().then(function () {
      // V0.7.20: permissions first (first start only). Android asks one at a time; the loading screen waits behind it.
      return LN.access.onboard().catch(function () { /* a failed prompt must never block the vault */ });
    }).then(function () {
      setVaultLoading('Loading your vault…', 'Opening your notes, folders and saved metadata');
      return LN.vault.init();
    }).then(function () {
      setVaultLoading('Preparing your workspace…', 'Restoring tabs, attachments and tools');
      LN.theme.init();
      LN.tree.init();
      LN.tabs.init();
      LN.editor.init();
      LN.editprefs.init();
      LN.home.init();
      LN.bojack.init();
      var a = LN.tabs.active();
      LN.editor.load(a);
      LN.editor.restoreReloadState(a);
      if (a) LN.tree.select(a, true);
      LN.folder.init();
      LN.vaults.init();
      LN.bin.init();
      LN.access.init();
      LN.notify.init();
      LN.music.init();
      LN.secure.init();
      LN.keys.init();
      LN.backup.init();
      setTimeout(function () { LN.access.firstRun(); }, 800);
      // bring back the panels that were open when the app was left
      try {
        var ui = LN.store.get('resumeUi');
        if (ui && ui.ai && a && LN.ai) LN.ai.openPanel(true);
        else if (ui && ui.drawer && narrow.matches) appEl.classList.add('drawer-open');
      } catch (err) { /* resuming panels is a convenience only */ }
      hideVaultLoading();
    }).catch(fatal);
  }

  LN.app = { closeDrawer: closeDrawer, openSidebar: openSidebar };

  // Capture before navigation/reload so returning to the app restores the same note and editor position.
  function captureUi() {
    try {
      if (!appEl) return;
      LN.store.set('resumeUi', { ai: document.body.classList.contains('aic-open'), drawer: appEl.classList.contains('drawer-open') });
    } catch (e) { /* storage blocked */ }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { captureUi(); try { localStorage.setItem('ln.hiddenAt', String(Date.now())); } catch (e) { /* ok */ } }
  });
  window.addEventListener('pagehide', captureUi);
  // Android can freeze the page when the app is backgrounded: save where you are before that happens too.
  document.addEventListener('freeze', function () {
    captureUi();
    try { if (LN.editor && LN.editor.captureReloadState) LN.editor.captureReloadState(); if (LN.editor && LN.editor.flush) LN.editor.flush(); } catch (e) { /* ok */ }
  });

  window.addEventListener('pagehide', function () {
    try {
      if (LN.editor && LN.editor.captureReloadState) LN.editor.captureReloadState();
      if (LN.editor && LN.editor.flush) LN.editor.flush();
    } catch (e) { /* page is already leaving; persisted vault state remains authoritative */ }
  });

  // V0.7.20: let the loading screen paint (and its spinner start turning) before the heavy start work begins.
  function startAfterPaint() {
    if (window.requestAnimationFrame) window.requestAnimationFrame(function () { setTimeout(start, 0); });
    else setTimeout(start, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAfterPaint);
  else startAfterPaint();
})(window.LN = window.LN || {});
