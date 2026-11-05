// Logic tests for V0.3.0: folder sync engine, AI request building, base64 helpers.
// Run with: node tests/sync-test.js   (no install needed)
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..', 'www', 'js');
var calls = [];
var fetchImpl = null;
var sandbox = {
  console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder, Uint8Array: Uint8Array, Promise: Promise,
  setTimeout: setTimeout, clearTimeout: clearTimeout, btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
  atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
  fetch: function (url, init) { calls.push({ url: url, init: init }); return fetchImpl(url, init); }
};
sandbox.window = sandbox;
sandbox.document = { addEventListener: function () {}, hidden: false };
vm.createContext(sandbox);
['kinds.js', 'foldersync.js', 'folder.js', 'ai.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
var LN = sandbox.LN;

// ---- fakes ----
var clock = 1000;
function tick() { return ++clock; }

function makeVault() {
  var nodes = {}, n = 0;
  function uid() { return 'n' + (++n); }
  var v = {
    all: function () { return Object.keys(nodes).map(function (k) { return nodes[k]; }); },
    get: function (id) { return nodes[id] || null; },
    children: function (p) { p = p || null; return v.all().filter(function (x) { return x.parent === p; }); },
    path: function (id) { var parts = [], x = nodes[id]; while (x) { parts.unshift(x.name); x = nodes[x.parent]; } return parts.join('/'); },
    create: function (type, name, parent) {
      var x = { id: uid(), type: type, name: name, parent: parent || null, content: '', updated: tick() };
      nodes[x.id] = x; return Promise.resolve(x);
    },
    importFile: function (name, parent, payload) {
      var base = name, i = 2;
      function taken(nm) { return v.children(parent || null).some(function (c) { return c.name.toLowerCase() === nm.toLowerCase(); }); }
      while (taken(name)) { var m = /^(.*?)(\.[^.]+)?$/.exec(base); name = m[1] + ' (' + i++ + ')' + (m[2] || ''); }
      var x = { id: uid(), type: 'file', name: name, parent: parent || null, content: '', updated: tick() };
      if (typeof payload === 'string') x.content = payload; else { x.bytes = payload; x.size = payload.length; }
      nodes[x.id] = x; return Promise.resolve(x);
    },
    update: function (id, c) { nodes[id].content = c; nodes[id].updated = tick(); return Promise.resolve(); },
    updateBlob: function (id, b) { nodes[id].bytes = b; nodes[id].updated = tick(); return Promise.resolve(); },
    remove: function (id) { delete nodes[id]; }
  };
  return v;
}

function makeBackend() {
  var files = {}, dirs = {};
  var b = {
    files: files, dirs: dirs,
    list: function () {
      var out = Object.keys(dirs).map(function (p) { return { path: p, dir: true, mtime: 0, size: 0 }; });
      Object.keys(files).forEach(function (p) { out.push({ path: p, dir: false, mtime: files[p].m, size: files[p].b.length }); });
      return Promise.resolve(out);
    },
    stat: function (p) { return Promise.resolve(files[p] ? { mtime: files[p].m, size: files[p].b.length } : null); },
    read: function (p) { return Promise.resolve(files[p].b); },
    write: function (p, bytes) { files[p] = { b: bytes, m: tick() }; return Promise.resolve(); },
    mkdir: function (p) { dirs[p] = 1; return Promise.resolve(); },
    remove: function (p, isDir) { if (isDir) delete dirs[p]; else delete files[p]; return Promise.resolve(); },
    put: function (p, text) { files[p] = { b: typeof text === 'string' ? new TextEncoder().encode(text) : text, m: tick() }; }
  };
  return b;
}

function rig(opts) {
  var vault = makeVault(), backend = makeBackend(), index = {}, o = opts || { mirrorDeletes: false };
  var engine = LN.foldersync.create({
    vault: vault, backend: backend, options: function () { return o; },
    loadIndex: function () { return JSON.parse(JSON.stringify(index)); },
    saveIndex: function (i) { index = i; }
  });
  return { vault: vault, backend: backend, engine: engine, opts: o, index: function () { return index; } };
}
function text(b) { return new TextDecoder().decode(b); }
function findByPath(vault, p) { return vault.all().filter(function (n) { return vault.path(n.id) === p; })[0]; }

var tests = [];
function t(name, fn) { tests.push([name, fn]); }

t('push writes folders and files, second push is a no-op', function () {
  var r = rig();
  return r.vault.create('folder', 'Notes', null).then(function (f) {
    return r.vault.importFile('a.md', f.id, '# hi').then(function () { return r.vault.importFile('b.txt', null, 'root'); });
  }).then(function () { return r.engine.push(); }).then(function (res) {
    assert.strictEqual(res.written, 2);
    assert.ok(r.backend.dirs['Notes']);
    assert.strictEqual(text(r.backend.files['Notes/a.md'].b), '# hi');
    return r.engine.push();
  }).then(function (res) { assert.strictEqual(res.written, 0); });
});

t('only the edited file is rewritten', function () {
  var r = rig(), a;
  return r.vault.importFile('a.md', null, 'one').then(function (n) { a = n; return r.vault.importFile('b.md', null, 'two'); })
    .then(function () { return r.engine.push(); })
    .then(function () { return r.vault.update(a.id, 'one edited'); })
    .then(function () { return r.engine.push(); })
    .then(function (res) { assert.strictEqual(res.written, 1); assert.strictEqual(text(r.backend.files['a.md'].b), 'one edited'); });
});

t('pull imports new nested files, text and binary', function () {
  var r = rig();
  r.backend.dirs['Deep'] = 1; r.backend.dirs['Deep/er'] = 1;
  r.backend.put('Deep/er/n.md', 'nested');
  r.backend.put('doc.docx', new Uint8Array([80, 75, 3, 4, 1, 2]));
  return r.engine.pull().then(function (res) {
    assert.strictEqual(res.created, 2);
    assert.strictEqual(findByPath(r.vault, 'Deep/er/n.md').content, 'nested');
    assert.deepStrictEqual(Array.from(findByPath(r.vault, 'doc.docx').bytes), [80, 75, 3, 4, 1, 2]);
    return r.engine.pull();
  }).then(function (res) { assert.strictEqual(res.created + res.updated, 0); });
});

t('folder edit with no local change updates the vault without a copy', function () {
  var r = rig();
  return r.vault.importFile('a.md', null, 'v1').then(function () { return r.engine.sync(); }).then(function () {
    r.backend.put('a.md', 'v2 from termux');
    return r.engine.pull();
  }).then(function (res) {
    assert.strictEqual(res.updated, 1); assert.strictEqual(res.conflicts, 0);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'v2 from termux');
    assert.strictEqual(r.vault.all().length, 1);
  });
});

