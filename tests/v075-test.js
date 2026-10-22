// Logic tests for V0.7.5: API key vault (scan, add, rotation, failover, health, files). Run: node tests/v075-test.js
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
    settings = { groqModel: 'llama-3.3-70b-versatile', geminiModel: 'gemini-2.5-flash', aiTemp: 0.7, aiSystem: '', aiKeys: {}, aiKeyMeta: {}, aiKeyWatch: 'ask', groqKey: '', geminiKey: '', aiProvider: 'groq' };
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
function keyOf(c) { return (c.init.headers.Authorization || '').replace('Bearer ', '') || c.init.headers['x-goog-api-key']; }

// ---------------- scanning ----------------
t('finds keys in .env, json, markdown and plain prose, with labels', function () {
  var text = 'GROQ_API_KEY=' + G1 + '\n{"gemini_key_2": "' + A1 + '"}\n| Work Groq | ' + G2 + ' |\nmy old one was ' + G3 + ', thanks\n';
  var r = LN.keys.scan(text);
  assert.strictEqual(r.total, 4);
  var by = {}; r.found.forEach(function (f) { by[f.key] = f; });
  assert.strictEqual(by[G1].pid, 'groq'); assert.strictEqual(by[G1].label, 'GROQ_API_KEY');
  assert.strictEqual(by[A1].pid, 'gemini'); assert.strictEqual(by[A1].label, 'gemini_key_2');
  assert.strictEqual(by[G2].label, 'Work Groq');
  assert.strictEqual(by[G3].pid, 'groq');
});
t('same key twice is one; short or glued strings are not keys', function () {
  var r = LN.keys.scan(G1 + ' ' + G1 + ' gsk_short AIzaTooShort x' + 'AIza' + 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6QEXTRA');
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.found[0].key, G1);
});
t('keys of other providers are counted as skipped and never returned', function () {
  var r = LN.keys.scan(OAI + '\n' + ANT + '\n' + G1);
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.ignored.OpenAI, 1);
  assert.strictEqual(r.ignored.Anthropic, 1);
  assert.ok(!JSON.stringify(r).includes(OAI), 'skipped keys must not be echoed');
});
t('two keys with one character between them are both found', function () {
  var r = LN.keys.scan(G1 + ',' + G2 + ';' + A1);
  assert.strictEqual(r.total, 3);
});

// ---------------- vault ----------------
t('add skips duplicates, treats the main key as already saved, and caps a provider', function () {
  settings.groqKey = G1;
  var a = LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: 'two' }, { pid: 'groq', key: G2, label: '' }, { pid: 'gemini', key: A1, label: '' }]);
  assert.strictEqual(a.added.length, 2); assert.strictEqual(a.dup, 2);
  assert.strictEqual(LN.keys.count('groq'), 2); assert.strictEqual(LN.keys.count('gemini'), 1);
  assert.strictEqual(LN.keys.list('groq')[0].main, true);
  assert.strictEqual(LN.keys.list('groq')[1].m.label, 'two');
  var many = []; for (var i = 0; i < 40; i++) many.push({ pid: 'gemini', key: 'AIza' + ('SyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + i).slice(-35), label: '' });
  var b = LN.keys.add(many);
  assert.strictEqual(LN.keys.count('gemini'), 25, 'the vault holds at most 25 per provider');
  assert.ok(b.full > 0);
  assert.strictEqual(LN.keys.summary(), 'Groq 2 · Gemini 25');
});
t('remove clears the main key box too; clearAll empties everything', function () {
  settings.groqKey = G1;
  LN.keys.add([{ pid: 'groq', key: G2, label: '' }]);
  LN.keys.remove('groq', G1);
  assert.strictEqual(settings.groqKey, '');
  assert.strictEqual(LN.keys.count('groq'), 1);
  LN.keys.clearAll();
  assert.strictEqual(LN.keys.count('groq'), 0);
  assert.deepStrictEqual(Object.keys(settings.aiKeyMeta), []);
});
t('the diagnostics tag is not the key', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }]);
  var blob = JSON.stringify(settings.aiKeyMeta);
  assert.ok(!blob.includes(G1) && !blob.includes(G1.slice(4, 30)), 'stats must not contain the key');
});

