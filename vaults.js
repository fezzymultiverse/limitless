(function (LN) {
  'use strict';

  var nameEl = null;
  var statEl = null;
  var sheetRef = null;

  function list() { return (LN.store.get('vaults') || []).slice(); }
  function activeId() { return LN.store.get('activeVault'); }
  function find(id) { return list().filter(function (v) { return v.id === id; })[0] || null; }
  function fail(e) { LN.toast(e && e.message ? e.message : 'Something went wrong'); }

  function stats() {
    var all = LN.vault.all();
    var f = all.filter(function (n) { return n.type === 'file'; }).length;
    return f + ' files, ' + (all.length - f) + ' folders';
  }

  function refresh() {
    var v = find(activeId());
    if (nameEl) nameEl.textContent = v ? v.name : 'Vault';
    if (statEl) statEl.textContent = stats();
  }

  function switchTo(id) {
    return LN.editor.flush().then(function () {
      LN.store.set('activeVault', id);
      if (LN.lock) LN.lock.keep();
      window.location.reload();
    });
  }

  function uniqueName(name, skipId) {
    var l = name.toLowerCase();
    return !list().some(function (v) { return v.id !== skipId && v.name.toLowerCase() === l; });
  }

  function create() {
    return LN.ui.form({
      title: 'Create vault',
      ok: 'Create and open',
      fields: [
        { key: 'name', label: 'Vault name', required: true, placeholder: 'For example Work' },
        { key: 'folder', label: 'Folder name inside Documents', desc: 'Used if you turn on Sync to folder for this vault.', placeholder: 'Same as the vault name' }
      ],
      note: 'A vault is its own place to save notes. It has its own files, open tabs and folder sync. Your other vaults stay as they are.',
      validate: function (v) { return uniqueName(v.name) ? '' : 'A vault with that name already exists.'; }
    }).then(function (v) {
      if (!v) return null;
      var id = 'v' + Date.now().toString(36);
      var folder = (v.folder || v.name).replace(/[\\\/:*?"<>|]/g, '').replace(/^\.+/, '').trim() || 'LimitlessNotepad';
      var vaults = list();
      vaults.push({ id: id, name: v.name });
      LN.store.set('vaults', vaults);
      LN.store.setVaultState(id, { capFolder: folder });
      return switchTo(id);
    });
  }

  function rename(id) {
    var v = find(id);
    if (!v) return Promise.resolve();
    return LN.ui.form({
      title: 'Rename vault', ok: 'Rename',
      fields: [{ key: 'name', label: 'Vault name', value: v.name, required: true }],
      validate: function (x) { return uniqueName(x.name, id) ? '' : 'A vault with that name already exists.'; }
    }).then(function (x) {
      if (!x) return;
      LN.store.set('vaults', list().map(function (a) { return a.id === id ? { id: a.id, name: x.name } : a; }));
      refresh();
      paintSheet();
    });
  }

  function remove(id) {
    var v = find(id);
    if (!v) return Promise.resolve();
    if (id === activeId()) { LN.toast('Open another vault first, then delete this one'); return Promise.resolve(); }
    if (list().length < 2) { LN.toast('You need at least one vault'); return Promise.resolve(); }
    if (!window.confirm('Delete the vault "' + v.name + '" and every note in it? This can\'t be undone. Files already synced to a folder stay there.')) return Promise.resolve();
    return new Promise(function (resolve) {
      var r = window.indexedDB.deleteDatabase(LN.vault.dbNameFor(id));
      r.onsuccess = r.onerror = r.onblocked = function () { resolve(); };
    }).then(function () {
      LN.store.set('vaults', list().filter(function (a) { return a.id !== id; }));
      LN.store.dropVaultState(id);
      LN.toast('Vault deleted');
      paintSheet();
    });
  }

  function paintSheet() {
    if (!sheetRef) return;
    var body = sheetRef.body;
    body.textContent = '';
    var g = LN.ui.el('div', 'set-group');
    list().forEach(function (v) {
      var on = v.id === activeId();
      var row = LN.ui.el('div', 'set-row');
      var info = LN.ui.el('div', 'set-info');
      info.appendChild(LN.ui.el('div', 'set-label', v.name));
      info.appendChild(LN.ui.el('div', 'set-desc', on ? 'Open now · ' + stats() : 'Tap Open to switch'));
      row.appendChild(info);
      var acts = LN.ui.el('div', 'vault-acts');
      function btn(text, fn) {
        var b = LN.ui.el('button', 'btn small', text);
        b.type = 'button';
        b.addEventListener('click', function () { Promise.resolve(fn()).catch(fail); });
        acts.appendChild(b);
      }
      if (!on) btn('Open', function () { return switchTo(v.id); });
      btn('Rename', function () { return rename(v.id); });
      if (!on) btn('Delete', function () { return remove(v.id); });
      row.appendChild(acts);
      g.appendChild(row);
    });
    body.appendChild(g);
    var add = LN.ui.el('button', 'btn primary vault-new', 'Create new vault');
    add.type = 'button';
    add.addEventListener('click', function () { create().catch(fail); });
    body.appendChild(add);
  }

  function openSheet() {
    if (LN.app && LN.app.closeDrawer) { /* keep the drawer open behind the sheet */ }
    sheetRef = LN.ui.sheet('Vaults', function () { sheetRef = null; });
    paintSheet();
  }

  // V0.7.8: Sync button next to the vault name. Runs the same full sync as Settings, Sync to folder, Sync now.
  var syncBtn = null;
  var syncing = false;
  function setSyncing(on) {
    syncing = on;
    if (!syncBtn) return;
    syncBtn.classList.toggle('spin', on);
    syncBtn.disabled = on;
    syncBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function syncTitle() {
    if (!syncBtn) return;
    var st = LN.folder && LN.folder.status ? LN.folder.status() : '';
    syncBtn.title = st ? 'Sync now. ' + st : 'Sync now';
  }
  function doSync() {
    if (syncing) return;
    if (!LN.folder || (!LN.folder.connected() && !(LN.extra && LN.extra.count()))) {
      LN.toast('No sync folder yet. Pick one under Sync to folder.');
      LN.settings.open('sync');
      return;
    }
    setSyncing(true);
    var first = LN.folder.needsPermission() ? LN.folder.reconnect() : Promise.resolve();
    Promise.resolve(first).then(function () { return LN.folder.syncNow(); }).then(function (s) {
      LN.toast('Synced · ' + s);
    }, function (e) {
      LN.toast(e && e.message ? e.message : 'Sync failed');
    }).then(function () { setSyncing(false); syncTitle(); refresh(); });
  }

  function build() {
    var side = document.getElementById('sidebar');
    var bar = LN.ui.el('div', 'vault-bar');
    var btn = LN.ui.el('button', 'vault-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Switch vault');
    var top = LN.ui.el('div', 'vault-name');
    nameEl = LN.ui.el('span', 'vault-nm', '');
    var chev = LN.ui.el('span', 'vault-chev');
    chev.innerHTML = LN.icon('chevron-down', 16);
    top.appendChild(nameEl);
    top.appendChild(chev);
    statEl = LN.ui.el('div', 'vault-stat', '');
    btn.appendChild(top);
    btn.appendChild(statEl);
    syncBtn = LN.ui.el('button', 'vault-gear vault-sync');
    syncBtn.type = 'button';
    syncBtn.setAttribute('aria-label', 'Sync now');
    syncBtn.innerHTML = LN.icon('sync', 18);
    syncBtn.addEventListener('click', doSync);
    var gear = LN.ui.el('button', 'vault-gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.innerHTML = LN.icon('gear', 18);
    bar.appendChild(btn);
    bar.appendChild(syncBtn);
    bar.appendChild(gear);
    side.appendChild(bar);
    btn.addEventListener('click', openSheet);
    gear.addEventListener('click', function () { LN.settings.open(); });
  }

  function init() {
    build();
    refresh();
    LN.vault.onChange(refresh);
    syncTitle();
    if (LN.folder && LN.folder.onStatus) LN.folder.onStatus(syncTitle);
  }

  LN.vaults = { init: init, refresh: refresh, open: openSheet };
})(window.LN = window.LN || {});