t('both sides changed: folder wins, vault version kept as a copy', function () {
  var r = rig(), a;
  return r.vault.importFile('a.md', null, 'v1').then(function (n) { a = n; return r.engine.sync(); }).then(function () {
    return r.vault.update(a.id, 'vault edit');
  }).then(function () {
    r.backend.put('a.md', 'folder edit');
    return r.engine.pull();
  }).then(function (res) {
    assert.strictEqual(res.conflicts, 1);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'folder edit');
    assert.strictEqual(findByPath(r.vault, 'a (vault copy).md').content, 'vault edit');
  });
});

t('push never overwrites a folder file that changed outside', function () {
  var r = rig(), a;
  return r.vault.importFile('a.md', null, 'v1').then(function (n) { a = n; return r.engine.sync(); }).then(function () {
    return r.vault.update(a.id, 'vault edit');
  }).then(function () {
    r.backend.put('a.md', 'someone else');
    return r.engine.push();
  }).then(function (res) {
    assert.strictEqual(res.needsPull, true); assert.strictEqual(res.written, 0);
    assert.strictEqual(text(r.backend.files['a.md'].b), 'someone else');
  });
});

t('vault deletes stay in the folder unless mirrorDeletes is on', function () {
  var r = rig(), a;
  return r.vault.importFile('a.md', null, 'x').then(function (n) { a = n; return r.engine.push(); }).then(function () {
    r.vault.remove(a.id);
    return r.engine.push();
  }).then(function (res) {
    assert.strictEqual(res.removed, 0); assert.ok(r.backend.files['a.md']);
    r.opts.mirrorDeletes = true;
    return r.engine.push();
  }).then(function (res) { assert.strictEqual(res.removed, 1); assert.ok(!r.backend.files['a.md']); });
});