// ---------------- rotation and reporting ----------------
t('rotation: least used today first, paused skipped, rejected last, resting after healthy', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }, { pid: 'groq', key: G3, label: '' }]);
  LN.keys.report('groq', G1, { ok: true, ms: 10 });
  LN.keys.report('groq', G1, { ok: true, ms: 10 });
  LN.keys.report('groq', G2, { ok: true, ms: 10 });
  assert.deepStrictEqual(Array.from(LN.keys.candidates('groq')), [G3, G2, G1]);
  LN.keys.setPaused('groq', G3, true);
  assert.deepStrictEqual(Array.from(LN.keys.candidates('groq')), [G2, G1]);
  LN.keys.report('groq', G2, { ok: false, kind: 'limit', msg: 'slow', retryAfter: 30 });
  assert.deepStrictEqual(Array.from(LN.keys.candidates('groq')), [G1, G2], 'resting key goes last');
  LN.keys.report('groq', G1, { ok: false, kind: 'bad', msg: 'no' });
  assert.deepStrictEqual(Array.from(LN.keys.candidates('groq')), [G2], 'rejected key is skipped while another exists');
  LN.keys.report('groq', G2, { ok: false, kind: 'bad', msg: 'no' });
  assert.strictEqual(LN.keys.candidates('groq').length, 1, 'all rejected: one is still tried so the real error shows');
});
t('a limit with Retry-After rests that long; with none it rests a minute; never over 15 minutes', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }]);
  var f = LN.keys.list('groq')[0];
  var t0 = Date.now();
  LN.keys.report('groq', G1, { ok: false, kind: 'limit', msg: 'x', retryAfter: 5 });
  var c1 = LN.keys.list('groq')[0].m.cool - t0;
  assert.ok(c1 >= 4900 && c1 <= 6000, 'got ' + c1);
  LN.keys.report('groq', G1, { ok: false, kind: 'limit', msg: 'x' });
  var c2 = LN.keys.list('groq')[0].m.cool - Date.now();
  assert.ok(c2 > 55000 && c2 <= 60000, 'got ' + c2);
  LN.keys.report('groq', G1, { ok: false, kind: 'limit', msg: 'x', retryAfter: 99999 });
  assert.ok(LN.keys.list('groq')[0].m.cool - Date.now() <= 900000);
  assert.ok(/Resting/.test(LN.keys.health(LN.keys.list('groq')[0]).text));
});
t('a check does not count as a call, a real call does', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }]);
  LN.keys.report('groq', G1, { ok: true, check: true, ms: 40 });
  var m = LN.keys.list('groq')[0].m;
  assert.strictEqual(m.uses, 0); assert.strictEqual(m.dayUses, 0); assert.strictEqual(m.status, 'ok'); assert.strictEqual(m.ms, 40);
  LN.keys.report('groq', G1, { ok: true, ms: 55 });
  m = LN.keys.list('groq')[0].m;
  assert.strictEqual(m.uses, 1); assert.strictEqual(m.dayUses, 1);
});

