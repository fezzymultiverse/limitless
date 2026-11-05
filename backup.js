(function (LN) {
  'use strict';
  // Backup and restore.
  // A backup is a normal .zip: manifest.json plus every note and file at vaults/<id>/files/<path>.
  // Backups are never encrypted. Restore never overwrites a note that is newer than the backup's copy:
  // the backup's version is added next to it as "name (backup copy)". A safety backup of the current
  // notes is kept inside the app before any restore.

  var N = LN.native;
  var DIR = 'LimitlessNotepad-Backups';
  var BDB = 'limitless-notepad-backups';
  var BST = 'b';
  var WEEK = 7 * 86400000;
  var DAY = 86400000;
  var timer = null;
  var running = false;

  // settings that travel with a backup. PIN, keys, folder links and permissions never do.
  var SETTING_KEYS = ['theme', 'accent', 'fontSize', 'editorFont', 'editorSize', 'editorLine', 'lineWrap', 'lineNumbers', 'spellcheck',
    'defaultExt', 'cursorBlink', 'autosaveMs', 'confirmDelete', 'showStatus', 'viewMode', 'lockAuto', 'lockIdle', 'lockBg', 'clipClear',
    'exportWarn', 'backupAuto', 'backupKeep', 'conflictMode', 'syncRetry', 'musicFolder', 'photoFolder', 'locationLink', 'calAlert'];

  function msg(e) { return e && e.message ? e.message : String(e || 'Unknown error'); }
  function log(l, m) { if (LN.log) LN.log(l, m); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fileStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }
  function size(n) { return LN.diag.size(n); }

  // ---------- backups kept inside the app ----------
  function bdb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Storage is not available')); return; }
      var r = indexedDB.open(BDB, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(BST)) r.result.createObjectStore(BST, { keyPath: 'id' }); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function bAll() {
    return bdb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var q = d.transaction(BST, 'readonly').objectStore(BST).getAll();
        q.onsuccess = function () { d.close(); resolve(q.result.sort(function (a, b) { return b.created - a.created; })); };
        q.onerror = function () { d.close(); reject(q.error); };
      });
    });
  }
  function bPut(rec) {
    return bdb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(BST, 'readwrite');
        tx.objectStore(BST).put(rec);
        tx.oncomplete = function () { d.close(); resolve(); };
        tx.onerror = tx.onabort = function () { d.close(); reject(tx.error); };
      });
    });
  }
  function bTrim(keep) {
    return bAll().then(function (list) {
      // safety backups and normal backups are trimmed separately
      var out = [];
      ['safety', 'backup'].forEach(function (kind) {
        var l = list.filter(function (x) { return (x.kind || 'backup') === kind; });
        out = out.concat(l.slice(kind === 'safety' ? 2 : keep));
      });
      if (!out.length) return null;
      return bdb().then(function (d) {
        return new Promise(function (resolve) {
          var tx = d.transaction(BST, 'readwrite');
          out.forEach(function (x) { tx.objectStore(BST).delete(x.id); });
          tx.oncomplete = tx.onerror = tx.onabort = function () { d.close(); resolve(); };
        });
      });
    });
  }
  function list() { return bAll().catch(function () { return []; }); }

  // ---------- build ----------
  function pathMap(nodes) {
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    function pathOf(n) {
      var parts = [n.name], p = n.parent, guard = 0;
      while (p && byId[p] && guard++ < 64) { parts.unshift(byId[p].name); p = byId[p].parent; }
      return parts.join('/');
    }
    return { byId: byId, pathOf: pathOf };
  }

  function build(label) {
    var enc = new TextEncoder();
    var vaults = (LN.store.get('vaults') || []).slice();
    var pkg = LN.zip.create();
    var manifest = { app: 'Limitless Notepad', format: 1, version: LN.settings.version, created: new Date().toISOString(), label: label || 'manual', vaults: [], settings: {} };
    SETTING_KEYS.forEach(function (k) { manifest.settings[k] = LN.store.get(k); });
    var files = 0, folders = 0;
    return (LN.editor && LN.editor.flush ? LN.editor.flush() : Promise.resolve()).then(function () {
      return vaults.reduce(function (p, v) {
        return p.then(function () {
          return LN.vault.readVault(v.id).then(function (nodes) {
            var pm = pathMap(nodes);
            var entry = { id: v.id, name: v.name, nodes: [] };
            nodes.forEach(function (n) {
              var path = pm.pathOf(n);
              var rec = { type: n.type, path: path, updated: n.updated || 0, created: n.created || 0 };
              if (n.type === 'folder') { folders++; entry.nodes.push(rec); return; }
              var bytes = n.bytes ? n.bytes : enc.encode(n.content || '');
              rec.size = bytes.length;
              rec.bin = n.bytes ? 1 : 0;
              files++;
              pkg.setBytes('vaults/' + v.id + '/files/' + path, bytes);
              entry.nodes.push(rec);
            });
            manifest.vaults.push(entry);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      pkg.setText('manifest.json', JSON.stringify(manifest, null, 1));
      pkg.setText('README.txt', 'Limitless Notepad backup made ' + manifest.created + '.\nEvery note is stored as a normal file under vaults/<vault id>/files/. This zip is NOT encrypted.\nRestore it from Settings, Backup.\n');
      return pkg.build();
    }).then(function (bytes) {
      return verify(bytes, files).then(function () {
        return { bytes: bytes, files: files, folders: folders, vaults: vaults.length, created: manifest.created };
      });
    });
  }

  // Open the zip again and compare it with what was meant to go in before calling it a backup.
  function verify(bytes, files) {
    var pkg;
    try { pkg = LN.zip.parse(bytes); } catch (e) { return Promise.reject(new Error('Backup check failed: ' + msg(e))); }
    return pkg.text('manifest.json').then(function (t) {
      var m = JSON.parse(t), n = 0;
      m.vaults.forEach(function (v) {
        v.nodes.forEach(function (x) {
          if (x.type !== 'file') return;
          var e = pkg.map['vaults/' + v.id + '/files/' + x.path];
          if (!e || e.usize !== x.size) throw new Error('Backup check failed: ' + x.path + ' did not match');
          n++;
        });
      });
      if (n !== files) throw new Error('Backup check failed: ' + n + ' of ' + files + ' files');
    });
  }

  // ---------- save to the phone ----------
  function saveNative(name, bytes, keep) {
    var fs = N.plugin('Filesystem');
    if (!fs) return Promise.reject(new Error('Filesystem plugin missing'));
    var path = DIR + '/' + name;
    return fs.writeFile({ path: path, directory: 'DOCUMENTS', data: N.bytesToB64(bytes), recursive: true }).then(function () {
      return fs.stat({ path: path, directory: 'DOCUMENTS' });
    }).then(function (st) {
      if (Number(st.size) !== bytes.length) throw new Error('The saved backup is ' + st.size + ' bytes, expected ' + bytes.length);
      return fs.readdir({ path: DIR, directory: 'DOCUMENTS' }).then(function (r) {
        var old = (r.files || []).filter(function (f) { return /^limitless-notepad-backup-.*\.zip$/.test(f.name); })
          .sort(function (a, b) { return a.name < b.name ? 1 : -1; }).slice(Math.max(1, keep));
        return Promise.all(old.map(function (f) { return fs.deleteFile({ path: DIR + '/' + f.name, directory: 'DOCUMENTS' }).catch(function () {}); }));
      }).catch(function () { /* cleaning old files is best effort */ });
    }).then(function () { return 'Documents/' + DIR; });
  }

  function download(name, bytes) {
    var blob = new Blob([bytes], { type: 'application/zip' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return Promise.resolve('Downloads');
  }

  // ---------- run a backup ----------
  // opts: { auto: bool, safety: bool }. A safety backup stays inside the app and never changes "last backup".
  function run(opts) {
    opts = opts || {};
    if (running) return Promise.reject(new Error('A backup is already running'));
    running = true;
    var d = new Date();
    var name = 'limitless-notepad-backup-' + fileStamp(d) + '.zip';
    var keep = Math.max(1, Number(LN.store.get('backupKeep')) || 5);
    return build(opts.safety ? 'safety' : (opts.auto ? 'auto' : 'manual')).then(function (b) {
      var rec = { id: 'b' + d.getTime().toString(36), name: name, created: d.getTime(), size: b.bytes.length, files: b.files, kind: opts.safety ? 'safety' : 'backup', auto: !!opts.auto, bytes: b.bytes };
      return bPut(rec).then(function () { return bTrim(keep); }).then(function () {
        if (opts.safety) return 'inside the app';
        // the copy kept inside the app is cleared with the app's data, so also write one the phone keeps
        if (N.isNative()) return saveNative(name, b.bytes, keep).then(function (w) { return w + ' and inside the app'; });
        return opts.auto ? Promise.resolve('inside the app') : download(name, b.bytes).then(function (w) { return w + ' and inside the app'; });
      }).then(function (where) {
        var note = (opts.auto ? 'Automatic' : 'Manual') + ' · ' + b.files + ' files, ' + size(b.bytes.length) + ' · saved to ' + where;
        if (!opts.safety) {
          LN.store.set('lastBackup', d.getTime());
          LN.store.set('lastBackupNote', note);
          LN.store.set('lastBackupError', '');
        }
        log('info', (opts.safety ? 'Safety backup ' : 'Backup ') + name + ': ' + note);
        running = false;
        return { name: name, files: b.files, bytes: b.bytes.length, where: where, note: note };
      });
    }).catch(function (e) {
      running = false;
      if (!opts.safety) LN.store.set('lastBackupError', LN.diag.stamp(Date.now()) + ' ' + msg(e));
      log('error', 'Backup failed: ' + msg(e));
      throw e;
    });
  }

  function manual() {
    return LN.secure.warnExport('A backup').then(function (ok) {
      if (!ok) return null;
      return run({ auto: false });
    });
  }

  // ---------- schedule ----------
  function intervalMs() {
    var a = LN.store.get('backupAuto');
    return a === 'daily' ? DAY : (a === 'weekly' ? WEEK : 0);
  }
  function due() {
    var iv = intervalMs();
    return iv > 0 && Date.now() - (Number(LN.store.get('lastBackup')) || 0) >= iv;
  }
  function nextText() {
    var iv = intervalMs();
    if (!iv) return 'Automatic backup is off';
    var last = Number(LN.store.get('lastBackup')) || 0;
    if (!last) return 'Next: the next time the app is open';
    var t = last + iv;
    return t <= Date.now() ? 'Next: due now, runs when the app is open' : 'Next: ' + LN.diag.stamp(t).slice(0, 16);
  }
  function tick() {
    if (document.hidden || running || !due()) return;
    run({ auto: true }).catch(function () { /* the status row and log show the error */ });
  }
  function init() {
    setTimeout(tick, 6000);
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 15 * 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(tick, 1500); });
  }

  // ---------- restore ----------
  function readManifest(bytes) {
    var pkg;
    try { pkg = LN.zip.parse(bytes); } catch (e) { return Promise.reject(new Error('This is not a zip file')); }
    if (!pkg.has('manifest.json')) return Promise.reject(new Error('This zip is not a Limitless Notepad backup (manifest.json is missing)'));
    return pkg.text('manifest.json').then(function (t) {
      var m;
      try { m = JSON.parse(t); } catch (e) { throw new Error('The backup\'s manifest is damaged'); }
      if (!m || m.app !== 'Limitless Notepad' || !Array.isArray(m.vaults)) throw new Error('This zip is not a Limitless Notepad backup');
      return { pkg: pkg, manifest: m };
    });
  }

  function sameData(local, bytes, isBin) {
    if (isBin || local.bytes) {
      var a = local.bytes;
      if (!a || a.length !== bytes.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
      return true;
    }
    return (local.content || '') === new TextDecoder('utf-8').decode(bytes);
  }

  function copyName(name, parentId, taken) {
    var m = /^(.*?)(\.[^.]+)?$/.exec(name);
    var base = m[1] + ' (backup copy)', ext = m[2] || '', i = 1, cand = base + ext;
    while (taken[(parentId || '') + '/' + cand.toLowerCase()]) { i++; cand = base + ' ' + i + ext; }
    return cand;
  }

  // Work out what a restore would do, without changing anything.
  function plan(src) {
    var m = src.manifest, pkg = src.pkg;
    var result = { vaults: [], counts: { created: 0, replaced: 0, kept: 0, same: 0 } };
    var local = (LN.store.get('vaults') || []);
    return m.vaults.reduce(function (p, bv) {
      return p.then(function () {
        var exists = local.some(function (v) { return v.id === bv.id; });
        return (exists ? LN.vault.readVault(bv.id) : Promise.resolve([])).then(function (nodes) {
          var pm = pathMap(nodes), byPath = {}, taken = {};
          nodes.forEach(function (n) { byPath[pm.pathOf(n).toLowerCase()] = n; taken[(n.parent || '') + '/' + n.name.toLowerCase()] = 1; });
          var vp = { id: bv.id, name: bv.name, exists: exists, nodes: nodes, byPath: byPath, taken: taken, items: [] };
          var chain = Promise.resolve();
          bv.nodes.forEach(function (x) {
            if (x.type === 'folder') { vp.items.push({ act: byPath[x.path.toLowerCase()] ? 'same' : 'folder', x: x }); return; }
            chain = chain.then(function () { return pkg.bytes('vaults/' + bv.id + '/files/' + x.path); }).then(function (bytes) {
              var cur = byPath[x.path.toLowerCase()];
              var it = { x: x, bytes: bytes, cur: cur };
              if (!cur) { it.act = 'create'; result.counts.created++; }
              else if (cur.type !== 'file') { it.act = 'copy'; result.counts.kept++; }
              else if (sameData(cur, bytes, x.bin)) { it.act = 'same'; result.counts.same++; }
              else if ((x.updated || 0) > (cur.updated || 0)) { it.act = 'replace'; result.counts.replaced++; }
              else { it.act = 'copy'; result.counts.kept++; }
              vp.items.push(it);
            });
          });
          return chain.then(function () { result.vaults.push(vp); });
        });
      });
    }, Promise.resolve()).then(function () { return result; });
  }

  function apply(src, pl, withSettings) {
    var now = Date.now();
    var vaultList = (LN.store.get('vaults') || []).slice();
    var addedVaults = false;
    return pl.vaults.reduce(function (p, vp) {
      return p.then(function () {
        var pm = pathMap(vp.nodes);
        var puts = [], byPath = vp.byPath, taken = vp.taken;
        function folderFor(path) {
          // path of the folder that holds an item; creates missing folders
          if (!path) return null;
          var key = path.toLowerCase();
          if (byPath[key] && byPath[key].type === 'folder') return byPath[key].id;
          var i = path.lastIndexOf('/');
          var parentId = folderFor(i < 0 ? '' : path.slice(0, i));
          var name = i < 0 ? path : path.slice(i + 1);
          var f = { id: LN.vault.newId(), type: 'folder', name: name, parent: parentId, content: '', created: now, updated: now };
          byPath[key] = f;
          taken[(parentId || '') + '/' + name.toLowerCase()] = 1;
          puts.push(f);
          return f.id;
        }
        vp.items.forEach(function (it) {
          var path = it.x.path, i = path.lastIndexOf('/');
          var dir = i < 0 ? '' : path.slice(0, i), name = i < 0 ? path : path.slice(i + 1);
          if (it.act === 'folder') { folderFor(path); return; }
          if (it.act === 'same') return;
          function fresh(nm, parentId) {
            var n = { id: LN.vault.newId(), type: 'file', name: nm, parent: parentId, content: '', created: it.x.created || now, updated: now };
            if (it.x.bin) { n.bytes = it.bytes; n.size = it.bytes.length; } else n.content = new TextDecoder('utf-8').decode(it.bytes);
            taken[(parentId || '') + '/' + nm.toLowerCase()] = 1;
            puts.push(n);
            return n;
          }
          if (it.act === 'create') {
            var pid = folderFor(dir);
            byPath[path.toLowerCase()] = fresh(name, pid);
          } else if (it.act === 'replace') {
            var c = it.cur;
            if (it.x.bin) { c.bytes = it.bytes; c.size = it.bytes.length; c.content = ''; } else { c.content = new TextDecoder('utf-8').decode(it.bytes); delete c.bytes; }
            c.updated = now;
            puts.push(c);
          } else if (it.act === 'copy') {
            var par = it.cur ? it.cur.parent : folderFor(dir);
            fresh(copyName(name, par, taken), par);
          }
        });
        if (!vp.exists) { vaultList.push({ id: vp.id, name: uniqueVaultName(vaultList, vp.name) }); addedVaults = true; }
        return puts.length ? LN.vault.putVault(vp.id, puts) : null;
      });
    }, Promise.resolve()).then(function () {
      if (addedVaults) LN.store.set('vaults', vaultList);
      if (withSettings && src.manifest.settings) {
        SETTING_KEYS.forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(src.manifest.settings, k)) LN.store.set(k, src.manifest.settings[k]);
        });
      }
    });
  }

  function uniqueVaultName(l, name) {
    var base = name || 'Restored vault', n = base, i = 1;
    while (l.some(function (v) { return v.name.toLowerCase() === n.toLowerCase(); })) { i++; n = base + ' (restored' + (i > 2 ? ' ' + i : '') + ')'; }
    return n;
  }

  function summaryText(m, pl) {
    var c = pl.counts;
    return 'Backup from ' + (m.created ? m.created.replace('T', ' ').slice(0, 16) : 'unknown date') + ' (' + (m.label || 'manual') + ').\n\n' +
      c.created + ' new file' + (c.created === 1 ? '' : 's') + ' will be added.\n' +
      c.replaced + ' file' + (c.replaced === 1 ? '' : 's') + ' where the backup is newer will be replaced.\n' +
      c.kept + ' file' + (c.kept === 1 ? '' : 's') + ' where your copy is newer or different will be kept; the backup version is added next to it as "(backup copy)".\n' +
      c.same + ' unchanged.\n\nYour current notes are backed up inside the app first. Continue?';
  }

  function restoreBytes(bytes) {
    return readManifest(bytes).then(function (src) {
      return plan(src).then(function (pl) {
        var c = pl.counts;
        if (!c.created && !c.replaced && !c.kept && !pl.vaults.some(function (v) { return v.items.some(function (i) { return i.act === 'folder'; }); })) {
          LN.toast('Nothing to restore: everything in the backup is already here');
          return null;
        }
        if (!window.confirm(summaryText(src.manifest, pl))) return null;
        return run({ safety: true }).then(function () {
          var withSettings = src.manifest.settings && window.confirm('Also restore the app settings saved in this backup? Your PIN, AI keys and folder links are never restored.');
          return apply(src, pl, withSettings);
        }).then(function () {
          log('info', 'Restore done: ' + c.created + ' added, ' + c.replaced + ' replaced, ' + c.kept + ' copies');
          LN.toast('Restored. Reloading…');
          setTimeout(function () { window.location.reload(); }, 900);
          return true;
        });
      });
    });
  }

  function restoreFile() {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.zip,application/zip';
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) { resolve(null); return; }
        f.arrayBuffer().then(function (b) { return restoreBytes(new Uint8Array(b)); }).then(resolve, reject);
      });
      inp.click();
    });
  }

  function pickInternal() {
    return list().then(function (l) {
      if (!l.length) { LN.toast('No backups are kept inside the app yet'); return null; }
      return new Promise(function (resolve) {
        var s = LN.ui.sheet('Backups kept inside the app', function () { resolve(null); });
        var g = LN.ui.el('div', 'set-group');
        l.forEach(function (r) {
          var row = LN.ui.el('div', 'set-row tap');
          var info = LN.ui.el('div', 'set-info');
          info.appendChild(LN.ui.el('div', 'set-label', LN.diag.stamp(r.created).slice(0, 16) + (r.kind === 'safety' ? ' · before a restore' : (r.auto ? ' · automatic' : ' · manual'))));
          info.appendChild(LN.ui.el('div', 'set-desc', r.files + ' files · ' + size(r.size)));
          var b = LN.ui.el('button', 'btn', 'Restore');
          b.type = 'button';
          b.addEventListener('click', function () {
            s.close();
            restoreBytes(r.bytes).then(resolve, function (e) { LN.toast(msg(e)); resolve(null); });
          });
          row.appendChild(info);
          row.appendChild(b);
          g.appendChild(row);
        });
        s.body.appendChild(g);
        s.body.appendChild(LN.ui.el('p', 'hint', 'These copies are deleted if the app\'s data is cleared. Use the files saved in Documents for a copy that survives that.'));
      });
    });
  }

  LN.backup = {
    init: init, run: run, manual: manual, due: due, nextText: nextText, list: list,
    restoreFile: restoreFile, restoreBytes: restoreBytes, pickInternal: pickInternal,
    _plan: function (bytes) { return readManifest(bytes).then(plan); }, _build: build
  };
})(window.LN = window.LN || {});
