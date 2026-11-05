'use strict';
// Focused regression checks for multi-folder sync wiring and attachment preview safeguards.
// Run: node tests/multifolder-thumbnail-test.js
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');
var extra = fs.readFileSync(path.join(root, 'www/js/extra.js'), 'utf8');
var sync = fs.readFileSync(path.join(root, 'www/js/foldersync.js'), 'utf8');
var editor = fs.readFileSync(path.join(root, 'www/js/editor.js'), 'utf8');
var pdf = fs.readFileSync(path.join(root, 'www/js/pdfv.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'www/css/style.css'), 'utf8');
var tests = [
 ['multiple folder records persist in store', /function recs\(\).*?LN\.store\.get\('extraFolders'\)/s.test(extra) && /function save\(a\).*?LN\.store\.set\('extraFolders', a\)/s.test(extra)],
 ['adding folders rejects duplicates', /function duplicate\(r\)/.test(extra) && /That folder is already added/.test(extra)],
 ['each folder keeps its own sync index and status', /r\.index = \{\}/.test(extra) && /x\.index = i/.test(extra) && /x\.last =/.test(extra) && /x\.err =/.test(extra)],
 ['one-folder sync targets the selected ID', /function syncOne\(id\) \{ return run\('sync', id\); \}/.test(extra) && /filter\(function \(r\) \{ return !onlyId \|\| r\.id === onlyId; \}\)/.test(extra)],
 ['sync errors are isolated per folder', /out\.failed\.push\(r\.label \+ ': ' \+ msg\(e\)\)/.test(extra)],
 ['nested folder paths are processed parent-first', /entries\.sort\(function \(a, b\) \{ return a\.path\.split\('\/'\)\.length - b\.path\.split\('\/'\)\.length/.test(sync)],
 ['conflicts preserve a copy instead of silently overwriting', /copyName\(name, 'vault'\)/.test(sync) && /copyName\(name, 'folder'\)/.test(sync)],
 ['revoked browser folder permission produces actionable error', /Allow access to "' \+ r\.label \+ '" and sync again/.test(extra)],
 ['attachment preview strip exists above viewer', /id="attachment-preview"/.test(html) && /\.attachment-preview/.test(css)],
 ['images render thumbnails from binary bytes', /k === 'img' && n\.bytes/.test(editor) && /URL\.createObjectURL/.test(editor)],
 ['PDFs render first page using PDF.js and fall back safely', /LN\.pdfv\.thumbnail\(n\.bytes, canvas, 220\)/.test(editor) && /media\.classList\.add\('attachment-generic'\)/.test(editor) && /pdf\.getPage\(1\)/.test(pdf)],
 ['other supported binary types get a generic type tile', /badge\.textContent = String\(k\)\.toUpperCase\(\)/.test(editor)],
 ['attachment preview revokes stale object URLs', /URL\.revokeObjectURL\(attachmentUrl\)/.test(editor) && /attachmentToken\+\+/.test(editor)],
 ['large files are skipped by sync engine above 25 MiB', /MAX_BYTES = 25 \* 1024 \* 1024/.test(sync) && /e\.size > MAX_BYTES/.test(sync)]
];
var failed = 0;
tests.forEach(function (t) { try { assert.ok(t[1], t[0]); console.log('PASS ' + t[0]); } catch (e) { failed++; console.log('FAIL ' + t[0] + ': ' + e.message); } });
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' focused checks passed.');
process.exit(failed ? 1 : 0);