// ---------------- ai.ask with a pool ----------------
t('ask fails over: rejected key, then rate limited key, then a good one', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }, { pid: 'groq', key: G3, label: '' }]);
  fetchImpl = function (url, init) {
    var k = init.headers.Authorization.replace('Bearer ', '');
    if (k === G1) return bad(401, { error: { message: 'Invalid API Key' } });
    if (k === G2) return bad(429, { error: { message: 'slow down' } }, { 'retry-after': '20' });
    return groqOk('hello', { 'x-ratelimit-limit-requests': 14400, 'x-ratelimit-remaining-requests': 14390, 'x-ratelimit-limit-tokens': 6000, 'x-ratelimit-remaining-tokens': 5900 });
  };
  return LN.ai.ask([{ role: 'user', content: 'hi' }]).then(function (out) {
    assert.strictEqual(out, 'hello');
    assert.deepStrictEqual(calls.map(keyOf), [G1, G2, G3]);
    var L = LN.keys.list('groq');
    var st = {}; L.forEach(function (e) { st[e.key] = e; });
    assert.strictEqual(st[G1].m.status, 'bad');
    assert.strictEqual(st[G2].m.status, 'limited');
    assert.ok(st[G2].m.cool - Date.now() > 15000);
    assert.strictEqual(st[G3].m.status, 'ok'); assert.strictEqual(st[G3].m.dayUses, 1);
    assert.deepStrictEqual({ lim: st[G3].m.rl.lim, rem: st[G3].m.rl.rem, tlim: st[G3].m.rl.tlim, trem: st[G3].m.rl.trem }, { lim: 14400, rem: 14390, tlim: 6000, trem: 5900 });
    var u = LN.keys.usage(st[G3], 1);
    assert.ok(/14,390 of 14,400/.test(u.cap)); assert.ok(u.pct < 1 && !u.low);
    // the next call skips the rejected key and the resting one
    calls.length = 0;
    return LN.ai.ask([{ role: 'user', content: 'again' }]);
  }).then(function () { assert.deepStrictEqual(calls.map(keyOf), [G3]); });
});
t('ask spreads calls across healthy keys', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }]);
  fetchImpl = function () { return groqOk('x'); };
  return LN.ai.ask([{ role: 'user', content: '1' }]).then(function () { return LN.ai.ask([{ role: 'user', content: '2' }]); }).then(function () { return LN.ai.ask([{ role: 'user', content: '3' }]); }).then(function () { return LN.ai.ask([{ role: 'user', content: '4' }]); }).then(function () {
    var c = calls.map(keyOf);
    assert.strictEqual(c.filter(function (k) { return k === G1; }).length, 2);
    assert.strictEqual(c.filter(function (k) { return k === G2; }).length, 2);
  });
});
t('when every key fails the last error is thrown and says how many were tried', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }]);
  fetchImpl = function () { return bad(429, { error: { message: 'slow' } }); };
  return LN.ai.ask([{ role: 'user', content: 'x' }]).then(function () { throw new Error('should fail'); }, function (e) {
    assert.ok(/Rate limit/.test(e.message)); assert.ok(/all 2 keys tried/.test(e.message));
    assert.strictEqual(calls.length, 2);
  });
});
t('a network error or a bad model name never burns through the other keys', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }]);
  fetchImpl = function () { return Promise.reject(new Error('offline')); };
  return LN.ai.ask([{ role: 'user', content: 'x' }]).then(function () { throw new Error('should fail'); }, function (e) {
    assert.ok(/reach/.test(e.message)); assert.strictEqual(calls.length, 1);
    assert.notStrictEqual(LN.keys.list('groq')[0].m.status, 'bad');
    calls.length = 0;
    fetchImpl = function () { return bad(404, { error: { message: 'no such model' } }); };
    return LN.ai.ask([{ role: 'user', content: 'x' }]);
  }).then(function () { throw new Error('should fail'); }, function (e) {
    assert.ok(/Model not found/.test(e.message));
    // V0.7.7: one chat call, then one models list call to repair the name. The second key is never tried.
    assert.strictEqual(calls.length, 2);
    assert.ok(/\/models$/.test(calls[1].url));
  });
});
t('V0.7.7: AQ. Gemini keys are found, kept and sent in the header', function () {
  var AQ = 'AQ.' + 'Ab8RN6K1s9ZXCQzQVk0123456789abcd';
  var r = LN.keys.scan('GEMINI_KEYS = "' + AQ + '"\nother ' + 'gsk_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8');
  var g = r.found.filter(function (f) { return f.pid === 'gemini'; });
  assert.strictEqual(g.length, 1); assert.strictEqual(g[0].key, AQ); assert.strictEqual(g[0].label, 'GEMINI_KEYS');
  assert.strictEqual(LN.keys.scan('see AQ.short and AQ.').found.length, 0);
});
t('V0.7.7: free guess, fallback lists and default pick', function () {
  assert.ok(LN.ai.isFree('groq', 'llama-3.3-70b-versatile'));
  assert.ok(LN.ai.isFree('gemini', 'gemini-2.5-flash'));
  assert.ok(!LN.ai.isFree('gemini', 'gemini-2.5-flash-image'));
  assert.ok(!LN.ai.isFree('gemini', 'gemini-2.5-pro'));
  assert.ok(LN.ai.fallbackModels('gemini').length >= 4 && LN.ai.fallbackModels('groq').length >= 4);
  assert.strictEqual(LN.ai.pickDefault('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-flash-latest']), 'gemini-flash-latest');
});
t('Gemini: expired key (HTTP 400) counts as rejected and fails over', function () {
  LN.keys.add([{ pid: 'gemini', key: A1, label: '' }, { pid: 'gemini', key: A2, label: '' }]);
  settings.aiProvider = 'gemini';
  fetchImpl = function (url, init) {
    if (init.headers['x-goog-api-key'] === A1) return bad(400, { error: { code: 400, message: 'API key expired. Please renew the API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
    return ok({ candidates: [{ content: { parts: [{ text: 'fine' }] } }] });
  };
  return LN.ai.ask([{ role: 'user', content: 'x' }]).then(function (out) {
    assert.strictEqual(out, 'fine');
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[0].url.indexOf('AIza') < 0, 'key must travel in a header, not the URL');
    var st = {}; LN.keys.list('gemini').forEach(function (e) { st[e.key] = e.m.status; });
    assert.strictEqual(st[A1], 'bad'); assert.strictEqual(st[A2], 'ok');
  });
});
t('Gemini quota (RESOURCE_EXHAUSTED) rests the key', function () {
  LN.keys.add([{ pid: 'gemini', key: A1, label: '' }]);
  settings.aiProvider = 'gemini';
  fetchImpl = function () { return bad(429, { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } }); };
  return LN.ai.ask([{ role: 'user', content: 'x' }]).then(function () { throw new Error('should fail'); }, function () {
    assert.strictEqual(LN.keys.list('gemini')[0].m.status, 'limited');
  });
});
t('old behaviour is intact: one main key, no vault entries, same messages', function () {
  settings.groqKey = 'gsk_test';
  fetchImpl = function () { return groqOk('hello'); };
  return LN.ai.ask([{ role: 'user', content: 'hi' }]).then(function (out) {
    assert.strictEqual(out, 'hello');
    assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer gsk_test');
    settings.groqKey = ''; calls.length = 0;
    return LN.ai.ask([{ role: 'user', content: 'x' }]);
  }).then(function () { throw new Error('should fail'); }, function (e) { assert.ok(/API key/.test(e.message)); assert.strictEqual(calls.length, 0); });
});
t('check lists models with that one key and records health without counting a call', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }]);
  fetchImpl = function (url, init) { return ok({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }] }, { 'x-ratelimit-limit-requests': 14400, 'x-ratelimit-remaining-requests': 14400 }); };
  return LN.keys.check('groq', G1).then(function (r) {
    assert.strictEqual(r.models, 1);
    assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/models');
    var m = LN.keys.list('groq')[0].m;
    assert.strictEqual(m.status, 'ok'); assert.strictEqual(m.uses, 0); assert.strictEqual(m.rl.lim, 14400);
    fetchImpl = function () { return bad(401, { error: { message: 'Invalid API Key' } }); };
    return LN.keys.check('groq', G1);
  }).then(function () { throw new Error('should fail'); }, function (e) {
    assert.ok(/rejected/.test(e.message));
    assert.strictEqual(LN.keys.list('groq')[0].m.status, 'bad');
  });
});
t('test uses exactly the chosen key and does not fail over', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }]);
  fetchImpl = function () { return bad(401, { error: { message: 'Invalid API Key' } }); };
  return LN.keys.testKey('groq', G2).then(function () { throw new Error('should fail'); }, function () {
    assert.strictEqual(calls.length, 1); assert.strictEqual(keyOf(calls[0]), G2);
    assert.strictEqual(JSON.parse(calls[0].init.body).max_tokens, 16);
    var st = {}; LN.keys.list('groq').forEach(function (e) { st[e.key] = e.m.status; });
    assert.strictEqual(st[G2], 'bad'); assert.strictEqual(st[G1], 'new');
  });
});
t('check all and test all visit every unpaused key once, in order', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }, { pid: 'groq', key: G2, label: '' }, { pid: 'gemini', key: A1, label: '' }]);
  LN.keys.setPaused('groq', G2, true);
  fetchImpl = function (url) { return /groq/.test(url) ? ok({ data: [{ id: 'm' }] }) : ok({ models: [{ name: 'models/g', supportedGenerationMethods: ['generateContent'] }] }); };
  var seen = [];
  return LN.keys.checkAll(function (d, total) { seen.push(d + '/' + total); }).then(function () {
    assert.strictEqual(calls.length, 2); assert.deepStrictEqual(seen, ['1/2', '2/2']);
  });
});