t('V0.7.20: only app/OS noise is skipped (.git, .trash...), every other file incl. dotfiles is read, and mirrorDeletes never removes the skipped ones', function () {
  var r = rig({ mirrorDeletes: true });
  r.backend.put('.hidden.md', 'secret');
  r.backend.put('.git/HEAD', 'ref');
  r.backend.put('.Trash-1000/x.md', 'bin');
  var raw = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x80, 0x00]);
  r.backend.put('pic.bin', raw);
  r.backend.put('blob.xyz', new Uint8Array([0x00, 0x01, 0x02, 0xfe]));
  r.backend.put('latin.txt', new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
  return r.engine.pull().then(function (res) {
    assert.strictEqual(res.skipped, 0); assert.strictEqual(res.created, 4);
    var byName = {}; r.vault.all().forEach(function (n) { byName[n.name] = n; });
    assert.deepStrictEqual(Array.from(byName['pic.bin'].bytes), Array.from(raw));
    assert.ok(byName['blob.xyz'].bytes);
    assert.strictEqual(byName['latin.txt'].content, 'caf\u00e9');
    assert.strictEqual(LN.kindOfNode(byName['blob.xyz']), 'bin');
    return r.engine.push();
  }).then(function () { assert.ok(r.backend.files['pic.bin']); assert.ok(r.backend.files['.hidden.md']); });
});

t('kinds and decodeText: every extension has a reader', function () {
  var K = LN.kindOf;
  assert.strictEqual(K('a.odt'), 'doc'); assert.strictEqual(K('a.epub'), 'doc'); assert.strictEqual(K('a.rtf'), 'doc');
  assert.strictEqual(K('a.mp3'), 'media'); assert.strictEqual(K('a.mp4'), 'media');
  assert.strictEqual(K('a.docm'), 'docx'); assert.strictEqual(K('a.xlsm'), 'xlsx'); assert.strictEqual(K('a.pptm'), 'pptx');
  assert.strictEqual(K('a.zip'), 'bin'); assert.strictEqual(K('a.doc'), 'bin'); assert.strictEqual(K('a.svg'), 'img');
  assert.strictEqual(K('a.whatever'), 'text'); assert.strictEqual(K('noext'), 'text');
  assert.strictEqual(LN.kindOfNode({ name: 'a.dat2', bytes: new Uint8Array(1) }), 'bin');
  assert.strictEqual(LN.kindOfNode({ name: 'a.pdf', bytes: new Uint8Array(1) }), 'pdf');
  var D = LN.decodeText;
  assert.strictEqual(D(new Uint8Array([0xe2, 0x82, 0xac])).text, '\u20ac');
  assert.strictEqual(D(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00])).text, 'hi');
  assert.strictEqual(D(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69])).text, 'hi');
  assert.strictEqual(D(new Uint8Array([0x63, 0xe9])).enc, 'Windows-1252');
  assert.strictEqual(D(new Uint8Array([0x41, 0x00, 0x42])), null);
  assert.strictEqual(D(new Uint8Array(0)).text, '');
});

