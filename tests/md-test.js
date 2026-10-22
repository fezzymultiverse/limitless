// Tests for the V0.7.0 WIP5 markdown upgrades: syntax highlighter (hl.js) and md.js
// (fenced code, callouts, nested lists, quotes). Run with: node tests/md-test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var root = path.join(__dirname, '..', 'www', 'js');

function load(files) {
  var sb = { console: console };
  sb.window = sb;
  vm.createContext(sb);
  files.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }); });
  return sb.LN;
}
var LN = load(['hl.js', 'md.js']);
var LNplain = load(['md.js']); // the viewer must still work if hl.js is missing

var tests = [], failed = 0;
function t(name, fn) { tests.push([name, fn]); }
function has(h, s, msg) { assert.ok(h.indexOf(s) >= 0, (msg || 'missing') + ': ' + s + '\n  in: ' + h); }
function not(h, s, msg) { assert.ok(h.indexOf(s) < 0, (msg || 'should not contain') + ': ' + s + '\n  in: ' + h); }

t('every language produces tokens', function () {
  var samples = {
    js: 'const a = foo(1); // hi', json: '{"a": 1, "b": true}', html: '<a href="x">t</a>', css: 'a{color:#fff;margin:4px}',
    sh: '$ ls -la "x" # c', py: 'def f(x):\n  return "s"  # c', yaml: 'key: value # c', sql: 'SELECT a FROM t WHERE x = 1',
    md: '# Title\n- item', diff: '+add\n-del\n@@ h', java: 'public class A { int x = 1; }'
  };
  Object.keys(samples).forEach(function (k) {
    has(LN.hl.highlight(samples[k], k), 'class="tk-', 'no tokens for ' + k);
  });
});

t('output is always escaped (no raw tags from code)', function () {
  ['js', 'html', 'sh', 'py', 'css', 'nope'].forEach(function (k) {
    var h = LN.hl.highlight('<script>alert("x")</script> & <img onerror=1>', k);
    not(h, '<script>', 'raw script tag in ' + k);
    not(h, '<img', 'raw img tag in ' + k);
  });
});

t('stripping the spans gives back exactly the original text', function () {
  var src = 'function a(x){ return "q" + 1; } /* c */\n// done\nconst t = `x ${y}`;';
  var plain = LN.hl.highlight(src, 'js').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.strictEqual(plain, src);
});

t('unterminated block comment and string do not hang or lose text', function () {
  ['js', 'css', 'sql', 'html', 'py'].forEach(function (k) {
    var h = LN.hl.highlight('x /* never closed\nstill comment "open', k);
    assert.ok(h.indexOf('never closed') >= 0);
  });
});

t('a block comment spanning lines is one comment in line-anchored languages', function () {
  var h = LN.hl.highlight('int a; /* one\ntwo\nthree */ int b;', 'java');
  has(h, '<span class="tk-c">/* one\ntwo\nthree */</span>');
});

t('unknown language and huge input are shown plain', function () {
  assert.strictEqual(LN.hl.highlight('a < b', 'klingon'), 'a &lt; b');
  var big = new Array(40000).join('a');
  not(LN.hl.highlight(big, 'js'), '<span');
});

t('fenced code: language label, copy button only when asked, escaped', function () {
  var src = '```js\nconst x = "<b>";\n```';
  var a = LN.md.render(src);
  has(a, 'class="cb" data-lang="js"'); has(a, 'class="cb-lang">js<'); has(a, 'tk-k'); not(a, 'data-copy'); not(a, '<b>');
  has(LN.md.render(src, { copy: true }), 'data-copy');
});

t('fenced code without a language and unclosed fence', function () {
  has(LN.md.render('```\nplain\n```'), 'class="cb-lang">code<');
  has(LN.md.render('```py\nprint(1)'), 'tk-f');
});

t('md.js works without hl.js (share viewer fallback)', function () {
  var h = LNplain.md.render('```js\nlet a = 1 < 2;\n```');
  has(h, 'let a = 1 &lt; 2;'); not(h, 'tk-');
});