// ---------------- usage bar and health text ----------------
t('without reported limits the bar is this key\'s share of the provider\'s calls today', function () {
  LN.keys.add([{ pid: 'gemini', key: A1, label: '' }, { pid: 'gemini', key: A2, label: '' }]);
  LN.keys.report('gemini', A1, { ok: true, ms: 1 }); LN.keys.report('gemini', A1, { ok: true, ms: 1 }); LN.keys.report('gemini', A1, { ok: true, ms: 1 }); LN.keys.report('gemini', A2, { ok: true, ms: 1 });
  var L = LN.keys.list('gemini');
  var u1 = LN.keys.usage(L[0], 4), u2 = LN.keys.usage(L[1], 4);
  assert.strictEqual(Math.round(u1.pct), 75); assert.strictEqual(Math.round(u2.pct), 25);
  assert.ok(/3 calls today/.test(u1.cap) && /does not report/.test(u1.cap));
});
t('a nearly empty reported quota turns the bar low', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }]);
  LN.keys.report('groq', G1, { ok: true, ms: 1, rl: { lim: 1000, rem: 50, at: Date.now() } });
  assert.strictEqual(LN.keys.usage(LN.keys.list('groq')[0], 1).low, true);
});

// ---------------- reading files ----------------
t('xmlToText joins paragraphs with new lines and decodes entities', function () {
  assert.strictEqual(LN.keys.xmlToText('<w:p><w:r><w:t>a&amp;b</w:t></w:r></w:p><w:p><w:r><w:t>c</w:t></w:r></w:p>'), 'a&b\nc\n');
});
t('keys are found inside a docx-like zip, even split across text runs', function () {
  var pk = LN.zip.create();
  var half = Math.floor(G1.length / 2);
  pk.setText('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>' + G1.slice(0, half) + '</w:t></w:r><w:r><w:t>' + G1.slice(half) + '</w:t></w:r></w:p><w:p><w:r><w:t>' + A1 + '</w:t></w:r></w:p></w:body></w:document>');
  pk.setText('word/media/skip.png', 'gsk_' + 'Z'.repeat(40));
  return pk.build().then(function (u8) { return LN.keys.scanBytes(u8); }).then(function (r) {
    var keys = r.found.map(function (f) { return f.key; }).sort();
    assert.strictEqual(JSON.stringify(keys), JSON.stringify([A1, G1].sort()));
  });
});
t('keys are found in a zip inside a zip, and in xlsx shared strings', function () {
  var inner = LN.zip.create();
  inner.setText('xl/sharedStrings.xml', '<sst><si><t>' + G2 + '</t></si><si><t>' + OAI + '</t></si></sst>');
  return inner.build().then(function (iu) {
    var outer = LN.zip.create();
    outer.setBytes('book.xlsx', iu);
    outer.setText('notes.txt', 'GEMINI=' + A2);
    return outer.build();
  }).then(function (u8) { return LN.keys.scanBytes(u8); }).then(function (r) {
    assert.strictEqual(JSON.stringify(r.found.map(function (f) { return f.key; }).sort()), JSON.stringify([A2, G2].sort()));
    assert.strictEqual(r.ignored.OpenAI, 1);
  });
});
t('plain text, utf-16 and binary files are read', function () {
  var enc = new TextEncoder();
  return LN.keys.scanBytes(enc.encode('x\n' + G1 + '\n')).then(function (r) {
    assert.strictEqual(r.total, 1);
    var u16 = Buffer.from('\ufeff' + A1, 'utf16le');
    return LN.keys.scanBytes(new Uint8Array(u16));
  }).then(function (r) {
    assert.strictEqual(r.total, 1);
    var bin = Buffer.concat([Buffer.from([0, 1, 2, 3, 0, 0]), Buffer.from(G3, 'latin1'), Buffer.from([0, 255, 0])]);
    return LN.keys.scanBytes(new Uint8Array(bin));
  }).then(function (r) { assert.strictEqual(r.total, 1); assert.strictEqual(r.found[0].key, G3); });
});
t('a PDF goes through the text reader when it is there', function () {
  sb.LN.pdfv = { text: function () { return Promise.resolve({ spaced: 'a ' + G1.slice(0, 20) + ' ' + G1.slice(20) + ' b', tight: 'a ' + G1.slice(0, 20) + G1.slice(20) + ' b' }); } };
  var pdf = new Uint8Array(Buffer.from('%PDF-1.7\n%binary stuff\n'));
  return LN.keys.scanBytes(pdf).then(function (r) { delete sb.LN.pdfv; assert.strictEqual(r.total, 1); assert.strictEqual(r.found[0].key, G1); });
});

