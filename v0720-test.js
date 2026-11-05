// V0.7.20 tests: new-at-bottom order + Edit order, parallel folder pull, quotes and greeting rules.
// Run with: node tests/v0720-test.js   (no install needed)
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var root = path.join(__dirname, '..', 'www', 'js');
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }

// ---------- fake IndexedDB (same shape as bin-test) ----------
var disk = {};
function repl(k, v) { return v instanceof Uint8Array ? { __u8: Array.from(v) } : v; }
function fakeIDB() {
  return { open: function (name) {
    var req = {};
    setTimeout(function () {
      var rows = disk[name] || (disk[name] = { keep: { id: 'keep', type: 'file', name: '.keep', parent: null, content: '' } });
      var made = false;
      var db = { objectStoreNames: { contains: function () { return made; } }, createObjectStore: function () { made = true; }, close: function () {},
        transaction: function () {
          var tx = {}, ops = [];
          tx.objectStore = function () { return {
            getAll: function () { var r = {}; setTimeout(function () { r.result = Object.keys(rows).map(function (k) { return JSON.parse(JSON.stringify(rows[k], repl)); }); if (r.onsuccess) r.onsuccess(); }, 0); return r; },
            put: function (v) { ops.push(function () { rows[v.id] = JSON.parse(JSON.stringify(v, repl)); }); },
            delete: function (k) { ops.push(function () { delete rows[k]; }); } }; };
          setTimeout(function () { ops.forEach(function (f) { f(); }); if (tx.oncomplete) tx.oncomplete(); }, 1);
          return tx;
        } };
      req.result = db;
      if (req.onupgradeneeded) req.onupgradeneeded();
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  } };
}
function bootVault() {
  var sb = { console: console, Promise: Promise, setTimeout: setTimeout, Date: Date, JSON: JSON, Uint8Array: Uint8Array, Blob: Blob };
  sb.window = sb; sb.indexedDB = fakeIDB();
  sb.LN = { store: { get: function (k) { return k === 'activeVault' ? 'default' : (k === 'vaults' ? [{ id: 'default', name: 'My vault' }] : null); } } };
  vm.createContext(sb);
  vm.runInContext(read('vault.js'), sb);
  return sb.LN.vault.init().then(function () { return sb.LN.vault; });
}
function names(V, parent) { return V.children(parent || null).map(function (n) { return n.name; }).filter(function (n) { return n !== '.keep'; }); }

function eq(a, b, m) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); }
var tests = [];
function t(n, f) { tests.push([n, f]); }

t('new files and folders land at the bottom, in the order they were made', function () {
  disk = {};
  return bootVault().then(function (V) {
    return V.create('file', 'zebra.md', null).then(function () { return V.create('folder', 'Alpha', null); })
      .then(function () { return V.create('file', 'middle.md', null); })
      .then(function () { eq(names(V), ['zebra.md', 'Alpha', 'middle.md']); });
  });
});

t('imported files also land at the bottom', function () {
  disk = {};
  return bootVault().then(function (V) {
    return V.create('folder', 'B', null).then(function () { return V.importFile('a.md', null, 'x'); })
      .then(function () { eq(names(V), ['B', 'a.md']); });
  });
});

t('reorder moves one step, stops at the ends and survives a restart', function () {
  disk = {};
  var ids = {};
  return bootVault().then(function (V) {
    return V.create('file', 'one.md', null).then(function (a) { ids.a = a.id; return V.create('file', 'two.md', null); })
      .then(function (b) { ids.b = b.id; return V.create('file', 'three.md', null); })
      .then(function (c) { ids.c = c.id; return V.reorder(ids.c, -1); })
      .then(function (moved) { assert.strictEqual(moved, true); eq(names(V), ['one.md', 'three.md', 'two.md']); return V.reorder(ids.b, 1); })
      .then(function (moved) { assert.strictEqual(moved, false, 'already last'); return V.reorder(ids.b, -1); })
      .then(function (moved) { assert.strictEqual(moved, true); eq(names(V), ['one.md', 'two.md', 'three.md']); return V.reorder(ids.c, 1); })
      .then(function (moved) { assert.strictEqual(moved, false, 'three is last again'); return V.reorder(ids.c, -1); })
      .then(function () { eq(names(V), ['one.md', 'three.md', 'two.md']); });
  }).then(function () {
    return bootVault().then(function (V2) { eq(names(V2), ['one.md', 'three.md', 'two.md'], 'order saved'); });
  });
});

