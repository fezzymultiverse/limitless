// Logic tests for the Recycle bin in www/js/vault.js (V0.7.0 WIP6), on a small fake IndexedDB.
// Run with: node tests/bin-test.js   (no install needed)
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var src = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'vault.js'), 'utf8');

var disk = {}; // db name -> { rowId: row } ; survives "restarts"
function fakeIDB() {
  return {
    open: function (name) {
      var req = {};
      setTimeout(function () {
        var rows = disk[name] || (disk[name] = { keep: { id: 'keep', type: 'file', name: '.keep', parent: null, content: '' } });
        var made = false;
        var db = {
          objectStoreNames: { contains: function () { return made; } },
          createObjectStore: function () { made = true; },
          close: function () {},
          transaction: function () {
            var tx = {}, ops = [];
            tx.objectStore = function () {
              return {
                getAll: function () {
                  var r = {};
                  setTimeout(function () { r.result = Object.keys(rows).map(function (k) { return JSON.parse(JSON.stringify(rows[k], repl)); }); if (r.onsuccess) r.onsuccess(); }, 0);
                  return r;
                },
                put: function (v) { ops.push(function () { rows[v.id] = JSON.parse(JSON.stringify(v, repl)); }); },
                delete: function (k) { ops.push(function () { delete rows[k]; }); }
              };
            };
            setTimeout(function () { ops.forEach(function (f) { f(); }); if (tx.oncomplete) tx.oncomplete(); }, 1);
            return tx;
          }
        };
        req.result = db;
        r2(db);
      }, 0);
      function r2(db) { if (req.onupgradeneeded) req.onupgradeneeded(); req.onsuccess && req.onsuccess(); }
      return req;
    }
  };
}
function repl(k, v) { return v instanceof Uint8Array ? { __u8: Array.from(v) } : v; }

function boot() {
  var sb = { console: console, Promise: Promise, setTimeout: setTimeout, Date: Date, JSON: JSON, Uint8Array: Uint8Array, Blob: Blob };
  sb.window = sb; sb.indexedDB = fakeIDB();
  sb.LN = { store: { get: function (k) { return k === 'activeVault' ? 'default' : (k === 'vaults' ? [{ id: 'default', name: 'My vault' }] : null); } } };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  return sb.LN.vault.init().then(function () { return sb.LN.vault; });
}

var tests = [];
function t(n, f) { tests.push([n, f]); }
function names(V) { return V.all().map(function (n) { return V.path(n.id); }).filter(function (p) { return p !== '.keep'; }).sort(); }
function eq(a, b, m) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); }
function liveCount(V) { return names(V).length; }

t('trash hides a file and keeps its text', function () {
  disk = {};
  return boot().then(function (V) {
    var seen = [];
    V.onChange(function (puts, dels) { seen.push([puts.length, dels.length]); });
    return V.create('file', 'a.md', null).then(function (a) {
      return V.update(a.id, 'hello').then(function () { return V.trash(a.id); }).then(function (ids) {
        eq(ids, [a.id]);
        assert.strictEqual(V.get(a.id), null);
        assert.strictEqual(V.search('hello').length, 0);
        assert.strictEqual(V.binCount(), 1);
        assert.strictEqual(V.binGet(a.id).content, 'hello');
        eq(seen[seen.length - 1], [0, 1], 'listeners see a delete');
      });
    });
  });
});

t('bin survives a restart and readVault leaves it out', function () {
  return boot().then(function (V) {
    assert.strictEqual(V.binCount(), 1);
    assert.strictEqual(V.all().filter(function (n) { return n.name === 'a.md'; }).length, 0);
    return V.readVault('default').then(function (live) {
      assert.ok(!live.some(function (n) { return n.name === 'a.md'; }));
      return V.readVault('default', true);
    }).then(function (all) { assert.ok(all.some(function (n) { return n.name === 'a.md'; })); });
  });
});

t('restore puts a file back where it was, with its text', function () {
  return boot().then(function (V) {
    var id = V.binItems()[0].id, seen = [];
    V.onChange(function (puts, dels) { seen.push([puts.length, dels.length]); });
    return V.restore(id).then(function (r) {
      assert.strictEqual(r.path, 'a.md');
      assert.strictEqual(V.get(id).content, 'hello');
      assert.strictEqual(V.get(id).trash, undefined);
      assert.strictEqual(V.binCount(), 0);
      eq(seen[0], [1, 0], 'listeners see a put');
    });
  });
});

t('trash a folder takes everything inside; restore brings it all back', function () {
  disk = {};
  return boot().then(function (V) {
    var f, g;
    return V.create('folder', 'Proj', null).then(function (x) { f = x; return V.create('folder', 'Sub', f.id); })
      .then(function (x) { g = x; return V.importFile('n.md', g.id, 'deep'); })
      .then(function () { return V.importFile('top.md', f.id, 'top'); })
      .then(function () { return V.trash(f.id); }).then(function (ids) {
        assert.strictEqual(ids.length, 4);
        assert.strictEqual(liveCount(V), 0);
        var it = V.binItems();
        assert.strictEqual(it.length, 1, 'one entry for the whole folder');
        assert.strictEqual(it[0].items, 4);
        eq(V.binPaths(f.id), ['Sub/', 'Sub/n.md', 'top.md']);
        return V.restore(f.id);
      }).then(function () {
        eq(names(V), ['Proj', 'Proj/Sub', 'Proj/Sub/n.md', 'Proj/top.md']);
        assert.strictEqual(V.binCount(), 0);
      });
  });
});

