(function (LN) {
  'use strict';
  // V0.7.9: more folders to sync. Each extra folder is mirrored with its own folder INSIDE the vault
  // (named after the folder), using the same engine, conflict rules and options as the main folder.
  // The main folder keeps working exactly as before. Extras are stored per vault in setting `extraFolders`.

  var busy = false;

  function msg(e) { return e && e.message ? e.message : String(e || 'Unknown error'); }
  function stamp() { return new Date().toLocaleString(); }
  function I() { return LN.folder && LN.folder._int; }
  function recs() { return JSON.parse(JSON.stringify(LN.store.get('extraFolders') || [])); }
  function save(a) { LN.store.set('extraFolders', a); }
  function patch(id, fn) { var a = recs(); a.forEach(function (r) { if (r.id === id) fn(r); }); save(a); }
  function find(id) { return recs().filter(function (r) { return r.id === id; })[0] || null; }
  function list() { return recs(); }
  function count() { return recs().length; }
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clean(v) { return String(v || '').replace(/[\\\/:*?"<>|]/g, '').replace(/^\.+/, '').trim() || 'Folder'; }

  function uniqueMount(name, skipId) {
    var used = recs().filter(function (r) { return r.id !== skipId; }).map(function (r) { return String(r.mount).toLowerCase(); });
    var base = clean(name), n = base, i = 2;
    while (used.indexOf(n.toLowerCase()) >= 0) n = base + ' (' + (i++) + ')';
    return n;
  }

  // Refuse a folder that is already the main folder or already added, so nothing syncs twice.
  function duplicate(r) {
    var main = LN.store.get('folderMode');
    if (r.mode === 'saf' && main === 'saf' && LN.store.get('safUri') === r.safUri) return 'That is already the main folder';
    if (r.mode === 'cap' && main === 'cap' && String(LN.store.get('capFolder')).toLowerCase() === r.capFolder.toLowerCase()) return 'That is already the main folder';
    var hit = recs().filter(function (x) {
      return (r.mode === 'saf' && x.mode === 'saf' && x.safUri === r.safUri) || (r.mode === 'cap' && x.mode === 'cap' && String(x.capFolder || '').toLowerCase() === String(r.capFolder || '').toLowerCase());
    })[0];
    return hit ? 'That folder is already added' : '';
  }

  function backendFor(r) {
    var X = I();
    if (r.mode === 'saf') {
      var pl = X.safPlugin();
      if (!pl) return Promise.reject(new Error('The folder picker is not available in this build'));
      return Promise.resolve(X.saf(pl, r.safUri, r.label));
    }
    if (r.mode === 'cap') return Promise.resolve(X.cap(X.capPlugin(), r.capFolder));
    if (r.mode === 'fsa') {
      return X.hget('extra.' + r.id).then(function (h) {
        if (!h) throw new Error('Pick "' + r.label + '" again');
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          if (p === 'granted') return X.fsa(h);
          return h.requestPermission({ mode: 'readwrite' }).then(function (q) {
            if (q !== 'granted') throw new Error('Allow access to "' + r.label + '" and sync again');
            return X.fsa(h);
          });
        });
      });
    }
    return Promise.reject(new Error('Unknown folder type'));
  }

  function ensureMount(r) {
    var V = LN.vault;
    var n = r.mountId ? V.get(r.mountId) : null;
    if (n && n.type === 'folder') return Promise.resolve(n.id);
    var hit = V.children(null).filter(function (c) { return c.type === 'folder' && c.name.toLowerCase() === String(r.mount).toLowerCase(); })[0];
    if (hit) return Promise.resolve(hit.id);
    return V.create('folder', r.mount, null).then(function (f) { return f.id; });
  }

  // The engine sees only the mount folder, with paths relative to it.
  function scoped(rootId) {
    var V = LN.vault;
    var base = V.path(rootId) + '/';
    return {
      all: function () {
        var set = {};
        V.descendants(rootId).forEach(function (i) { set[i] = 1; });
        return V.all().filter(function (n) { return set[n.id]; });
      },
      children: function (p) { return V.children(p || rootId); },
      create: function (t, n, p) { return V.create(t, n, p || rootId); },
      importFile: function (n, p, pl) { return V.importFile(n, p || rootId, pl); },
      path: function (id) { var f = V.path(id); return f.indexOf(base) === 0 ? f.slice(base.length) : f; },
      update: V.update,
      updateBlob: V.updateBlob
    };
  }

  function engineFor(r) {
    return Promise.all([backendFor(r), ensureMount(r)]).then(function (a) {
      var b = a[0], mountId = a[1];
      if (r.mountId !== mountId) patch(r.id, function (x) { x.mountId = mountId; });
      return b.ensureRoot().then(function () {
        return LN.foldersync.create({
          vault: scoped(mountId), backend: b,
          loadIndex: function () { var c = find(r.id); return JSON.parse(JSON.stringify((c && c.index) || {})); },
          saveIndex: function (i) { patch(r.id, function (x) { x.index = i; }); },
          options: function () {
            return { mirrorDeletes: !!LN.store.get('mirrorDeletes'), excluded: LN.store.get('syncExclude') || '', conflict: LN.store.get('conflictMode') || 'folder' };
          }
        });
      });
    });
  }

  function brief(res) {
    var p = res.pull || res, q = res.push || null, parts = [];
    if (p.created) parts.push(p.created + ' imported');
    if (p.updated) parts.push(p.updated + ' updated');
    if (p.conflicts) parts.push(p.conflicts + ' copies kept');
    if (p.errors) parts.push(p.errors + ' failed');
    if (q) {
      if (q.held) parts.push('upload held back');
      if (q.written) parts.push(q.written + ' written');
      if (q.removed) parts.push(q.removed + ' removed');
      if (q.errors) parts.push(q.errors + ' failed');
    }
    return parts.length ? parts.join(', ') : 'Up to date';
  }

  // run one action on every extra folder, one after another; a failing folder does not stop the others
  function each(action, onlyId) {
    var out = { done: 0, failed: [], changed: [] };
    var chain = Promise.resolve();
    recs().filter(function (r) { return !onlyId || r.id === onlyId; }).forEach(function (r) {
      chain = chain.then(function () {
        return engineFor(r).then(function (eng) { return eng[action](); }).then(function (res) {
          var p = res.pull || res;
          if (p.changedIds) out.changed = out.changed.concat(p.changedIds);
          var s = brief(res);
          patch(r.id, function (x) { x.last = stamp() + ' · ' + s; x.err = ''; });
          out.done++;
        }, function (e) {
          patch(r.id, function (x) { x.err = stamp() + ' · ' + msg(e); });
          out.failed.push(r.label + ': ' + msg(e));
        });
      });
    });
    return chain.then(function () { return out; });
  }

  function run(action, onlyId) {
    if (!count() || (onlyId && !find(onlyId))) return Promise.resolve({ done: 0, failed: [], changed: [] });
    if (busy) return Promise.resolve({ done: 0, failed: [], changed: [], busy: true });
    busy = true;
    return each(action, onlyId).then(function (o) { busy = false; return o; }, function (e) { busy = false; throw e; });
  }

  function syncAll() { return run('sync'); }
  function syncOne(id) { return run('sync', id); }
  function pullAll() { return run('pull'); }
  function pushAll() { return run('push'); }

  // ---------- adding and removing ----------
  function add(r) {
    var why = duplicate(r);
    if (why) return Promise.reject(new Error(why));
    r.id = r.pre || uid();
    delete r.pre;
    r.mount = uniqueMount(r.label);
    r.mountId = null;
    r.index = {};
    r.last = '';
    r.err = '';
    return backendFor(r).then(function (b) { return b.ensureRoot(); }).then(function () {
      var a = recs();
      a.push(r);
      save(a);
      return ensureMount(r);
    }).then(function (id) {
      patch(r.id, function (x) { x.mountId = id; });
      LN.tree.render();
      // V0.7.20: the first import of an added folder runs in the background, so adding it returns at once
      setTimeout(function () { try { if (!busy()) syncAll().then(function (o) { if (o && o.changed && o.changed.length) { LN.tree.render(); } }, function () {}); } catch (e) { /* status shows it */ } }, 60);
      return r;
    });
  }

  function addPicked() {
    var pl = I() && I().safPlugin();
    if (!pl) return Promise.reject(new Error('The folder picker is not available in this build'));
    return pl.pick().then(function (p) {
      if (!p || !p.uri) throw new Error('The folder picker did not return a usable folder URI');
      return add({ mode: 'saf', safUri: p.uri, label: p.name || 'Folder' });
    }).catch(function (e) {
      if (e && /cancel/i.test(e.message || '')) throw new Error('No folder picked');
      throw e;
    });
  }

  function addNamed(name) {
    name = clean(name);
    var X = I();
    var fs = X.capPlugin();
    return Promise.resolve().then(function () {
      return fs && fs.requestPermissions ? fs.requestPermissions().catch(function () { return null; }) : null;
    }).then(function () { return add({ mode: 'cap', capFolder: name, label: name }); });
  }

  function addBrowser() {
    return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
      var r = { mode: 'fsa', label: h.name || 'Folder' };
      var id = uid();
      return I().hput('extra.' + id, h).then(function () {
        r.pre = id;
        return add(r);
      });
    });
  }

  function remove(id) {
    save(recs().filter(function (r) { return r.id !== id; }));
  }

  function rename(id, name) {
    name = uniqueMount(name, id);
    var r = find(id);
    if (!r) return Promise.resolve();
    var V = LN.vault;
    var p = r.mountId && V.get(r.mountId) ? V.rename(r.mountId, name) : Promise.resolve();
    return p.then(function () { patch(id, function (x) { x.mount = name; }); LN.tree.render(); });
  }

  LN.extra = {
    list: list, count: count, syncAll: syncAll, syncOne: syncOne, pullAll: pullAll, pushAll: pushAll,
    addPicked: addPicked, addNamed: addNamed, addBrowser: addBrowser, remove: remove, rename: rename,
    busy: function () { return busy; }
  };
})(window.LN = window.LN || {});
