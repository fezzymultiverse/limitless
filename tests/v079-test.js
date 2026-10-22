// Logic tests for V0.7.9: extra sync folders (www/js/extra.js). Run: node tests/v079-test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var root = path.join(__dirname, '..', 'www', 'js');
var sb = { console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder, Uint8Array: Uint8Array, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout, Date: Date, Math: Math, JSON: JSON };
sb.window = sb; sb.document = { addEventListener: function () {}, hidden: false };
vm.createContext(sb);
['kinds.js', 'foldersync.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }); });
var LN = sb.LN;
var clock = 1000; function tick() { return ++clock; }

// fake vault with the API the sync engine and extra.js use
var nodes = {}, n = 0;
var V = {
  all: function () { return Object.keys(nodes).map(function (k) { return nodes[k]; }); },
  get: function (id) { return nodes[id] || null; },
  children: function (p) { p = p || null; return V.all().filter(function (x) { return x.parent === p; }); },
  descendants: function (id) { var out = []; (function w(pid) { V.children(pid).forEach(function (c) { out.push(c.id); if (c.type === 'folder') w(c.id); }); })(id); return out; },
  path: function (id) { var parts = [], x = nodes[id]; while (x) { parts.unshift(x.name); x = nodes[x.parent]; } return parts.join('/'); },
  create: function (type, name, parent) { var x = { id: 'n' + (++n), type: type, name: name, parent: parent || null, content: '', updated: tick() }; nodes[x.id] = x; return Promise.resolve(x); },
  importFile: function (name, parent, payload) {
    var x = { id: 'n' + (++n), type: 'file', name: name, parent: parent || null, content: '', updated: tick() };
    if (typeof payload === 'string') x.content = payload; else { x.bytes = payload; x.size = payload.length; }
    nodes[x.id] = x; return Promise.resolve(x);
  },
  update: function (id, c) { nodes[id].content = c; nodes[id].updated = tick(); return Promise.resolve(); },
  updateBlob: function (id, b) { nodes[id].bytes = b; nodes[id].updated = tick(); return Promise.resolve(); },
  rename: function (id, name) { nodes[id].name = name; return Promise.resolve(nodes[id]); }
};
function backend() {
  var files = {}, dirs = {};
  return { files: files, dirs: dirs, name: 'fake',
    ensureRoot: function () { return Promise.resolve(); },
    list: function () { var out = Object.keys(dirs).map(function (p) { return { path: p, dir: true, mtime: 0, size: 0 }; }); Object.keys(files).forEach(function (p) { out.push({ path: p, dir: false, mtime: files[p].m, size: files[p].b.length }); }); return Promise.resolve(out); },
    stat: function (p) { return Promise.resolve(files[p] ? { mtime: files[p].m, size: files[p].b.length } : null); },
    read: function (p) { return Promise.resolve(files[p].b); },
    write: function (p, b) { files[p] = { b: b, m: tick() }; return Promise.resolve(); },
    mkdir: function (p) { dirs[p] = 1; return Promise.resolve(); },
    remove: function (p, d) { if (d) delete dirs[p]; else delete files[p]; return Promise.resolve(); },
    put: function (p, t) { files[p] = { b: new TextEncoder().encode(t), m: tick() }; } };
}
var disk = { termux: backend(), pics: backend() };
var settings = { extraFolders: [], folderMode: 'off', mirrorDeletes: false, syncExclude: '', conflictMode: 'folder' };
LN.store = { get: function (k) { return settings[k]; }, set: function (k, v) { settings[k] = v; } };
LN.vault = V;
LN.tree = { render: function () {} };
LN.folder = { _int: {
  capPlugin: function () { return { requestPermissions: function () { return Promise.resolve(); } }; },
  safPlugin: function () { return null },
  cap: function (fsx, name) { if (!disk[name]) disk[name] = backend(); return disk[name]; },
  saf: function () { throw new Error('no'); }, fsa: function () { throw new Error('no'); },
  hget: function () { return Promise.resolve(null); }, hput: function () { return Promise.resolve(); } } };
vm.runInContext(fs.readFileSync(path.join(root, 'extra.js'), 'utf8'), sb, { filename: 'extra.js' });
var X = LN.extra;
var tests = [];
function t(name, fn) { tests.push([name, fn]); }
function text(b) { return new TextDecoder().decode(b); }
function mount(name) { return V.children(null).filter(function (c) { return c.name === name; })[0]; }

t('adds a folder and makes its vault folder', function () {
  return X.addNamed('termux').then(function (r) {
    assert.strictEqual(X.count(), 1);
    assert.strictEqual(r.mount, 'termux');
    assert.ok(mount('termux') && mount('termux').type === 'folder');
  });
});
t('refuses the same folder twice', function () {
  return X.addNamed('Termux').then(function () { assert.fail('should refuse'); }, function (e) { assert.ok(/already/.test(e.message)); });
});
t('pull imports files into the mount folder only', function () {
  disk.termux.put('a.txt', 'hello'); disk.termux.put('sub/b.md', 'deep');
  return X.syncAll().then(function (o) {
    assert.strictEqual(o.failed.length, 0);
    var m = mount('termux');
    var a = V.children(m.id).filter(function (c) { return c.name === 'a.txt'; })[0];
    assert.strictEqual(a.content, 'hello');
    var sub = V.children(m.id).filter(function (c) { return c.name === 'sub'; })[0];
    assert.ok(sub && V.children(sub.id)[0].name === 'b.md');
    assert.strictEqual(V.children(null).filter(function (c) { return c.name === 'a.txt'; }).length, 0, 'nothing leaks to the vault root');
  });
});
t('push writes vault files inside the mount, never other notes', function () {
  return V.create('file', 'private.md', null).then(function (p) { return V.update(p.id, 'secret'); }).then(function () {
    var m = mount('termux');
    return V.importFile('new.txt', m.id, 'fresh');
  }).then(function () { return X.syncAll(); }).then(function () {
    assert.strictEqual(text(disk.termux.files['new.txt'].b), 'fresh');
    assert.ok(!disk.termux.files['private.md'], 'a note outside the mount must not reach the folder');
    assert.ok(!Object.keys(disk.termux.files).some(function (k) { return /termux\//.test(k); }), 'paths are relative to the mount');
  });
});
t('second folder is independent', function () {
  disk.pics.put('p1.txt', 'one');
  return X.addNamed('pics').then(function () { return X.syncAll(); }).then(function () {
    assert.ok(mount('pics'));
    assert.strictEqual(text(disk.pics.files['p1.txt'].b), 'one');
    assert.ok(!disk.pics.files['a.txt'] && !disk.pics.files['new.txt'], 'folders do not mix');
    assert.ok(!disk.termux.files['p1.txt']);
  });
});
t('syncOne only syncs the selected folder', function () {
  disk.pics.put('only-pics.txt', 'pics');
  disk.termux.put('only-termux.txt', 'termux');
  var before = V.all().length;
  return X.syncOne(X.list().filter(function (r) { return r.label === 'pics'; })[0].id).then(function (o) {
    assert.strictEqual(o.done, 1);
    assert.strictEqual(o.failed.length, 0);
    var p = mount('pics');
    assert.ok(V.children(p.id).some(function (c) { return c.name === 'only-pics.txt'; }));
    var tmount = mount('termux');
    assert.ok(!V.children(tmount.id).some(function (c) { return c.name === 'only-termux.txt'; }), 'other folder was not synced');
  });
});
t('one failing folder does not stop the others', function () {
  var good = disk.pics.list;
  disk.termux.list = function () { return Promise.reject(new Error('boom')); };
  disk.pics.put('p2.txt', 'two');
  return X.syncAll().then(function (o) {
    assert.strictEqual(o.failed.length, 1);
    assert.ok(/boom/.test(o.failed[0]));
    var p = mount('pics');
    assert.ok(V.children(p.id).some(function (c) { return c.name === 'p2.txt'; }), 'second folder still synced');
    assert.ok(X.list()[0].err, 'error is recorded on the failing folder');
    disk.termux.list = backend().list.bind(disk.termux);
  });
});
t('rename of the vault folder keeps syncing', function () {
  var id = X.list()[1].id;
  return X.rename(id, 'Pictures').then(function () { disk.pics.put('p3.txt', 'three'); return X.syncAll(); }).then(function () {
    var m = mount('Pictures');
    assert.ok(m && V.children(m.id).some(function (c) { return c.name === 'p3.txt'; }));
  });
});
t('remove keeps files in vault and folder', function () {
  var id = X.list()[0].id;
  X.remove(id);
  assert.strictEqual(X.count(), 1);
  assert.ok(mount('termux'));
  assert.ok(disk.termux.files['a.txt']);
});
t('main folder cannot be added as an extra', function () {
  settings.folderMode = 'cap'; settings.capFolder = 'Main';
  return X.addNamed('main').then(function () { assert.fail('should refuse'); }, function (e) { assert.ok(/main folder/.test(e.message)); });
});

(function run(i, pass) {
  if (i >= tests.length) { console.log(pass + '/' + tests.length + ' passed'); process.exit(pass === tests.length ? 0 : 1); }
  var T = tests[i];
  Promise.resolve().then(T[1]).then(function () { console.log('ok   ' + T[0]); run(i + 1, pass + 1); }, function (e) { console.log('FAIL ' + T[0] + ': ' + (e && e.stack || e)); run(i + 1, pass); });
})(0, 0);
