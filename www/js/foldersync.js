(function (LN) {
  'use strict';

  // Sync engine for V0.3.0. It knows nothing about Android or the browser:
  // it talks to a backend (list, stat, read, write, mkdir, remove) and to the vault.
  // Rules:
  //  - pull never deletes vault files; push deletes folder files only when mirrorDeletes is on
  //  - when a file changed on both sides, the folder version wins and the vault version is kept as "name (vault copy).ext"
  //  - conflict mode (options().conflict): 'folder' (default) folder wins, vault version kept as "name (vault copy).ext";
  //    'vault' the vault note wins, folder version imported as "name (folder copy).ext"; 'newest' the later edit wins
  //    (a folder time of 0 means unknown, then both versions are kept like 'folder')
  //  - options().excluded: lines of names or paths that sync never touches (pull, push or mirror delete)
  //  - an empty folder file never replaces a non-empty vault note; a pull with errors holds back the push
  //  - dotfiles and files over 25 MB are skipped

  var MAX_BYTES = 25 * 1024 * 1024;

  // V0.7.20: only app/OS noise is hidden now. Before, every dotfile or dot-folder was skipped, which made folders look empty.
  var NOISE = /^(\.git|\.trash(-.*)?|\.thumbnails|\.nomedia|\.obsidian|\.ds_store|\.stfolder|\.sync|\.syncthing.*|.*\.tmp|.*\.crdownload)$/i;
  function hidden(path) {
    return path.split('/').some(function (s) { return NOISE.test(s); });
  }
  function dirname(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
  function basename(p) { var i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }
  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function copyName(name, who) {
    var m = /^(.*?)(\.[^.]+)?$/.exec(name);
    return m[1] + ' (' + (who || 'vault') + ' copy)' + (m[2] || '');
  }
  // text (one entry per line) or array -> lowercase entries without leading or trailing slashes
  function parseExclude(x) {
    if (typeof x === 'string') x = x.split(/\r?\n/);
    return (x || []).map(function (l) { return String(l).trim().replace(/^\/+|\/+$/g, '').toLowerCase(); }).filter(Boolean);
  }
  // an entry with a slash matches that path or anything under it; a bare name matches any folder or file with that name
  function excludedBy(path, list) {
    if (!list || !list.length) return false;
    var low = path.toLowerCase();
    var segs = low.split('/');
    for (var i = 0; i < list.length; i++) {
      var ex = list[i];
      if (ex.indexOf('/') >= 0) { if (low === ex || low.indexOf(ex + '/') === 0) return true; }
      else if (segs.indexOf(ex) >= 0) return true;
    }
    return false;
  }

  function create(deps) {
    var vault = deps.vault;
    var backend = deps.backend;
    var queue = Promise.resolve();
    var lastPullErrors = 0;

    function enqueue(fn) {
      var run = queue.then(fn, fn);
      queue = run.then(function () {}, function () {});
      return run;
    }

    function isBinName(name) { return LN.isBin(LN.kindOf(name)); }

    function payloadOf(n) {
      if (n.bytes) return n.bytes;
      if (isBinName(n.name)) return null;
      return n.content || '';
    }

    function findChild(parent, name, type) {
      var l = name.toLowerCase();
      var list = vault.children(parent);
      for (var i = 0; i < list.length; i++) {
        if (list[i].name.toLowerCase() === l && (!type || list[i].type === type)) return list[i];
      }
      return null;
    }

    function ensureFolders(dir) {
      var parts = dir ? dir.split('/') : [];
      var cur = null;
      var chain = Promise.resolve();
      parts.forEach(function (part) {
        chain = chain.then(function () {
          var hit = findChild(cur, part, 'folder');
          if (hit) { cur = hit.id; return null; }
          if (findChild(cur, part, 'file')) throw new Error('"' + part + '" is a file in the vault');
          return vault.create('folder', part, cur).then(function (n) { cur = n.id; });
        });
      });
      return chain.then(function () { return cur; });
    }

    // V0.7.20 folder to vault. Folders first (one by one, cheap), then files: bytes are READ 5 at a time, but every vault
    // change is applied one at a time (applyQ), so two files in the same folder can never race to create it.
    var READERS = 5;
    var applyTail = Promise.resolve();
    function applyQ(fn) {
      var run = applyTail.then(fn, fn);
      applyTail = run.then(function () {}, function () {});
      return run;
    }
    function progress(phase, done, total) {
      if (typeof deps.progress === 'function') { try { deps.progress({ phase: phase, done: done, total: total }); } catch (e) { /* ui only */ } }
    }
    function doPull() {
      var idx = deps.loadIndex();
      var opts = deps.options();
      var ex = parseExclude(opts.excluded);
      var r = { created: 0, updated: 0, conflicts: 0, unchanged: 0, skipped: 0, big: 0, errors: 0, guarded: 0, changedIds: [], errorNames: [] };
      var seen = {};
      return backend.list().then(function (entries) {
        entries = entries.filter(function (e) { return !hidden(e.path) && !excludedBy(e.path, ex); });
        entries.sort(function (a, b) { return a.path.split('/').length - b.path.split('/').length || (a.path < b.path ? -1 : 1); });
        var dirs = entries.filter(function (e) { return e.dir; });
        var files = entries.filter(function (e) { return !e.dir; });
        entries.forEach(function (e) { seen[e.path] = true; });
        var total = entries.length, done = 0;
        progress('pull', 0, total);
        var chain = Promise.resolve();
        dirs.forEach(function (e) {
          chain = chain.then(function () { return applyQ(function () { return pullOne(e, idx, r, opts); }); })
            .catch(function () { r.errors++; r.errorNames.push(e.path); })
            .then(function () { done++; if (done % 20 === 0) progress('pull', done, total); });
        });
        return chain.then(function () {
          var next = 0;
          function worker() {
            if (next >= files.length) return Promise.resolve();
            var e = files[next++];
            return Promise.resolve().then(function () { return pullOne(e, idx, r, opts); })
              .catch(function () { r.errors++; if (r.errorNames.length < 20) r.errorNames.push(e.path); })
              .then(function () { done++; if (done % 10 === 0) progress('pull', done, total); return worker(); });
          }
          var ws = [];
          for (var i = 0; i < Math.min(READERS, files.length); i++) ws.push(worker());
          return Promise.all(ws);
        });
      }).then(function () {
        progress('pull', 1, 1);
        // an entry that failed to list or read keeps its old index record, so it is retried next time
        Object.keys(idx).forEach(function (p) { if (!seen[p]) delete idx[p]; });
        deps.saveIndex(idx);
        return r;
      });
    }

    function pullOne(e, idx, r, opts) {
      if (e.dir) {
        if (idx[e.path] && idx[e.path].d) return null;
        return ensureFolders(e.path).then(function () { idx[e.path] = { d: 1 }; });
      }
      var old = idx[e.path];
      if (e.size > MAX_BYTES) { r.skipped++; r.big++; idx[e.path] = { m: e.mtime, s: e.size, v: 0, x: 1 }; return null; }
      if (old && old.m === e.mtime && old.s === e.size) { r.unchanged++; return null; }
      var name = basename(e.path);
      var bin = isBinName(name);
      return backend.read(e.path).then(function (bytes) { return applyQ(function () {
        var payload = bytes;
        if (!bin) {
          var dec = LN.decodeText(bytes);
          if (dec) payload = dec.text;
          else bin = true;
        }
        return ensureFolders(dirname(e.path)).then(function (parent) {
          var node = findChild(parent, name, 'file');
          if (!node) {
            return vault.importFile(name, parent, payload).then(function (n) {
              idx[e.path] = { m: e.mtime, s: e.size, v: n.updated };
              r.created++;
              r.changedIds.push(n.id);
            });
          }
          var same = bin ? sameBytes(payload, node.bytes) : (payload === (node.content || ''));
          if (same) { idx[e.path] = { m: e.mtime, s: e.size, v: node.updated }; r.unchanged++; return null; }
          // an empty file in the folder never wipes a note that has content
          var theirsEmpty = bin ? !payload.length : payload === '';
          var held = payloadOf(node);
          if (theirsEmpty && held !== null && held.length > 0) {
            r.guarded++;
            r.skipped++;
            // v: 0 marks the vault note as newer, so a push puts it back in the folder
            idx[e.path] = { m: e.mtime, s: e.size, v: 0 };
            return null;
          }
          var localChanged = old ? node.updated > old.v : true;
          var keep = Promise.resolve();
          var mine = payloadOf(node);
          if (localChanged && mine !== null) {
            var mode = opts.conflict;
            var vaultWins = mode === 'vault' || (mode === 'newest' && e.mtime > 0 && e.mtime < node.updated);
            if (vaultWins) {
              return vault.importFile(copyName(name, 'folder'), parent, payload).then(function (c) {
                r.conflicts++;
                r.changedIds.push(c.id);
                // v stays old so the next push writes the vault note over the folder file
                idx[e.path] = { m: e.mtime, s: e.size, v: old ? old.v : 0 };
              });
            }
            keep = vault.importFile(copyName(name, 'vault'), parent, mine).then(function (c) {
              r.conflicts++;
              r.changedIds.push(c.id);
            });
          }
          return keep.then(function () {
            return bin ? vault.updateBlob(node.id, payload) : vault.update(node.id, payload);
          }).then(function () {
            idx[e.path] = { m: e.mtime, s: e.size, v: node.updated };
            r.updated++;
            r.changedIds.push(node.id);
          });
        });
      }); });
    }

    // vault to folder
    function doPush() {
      var idx = deps.loadIndex();
      var opts = deps.options();
      var ex = parseExclude(opts.excluded);
      var r = { written: 0, skipped: 0, removed: 0, errors: 0, needsPull: false };
      var nodes = vault.all().map(function (n) { return { n: n, p: vault.path(n.id) }; });
      nodes.sort(function (a, b) {
        var da = a.p.split('/').length, db = b.p.split('/').length;
        return da - db || (a.p < b.p ? -1 : 1);
      });
      var present = {};
      var chain = Promise.resolve();
      nodes.forEach(function (it) {
        present[it.p] = true;
        if (excludedBy(it.p, ex)) { r.skipped++; return; }
        chain = chain.then(function () { return pushOne(it, idx, r); }).catch(function () { r.errors++; });
      });
      return chain.then(function () {
        // deletes are held back while the last pull had errors, so a half-read folder can't delete anything
        if (!opts.mirrorDeletes || lastPullErrors > 0) return null;
        var gone = Object.keys(idx).filter(function (p) { return !present[p] && !idx[p].x && !excludedBy(p, ex); });
        gone.sort(function (a, b) { return b.split('/').length - a.split('/').length; });
        var c2 = Promise.resolve();
        gone.forEach(function (p) {
          c2 = c2.then(function () {
            return backend.remove(p, !!idx[p].d).then(function () { delete idx[p]; r.removed++; });
          }).catch(function () { r.errors++; });
        });
        return c2;
      }).then(function () {
        deps.saveIndex(idx);
        return r;
      });
    }

    function pushOne(it, idx, r) {
      var n = it.n, p = it.p, e = idx[p];
      if (n.type === 'folder') {
        if (e && e.d) return null;
        return backend.mkdir(p).then(function () { idx[p] = { d: 1 }; });
      }
      var payload = payloadOf(n);
      if (payload === null) { r.skipped++; return null; }
      if (e && e.v === n.updated) { r.skipped++; return null; }
      var guard = Promise.resolve(true);
      if (e && !e.d) {
        guard = backend.stat(p).then(function (st) {
          return !st || (st.mtime === e.m && st.size === e.s);
        });
      }
      return guard.then(function (ok) {
        if (!ok) { r.needsPull = true; r.skipped++; return null; }
        var bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
        return backend.write(p, bytes).then(function () { return backend.stat(p); }).then(function (st) {
          idx[p] = { m: st ? st.mtime : 0, s: st ? st.size : bytes.length, v: n.updated };
          r.written++;
        });
      });
    }

    function doPullTracked() {
      return doPull().then(function (r) { lastPullErrors = r.errors; return r; }, function (e) { lastPullErrors = 1; throw e; });
    }

    return {
      pull: function () { return enqueue(doPullTracked); },
      push: function () { return enqueue(doPush); },
      sync: function () {
        return enqueue(doPullTracked).then(function (a) {
          // pull had errors: don't write to the folder until they are sorted out
          if (a.errors > 0) return { pull: a, push: { written: 0, skipped: 0, removed: 0, errors: 0, needsPull: false, held: true } };
          return enqueue(doPush).then(function (b) { return { pull: a, push: b }; });
        });
      }
    };
  }

  LN.foldersync = { create: create, copyName: copyName, parseExclude: parseExclude, excludedBy: excludedBy };
})(window.LN = window.LN || {});
