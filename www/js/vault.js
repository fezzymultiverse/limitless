(function (LN) {
  'use strict';

  function dbNameFor(id) { return !id || id === 'default' ? 'limitless-notepad' : 'limitless-notepad-' + id; }
  function activeId() { return LN.store ? LN.store.get('activeVault') : 'default'; }
  var STORE = 'nodes';
  var db = null;
  var nodes = {};
  var bin = {}; // V0.7.0 WIP6: trashed nodes (same IndexedDB store, flagged with n.trash), hidden from every normal view

  function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Storage is not available on this device')); return; }
      var r = window.indexedDB.open(dbNameFor(activeId()), 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { db = r.result; resolve(); };
      r.onerror = function () { reject(r.error); };
    });
  }

  // V0.5.0 encryption hooks (lock.js). Without lock.js these pass nodes through untouched.
  function decodeOne(n) { return LN.lock ? LN.lock.decodeNode(n) : Promise.resolve(n); }
  function encodeOne(n, on) { return LN.lock ? LN.lock.encodeNode(n, on) : Promise.resolve(n); }

  function readAll() {
    return new Promise(function (resolve, reject) {
      var q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      q.onsuccess = function () {
        var list = q.result;
        Promise.all(list.map(decodeOne)).then(function () {
          nodes = {};
          bin = {};
          list.forEach(function (n) { if (n.trash) bin[n.id] = n; else nodes[n.id] = n; });
          resolve();
        }, reject);
      };
      q.onerror = function () { reject(q.error); };
    });
  }

  var listeners = [];
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function notify(puts, dels) {
    listeners.forEach(function (fn) { try { fn(puts || [], dels || []); } catch (e) { /* a listener must not break saving */ } });
  }
  function all() { return Object.keys(nodes).map(function (k) { return nodes[k]; }); }

  // Writes run one after another, in call order, and encode the node as it is when its turn comes.
  // That stops an older autosave from landing after (and undoing) a newer trash or restore.
  // ev: undefined = tell listeners about puts and dels, {puts,dels} = tell them this instead, false = tell nobody.
  var wq = Promise.resolve();
  function write(puts, dels, ev) {
    var run = function () { return doWrite(puts, dels, ev); };
    var p = wq.then(run, run);
    wq = p.then(function () {}, function () {});
    return p;
  }

  function doWrite(puts, dels, ev) {
    return Promise.all((puts || []).map(function (n) { return encodeOne(n); })).then(function (rows) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var s = tx.objectStore(STORE);
        rows.forEach(function (n) { s.put(n); });
        (dels || []).forEach(function (id) { s.delete(id); });
        tx.oncomplete = function () {
          resolve();
          if (ev !== false) notify(ev ? ev.puts : puts, ev ? ev.dels : dels);
        };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  // Re-writes every vault's notes encrypted (on) or plain (off). Used by Settings > Security.
  function recode(id, on) {
    return new Promise(function (resolve, reject) {
      var r = window.indexedDB.open(dbNameFor(id), 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onerror = function () { reject(r.error); };
      r.onsuccess = function () {
        var d = r.result;
        var q = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        q.onerror = function () { d.close(); reject(q.error); };
        q.onsuccess = function () {
          Promise.all(q.result.map(function (n) {
            return decodeOne(n).then(function (p) { return encodeOne(p, on); });
          })).then(function (rows) {
            var tx = d.transaction(STORE, 'readwrite');
            var s = tx.objectStore(STORE);
            rows.forEach(function (x) { s.put(x); });
            tx.oncomplete = function () { d.close(); resolve(); };
            tx.onerror = tx.onabort = function () { d.close(); reject(tx.error); };
          }).catch(function (e) { d.close(); reject(e); });
        };
      };
    });
  }

  function reencryptAll(on) {
    var ids = (LN.store.get('vaults') || []).map(function (v) { return v.id; });
    if (ids.indexOf('default') < 0) ids.unshift('default');
    return ids.reduce(function (p, id) { return p.then(function () { return recode(id, on); }); }, Promise.resolve());
  }

  function cleanName(name) {
    name = String(name == null ? '' : name).trim();
    if (!name) throw new Error('Enter a name');
    if (/[\/\\]/.test(name)) throw new Error('Names can\'t contain slashes');
    if (name === '.' || name === '..') throw new Error('Pick a different name');
    return name;
  }

  function exists(parent, name, exceptId) {
    var l = name.toLowerCase();
    return Object.keys(nodes).some(function (k) {
      var n = nodes[k];
      return n.parent === parent && n.id !== exceptId && n.name.toLowerCase() === l;
    });
  }

  function get(id) { return id ? nodes[id] || null : null; }

  function children(parent) {
    parent = parent || null;
    return Object.keys(nodes).map(function (k) { return nodes[k]; })
      .filter(function (n) { return n.parent === parent; })
      .sort(function (a, b) {
        // V0.7.20: items with an order number (every item made, imported or moved since V0.7.20, and everything you have
        // reordered) come in that order, so NEW items land at the bottom. Older unordered items stay first, folders then A-Z.
        var ao = typeof a.ord === 'number', bo = typeof b.ord === 'number';
        if (ao && bo) return a.ord - b.ord;
        if (ao !== bo) return ao ? 1 : -1;
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
  }

  var lastOrd = 0;
  function nextOrd() { lastOrd = Math.max(Date.now(), lastOrd + 1); return lastOrd; }

  // V0.7.20 Edit mode: move one item up or down (dir -1 / +1) among its siblings. The whole sibling list gets numbered
  // so the order you see is exactly the order that is saved. Order is local to the vault; it never goes to the sync folder.
  function reorder(id, dir) {
    var n = get(id);
    if (!n) return Promise.reject(new Error('Not found'));
    var list = children(n.parent);
    var i = list.indexOf(n), j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return Promise.resolve(false);
    var t = list[i]; list[i] = list[j]; list[j] = t;
    var puts = [];
    list.forEach(function (x, k) { if (x.ord !== k + 1) { x.ord = k + 1; puts.push(x); } });
    return write(puts, [], false).then(function () { return true; });
  }
  // send an item to the very top or bottom of its folder (where = 'top' | 'bottom')
  function reorderEdge(id, where) {
    var n = get(id);
    if (!n) return Promise.reject(new Error('Not found'));
    var list = children(n.parent).filter(function (x) { return x !== n; });
    if (where === 'top') list.unshift(n); else list.push(n);
    var puts = [];
    list.forEach(function (x, k) { if (x.ord !== k + 1) { x.ord = k + 1; puts.push(x); } });
    return write(puts, [], false).then(function () { return true; });
  }

  function descendants(id) {
    var out = [];
    (function walk(pid) {
      children(pid).forEach(function (c) { out.push(c.id); if (c.type === 'folder') walk(c.id); });
    })(id);
    return out;
  }

  function pathOf(id) {
    var parts = [];
    var n = get(id);
    while (n) { parts.unshift(n.name); n = get(n.parent); }
    return parts.join('/');
  }

  function resolvePath(path) {
    var parts = String(path || '').split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    var cur = null;
    for (var i = 0; i < parts.length; i++) {
      var hit = children(cur).filter(function (c) {
        return c.type === 'folder' && c.name.toLowerCase() === parts[i].toLowerCase();
      })[0];
      if (!hit) return { ok: false, id: null };
      cur = hit.id;
    }
    return { ok: true, id: cur };
  }

  function create(type, name, parent) {
    parent = parent || null;
    try { name = cleanName(name); } catch (err) { return Promise.reject(err); }
    if (type !== 'file' && type !== 'folder') return Promise.reject(new Error('Unknown type'));
    if (parent && (!get(parent) || get(parent).type !== 'folder')) return Promise.reject(new Error('Parent folder not found'));
    if (exists(parent, name)) return Promise.reject(new Error('"' + name + '" already exists here'));
    var n = { id: uid(), type: type, name: name, parent: parent, content: '', created: Date.now(), updated: Date.now(), ord: nextOrd() };
    nodes[n.id] = n;
    return write([n]).then(function () { return n; });
  }

  function rename(id, name) {
    var n = get(id);
    if (!n) return Promise.reject(new Error('Not found'));
    try { name = cleanName(name); } catch (err) { return Promise.reject(err); }
    if (exists(n.parent, name, id)) return Promise.reject(new Error('"' + name + '" already exists here'));
    n.name = name;
    n.updated = Date.now();
    return write([n]).then(function () { return n; });
  }

  function move(id, newParent) {
    var n = get(id);
    newParent = newParent || null;
    if (!n) return Promise.reject(new Error('Not found'));
    if (newParent && (!get(newParent) || get(newParent).type !== 'folder')) return Promise.reject(new Error('Destination folder not found'));
    if (newParent === n.parent) return Promise.resolve(n);
    if (newParent === id || descendants(id).indexOf(newParent) >= 0) return Promise.reject(new Error('A folder can\'t go inside itself'));
    if (exists(newParent, n.name, id)) return Promise.reject(new Error('"' + n.name + '" already exists in that folder'));
    n.parent = newParent;
    n.ord = nextOrd();
    n.updated = Date.now();
    return write([n]).then(function () { return n; });
  }

  function remove(id) {
    var n = get(id);
    if (!n) return Promise.resolve([]);
    var ids = [id].concat(descendants(id));
    ids.forEach(function (x) { delete nodes[x]; });
    return write([], ids).then(function () { return ids; });
  }

  function update(id, content) {
    var n = get(id);
    if (!n || n.type !== 'file') return Promise.reject(new Error('File not found'));
    n.content = content;
    n.updated = Date.now();
    return write([n]);
  }

  function uniqueName(parent, name) {
    if (!exists(parent, name)) return name;
    var m = /^(.*?)(\.[^.]+)?$/.exec(name), i = 2;
    while (exists(parent, m[1] + ' (' + i + ')' + (m[2] || ''))) i++;
    return m[1] + ' (' + i + ')' + (m[2] || '');
  }

  // payload: string for text files, Uint8Array for binary files (pdf, pptx, docx, xlsx)
  function importFile(name, parent, payload) {
    parent = parent || null;
    try { name = cleanName(name); } catch (err) { return Promise.reject(err); }
    if (parent && (!get(parent) || get(parent).type !== 'folder')) parent = null;
    var n = { id: uid(), type: 'file', name: uniqueName(parent, name), parent: parent, content: '', created: Date.now(), updated: Date.now(), ord: nextOrd() };
    if (typeof payload === 'string') n.content = payload;
    else { n.bytes = payload; n.size = payload.length; }
    nodes[n.id] = n;
    return write([n]).then(function () { return n; });
  }

  function updateBlob(id, bytes) {
    var n = get(id);
    if (!n || n.type !== 'file') return Promise.reject(new Error('File not found'));
    n.bytes = bytes;
    n.size = bytes.length;
    n.updated = Date.now();
    return write([n]);
  }

  function search(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    return Object.keys(nodes).map(function (k) { return nodes[k]; }).filter(function (n) {
      return n.name.toLowerCase().indexOf(q) >= 0 ||
        (n.type === 'file' && String(n.content || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) {
      return pathOf(a.id).localeCompare(pathOf(b.id), undefined, { numeric: true, sensitivity: 'base' });
    }).slice(0, 100);
  }

  function findNote(name) {
    var l = String(name || '').trim().toLowerCase();
    if (!l) return null;
    var files = Object.keys(nodes).map(function (k) { return nodes[k]; }).filter(function (n) { return n.type === 'file'; });
    files.sort(function (a, b) { return pathOf(a.id).localeCompare(pathOf(b.id)); });
    for (var i = 0; i < files.length; i++) {
      var f = files[i].name.toLowerCase();
      if (f === l || f === l + '.md' || f.replace(/\.[^.]+$/, '') === l) return files[i];
    }
    return null;
  }

  function seedBlank() {
    var n = { id: uid(), type: 'file', name: 'Welcome.md', parent: null, content: '# ' + vaultName() + '\n\nThis vault is empty. Create notes with the new file button.\n', created: Date.now(), updated: Date.now() };
    nodes[n.id] = n;
    return write([n]);
  }

  function vaultName() {
    var id = activeId();
    var list = LN.store.get('vaults') || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return 'Vault';
  }

  function seed() {
    if (activeId() !== 'default') return seedBlank();
    var start = [
      '# Strategy Over Impulse',
      '',
      'Welcome to LIMITLESS NOTEPAD. Plan the vault before the plugins.',
      '',
      '- Folders and files live in the tree on the left',
      '- Press **Split** to write and preview side by side',
      '- Link notes with [[Shortcuts]]',
      '- [x] Open the vault',
      '- [ ] Write the first real note',
      ''
    ].join('\n');
    var shortcuts = [
      '# Shortcuts',
      '',
      '- Ctrl+N: new file',
      '- Ctrl+S: save now',
      '- Ctrl+B: bold',
      '- Ctrl+I: italic',
      '- Tab: indent two spaces',
      '- F2: rename the selected item',
      '- Delete: delete the selected item',
      '',
      'Back to [[Start here]].',
      ''
    ].join('\n');
    var script = '#!/usr/bin/env bash\nset -euo pipefail\necho "limitless"\n';
    var csv = 'name,type,status\nvault,core,done\ntabs,core,done\nsync,sync,planned\n';
    var made = {};
    function mk(type, name, parent, content) {
      var n = { id: uid(), type: type, name: name, parent: parent, content: content || '', created: Date.now(), updated: Date.now() };
      nodes[n.id] = n;
      made[n.id] = n;
      return n;
    }
    var w = mk('folder', 'Welcome', null);
    mk('file', 'Start here.md', w.id, start);
    mk('file', 'Shortcuts.md', w.id, shortcuts);
    var s = mk('folder', 'Scripts', null);
    mk('file', 'hello.sh', s.id, script);
    var d = mk('folder', 'Data', null);
    mk('file', 'sample.csv', d.id, csv);
    return write(Object.keys(made).map(function (k) { return made[k]; }));
  }

  // Read another (or this) vault straight from storage, decrypted. Used by backup and restore.
  function openById(id) {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Storage is not available on this device')); return; }
      var r = window.indexedDB.open(dbNameFor(id), 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  // withBin = true also returns trashed nodes. Backup and restore leave the Recycle bin out.
  function readVault(id, withBin) {
    return openById(id).then(function (d) {
      return new Promise(function (resolve, reject) {
        var q = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        q.onsuccess = function () {
          d.close();
          Promise.all(q.result.map(decodeOne)).then(function () {
            resolve(withBin ? q.result : q.result.filter(function (n) { return !n.trash; }));
          }, reject);
        };
        q.onerror = function () { d.close(); reject(q.error); };
      });
    });
  }
  // Write nodes into a vault by id (encrypting them if encryption is on). Never deletes anything.
  function putVault(id, list) {
    return Promise.all(list.map(function (n) { return encodeOne(n); })).then(function (rows) {
      return openById(id).then(function (d) {
        return new Promise(function (resolve, reject) {
          var tx = d.transaction(STORE, 'readwrite');
          var s = tx.objectStore(STORE);
          rows.forEach(function (n) { s.put(n); });
          tx.oncomplete = function () { d.close(); resolve(); };
          tx.onerror = tx.onabort = function () { d.close(); reject(tx.error); };
        });
      });
    });
  }
  function usage() {
    var files = 0, folders = 0, bytes = 0;
    all().forEach(function (n) {
      if (n.type === 'folder') { folders++; return; }
      files++;
      bytes += n.bytes ? n.bytes.length : new Blob([n.content || '']).size;
    });
    return { files: files, folders: folders, bytes: bytes };
  }
  function close() { if (db) { try { db.close(); } catch (e) { /* already closed */ } db = null; } }
  function uidNew() { return uid(); }

  // ---------- Recycle bin (V0.7.0 WIP6) ----------
  // A trashed node keeps its id, parent pointer and content. Only the top item of a delete carries
  // trash = { at, batch, top:true, from (parent id), path (names of the folders it sat in) };
  // everything inside a trashed folder carries { at, batch, top:false } and keeps its own parent pointer.
  function membersOf(batch) {
    return Object.keys(bin).map(function (k) { return bin[k]; }).filter(function (m) { return m.trash && m.trash.batch === batch; });
  }
  function sizeOf(m) { return m.type === 'folder' ? 0 : (m.size || (m.bytes ? m.bytes.length : String(m.content || '').length)); }

  function trash(id) {
    var n = get(id);
    if (!n) return Promise.resolve([]);
    var ids = [id].concat(descendants(id));
    var at = Date.now(), names = [], p = get(n.parent), from = n.parent || null;
    while (p) { names.unshift(p.name); p = get(p.parent); }
    var rows = ids.map(function (x, i) {
      var m = nodes[x];
      delete nodes[x];
      m.trash = i === 0 ? { at: at, batch: id, top: true, from: from, path: names } : { at: at, batch: id, top: false };
      bin[x] = m;
      return m;
    });
    // listeners (folder sync, vault stats) see this exactly like a delete
    return write(rows, [], { puts: [], dels: ids }).then(function () { return ids; });
  }

  // Put one trashed item (and everything inside it) back. Resolves { id, path, node }.
  // Goes back to its old folder; if that folder is gone it is found or re-made by name.
  // A name clash gets "(2)"; a folder that meets a live folder of the same name merges into it.
  function restore(id) {
    var top = bin[id];
    if (!top || !top.trash || !top.trash.top) return Promise.reject(new Error('That item is no longer in the Recycle bin'));
    var t = top.trash, kids = {}, puts = [], dels = [], now = Date.now();
    membersOf(id).forEach(function (m) { if (m.id !== id) (kids[m.parent] = kids[m.parent] || []).push(m); });
    function ensurePath(names) {
      var cur = null;
      names.forEach(function (nm) {
        var hit = children(cur).filter(function (c) { return c.type === 'folder' && c.name.toLowerCase() === nm.toLowerCase(); })[0];
        if (!hit) {
          hit = { id: uid(), type: 'folder', name: uniqueName(cur, nm), parent: cur, content: '', created: now, updated: now };
          nodes[hit.id] = hit;
          puts.push(hit);
        }
        cur = hit.id;
      });
      return cur;
    }
    function unbin(m) { delete m.trash; delete bin[m.id]; nodes[m.id] = m; puts.push(m); }
    function unbinTree(fid) { (kids[fid] || []).forEach(function (c) { unbin(c); if (c.type === 'folder') unbinTree(c.id); }); }
    function place(m, parent) {
      var l = m.name.toLowerCase();
      var clash = children(parent).filter(function (c) { return c.name.toLowerCase() === l; })[0];
      if (m.type === 'folder' && clash && clash.type === 'folder') {
        delete bin[m.id];
        dels.push(m.id);
        (kids[m.id] || []).forEach(function (c) { place(c, clash.id); });
        return clash;
      }
      if (clash) m.name = uniqueName(parent, m.name);
      m.parent = parent || null;
      unbin(m);
      if (m.type === 'folder') unbinTree(m.id);
      return m;
    }
    var dest = null;
    if (t.from) dest = nodes[t.from] && nodes[t.from].type === 'folder' ? t.from : ensurePath(t.path || []);
    var landed = place(top, dest);
    return write(puts, dels, { puts: puts, dels: [] }).then(function () {
      return { id: landed.id, node: landed, path: pathOf(landed.id) };
    });
  }

  function purge(id) {
    var ids = membersOf(id).map(function (m) { return m.id; });
    ids.forEach(function (x) { delete bin[x]; });
    return ids.length ? write([], ids, false).then(function () { return ids.length; }) : Promise.resolve(0);
  }

  function emptyBin() {
    var ids = Object.keys(bin);
    bin = {};
    return ids.length ? write([], ids, false).then(function () { return ids.length; }) : Promise.resolve(0);
  }

  // Delete for good every bin item older than `days` days. Returns how many items went.
  function purgeOlder(days) {
    var cutoff = Date.now() - Number(days) * 86400000, ids = [], count = 0;
    Object.keys(bin).map(function (k) { return bin[k]; }).forEach(function (m) {
      if (m.trash && m.trash.top && m.trash.at < cutoff) { count++; membersOf(m.id).forEach(function (x) { ids.push(x.id); delete bin[x.id]; }); }
    });
    return ids.length ? write([], ids, false).then(function () { return count; }) : Promise.resolve(0);
  }

  // One entry per deleted item, newest first.
  function binItems() {
    var by = {};
    Object.keys(bin).forEach(function (k) { var b = bin[k].trash && bin[k].trash.batch; (by[b] = by[b] || []).push(bin[k]); });
    return Object.keys(bin).map(function (k) { return bin[k]; }).filter(function (m) { return m.trash && m.trash.top; }).map(function (m) {
      var mem = by[m.id] || [m], bytes = 0;
      mem.forEach(function (x) { bytes += sizeOf(x); });
      return { id: m.id, node: m, at: m.trash.at, from: (m.trash.path || []).join('/'), folder: m.type === 'folder', items: mem.length, bytes: bytes };
    }).sort(function (a, b) { return b.at - a.at; });
  }
  function binCount() { return Object.keys(bin).filter(function (k) { return bin[k].trash && bin[k].trash.top; }).length; }
  function binUsage() {
    var bytes = 0;
    Object.keys(bin).forEach(function (k) { bytes += sizeOf(bin[k]); });
    return { items: binCount(), nodes: Object.keys(bin).length, bytes: bytes };
  }
  // Paths inside a trashed item, for the preview.
  function binPaths(id) {
    var top = bin[id];
    if (!top) return [];
    return membersOf(id).filter(function (m) { return m.id !== id; }).map(function (m) {
      var parts = [m.name], p = bin[m.parent];
      while (p && p.id !== id) { parts.unshift(p.name); p = bin[p.parent]; }
      return parts.join('/') + (m.type === 'folder' ? '/' : '');
    }).sort();
  }
  function binGet(id) { return bin[id] || null; }

  function init() {
    return openDb().then(readAll).then(function () {
      if (!Object.keys(nodes).length) return seed();
    });
  }

  LN.vault = {
    init: init, get: get, children: children, descendants: descendants, path: pathOf,
    resolvePath: resolvePath, create: create, rename: rename, move: move, reorder: reorder, reorderEdge: reorderEdge, remove: remove,
    update: update, importFile: importFile, updateBlob: updateBlob, search: search, findNote: findNote,
    onChange: onChange, all: all, dbNameFor: dbNameFor, reencryptAll: reencryptAll,
    readVault: readVault, putVault: putVault, usage: usage, close: close, newId: uidNew,
    trash: trash, restore: restore, purge: purge, emptyBin: emptyBin, purgeOlder: purgeOlder,
    binItems: binItems, binCount: binCount, binUsage: binUsage, binPaths: binPaths, binGet: binGet
  };
})(window.LN = window.LN || {});
