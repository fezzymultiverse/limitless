// Logic tests for V0.7.8: Mistral provider, Mistral key scanning, grounded Ask AI. Run: node tests/v078-test.js
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
var root = path.join(__dirname, '..', 'www', 'js');

var calls = [];
var fetchImpl = null;
var toasts = [];
var settings = {};
var sb = {
  console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder, Uint8Array: Uint8Array, Promise: Promise,
  setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
  Blob: Blob, Response: Response, CompressionStream: CompressionStream, DecompressionStream: DecompressionStream, DataView: DataView,
  Uint32Array: Uint32Array, Date: Date, Math: Math, JSON: JSON, XMLSerializer: function () {},
  fetch: function (url, init) { calls.push({ url: url, init: init }); return fetchImpl(url, init); }
};
sb.window = sb;
sb.document = { addEventListener: function () {}, hidden: false };
vm.createContext(sb);
['kinds.js', 'zip.js', 'keys.js', 'ai.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f });
});
var LN = sb.LN;
LN.store = { get: function (k) { return settings[k]; }, set: function (k, v) { settings[k] = v; } };
LN.toast = function (m, a) { toasts.push({ m: m, a: a }); };

var G1 = 'gsk_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6';   // 56 chars like the real thing
var G2 = 'gsk_' + 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4';
var G3 = 'gsk_' + 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4G5h6J7k8L9z0X1c2V3b4N5m6';
var A1 = 'AIza' + 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';                       // 39 chars
var A2 = 'AIza' + 'SyZ9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J';
var OAI = 'sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
var ANT = 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD';

assert.strictEqual(G1.length, 56); assert.strictEqual(A1.length, 39); assert.strictEqual(A2.length, 39);

var n = 0, fails = 0, queue = Promise.resolve();
function t(name, fn) {
  queue = queue.then(function () {
    n++;
    settings = { groqModel: 'llama-3.3-70b-versatile', geminiModel: 'gemini-2.5-flash', mistralModel: 'mistral-small-latest', mistralKey: '', aiTemp: 0.3, aiSystem: '', aiKeys: {}, aiKeyMeta: {}, aiKeyWatch: 'ask', groqKey: '', geminiKey: '', aiProvider: 'groq' };
    calls.length = 0; toasts.length = 0;
    return Promise.resolve().then(fn).then(function () { console.log('ok   ' + name); }, function (e) { fails++; console.log('FAIL ' + name + '\n     ' + (e && e.message ? e.message : e)); });
  });
}
function ok(json, headers) {
  return Promise.resolve({ ok: true, status: 200, headers: { get: function (h) { return headers && headers[h.toLowerCase()] != null ? String(headers[h.toLowerCase()]) : null; } }, text: function () { return Promise.resolve(JSON.stringify(json)); } });
}
function bad(status, json, headers) {
  return Promise.resolve({ ok: false, status: status, headers: { get: function (h) { return headers && headers[h.toLowerCase()] != null ? String(headers[h.toLowerCase()]) : null; } }, text: function () { return Promise.resolve(JSON.stringify(json)); } });
}
function groqOk(text, headers) { return ok({ choices: [{ message: { content: text } }] }, headers); }

var M1 = 'q7W2e9R4t1Y6u3I8o5P0a2S7d4F9g1H3';
var M2 = 'Zx8Cv5Bn2Mk7Lj4Hg1Fd9Sa6Qw3Er0Ty';
assert.strictEqual(M1.length, 32); assert.strictEqual(M2.length, 32);

