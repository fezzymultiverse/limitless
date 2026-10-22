(function (LN) {
  'use strict';

  // Recycle bin (V0.7.0 WIP6). Storage lives in vault.js (trash, restore, purge, binItems);
  // this file is the screen, the Undo toast, the sidebar button and the auto-empty.
  var badge = null;
  var sheetRef = null;
  var lastPurge = 0;

  function enabled() { return LN.store.get('binOn') !== false; }
  function keepDays() { return Number(LN.store.get('binDays')) || 0; }
  function fail(e) { LN.toast(e && e.message ? e.message : 'Something went wrong'); }

  function size(b) {
    if (!b) return '0 KB';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    var d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }

  function leftText(ts) {
    var k = keepDays();
    if (!k) return '';
    var d = Math.ceil((ts + k * 86400000 - Date.now()) / 86400000);
    return d <= 0 ? 'Goes today' : 'Goes in ' + d + (d === 1 ? ' day' : ' days');
  }

  function summary() {
    var u = LN.vault.binUsage();
    return u.items ? u.items + (u.items === 1 ? ' item, ' : ' items, ') + size(u.bytes) : 'Empty';
  }

  function policyText() {
    if (!enabled()) return 'The Recycle bin is off, so new deletes are permanent. Items already here stay until you remove them.';
    var k = keepDays();
    return k ? 'Items are deleted for good after ' + k + ' days.' : 'Items stay here until you empty the bin.';
  }

  // ---------- badge on the sidebar button ----------
  function refresh() {
    if (badge) {
      var c = LN.vault.binCount();
      badge.textContent = c > 99 ? '99+' : String(c);
      badge.hidden = !c;
    }
    if (sheetRef) paint();
  }

  // ---------- deleting and restoring ----------
  // Used by the file tree. Moves to the bin, or deletes for good when the bin is off.
  function discard(n) {
    if (!enabled()) return LN.vault.remove(n.id);
    var name = n.name;
    return LN.vault.trash(n.id).then(function (ids) {
      refresh();
      LN.toast('Moved "' + name + '" to the Recycle bin', { label: 'Undo', ms: 7000, run: function () { return restoreOne(n.id); } });
      return ids;
    });
  }

  function restoreOne(id) {
    return LN.vault.restore(id).then(function (r) {
      refresh();
      LN.tree.render();
      LN.tree.select(r.id, true);
      var where = r.path.indexOf('/') >= 0 ? ' to ' + r.path.slice(0, r.path.lastIndexOf('/')) : '';
      LN.toast('Restored "' + r.node.name + '"' + where);
      return r;
    }).catch(function (e) { refresh(); throw e; }).then(function (r) { return r; }, function (e) { fail(e); });
  }

  function restoreAll() {
    var list = LN.vault.binItems();
    if (!list.length) return Promise.resolve();
    return list.reduce(function (p, it) {
      return p.then(function () { return LN.vault.restore(it.id); });
    }, Promise.resolve()).then(function () {
      refresh();
      LN.tree.render();
      LN.toast('Restored ' + list.length + (list.length === 1 ? ' item' : ' items'));
    });
  }

  function deleteForever(id) {
    var item = LN.vault.binItems().filter(function (x) { return x.id === id; })[0];
    if (!item) return Promise.resolve();
    if (!window.confirm('Delete "' + item.node.name + '" forever? This can\'t be undone.')) return Promise.resolve();
    return LN.vault.purge(id).then(function () { refresh(); LN.toast('Deleted forever'); });
  }

  function emptyAll() {
    var c = LN.vault.binCount();
    if (!c) { LN.toast('The Recycle bin is already empty'); return Promise.resolve(); }
    if (!window.confirm('Delete ' + (c === 1 ? 'the 1 item' : 'all ' + c + ' items') + ' in the Recycle bin forever? This can\'t be undone.')) return Promise.resolve();
    return LN.vault.emptyBin().then(function () { refresh(); LN.toast('Recycle bin emptied'); });
  }

  function autoPurge() {
    var k = keepDays();
    lastPurge = Date.now();
    if (!k) return Promise.resolve(0);
    return LN.vault.purgeOlder(k).then(function (c) { if (c) refresh(); return c; }, function () { return 0; });
  }

  // ---------- preview ----------
  function preview(id) {
    var m = LN.vault.binGet(id);
    if (!m) return;
    var s = LN.ui.sheet(m.name);
    if (m.type === 'folder') {
      var paths = LN.vault.binPaths(id);
      s.body.appendChild(LN.ui.el('div', 'set-section', paths.length ? 'Inside this folder' : 'This folder is empty'));
      if (paths.length) {
        var pre = LN.ui.el('pre', 'bin-pre', paths.join('\n'));
        s.body.appendChild(pre);
      }
      return;
    }
    if (m.bytes && m.bytes.length) {
      s.body.appendChild(LN.ui.el('p', 'hint', 'A ' + size(m.bytes.length) + ' file that is not plain text. Restore it to open it.'));
      return;
    }
    var text = String(m.content || '');
    s.body.appendChild(LN.ui.el('pre', 'bin-pre', text.slice(0, 6000) || '(empty file)'));
    if (text.length > 6000) s.body.appendChild(LN.ui.el('p', 'hint', 'Showing the first 6,000 characters of ' + text.length + '.'));
  }

  // ---------- the screen ----------
  function btn(text, cls, fn) {
    var b = LN.ui.el('button', 'btn small' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', function () {
      if (b.disabled) return;
      b.disabled = true;
      var p;
      try { p = fn(); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).catch(fail).then(function () { b.disabled = false; });
    });
    return b;
  }

  function iconFor(it) {
    if (it.folder) return 'folder';
    var k = LN.kindOfNode(it.node);
    if (k === 'img') return 'image';
    if (k === 'media') return 'music';
    return 'file';
  }

  function paint() {
    if (!sheetRef) return;
    var body = sheetRef.body;
    body.textContent = '';
    var list = LN.vault.binItems();

    var top = LN.ui.el('div', 'bin-top');
    top.appendChild(LN.ui.el('div', 'bin-sum', list.length ? summary() : 'Nothing here'));
    top.appendChild(LN.ui.el('div', 'set-desc', policyText()));
    if (list.length) {
      var acts = LN.ui.el('div', 'bin-acts');
      acts.appendChild(btn('Restore all', 'primary', restoreAll));
      acts.appendChild(btn('Empty bin', 'danger', emptyAll));
      top.appendChild(acts);
    }
    body.appendChild(top);

    if (!list.length) {
      body.appendChild(LN.ui.el('div', 'set-empty', 'Deleted files and folders show up here, so you can get them back.'));
      return;
    }

    var g = LN.ui.el('div', 'set-group');
    list.forEach(function (it) {
      var row = LN.ui.el('div', 'set-row stack bin-row');
      var head = LN.ui.el('div', 'bin-head');
      var ic = LN.ui.el('span', 'bin-ico');
      ic.innerHTML = LN.icon(iconFor(it), 18);
      head.appendChild(ic);
      var info = LN.ui.el('div', 'set-info');
      info.appendChild(LN.ui.el('div', 'set-label bin-name', it.node.name));
      var bits = [it.from ? 'From ' + it.from : 'From the top level', 'Deleted ' + ago(it.at)];
      bits.push(it.folder ? (it.items - 1) + (it.items === 2 ? ' item inside' : ' items inside') : size(it.bytes));
      var left = leftText(it.at);
      if (left) bits.push(left);
      info.appendChild(LN.ui.el('div', 'set-desc', bits.join(' · ')));
      head.appendChild(info);
      row.appendChild(head);
      var a = LN.ui.el('div', 'bin-acts');
      a.appendChild(btn('Restore', 'primary', function () { return restoreOne(it.id); }));
      a.appendChild(btn('Preview', '', function () { preview(it.id); return null; }));
      a.appendChild(btn('Delete', 'danger', function () { return deleteForever(it.id); }));
      row.appendChild(a);
      g.appendChild(row);
    });
    body.appendChild(g);
  }

  function open() {
    if (LN.settings && LN.settings.close) LN.settings.close();
    if (sheetRef) { paint(); return; }
    sheetRef = LN.ui.sheet('Recycle bin', function () { sheetRef = null; });
    paint();
  }

  // ---------- start ----------
  function init() {
    var bar = document.querySelector('.vault-bar');
    if (bar) {
      var b = LN.ui.el('button', 'vault-gear vault-bin');
      b.type = 'button';
      b.setAttribute('aria-label', 'Recycle bin');
      b.title = 'Recycle bin';
      b.innerHTML = LN.icon('bin', 18);
      badge = LN.ui.el('span', 'bin-badge', '0');
      badge.hidden = true;
      b.appendChild(badge);
      b.addEventListener('click', open);
      var gear = bar.querySelector('.vault-gear');
      bar.insertBefore(b, gear);
    }
    var del = document.getElementById('t-delete');
    if (del) { del.title = 'Delete (goes to the Recycle bin)'; del.setAttribute('aria-label', 'Delete'); }
    refresh();
    autoPurge();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Date.now() - lastPurge > 3600000) autoPurge();
    });
  }

  LN.bin = {
    init: init, open: open, discard: discard, enabled: enabled, restore: restoreOne,
    emptyAll: emptyAll, autoPurge: autoPurge, summary: summary, refresh: refresh, size: size
  };
})(window.LN = window.LN || {});