t('callouts: types, aliases, titles, unknown type', function () {
  var h = LN.md.render('> [!tip] Pro move\n> Do **this**.');
  has(h, 'data-co="tip"'); has(h, 'Pro move'); has(h, '<strong>this</strong>'); has(h, 'role="note"');
  has(LN.md.render('> [!warning]\n> careful'), 'data-co="warn"');
  has(LN.md.render('> [!bug]\n> x'), 'data-co="danger"');
  has(LN.md.render('> [!whatever]\n> x'), 'data-co="note"');
  has(LN.md.render('> [!note]'), 'class="co-t">Note<'); // default title, no body
});

t('callouts: fold markers', function () {
  var open = LN.md.render('> [!faq]+ Q\n> a'), closed = LN.md.render('> [!faq]- Q\n> a');
  has(open, '<details class="co" data-co="quest" open>'); has(closed, '<details class="co" data-co="quest"><summary');
});

t('callout title and body are escaped', function () {
  var h = LN.md.render('> [!note] <img src=x onerror=1>\n> <script>1</script>');
  not(h, '<img'); not(h, '<script>');
});

t('callout can hold a list and a code block', function () {
  var h = LN.md.render('> [!example] Ex\n> - a\n> - b\n>\n> ```sh\n> echo hi\n> ```');
  has(h, '<ul><li>a</li><li>b</li></ul>'); has(h, 'class="cb" data-lang="sh"');
});

t('plain quote: paragraphs, line breaks, nested quote', function () {
  var h = LN.md.render('> line one\n> line two\n>\n> second para\n>\n> > inner');
  has(h, '<blockquote><p>line one<br>line two</p>'); has(h, '<p>second para</p>'); has(h, '<blockquote><p>inner</p></blockquote>');
});

t('lists: nesting, ordered start, tasks, mixed', function () {
  var h = LN.md.render('- a\n  - b\n    - c\n- d');
  assert.strictEqual(h, '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>');
  has(LN.md.render('3. x\n4. y'), '<ol start="3">');
  has(LN.md.render('1. x\n2. y'), '<ol><li>x');
  var tk = LN.md.render('- [ ] open\n- [x] done');
  has(tk, '<li class="task"><input type="checkbox" disabled> open'); has(tk, 'checked');
  has(LN.md.render('1. a\n   - sub\n2. b'), '<li>a<ul><li>sub</li></ul></li><li>b</li>');
});

t('list: indented continuation line, and a list ends at a blank line + paragraph', function () {
  has(LN.md.render('- one\n  more of one\n- two'), 'one more of one');
  var h = LN.md.render('- a\n\npara');
  has(h, '</ul>\n<p>para</p>');
});

t('old behaviour kept: headings, hr, table, wiki link, image embed, bold-not-list', function () {
  has(LN.md.render('# H'), '<h1>H</h1>'); has(LN.md.render('---'), '<hr>');
  has(LN.md.render('| a | b |\n|---|:-:|\n| 1 | 2 |'), '<div class="tbl"><table>');
  has(LN.md.render('[[Note]]'), 'class="wl" data-wl="Note"');
  has(LN.md.render('**bold** start'), '<p><strong>bold</strong> start</p>');
  has(LN.md.render('* star item'), '<ul><li>star item</li></ul>');
});

t('deeply nested quotes stop recursing instead of overflowing the stack', function () {
  var s = new Array(40).join('>') + ' deep';
  assert.ok(LN.md.render(s).length > 0);
});

t('speed: 2000 lines with code renders quickly', function () {
  var parts = [];
  for (var i = 0; i < 200; i++) parts.push('## H' + i, '- a', '  - b', '```js\nconst v' + i + ' = f(' + i + '); // c\n```', '> [!tip] t', '> body', '');
  var t0 = Date.now();
  LN.md.render(parts.join('\n'));
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
});

var chain = Promise.resolve();
tests.forEach(function (x) {
  chain = chain.then(function () { return x[1](); }).then(function () { console.log('PASS ' + x[0]); }, function (e) { failed++; console.log('FAIL ' + x[0] + '\n     ' + (e && e.message || e)); });
});
chain.then(function () { console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed'); process.exit(failed ? 1 : 0); });