t('V0.4.0: images in the folder are pulled in as binary files', function () {
  var r = rig();
  var png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x80]);
  r.backend.put('pic.png', png);
  return r.engine.pull().then(function (res) {
    assert.strictEqual(res.created, 1); assert.strictEqual(res.skipped, 0);
    var all = r.vault.all(); assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].name, 'pic.png');
    assert.deepStrictEqual(Array.from(all[0].bytes), Array.from(png));
  });
});

t('a file deleted in the folder is written back, not deleted from the vault', function () {
  var r = rig();
  return r.vault.importFile('a.md', null, 'keep').then(function () { return r.engine.sync(); }).then(function () {
    delete r.backend.files['a.md'];
    return r.engine.sync();
  }).then(function () {
    assert.ok(findByPath(r.vault, 'a.md'));
    assert.strictEqual(text(r.backend.files['a.md'].b), 'keep');
  });
});

t('base64 helpers round-trip 200 KB', function () {
  var big = new Uint8Array(200000);
  for (var i = 0; i < big.length; i++) big[i] = (i * 31) & 255;
  var back = LN.folder._b64.from(LN.folder._b64.to(big));
  assert.strictEqual(back.length, big.length);
  assert.ok(Buffer.from(back).equals(Buffer.from(big)));
});

function store(map) {
  LN.store = { get: function (k) { return map[k]; }, set: function (k, v) { map[k] = v; } };
}
function ok(json) { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(json)); } }); }
function bad(status, json) { return Promise.resolve({ ok: false, status: status, text: function () { return Promise.resolve(JSON.stringify(json)); } }); }

t('Groq request shape and parsing', function () {
  store({ aiProvider: 'groq', groqKey: 'gsk_test', groqModel: 'llama-3.3-70b-versatile', aiTemp: 0.3, aiSystem: 'Be brief' });
  calls.length = 0;
  fetchImpl = function () { return ok({ choices: [{ message: { content: 'hello' } }] }); };
  return LN.ai.ask([{ role: 'user', content: 'hi' }]).then(function (out) {
    assert.strictEqual(out, 'hello');
    assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer gsk_test');
    var body = JSON.parse(calls[0].init.body);
    assert.strictEqual(body.model, 'llama-3.3-70b-versatile');
    assert.strictEqual(body.messages[0].role, 'system');
    assert.strictEqual(body.messages[1].content, 'hi');
    assert.strictEqual(body.temperature, 0.3);
  });
});

t('Gemini request shape and parsing', function () {
  store({ aiProvider: 'gemini', geminiKey: 'AIza_test', geminiModel: 'gemini-2.5-flash', aiTemp: 0.7, aiSystem: '' });
  calls.length = 0;
  fetchImpl = function () { return ok({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }); };
  return LN.ai.ask([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'again' }]).then(function (out) {
    assert.strictEqual(out, 'ab');
    assert.strictEqual(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.strictEqual(calls[0].init.headers['x-goog-api-key'], 'AIza_test');
    var body = JSON.parse(calls[0].init.body);
    assert.strictEqual(body.contents[1].role, 'model');
    assert.ok(!body.systemInstruction);
    assert.ok(calls[0].url.indexOf('AIza_test') < 0, 'key must travel in a header, not the URL');
  });
});

t('AI errors are readable and a missing key never hits the network', function () {
  store({ aiProvider: 'groq', groqKey: '', groqModel: 'm' });
  calls.length = 0;
  return LN.ai.ask([{ role: 'user', content: 'x' }]).then(function () { throw new Error('should fail'); }, function (e) {
    assert.ok(/API key/.test(e.message)); assert.strictEqual(calls.length, 0);
    store({ aiProvider: 'groq', groqKey: 'k', groqModel: 'm' });
    fetchImpl = function () { return bad(401, { error: { message: 'Invalid API Key' } }); };
    return LN.ai.ask([{ role: 'user', content: 'x' }]);
  }).then(function () { throw new Error('should fail'); }, function (e) {
    assert.ok(/rejected/.test(e.message));
    fetchImpl = function () { return bad(429, { error: { message: 'slow down' } }); };
    return LN.ai.ask([{ role: 'user', content: 'x' }]);
  }).then(function () { throw new Error('should fail'); }, function (e) { assert.ok(/Rate limit/.test(e.message)); });
});

