(function (LN) {
  'use strict';
  // Diagnostic log, report, and the two reset actions (settings only, or all user data).
  // The log lives in this phone's storage, holds at most MAX short lines and never leaves the device unless the person shares it.

  var KEY = 'ln.log.v1';
  var MAX = 300;
  var buf = null;

  function load() {
    if (buf) return buf;
    try { buf = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { buf = []; }
    if (!Array.isArray(buf)) buf = [];
    return buf;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) { /* storage full or blocked */ }
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function clean(s) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ');
    // never write keys into the log
    s = s.replace(/(gsk_|AIza)[A-Za-z0-9_\-]{8,}/g, '$1***');
    s = s.replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '$1***');
    return s.length > 400 ? s.slice(0, 400) + '…' : s;
  }

  // level: info, warn, error
  function log(level, msg) {
    var b = load();
    b.push({ t: Date.now(), l: level === 'error' || level === 'warn' ? level : 'info', m: clean(msg) });
    if (b.length > MAX) b.splice(0, b.length - MAX);
    persist();
  }
  log.entries = function () { return load().slice(); };
  log.clear = function () { buf = []; persist(); };
  log.text = function (n) {
    var b = load();
    if (n) b = b.slice(-n);
    return b.map(function (e) { return stamp(e.t) + ' ' + e.l.toUpperCase() + ' ' + e.m; }).join('\n');
  };
  LN.log = log;

  window.addEventListener('error', function (e) {
    log('error', (e && e.message ? e.message : 'Script error') + (e && e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    log('error', 'Unhandled: ' + (r && r.message ? r.message : String(r)));
  });

  function size(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  // { used, quota, persisted } where the browser knows them
  function storage() {
    var out = { used: null, quota: null, persisted: null };
    var jobs = [];
    if (navigator.storage && navigator.storage.estimate) {
      jobs.push(navigator.storage.estimate().then(function (e) { out.used = e.usage; out.quota = e.quota; }, function () {}));
    }
    if (navigator.storage && navigator.storage.persisted) {
      jobs.push(navigator.storage.persisted().then(function (v) { out.persisted = v; }, function () {}));
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  function storageLine(s) {
    var u = LN.vault.usage();
    var t = u.files + ' files, ' + u.folders + ' folders, ' + size(u.bytes) + ' of notes in this vault';
    if (s.used != null) t += '. App storage in use: ' + size(s.used) + (s.quota ? ' of about ' + size(s.quota) : '');
    return t;
  }

  var SAFE = ['theme', 'accent', 'fontSize', 'editorFont', 'editorSize', 'editorLine', 'lineWrap', 'lineNumbers', 'spellcheck', 'defaultExt',
    'autosaveMs', 'lockAuto', 'lockIdle', 'lockBg', 'lockSecure', 'clipClear', 'exportWarn', 'backupAuto', 'backupKeep',
    'binOn', 'binDays', 'conflictMode', 'syncRetry', 'syncOut', 'mirrorDeletes', 'watchOn', 'watchSec', 'folderMode', 'aiProvider', 'aiKeyWatch'];

  // Plain-text report for support. No notes, no keys, no PIN.
  function report() {
    var perms = LN.access ? LN.access.defs : [];
    return Promise.all([storage()].concat(perms.map(function (d) { return LN.access.status(d.id); }))).then(function (r) {
      var s = r[0];
      var lines = [];
      lines.push('Limitless Notepad ' + (LN.settings ? LN.settings.version : ''));
      lines.push('Time: ' + stamp(Date.now()));
      lines.push('Platform: ' + (LN.native && LN.native.isNative() ? 'Android app' : 'Browser') + ' · ' + navigator.userAgent);
      lines.push('Storage: ' + storageLine(s) + (s.persisted != null ? ' · permanent storage ' + (s.persisted ? 'on' : 'off') : ''));
      lines.push('Recycle bin: ' + (LN.store.get('binOn') === false ? 'off' : 'on, empties after ' + (LN.store.get('binDays') || 'never') + ' days') + ' · ' + LN.bin.summary());
      lines.push('Protection: ' + (LN.lock ? LN.lock.summary() : 'n/a'));
      lines.push('Last backup: ' + (LN.store.get('lastBackup') ? stamp(LN.store.get('lastBackup')) + ' ' + (LN.store.get('lastBackupNote') || '') : 'never') +
        (LN.store.get('lastBackupError') ? ' · last error: ' + LN.store.get('lastBackupError') : ''));
      lines.push('Last sync: ' + (LN.store.get('lastSyncOk') ? stamp(LN.store.get('lastSyncOk')) : 'never') +
        (LN.store.get('lastSyncError') ? ' · last error: ' + LN.store.get('lastSyncError') : ''));
      lines.push('Permissions:');
      perms.forEach(function (d, i) { lines.push('  ' + d.label + ': ' + r[i + 1]); });
      lines.push('AI keys: ' + (LN.keys ? LN.keys.summary() : 'n/a') + ' (key values are never included)');
      lines.push('Settings:');
      SAFE.forEach(function (k) { lines.push('  ' + k + ' = ' + JSON.stringify(LN.store.get(k))); });
      lines.push('', 'Log (newest last):', log.text(100) || '(empty)');
      return lines.join('\n');
    });
  }

  function resetSettings() {
    LN.store.resetSettings();
    log('info', 'Settings reset to defaults');
    return Promise.resolve();
  }

  function delDb(name) {
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      try {
        var r = indexedDB.deleteDatabase(name);
        r.onsuccess = fin; r.onerror = fin; r.onblocked = fin;
      } catch (e) { fin(); }
      setTimeout(fin, 1500);
    });
  }

  // Deletes every vault, the backups kept inside the app, music, settings, PIN and keys on this device.
  // Files already synced to a folder or saved to Documents are not touched.
  function deleteAllData() {
    var ids = (LN.store.get('vaults') || []).map(function (v) { return v.id; });
    if (ids.indexOf('default') < 0) ids.unshift('default');
    try { LN.vault.close(); } catch (e) { /* not open */ }
    var names = ids.map(function (id) { return LN.vault.dbNameFor(id); })
      .concat(['limitless-notepad-fs', 'limitless-notepad-music', 'limitless-notepad-backups']);
    return Promise.all(names.map(delDb)).then(function () {
      try {
        var drop = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('ln.') === 0) drop.push(k);
        }
        drop.forEach(function (k) { localStorage.removeItem(k); });
        sessionStorage.clear();
      } catch (e) { /* blocked */ }
      var n = LN.native && LN.native.plugin ? LN.native.plugin('LocalNotifications') : null;
      if (n && n.cancel) {
        return n.getPending().then(function (p) { return p.notifications && p.notifications.length ? n.cancel({ notifications: p.notifications }) : null; }).catch(function () {});
      }
      return null;
    });
  }

  LN.diag = { report: report, storage: storage, storageLine: storageLine, resetSettings: resetSettings, deleteAllData: deleteAllData, stamp: stamp, size: size };
})(window.LN = window.LN || {});
