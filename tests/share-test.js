// Logic tests for V0.4.0 share: the codec round trip (including unicode and a large note)
// and the md embed output the share-as-page feature relies on.
// Run with: node tests/share-test.js   (no install needed)
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..', 'www', 'js');
var sandbox = {
  console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder, Uint8Array: Uint8Array, Promise: Promise,
  CompressionStream: typeof CompressionStream !== 'undefined' ? CompressionStream : undefined,
  DecompressionStream: typeof DecompressionStream !== 'undefined' ? DecompressionStream : undefined,
  btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
  atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
['sharecodec.js', 'md.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
var LN = sandbox.LN;

var tests = [];
function t(name, fn) { tests.push([name, fn]); }

t('round trip: short ascii note', function () {
  var obj = { v: 1, n: 'hello.md', k: 'md', t: '# Hi\n\nJust a short note.' };
  return LN.sharecodec.encode(obj).then(function (s) {
    assert.ok(/^z\.|^u\./.test(s), 'must be tagged z. or u.');
    return LN.sharecodec.decode(s);
  }).then(function (back) {
    // compare as JSON: the decoded object was built inside the vm sandbox's own
    // realm, so its Object/Array are not === the test's, which trips up deepStrictEqual
    assert.strictEqual(JSON.stringify(back), JSON.stringify(obj));
  });
});

t('round trip: unicode (emoji, CJK, combining marks)', function () {
  var obj = { v: 1, n: 'strategy over impulse.md', k: 'md', t: '999 Стратегия 会议记录 🚀🔥 ééè' };
  return LN.sharecodec.encode(obj).then(function (s) { return LN.sharecodec.decode(s); }).then(function (back) {
    assert.strictEqual(back.t, obj.t);
    assert.strictEqual(back.n, obj.n);
  });
});

t('round trip: a large note (100 KB) compresses smaller than uncompressed', function () {
  var line = 'Strategy Over Impulse. 999. The quick brown fox jumps over the lazy dog.\n';
  var big = '';
  while (big.length < 100000) big += line;
  var obj = { v: 1, n: 'big.md', k: 'md', t: big };
  var compressedLen = 0, plainLen = 0;
  return LN.sharecodec.encode(obj).then(function (s) {
    compressedLen = s.length;
    assert.strictEqual(s.slice(0, 2), 'z.', 'a 100 KB repetitive note should take the compressed path');
    return LN.sharecodec.decode(s);
  }).then(function (back) {
    assert.strictEqual(back.t, obj.t);
    assert.strictEqual(back.t.length, big.length);
    // a plain (uncompressed) base64url encoding, for comparison
    plainLen = LN.sharecodec.b64url(new TextEncoder().encode(JSON.stringify(obj))).length;
    assert.ok(compressedLen < plainLen, 'repetitive text should compress well below the uncompressed size');
  });
});

t('decode rejects a string with no z./u. tag', function () {
  return LN.sharecodec.decode('not-a-real-share-link').then(function () {
    throw new Error('should have rejected');
  }, function (e) {
    assert.ok(/not a limitless notepad share link/i.test(e.message));
  });
});

t('decode rejects garbage after a valid tag', function () {
  return LN.sharecodec.decode('u.***not-base64***').then(function () {
    throw new Error('should have rejected');
  }, function (e) {
    // thrown inside the vm sandbox's own realm, so it is not `instanceof` this file's Error
    assert.ok(e && typeof e.message === 'string' && e.message.length > 0);
  });
});

t('b64url output has no +, / or = padding', function () {
  var bytes = new Uint8Array(64);
  for (var i = 0; i < bytes.length; i++) bytes[i] = i * 4 + 3; // exercises the full byte range
  var s = LN.sharecodec.b64url(bytes);
  assert.ok(!/[+/=]/.test(s), 'base64url must not contain +, / or =');
  assert.deepStrictEqual(Array.from(LN.sharecodec.fromB64url(s)), Array.from(bytes));
});

t('md embed: ![[name.jpg]] becomes an <img data-ln-img> tag, not a wiki link', function () {
  var html = LN.md.render('See ![[pic.jpg]] and also [[Some Note]].');
  assert.ok(html.indexOf('<img data-ln-img="pic.jpg" alt="pic.jpg">') >= 0, 'image embed missing or malformed');
  assert.ok(html.indexOf('class="wl" data-wl="Some Note"') >= 0, 'wiki link should still work alongside an image embed');
  assert.strictEqual(html.indexOf('![['), -1, 'the raw embed syntax must not leak into the output');
});

t('md embed: a name with special characters is still escaped safely', function () {
  var html = LN.md.render('![[<script>.png]]');
  assert.ok(html.indexOf('<script>') === -1 || html.indexOf('data-ln-img="&lt;script&gt;.png"') >= 0,
    'embed name must be HTML-escaped before it reaches data-ln-img');
});

var chain = Promise.resolve(), failed = 0;
tests.forEach(function (x) {
  chain = chain.then(function () { return x[1](); }).then(function () { console.log('PASS ' + x[0]); }, function (e) { failed++; console.log('FAIL ' + x[0] + '\n     ' + (e && e.stack || e)); });
});
chain.then(function () { console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed'); process.exit(failed ? 1 : 0); });