t('model lists are filtered and sorted', function () {
  store({ groqKey: 'k', geminiKey: 'k' });
  fetchImpl = function (url) {
    if (/groq/.test(url)) return ok({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'gemma2-9b-it' }] });
    return ok({ models: [{ name: 'models/gemini-b', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }, { name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }] });
  };
  return LN.ai.listModels('groq').then(function (l) {
    assert.deepStrictEqual(Array.from(l), ['gemma2-9b-it', 'llama-3.1-8b-instant']);
    return LN.ai.listModels('gemini');
  }).then(function (l) { assert.deepStrictEqual(Array.from(l), ['gemini-a', 'gemini-b']); });
});


// ---- V0.7.0 WIP9: exclude, conflict modes, guards ----
t('excluded names and paths are skipped in pull, push and mirror delete', function () {
  var r = rig({ mirrorDeletes: true, excluded: 'node_modules\n/Private/secret/\n' }), keep;
  r.backend.dirs['node_modules'] = 1; r.backend.put('node_modules/x.md', 'dep');
  r.backend.dirs['src'] = 1; r.backend.dirs['src/node_modules'] = 1; r.backend.put('src/node_modules/y.md', 'dep2');
  r.backend.dirs['Private'] = 1; r.backend.dirs['Private/secret'] = 1; r.backend.put('Private/secret/k.md', 'k'); r.backend.put('Private/ok.md', 'ok');
  return r.engine.pull().then(function (res) {
    assert.strictEqual(res.created, 1);
    assert.ok(findByPath(r.vault, 'Private/ok.md'));
    assert.ok(!findByPath(r.vault, 'node_modules/x.md') && !findByPath(r.vault, 'src/node_modules/y.md') && !findByPath(r.vault, 'Private/secret/k.md'));
    return r.vault.create('folder', 'node_modules', null);
  }).then(function (f) { return r.vault.importFile('z.md', f.id, 'vault only'); }).then(function () { return r.engine.push(); }).then(function (res) {
    assert.ok(!r.backend.files['node_modules/z.md']);
    assert.ok(r.backend.files['node_modules/x.md']);
    var z = findByPath(r.vault, 'node_modules');
    r.vault.remove(z.id);
    return r.engine.push();
  }).then(function () { assert.ok(r.backend.files['node_modules/x.md'], 'excluded folder file must survive mirror delete'); });
});

t('conflict mode vault: vault note stays, folder version kept as folder copy, next push writes the vault note', function () {
  var r = rig({ mirrorDeletes: false, conflict: 'vault' }), a;
  return r.vault.importFile('a.md', null, 'v1').then(function (n) { a = n; return r.engine.sync(); }).then(function () {
    return r.vault.update(a.id, 'vault edit');
  }).then(function () {
    r.backend.put('a.md', 'folder edit');
    return r.engine.pull();
  }).then(function (res) {
    assert.strictEqual(res.conflicts, 1);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'vault edit');
    assert.strictEqual(findByPath(r.vault, 'a (folder copy).md').content, 'folder edit');
    return r.engine.push();
  }).then(function () { assert.strictEqual(text(r.backend.files['a.md'].b), 'vault edit'); });
});