// ---------------- paste watch ----------------
t('ask mode offers; Add puts the keys in the vault', function () {
  LN.keys.watch('note text\n' + G1 + '\n' + A1 + '\n', 'what you pasted');
  assert.strictEqual(toasts.length, 1); assert.ok(/2 API keys/.test(toasts[0].m)); assert.strictEqual(LN.keys.count('groq'), 0);
  fetchImpl = function () { return ok({ data: [] }); };
  toasts[0].a.run();
  assert.strictEqual(LN.keys.count('groq'), 1); assert.strictEqual(LN.keys.count('gemini'), 1);
});
t('auto mode adds at once; off mode does nothing; no keys means no toast', function () {
  settings.aiKeyWatch = 'auto';
  fetchImpl = function () { return ok({ data: [] }); };
  LN.keys.watch('first paste of ' + G2 + ' here', 'a');
  assert.strictEqual(LN.keys.count('groq'), 1);
  settings.aiKeyWatch = 'off';
  LN.keys.watch('second paste of ' + G3 + ' here', 'b');
  assert.strictEqual(LN.keys.count('groq'), 1);
  settings.aiKeyWatch = 'ask'; toasts.length = 0;
  LN.keys.watch('nothing secret in this paragraph of text at all', 'c');
  assert.strictEqual(toasts.length, 0);
});
t('keys already saved never trigger an offer', function () {
  LN.keys.add([{ pid: 'groq', key: G1, label: '' }]);
  toasts.length = 0;
  LN.keys.watch('again ' + G1 + ' and again', 'd');
  assert.strictEqual(toasts.length, 0);
});
t('the diagnostics log scrubber still hides every key prefix the vault finds', function () {
  var src = fs.readFileSync(path.join(root, 'diag.js'), 'utf8');
  assert.ok(/\(gsk_\|AIza\)/.test(src));
});

queue.then(function () {
  console.log('\n' + n + ' tests, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
});
