(function (LN) {
  'use strict';

  var MAX_DEPTH = 8;
  var engine = null;
  var backend = null;
  var mode = 'off';
  var watchTimer = null;
  var pushTimer = null;
  var listeners = [];
  var state = { text: '', busy: false, needsPermission: false };

  // ---------- helpers ----------
  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(s);
  }
  function fromB64(b64) {
    var s = atob(b64 || '');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function say(text) {
    state.text = text;
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
  }
  function stamp() { return new Date().toLocaleString(); }
  function msg(e) { return e && e.message ? e.message : String(e || 'Unknown error'); }

  // ---------- backend: browser folder picker (File System Access API) ----------
  var HDB = 'limitless-notepad-fs';
  function hdb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(HDB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function hput(key, val) {
    return hdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('h', 'readwrite');
        tx.objectStore('h').put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function hget(key) {
    return hdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var q = db.transaction('h', 'readonly').objectStore('h').get(key);
        q.onsuccess = function () { resolve(q.result || null); };
        q.onerror = function () { reject(q.error); };
      });
    });
  }

  function rootKey() {
    var id = LN.store.get('activeVault');
    return !id || id === 'default' ? 'root' : 'root-' + id;
  }

  function fsaBackend(root) {
    function dirFor(path, create) {
      var parts = path ? path.split('/') : [];
      var chain = Promise.resolve(root);
      parts.forEach(function (p) {
        chain = chain.then(function (d) { return d.getDirectoryHandle(p, { create: !!create }); });
      });
      return chain;
    }
    function split(path) {
      var i = path.lastIndexOf('/');
      return { dir: i < 0 ? '' : path.slice(0, i), name: i < 0 ? path : path.slice(i + 1) };
    }
    function walk(dir, prefix, depth, out) {
      if (depth > MAX_DEPTH) return Promise.resolve();
      var entries = [];
      var it = dir.values();
      function next() {
        return it.next().then(function (r) {
          if (r.done) return null;
          entries.push(r.value);
          return next();
        });
      }
      return next().then(function () {
        var chain = Promise.resolve();
        entries.forEach(function (h) {
          if (h.name.charAt(0) === '.') return;
          var path = prefix ? prefix + '/' + h.name : h.name;
          if (h.kind === 'directory') {
            out.push({ path: path, dir: true, mtime: 0, size: 0 });
            chain = chain.then(function () { return walk(h, path, depth + 1, out); });
          } else {
            chain = chain.then(function () { return h.getFile(); }).then(function (f) {
              out.push({ path: path, dir: false, mtime: f.lastModified, size: f.size });
            });
          }
        });
        return chain;
      });
    }
    return {
      name: 'Browser folder',
      list: function () { var out = []; return walk(root, '', 0, out).then(function () { return out; }); },
      stat: function (path) {
        var s = split(path);
        return dirFor(s.dir, false).then(function (d) { return d.getFileHandle(s.name); })
          .then(function (h) { return h.getFile(); })
          .then(function (f) { return { mtime: f.lastModified, size: f.size }; })
          .catch(function () { return null; });
      },
      read: function (path) {
        var s = split(path);
        return dirFor(s.dir, false).then(function (d) { return d.getFileHandle(s.name); })
          .then(function (h) { return h.getFile(); })
          .then(function (f) { return f.arrayBuffer(); })
          .then(function (b) { return new Uint8Array(b); });
      },
      write: function (path, bytes) {
        var s = split(path);
        return dirFor(s.dir, true).then(function (d) { return d.getFileHandle(s.name, { create: true }); })
          .then(function (h) { return h.createWritable(); })
          .then(function (w) { return w.write(bytes).then(function () { return w.close(); }); });
      },
      mkdir: function (path) { return dirFor(path, true).then(function () {}); },
      remove: function (path, isDir) {
        var s = split(path);
        return dirFor(s.dir, false).then(function (d) { return d.removeEntry(s.name, { recursive: !!isDir }); });
      }
    };
  }

  // ---------- backend: Android Documents folder (Capacitor Filesystem) ----------
  function capPlugin() {
    return LN.native ? LN.native.plugin('Filesystem') : null;
  }

  function capBackend(fs, folder) {
    var DIR = 'DOCUMENTS';
    function full(path) { return path ? folder + '/' + path : folder; }
    function walk(prefix, depth, out) {
      if (depth > MAX_DEPTH) return Promise.resolve();
      return fs.readdir({ path: full(prefix), directory: DIR }).then(function (r) {
        var chain = Promise.resolve();
        (r.files || []).forEach(function (f) {
          if (f.name.charAt(0) === '.') return;
          var path = prefix ? prefix + '/' + f.name : f.name;
          if (f.type === 'directory') {
            out.push({ path: path, dir: true, mtime: 0, size: 0 });
            chain = chain.then(function () { return walk(path, depth + 1, out); });
          } else {
            out.push({ path: path, dir: false, mtime: Number(f.mtime) || 0, size: Number(f.size) || 0 });
          }
        });
        return chain;
      });
    }
    function ensure(path) {
      return fs.mkdir({ path: full(path), directory: DIR, recursive: true }).catch(function (e) {
        return fs.stat({ path: full(path), directory: DIR }).then(function () {}, function () { throw e; });
      });
    }
    return {
      name: 'Documents/' + folder,
      ensureRoot: function () { return ensure(''); },
      list: function () { var out = []; return walk('', 0, out).then(function () { return out; }); },
      stat: function (path) {
        return fs.stat({ path: full(path), directory: DIR })
          .then(function (s) { return { mtime: Number(s.mtime) || 0, size: Number(s.size) || 0 }; })
          .catch(function () { return null; });
      },
      read: function (path) {
        return fs.readFile({ path: full(path), directory: DIR }).then(function (r) { return fromB64(r.data); });
      },
      write: function (path, bytes) {
        return fs.writeFile({ path: full(path), directory: DIR, data: toB64(bytes), recursive: true });
      },
      mkdir: function (path) { return ensure(path); },
      remove: function (path, isDir) {
        if (isDir) return fs.rmdir({ path: full(path), directory: DIR, recursive: true });
        return fs.deleteFile({ path: full(path), directory: DIR });
      }
    };
  }

  // ---------- backend: any folder picked with the Android system picker (LNFolder plugin) ----------
  function safPlugin() {
    return LN.native ? LN.native.plugin('LNFolder') : null;
  }

  function safBackend(pl, uri, label) {
    return {
      name: label,
      ensureRoot: function () { return pl.check({ uri: uri }).then(function (r) { if (!r.ok) throw new Error('Access to the folder was lost. Pick it again.'); }); },
      list: function () { return pl.list({ uri: uri }).then(function (r) { return r.files || []; }); },
      stat: function (path) {
        return pl.stat({ uri: uri, path: path })
          .then(function (s) { return s.exists ? { mtime: Number(s.mtime) || 0, size: Number(s.size) || 0 } : null; })
          .catch(function () { return null; });
      },
      read: function (path) { return pl.read({ uri: uri, path: path }).then(function (r) { return fromB64(r.data); }); },
      write: function (path, bytes) { return pl.write({ uri: uri, path: path, data: toB64(bytes) }); },
      mkdir: function (path) { return pl.mkdir({ uri: uri, path: path }); },
      remove: function (path) { return pl.remove({ uri: uri, path: path }); }
    };
  }

  // ---------- availability ----------
  function pickAvailable() { return !!safPlugin(); }
  function available() {
    if (capPlugin()) return 'cap';
    if (typeof window.showDirectoryPicker === 'function') return 'fsa';
    return null;
  }

  function cleanFolderName(v) {
    v = String(v || '').replace(/[\\\/:*?"<>|]/g, '').replace(/^\.+/, '').trim();
    return v || 'LimitlessNotepad';
  }

  // ---------- engine wiring ----------
  function loadIndex() { return JSON.parse(JSON.stringify(LN.store.get('folderIndex') || {})); }
  function saveIndex(i) { LN.store.set('folderIndex', i); }
  function options() {
    return {
      mirrorDeletes: !!LN.store.get('mirrorDeletes'),
      excluded: LN.store.get('syncExclude') || '',
      conflict: LN.store.get('conflictMode') || 'folder'
    };
  }

  // ---------- failures and automatic retry ----------
  var RETRY_SEC = [30, 60, 120, 300, 300];
  var retry = { n: 0, timer: null };
  function clearRetry() { if (retry.timer) { clearTimeout(retry.timer); retry.timer = null; } }
  function noteOk() {
    clearRetry();
    retry.n = 0;
    LN.store.set('lastSyncOk', Date.now());
    LN.store.set('lastSyncError', '');
  }
  function noteFail(e) {
    var m = msg(e);
    LN.store.set('lastSyncError', stamp() + ' · ' + m);
    if (LN.log) LN.log('error', 'Folder sync failed: ' + m);
    if (!LN.store.get('syncRetry') || !engine || state.needsPermission) return;
    if (retry.n >= RETRY_SEC.length) { say('Sync failed: ' + m + '. Gave up after ' + retry.n + ' retries'); return; }
    var wait = RETRY_SEC[retry.n++];
    clearRetry();
    retry.timer = setTimeout(function () {
      retry.timer = null;
      if (!engine || state.busy) return;
      syncNow().catch(function () { /* noteFail already scheduled the next try */ });
    }, wait * 1000);
    say('Sync failed: ' + m + '. Retrying in ' + wait + ' s');
  }
  function retryNow() {
    clearRetry();
    retry.n = 0;
    return syncNow();
  }

  // V0.7.20: live "Syncing 120 / 800" text, throttled so it never costs a frame.
  var progAt = 0;
  function onProgress(p) {
    var now = Date.now();
    if (p.phase !== 'pull' || p.total <= 1 || now - progAt < 250) return;
    progAt = now;
    say('Syncing ' + Math.min(p.done, p.total) + ' / ' + p.total + '…');
  }
  // V0.7.20: connecting no longer walks the whole folder first. It checks access and returns; the first sync runs in the background.
  function firstSyncSoon() { setTimeout(function () { if (engine && !state.busy) syncNow().catch(function () { /* status line shows it */ }); }, 60); }

  function attach(b, m) {
    backend = b;
    mode = m;
    engine = LN.foldersync.create({ vault: LN.vault, backend: b, loadIndex: loadIndex, saveIndex: saveIndex, options: options, progress: onProgress });
    state.needsPermission = false;
  }

  function summary(res) {
    var parts = [];
    if (res.pull) {
      var p = res.pull;
      if (p.created) parts.push(p.created + ' imported');
      if (p.updated) parts.push(p.updated + ' updated from folder');
      if (p.conflicts) parts.push(p.conflicts + ' vault ' + (p.conflicts === 1 ? 'copy' : 'copies') + ' kept');
      if (p.guarded) parts.push(p.guarded + ' empty folder ' + (p.guarded === 1 ? 'file' : 'files') + ' not imported');
      if (p.big) parts.push(p.big + ' over 25 MB not imported');
      if (p.errors) parts.push(p.errors + ' failed' + (p.errorNames && p.errorNames.length ? ' (' + p.errorNames.slice(0, 2).join(', ') + (p.errorNames.length > 2 ? '…' : '') + ')' : ''));
    }
    if (res.push) {
      var q = res.push;
      if (q.held) parts.push('upload held back until the folder errors are fixed');
      if (q.written) parts.push(q.written + ' written');
      if (q.removed) parts.push(q.removed + ' removed');
      if (q.errors) parts.push(q.errors + ' failed');
    }
    return parts.length ? parts.join(', ') : 'Everything up to date';
  }

  function refreshUi(ids) {
    LN.tree.render();
    LN.tabs.render();
    var cur = LN.editor.currentId();
    if (cur && ids && ids.indexOf(cur) >= 0) LN.editor.load(cur);
  }

  function connected() { return !!engine; }

  function guard() {
    if (!engine) return Promise.reject(new Error('Choose a folder first'));
    if (state.needsPermission) return Promise.reject(new Error('Reconnect the folder first'));
    return Promise.resolve();
  }

  function syncMain() {
    return guard().then(function () {
      state.busy = true;
      say('Syncing…');
      return LN.editor.flush().then(function () { return engine.sync(); });
    }).then(function (res) {
      state.busy = false;
      var s = summary(res);
      LN.store.set('lastSync', stamp() + ' · ' + s);
      LN.store.set('lastCheck', stamp());
      refreshUi(res.pull.changedIds);
      say('Last sync: ' + LN.store.get('lastSync'));
      var bad = res.pull.errors + (res.push.errors || 0);
      if (bad || res.push.held) noteFail(new Error(bad + ' ' + (bad === 1 ? 'file' : 'files') + ' failed. ' + s));
      else noteOk();
      return s;
    }).catch(function (e) {
      state.busy = false;
      say('Sync failed: ' + msg(e));
      noteFail(e);
      throw e;
    });
  }

  // V0.7.9: extra folders (extra.js) are synced after the main folder, or on their own when no main folder is set
  function syncExtras() {
    if (!LN.extra || !LN.extra.count()) return Promise.resolve(null);
    return LN.extra.syncAll().then(function (o) {
      if (o.changed && o.changed.length) refreshUi(o.changed); else LN.tree.render();
      return o;
    });
  }
  function syncNow() {
    var hasX = !!(LN.extra && LN.extra.count());
    if (!hasX) return syncMain();
    var main = engine ? syncMain().then(function (s) { return { s: s }; }, function (e) { return { e: e }; }) : Promise.resolve({ s: '' });
    return main.then(function (m) {
      return syncExtras().then(function (o) {
        if (o && o.busy) { if (m.e) throw m.e; return m.s || 'Extra folders are already syncing'; }
        if (o && o.failed.length) {
          var err = new Error(o.failed.join('; '));
          say('Sync failed: ' + err.message);
          noteFail(err);
          throw err;
        }
        if (m.e) throw m.e;
        if (!engine) noteOk();
        var extra = o && o.done ? o.done + ' extra ' + (o.done === 1 ? 'folder' : 'folders') + ' synced' : '';
        if (!engine) say('Last sync: ' + stamp() + ' · ' + extra);
        return m.s && extra ? m.s + ', ' + extra : (m.s || extra || 'Everything up to date');
      });
    });
  }

  function checkNow(quiet) {
    return guard().then(function () {
      state.busy = true;
      return LN.editor.flush().then(function () { return engine.pull(); });
    }).then(function (res) {
      state.busy = false;
      LN.store.set('lastCheck', stamp());
      var changed = res.created + res.updated + res.conflicts;
      if (changed) {
        refreshUi(res.changedIds);
        var s = summary({ pull: res });
        LN.store.set('lastSync', stamp() + ' · ' + s);
        if (!quiet) LN.toast('Folder: ' + s);
      }
      say(changed ? 'Last change from folder: ' + LN.store.get('lastSync') : 'Checked ' + LN.store.get('lastCheck') + ', no changes');
      return res;
    }).catch(function (e) {
      state.busy = false;
      say('Check failed: ' + msg(e));
      throw e;
    });
  }

  function schedulePush() {
    var hasX = !!(LN.extra && LN.extra.count());
    if ((!engine && !hasX) || !LN.store.get('syncOut') || state.needsPermission) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      if (LN.extra && LN.extra.count() && !LN.extra.busy()) LN.extra.pushAll().then(function () {}, function () {});
      if (!engine) return;
      engine.push().then(function (r) {
        if (r.needsPull) return engine.sync().then(function (res) { refreshUi(res.pull.changedIds); });
        if (r.written || r.removed) {
          LN.store.set('lastSync', stamp() + ' · ' + summary({ push: r }));
          say('Last sync: ' + LN.store.get('lastSync'));
        }
        if (r.errors) throw new Error(r.errors + (r.errors === 1 ? ' file' : ' files') + ' failed to write');
        noteOk();
        return null;
      }).catch(function (e) { say('Sync failed: ' + msg(e)); noteFail(e); });
    }, 1500);
  }

  // ---------- watch loop ----------
  function stopWatch() { if (watchTimer) { clearInterval(watchTimer); watchTimer = null; } }
  function startWatch() {
    stopWatch();
    var hasX = !!(LN.extra && LN.extra.count());
    if ((!engine && !hasX) || !LN.store.get('watchOn') || state.needsPermission) return;
    var sec = Math.max(5, Number(LN.store.get('watchSec')) || 10);
    watchTimer = setInterval(function () {
      if (document.hidden || state.busy) return;
      if (engine) checkNow(false).catch(function () { /* status line already shows the error */ });
      if (LN.extra && LN.extra.count() && !LN.extra.busy()) LN.extra.pullAll().then(function (o) { if (o.changed && o.changed.length) refreshUi(o.changed); }, function () {});
    }, sec * 1000);
  }

  // ---------- choose / reconnect / disconnect ----------
  function choose() {
    var kind = available();
    if (kind === 'cap') {
      var fs = capPlugin();
      var name = cleanFolderName(LN.store.get('capFolder'));
      LN.store.set('capFolder', name);
      return Promise.resolve().then(function () {
        return fs.requestPermissions ? fs.requestPermissions().catch(function () { return null; }) : null;
      }).then(function () {
        var b = capBackend(fs, name);
        return b.ensureRoot().then(function () { return b; });
      }).then(function (b) {
        LN.store.set('folderIndex', {});
        LN.store.set('folderMode', 'cap');
        LN.store.set('folderLabel', b.name);
        attach(b, 'cap');
        say('Connected: ' + b.name);
        startWatch();
        firstSyncSoon();
        return b.name;
      });
    }
    if (kind === 'fsa') {
      return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
        return hput(rootKey(), h).then(function () {
          LN.store.set('folderIndex', {});
          LN.store.set('folderMode', 'fsa');
          LN.store.set('folderLabel', h.name);
          attach(fsaBackend(h), 'fsa');
          say('Connected: ' + h.name);
          startWatch();
          return h.name;
        });
      });
    }
    return Promise.reject(new Error('This device can\'t open folders from here'));
  }

  // Android: any folder via the system picker (Documents, Downloads, SD card, Termux shared storage...)
  function choosePicked() {
    var pl = safPlugin();
    if (!pl) return Promise.reject(new Error('The folder picker is not available in this build'));
    return pl.pick().then(function (r) {
      var b = safBackend(pl, r.uri, r.name);
      return b.ensureRoot().then(function () {
        LN.store.set('folderIndex', {});
        LN.store.set('folderMode', 'saf');
        LN.store.set('safUri', r.uri);
        LN.store.set('folderLabel', r.name);
        attach(b, 'saf');
        say('Connected: ' + r.name);
        startWatch();
        firstSyncSoon();
        return r.name;
      });
    }).catch(function (e) {
      if (e && /cancel/i.test(e.message || '')) throw new Error('No folder picked');
      throw e;
    });
  }

  function reconnect() {
    if (LN.store.get('folderMode') === 'saf') return choosePicked();
    if (LN.store.get('folderMode') !== 'fsa') return choose();
    return hget(rootKey()).then(function (h) {
      if (!h) return choose();
      return h.requestPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') throw new Error('Permission was not granted');
        attach(fsaBackend(h), 'fsa');
        say('Connected: ' + h.name);
        startWatch();
        return h.name;
      });
    });
  }

  function disconnect() {
    stopWatch();
    clearRetry();
    retry.n = 0;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    engine = null;
    backend = null;
    mode = 'off';
    LN.store.set('folderMode', 'off');
    LN.store.set('folderLabel', '');
    LN.store.set('folderIndex', {});
    LN.store.set('watchOn', false);
    LN.store.set('syncOut', false);
    say('No folder chosen');
  }

  // ---------- startup ----------
  function init() {
    LN.vault.onChange(schedulePush);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && engine && LN.store.get('watchOn') && !state.busy) checkNow(true).catch(function () {});
    });
    var saved = LN.store.get('folderMode');
    var kind = available();
    if (saved === 'saf' && safPlugin()) {
      var uri = LN.store.get('safUri');
      var sb = safBackend(safPlugin(), uri, LN.store.get('folderLabel') || 'Chosen folder');
      attach(sb, 'saf');
      sb.ensureRoot().then(function () {
        say('Connected: ' + sb.name);
        startWatch();
      }, function () {
        state.needsPermission = true;
        stopWatch();
        say('Tap Reconnect to pick ' + sb.name + ' again');
      });
    } else if (saved === 'cap' && kind === 'cap') {
      var b = capBackend(capPlugin(), cleanFolderName(LN.store.get('capFolder')));
      attach(b, 'cap');
      say('Connected: ' + b.name);
      b.ensureRoot().catch(function () { /* the status line shows the error on the first sync */ });
      startWatch();
    } else if (saved === 'fsa' && kind === 'fsa') {
      hget(rootKey()).then(function (h) {
        if (!h) { say('No folder chosen'); return null; }
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          if (p === 'granted') { attach(fsaBackend(h), 'fsa'); say('Connected: ' + h.name); startWatch(); }
          else {
            attach(fsaBackend(h), 'fsa');
            state.needsPermission = true;
            say('Tap Reconnect to allow access to ' + h.name);
          }
        });
      }).catch(function (e) { say('Folder unavailable: ' + msg(e)); });
    } else {
      say(saved && saved !== 'off' ? 'Folder is not available on this device' : 'No folder chosen');
    }
    startWatch();
  }

  LN.folder = {
    init: init, available: available, choose: choose, choosePicked: choosePicked, pickAvailable: pickAvailable, reconnect: reconnect, disconnect: disconnect,
    syncNow: syncNow, retryNow: retryNow, retryPending: function () { return !!retry.timer; },
    lastError: function () { return LN.store.get('lastSyncError') || ''; }, checkNow: checkNow, startWatch: startWatch, stopWatch: stopWatch,
    connected: connected, status: function () { return state.text; },
    needsPermission: function () { return state.needsPermission; },
    onStatus: function (fn) { listeners.push(fn); },
    offStatus: function (fn) { listeners = listeners.filter(function (x) { return x !== fn; }); },
    label: function () { return LN.store.get('folderLabel') || ''; },
    _b64: { to: toB64, from: fromB64 },
    _int: { cap: capBackend, saf: safBackend, fsa: fsaBackend, capPlugin: capPlugin, safPlugin: safPlugin, hget: hget, hput: hput },
    startWatch2: startWatch
  };
})(window.LN = window.LN || {});