t('conflict mode newest: later edit wins, unknown folder time keeps both', function () {
  var r = rig({ mirrorDeletes: false, conflict: 'newest' }), a;
  return r.vault.importFile('a.md', null, 'v1').then(function (n) { a = n; return r.engine.sync(); }).then(function () {
    r.backend.put('a.md', 'older folder edit');
    return r.vault.update(a.id, 'newer vault edit');
  }).then(function () { return r.engine.pull(); }).then(function (res) {
    assert.strictEqual(res.conflicts, 1);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'newer vault edit');
    assert.strictEqual(findByPath(r.vault, 'a (folder copy).md').content, 'older folder edit');
    return r.engine.push();
  }).then(function () {
    return r.vault.update(a.id, 'vault edit 2');
  }).then(function () {
    r.backend.put('a.md', 'newer folder edit');
    return r.engine.pull();
  }).then(function (res) {
    assert.strictEqual(res.conflicts, 1);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'newer folder edit');
    assert.strictEqual(findByPath(r.vault, 'a (vault copy).md').content, 'vault edit 2');
    return r.vault.update(a.id, 'vault edit 3');
  }).then(function () {
    r.backend.put('a.md', 'zero time edit'); r.backend.files['a.md'].m = 0;
    return r.engine.pull();
  }).then(function (res) {
    assert.strictEqual(res.conflicts, 1);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'zero time edit');
    assert.ok(r.vault.all().some(function (n) { return n.content === 'vault edit 3'; }), 'vault version must survive');
  });
});

t('an empty folder file does not wipe a note with content, and a push puts the note back', function () {
  var r = rig(), a;
  return r.vault.importFile('a.md', null, 'precious').then(function (n) { a = n; return r.engine.sync(); }).then(function () {
    r.backend.put('a.md', '');
    return r.engine.pull();
  }).then(function (res) {
    assert.strictEqual(res.guarded, 1); assert.strictEqual(res.updated, 0);
    assert.strictEqual(findByPath(r.vault, 'a.md').content, 'precious');
    return r.engine.push();
  }).then(function () {
    assert.strictEqual(text(r.backend.files['a.md'].b), 'precious');
    // a brand new empty file still imports
    r.backend.put('blank.md', '');
    return r.engine.pull();
  }).then(function (res) { assert.strictEqual(res.created, 1); assert.strictEqual(res.guarded, 0); });
});

t('a pull with errors holds back the push and mirror deletes', function () {
  var r = rig({ mirrorDeletes: true }), a;
  return r.vault.importFile('a.md', null, 'one').then(function (n) { a = n; return r.engine.sync(); }).then(function () {
    r.backend.put('bad.md', 'x');
    var realRead = r.backend.read;
    r.backend.read = function (p) { return p === 'bad.md' ? Promise.reject(new Error('read failed')) : realRead(p); };
    return r.vault.importFile('b.md', null, 'vault only').then(function () { return r.engine.sync(); });
  }).then(function (res) {
    assert.strictEqual(res.pull.errors, 1); assert.strictEqual(res.push.held, true);
    assert.ok(!r.backend.files['b.md'], 'nothing is written while the pull has errors');
    r.vault.remove(a.id);
    return r.engine.push();
  }).then(function (res) {
    assert.strictEqual(res.removed, 0);
    assert.ok(r.backend.files['a.md'], 'no mirror delete after a failed pull');
  });
});

t('parseExclude and excludedBy', function () {
  var l = LN.foldersync.parseExclude(' Foo \n\n/Bar/baz/\r\nqux');
  assert.deepStrictEqual(Array.from(l), ['foo', 'bar/baz', 'qux']);
  assert.ok(LN.foldersync.excludedBy('x/FOO/y.md', l));
  assert.ok(LN.foldersync.excludedBy('Bar/baz/y.md', l));
  assert.ok(!LN.foldersync.excludedBy('Bar/bazz/y.md', l));
  assert.ok(!LN.foldersync.excludedBy('Bar/y.md', l));
});

var chain = Promise.resolve(), failed = 0;
tests.forEach(function (x) {
  chain = chain.then(function () { return x[1](); }).then(function () { console.log('PASS ' + x[0]); }, function (e) { failed++; console.log('FAIL ' + x[0] + '\n     ' + (e && e.stack || e)); });
});
chain.then(function () { console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed'); process.exit(failed ? 1 : 0); });