t('name clash gets (2), nothing is overwritten', function () {
  disk = {};
  return boot().then(function (V) {
    var a;
    return V.importFile('x.md', null, 'old').then(function (n) { a = n; return V.trash(n.id); })
      .then(function () { return V.importFile('x.md', null, 'new'); })
      .then(function () { return V.restore(a.id); }).then(function (r) {
        assert.strictEqual(V.get(a.id).name, 'x (2).md');
        assert.strictEqual(V.get(a.id).content, 'old');
        eq(names(V), ['x (2).md', 'x.md']);
      });
  });
});

t('old folder deleted for good: path is made again by name', function () {
  disk = {};
  return boot().then(function (V) {
    var a, f, s;
    return V.create('folder', 'A', null).then(function (x) { return V.create('folder', 'B', x.id); })
      .then(function (x) { f = x; return V.importFile('k.md', f.id, 'k'); })
      .then(function (n) { a = n; return V.trash(n.id); })
      .then(function () { return V.trash(V.resolvePath('A').id); })   // A and B go to the bin
      .then(function () { assert.strictEqual(liveCount(V), 0); return V.restore(a.id); })
      .then(function (r) {
        assert.strictEqual(r.path, 'A/B/k.md');
        eq(names(V), ['A', 'A/B', 'A/B/k.md']);
        // now bring the trashed A back: it merges into the live A, no "A (2)"
        var Aid = V.binItems()[0].id;
        return V.restore(Aid);
      }).then(function () {
        eq(names(V), ['A', 'A/B', 'A/B/k.md']);
        assert.strictEqual(V.binCount(), 0);
        assert.strictEqual(V.binUsage().nodes, 0, 'merged-away folders leave no orphans');
      });
  });
});

t('merge keeps both sides when files clash', function () {
  disk = {};
  return boot().then(function (V) {
    return V.create('folder', 'D', null).then(function (d) {
      return V.importFile('same.md', d.id, 'one').then(function () { return V.trash(d.id); });
    }).then(function () { return V.create('folder', 'D', null); })
      .then(function (d2) { return V.importFile('same.md', d2.id, 'two'); })
      .then(function () { return V.restore(V.binItems()[0].id); })
      .then(function () {
        eq(names(V), ['D', 'D/same (2).md', 'D/same.md']);
        var m = {}; V.all().forEach(function (n) { m[V.path(n.id)] = n.content; });
        assert.strictEqual(m['D/same.md'], 'two'); assert.strictEqual(m['D/same (2).md'], 'one');
      });
  });
});

t('purge, emptyBin and purgeOlder delete for good, on disk too', function () {
  disk = {};
  return boot().then(function (V) {
    var ids = [];
    return V.importFile('1.md', null, 'a').then(function (n) { ids.push(n.id); return V.importFile('2.md', null, 'b'); })
      .then(function (n) { ids.push(n.id); return V.importFile('3.md', null, 'c'); })
      .then(function (n) { ids.push(n.id); return V.trash(ids[0]); })
      .then(function () { return V.trash(ids[1]); }).then(function () { return V.trash(ids[2]); })
      .then(function () {
        V.binGet(ids[0]).trash.at = Date.now() - 40 * 86400000;
        return V.purgeOlder(30);
      }).then(function (c) {
        assert.strictEqual(c, 1); assert.strictEqual(V.binCount(), 2);
        return V.purge(ids[1]);
      }).then(function () { assert.strictEqual(V.binCount(), 1); return V.emptyBin(); })
      .then(function (c) {
        assert.strictEqual(c, 1); assert.strictEqual(V.binCount(), 0);
        return V.readVault('default', true);
      }).then(function (rows) { assert.strictEqual(rows.filter(function (r) { return r.name !== '.keep'; }).length, 0, 'disk is empty'); });
  });
});

t('a queued autosave cannot undo a trash that follows it', function () {
  disk = {};
  return boot().then(function (V) {
    return V.create('file', 'q.md', null).then(function (n) {
      var p1 = V.update(n.id, 'typed just before delete');
      var p2 = V.trash(n.id);
      return Promise.all([p1, p2]).then(function () { return V.readVault('default', true); });
    }).then(function (rows) {
      rows = rows.filter(function (r) { return r.name !== '.keep'; });
      assert.strictEqual(rows.length, 1);
      assert.ok(rows[0].trash, 'row on disk is still flagged as trashed');
      assert.strictEqual(rows[0].content, 'typed just before delete');
    });
  });
});

t('binUsage and a missing id', function () {
  disk = {};
  return boot().then(function (V) {
    return V.importFile('s.md', null, '12345').then(function (n) { return V.trash(n.id); }).then(function () {
      var u = V.binUsage(); assert.strictEqual(u.items, 1); assert.strictEqual(u.bytes, 5);
      return V.restore('nope').then(function () { assert.fail('should reject'); }, function (e) { assert.ok(/no longer/.test(e.message)); });
    });
  });
});

var failed = 0;
tests.reduce(function (p, x) {
  return p.then(function () { return x[1](); }).then(function () { console.log('PASS ' + x[0]); }, function (e) { failed++; console.log('FAIL ' + x[0] + ' :: ' + (e && e.stack || e)); });
}, Promise.resolve()).then(function () { console.log((tests.length - failed) + '/' + tests.length + ' pass'); process.exit(failed ? 1 : 0); });