t('reorder is silent: listeners (and so folder sync) are not told', function () {
  disk = {};
  return bootVault().then(function (V) {
    var seen = 0, a, b;
    return V.create('file', 'a.md', null).then(function (x) { a = x; return V.create('file', 'b.md', null); })
      .then(function (y) { b = y; V.onChange(function () { seen++; }); return V.reorder(b.id, -1); })
      .then(function () { assert.strictEqual(seen, 0); assert.strictEqual(V.get(a.id).updated, a.updated, 'updated time untouched'); });
  });
});

t('reorderEdge sends an item to the very top or bottom; a moved item goes to the bottom of its new folder', function () {
  disk = {};
  return bootVault().then(function (V) {
    var m = {};
    return V.create('file', 'a.md', null).then(function (x) { m.a = x; return V.create('file', 'b.md', null); })
      .then(function (x) { m.b = x; return V.create('file', 'c.md', null); })
      .then(function (x) { m.c = x; return V.reorderEdge(m.c.id, 'top'); })
      .then(function () { eq(names(V), ['c.md', 'a.md', 'b.md']); return V.reorderEdge(m.c.id, 'bottom'); })
      .then(function () { eq(names(V), ['a.md', 'b.md', 'c.md']); return V.create('folder', 'F', null); })
      .then(function (f) { m.f = f; return V.create('file', 'inside.md', f.id); })
      .then(function () { return V.move(m.a.id, m.f.id); })
      .then(function () { eq(names(V, m.f.id), ['inside.md', 'a.md']); });
  });
});

t('older unordered items keep folders-first A-Z and sit above ordered ones', function () {
  disk = {};
  return bootVault().then(function (V) {
    var dbName = V.dbNameFor('default');
    var rows = disk[dbName];
    rows.o1 = { id: 'o1', type: 'file', name: 'b-old.md', parent: null, content: '' };
    rows.o2 = { id: 'o2', type: 'folder', name: 'z-old', parent: null, content: '' };
    rows.o3 = { id: 'o3', type: 'file', name: 'a-old.md', parent: null, content: '' };
    return bootVault().then(function (V2) {
      return V2.create('file', 'new.md', null).then(function () {
        eq(names(V2), ['z-old', 'a-old.md', 'b-old.md', 'new.md']);
      });
    });
  });
});

// ---------- parallel pull ----------
function makeSyncRig(count) {
  var sb = { console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder, Uint8Array: Uint8Array, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout };
  sb.window = sb; sb.document = { addEventListener: function () {}, hidden: false };
  vm.createContext(sb);
  ['kinds.js', 'foldersync.js'].forEach(function (f) { vm.runInContext(read(f), sb, { filename: f }); });
  var LN = sb.LN, nodes = {}, seq = 0, inflight = 0, maxInflight = 0;
  var vault = {
    children: function (p) { p = p || null; return Object.keys(nodes).map(function (k) { return nodes[k]; }).filter(function (n) { return n.parent === p; }); },
    create: function (type, name, parent) { var n = { id: 'n' + (++seq), type: type, name: name, parent: parent || null, content: '', updated: 1 }; nodes[n.id] = n; return Promise.resolve(n); },
    importFile: function (name, parent, payload) { var n = { id: 'n' + (++seq), type: 'file', name: name, parent: parent || null, content: typeof payload === 'string' ? payload : '', updated: 1 }; nodes[n.id] = n; return Promise.resolve(n); },
    update: function (id, c) { nodes[id].content = c; return Promise.resolve(); },
    updateBlob: function () { return Promise.resolve(); },
    all: function () { return Object.keys(nodes).map(function (k) { return nodes[k]; }); },
    path: function (id) { var n = nodes[id], p = []; while (n) { p.unshift(n.name); n = nodes[n.parent]; } return p.join('/'); }
  };
  var entries = [{ path: 'Deep', dir: true }, { path: 'Deep/Deeper', dir: true }];
  for (var i = 0; i < count; i++) entries.push({ path: 'Deep/Deeper/note' + i + '.md', dir: false, mtime: 5, size: 3 });
  entries.push({ path: '.config-note.md', dir: false, mtime: 5, size: 3 }, { path: '.git/HEAD', dir: false, mtime: 5, size: 3 });
  var progress = [];
  var backend = {
    list: function () { return Promise.resolve(entries); },
    read: function (p) {
      inflight++; maxInflight = Math.max(maxInflight, inflight);
      return new Promise(function (res) { setTimeout(function () { inflight--; res(new TextEncoder().encode('abc')); }, Math.random() * 8); });
    },
    stat: function () { return Promise.resolve(null); }, write: function () { return Promise.resolve(); }, mkdir: function () { return Promise.resolve(); }, remove: function () { return Promise.resolve(); }
  };
  var idx = {};
  var engine = LN.foldersync.create({ vault: vault, backend: backend, loadIndex: function () { return idx; }, saveIndex: function (i) { idx = i; },
    options: function () { return { conflict: 'folder' }; }, progress: function (p) { progress.push(p); } });
  return { engine: engine, vault: vault, progress: progress, max: function () { return maxInflight; } };
}