t('a bare 32 character key is a Mistral key only when the line says Mistral', function () {
  var r = LN.keys.scan('MISTRAL_API_KEY=' + M1 + '\nnote: ' + M2 + '\n');
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.found[0].pid, 'mistral'); assert.strictEqual(r.found[0].key, M1);
  assert.strictEqual(r.found[0].label, 'MISTRAL_API_KEY');
});
t('hashes, ids and all-digit tokens are never taken as Mistral keys', function () {
  var r = LN.keys.scan('mistral commit 0123456789012345678901234567890123\nmistral id ' + '12345678901234567890123456789012' + '\nmistral sha ' + 'abcdefabcdefabcdefabcdefabcdefab' + '\n');
  assert.strictEqual(r.total, 0);
});
t('Mistral, Groq and Gemini keys in one document are all found', function () {
  var G = 'gsk_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6';
  var A = 'AIza' + 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
  var r = LN.keys.scan('GROQ=' + G + '\nGEMINI=' + A + '\n| Mistral key | ' + M2 + ' |\n');
  var by = {}; r.found.forEach(function (f) { by[f.pid] = f.key; });
  assert.strictEqual(r.total, 3); assert.strictEqual(by.groq, G); assert.strictEqual(by.gemini, A); assert.strictEqual(by.mistral, M2);
});
t('Mistral keys can be added, counted and summarised', function () {
  var a = LN.keys.add([{ pid: 'mistral', key: M1, label: 'one' }, { pid: 'mistral', key: M1, label: '' }]);
  assert.strictEqual(a.added.length, 1); assert.strictEqual(a.dup, 1);
  assert.strictEqual(LN.keys.count('mistral'), 1);
  assert.ok(/Mistral 1/.test(LN.keys.summary()));
});
t('a Mistral call goes to api.mistral.ai with a Bearer key, the model and the system text', function () {
  settings.aiProvider = 'mistral'; settings.mistralKey = M1;
  fetchImpl = function () { return ok({ choices: [{ message: { content: 'hello' } }] }); };
  return LN.ai.ask([{ role: 'user', content: 'hi' }], { system: 'SYS' }).then(function (out) {
    assert.strictEqual(out, 'hello');
    var c = calls[0];
    assert.strictEqual(c.url, 'https://api.mistral.ai/v1/chat/completions');
    assert.strictEqual(c.init.headers.Authorization, 'Bearer ' + M1);
    var b = JSON.parse(c.init.body);
    assert.strictEqual(b.model, 'mistral-small-latest'); assert.strictEqual(b.messages[0].role, 'system'); assert.strictEqual(b.messages[0].content, 'SYS');
    assert.strictEqual(b.temperature, 0.3);
  });
});
t('a rejected Mistral key hands the call to the next Mistral key', function () {
  settings.aiProvider = 'mistral'; settings.mistralKey = M1;
  LN.keys.add([{ pid: 'mistral', key: M2, label: '' }]);
  fetchImpl = function (url, init) {
    return init.headers.Authorization === 'Bearer ' + M1 ? bad(401, { message: 'Unauthorized' }) : ok({ choices: [{ message: { content: 'second' } }] });
  };
  return LN.ai.ask([{ role: 'user', content: 'hi' }]).then(function (out) {
    assert.strictEqual(out, 'second'); assert.strictEqual(calls.length, 2);
    assert.strictEqual(LN.keys.list('mistral').filter(function (e) { return e.key === M1; })[0].m.status, 'bad');
  });
});
t('Mistral model list drops embeddings and moderation models and models that cannot chat', function () {
  settings.mistralKey = M1;
  fetchImpl = function () { return ok({ data: [{ id: 'mistral-small-latest', capabilities: { completion_chat: true } }, { id: 'mistral-embed' }, { id: 'mistral-moderation-latest' }, { id: 'mistral-ocr-latest' }, { id: 'open-mistral-nemo' }, { id: 'no-chat-model', capabilities: { completion_chat: false } }, { id: 'mistral-small-latest' }] }); };
  return LN.ai.listModels('mistral').then(function (l) {
    assert.deepStrictEqual(l, ['mistral-small-latest', 'open-mistral-nemo']);
    assert.strictEqual(calls[0].url, 'https://api.mistral.ai/v1/models');
  });
});
t('Mistral fallback list, free guess and default pick', function () {
  assert.ok(LN.ai.fallbackModels('mistral').length >= 4);
  assert.ok(LN.ai.isFree('mistral', 'mistral-small-latest'));
  assert.strictEqual(LN.ai.pickDefault('mistral', ['mistral-large-latest', 'open-mistral-nemo', 'mistral-small-latest']), 'mistral-small-latest');
  assert.ok(LN.ai.providers.mistral && LN.ai.providers.mistral.label === 'Mistral');
});
t('Mistral test call sends a tiny max_tokens like Groq', function () {
  settings.mistralKey = M1;
  fetchImpl = function () { return ok({ choices: [{ message: { content: 'ready' } }] }); };
  return LN.ai.test('mistral').then(function (r) {
    assert.ok(r.ok); assert.strictEqual(JSON.parse(calls[0].init.body).max_tokens, 16);
  });
});
t('an unknown provider name in settings falls back to Groq', function () {
  settings.aiProvider = 'nonsense'; settings.groqKey = G1;
  fetchImpl = function () { return groqOk('fine'); };
  return LN.ai.ask([{ role: 'user', content: 'hi' }]).then(function () { assert.ok(/api\.groq\.com/.test(calls[0].url)); });
});

queue.then(function () { console.log('\n' + n + ' tests, ' + fails + ' failed'); process.exit(fails ? 1 : 0); });