t('pull reads in parallel, creates each folder once, imports every file and reports progress', function () {
  var r = makeSyncRig(60);
  return r.engine.pull().then(function (res) {
    assert.strictEqual(res.errors, 0);
    assert.strictEqual(res.created, 61, '60 notes + the dotfile note; .git is noise');
    var folders = r.vault.all().filter(function (n) { return n.type === 'folder'; });
    assert.strictEqual(folders.length, 2, 'Deep and Deep/Deeper made exactly once');
    assert.ok(r.max() > 1 && r.max() <= 5, 'parallel reads, capped at 5 (saw ' + r.max() + ')');
    assert.ok(r.progress.length > 0 && r.progress[r.progress.length - 1].done === 1);
  });
});

t('second pull of an unchanged folder reads nothing', function () {
  var r = makeSyncRig(20);
  return r.engine.pull().then(function () { return r.engine.pull(); }).then(function (res) {
    assert.strictEqual(res.created, 0); assert.strictEqual(res.unchanged, 21);
  });
});

// ---------- quotes and greeting ----------
function bootQuotes(stored) {
  var store = { 'ln.quote.i': stored };
  var sb = { console: console, localStorage: { getItem: function (k) { return store[k] === undefined ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); } }, Date: Date };
  sb.window = sb; vm.createContext(sb);
  vm.runInContext(read('quotes.js'), sb);
  return { Q: sb.LN.quotes, store: store };
}

t('greeting follows the hour', function () {
  var Q = bootQuotes().Q;
  [[5, 'Good Morning'], [11, 'Good Morning'], [12, 'Good Afternoon'], [16, 'Good Afternoon'], [17, 'Good Evening'], [20, 'Good Evening'], [21, 'Late Night'], [3, 'Late Night']].forEach(function (c) {
    assert.strictEqual(Q.greeting(new Date(2026, 9, 20, c[0], 0)), c[1], 'hour ' + c[0]);
  });
  assert.strictEqual(Q.timeText(new Date(2026, 9, 20, 7, 5)), '07:05');
});

t('every quote names a source, none look like song lyrics, and each launch moves to the next one', function () {
  var b = bootQuotes('3');
  var Q = b.Q;
  assert.ok(Q.list.length >= 15);
  Q.list.forEach(function (q) { assert.ok(q.t && q.by && q.src, 'complete: ' + q.t); assert.ok(q.t.length < 200, 'short spoken line, not a verse'); assert.ok(!/\n/.test(q.t)); });
  assert.strictEqual(Q.current(), Q.list[4]);
  assert.strictEqual(b.store['ln.quote.i'], '4');
  var wrap = bootQuotes(String(Q.list.length - 1));
  assert.strictEqual(wrap.Q.current(), wrap.Q.list[0], 'wraps after the last');
  assert.ok(Q.filtered(['w', 'o']).length >= 10);
});

var failed = 0;
tests.reduce(function (p, c) {
  return p.then(function () { return Promise.resolve().then(c[1]).then(function () { console.log('PASS ' + c[0]); }, function (e) { failed++; console.log('FAIL ' + c[0] + '\n   ' + (e && e.stack || e)); }); });
}, Promise.resolve()).then(function () {
  console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed');
  process.exit(failed ? 1 : 0);
});
