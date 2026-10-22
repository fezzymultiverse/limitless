// Logic tests for V0.7.4: xlsx dates, csv sort, chart helpers, json helpers. Run: node tests/v074-test.js
var fs = require('fs'), vm = require('vm'), path = require('path');
var sb = { window: {}, console: console };
sb.window.LN = {};
vm.createContext(sb);
['csv.js', 'chart.js', 'datav.js', 'xlsx.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8'), sb, { filename: f });
});
var LN = sb.window.LN, fails = 0, n = 0;
function eq(a, b, label) {
  n++;
  var ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fails++; console.log('FAIL', label, '\n  got     ', JSON.stringify(a), '\n  expected', JSON.stringify(b)); }
}

// ---- xlsx dates
var X = LN.xlsx;
eq(X.fmtSerial(45000, 'yyyy-mm-dd'), '2023-03-15', 'iso date');
eq(X.fmtSerial(44927.5, 'yyyy-mm-dd hh:mm:ss'), '2023-01-01 12:00:00', 'date and time');
eq(X.fmtSerial(45000, 'd-mmm-yy'), '15-Mar-23', 'd-mmm-yy');
eq(X.fmtSerial(45000, 'dddd, mmmm d, yyyy'), 'Wednesday, March 15, 2023', 'long date');
eq(X.fmtSerial(0.75, 'h:mm AM/PM'), '6:00 PM', '12 hour');
eq(X.fmtSerial(0.5208333333, 'h:mm:ss'), '12:30:00', 'time only, mm is minutes');
eq(X.fmtSerial(45000.5, 'mm/dd/yyyy hh:mm'), '03/15/2023 12:00', 'month then minute');
eq(X.fmtSerial(45000, '[$-409]mmm d, yyyy'), 'Mar 15, 2023', 'locale prefix');
eq(X.fmtSerial(45000, 'yyyy"年"mm"月"dd"日"'), '2023年03月15日', 'quoted text');
eq(X.fmtSerial(1, 'yyyy-mm-dd'), '1900-01-01', 'serial 1');
eq(X.fmtSerial(61, 'yyyy-mm-dd'), '1900-03-01', 'serial 61');
eq(X.fmtSerial(0, 'yyyy-mm-dd', true), '1904-01-01', '1904 system');
eq(X.fmtSerial(NaN, 'yyyy-mm-dd'), null, 'NaN');
eq(X.textToSerial('2023-03-15', false), 45000, 'text to serial');
eq(X.textToSerial('2023-01-01 12:00:00', false), 44927.5, 'text to serial with time');
eq(X.textToSerial('2023/03/15', false), 45000, 'slashes');
eq(X.textToSerial('2023-02-31', false), null, 'bad day');
eq(X.textToSerial('hello', false), null, 'not a date');
eq(Math.round(X.textToSerial('12:30', false) * 1e6) / 1e6, 0.520833, 'time text');
eq(X.textToSerial('1904-01-01', true), 0, '1904 text');
eq(X.fmtSerial(X.textToSerial('2024-02-29', false), 'yyyy-mm-dd'), '2024-02-29', 'leap day round trip');
eq(X.dateCode(14, {}), 'yyyy-mm-dd', 'builtin 14');
eq(X.dateCode(0, {}), null, 'general');
eq(X.dateCode(164, { 164: '#,##0.00 "USD"' }), null, 'currency is not a date');
eq(X.dateCode(165, { 165: '[$-409]mmm d, yyyy' }) !== null, true, 'custom date');
eq(X.dateCode(166, { 166: '0.00E+00' }), null, 'scientific');
eq(X.dateCode(167, { 167: '0 "hrs"' }), null, 'hrs in quotes');

// ---- chart helpers
var C = LN.chart;
eq(C.num('R 1 200'), 1200, 'rand with spaces');
eq(C.num('1,234.5'), 1234.5, 'thousands');
eq(C.num('12%'), 12, 'percent');
eq(isNaN(C.num('abc')), true, 'text');
eq(isNaN(C.num('')), true, 'empty');
eq(C.guessHeader([['Name', 'Qty'], ['a', '2']]), true, 'header yes');
eq(C.guessHeader([['a', '2'], ['b', '3']]), false, 'header no');
eq(C.numericCols([['Name', 'Qty', 'Note'], ['a', '2', 'x'], ['b', '3', 'y']], true), [1], 'numeric cols');
eq(C.points([['Name', 'Qty'], ['a', '2'], ['b', 'zz'], ['', '4']], true, 0, 1), [{ l: 'a', v: 2 }, { l: 'Row 4', v: 4 }], 'points skip non numbers');

// ---- csv sort
var rows = [['Name', 'Qty'], ['b', '10'], ['a', '2'], ['c', ''], ['d', '33']];
eq(LN.csv.sortRows(rows.map(function (r) { return r.slice(); }), 1, 1, true).map(function (r) { return r[1]; }), ['Qty', '2', '10', '33', ''], 'numeric ascending, blank last');
eq(LN.csv.sortRows(rows.map(function (r) { return r.slice(); }), 1, -1, true).map(function (r) { return r[1]; }), ['Qty', '33', '10', '2', ''], 'numeric descending, blank still last');
eq(LN.csv.sortRows(rows.map(function (r) { return r.slice(); }), 0, 1, true).map(function (r) { return r[0]; }), ['Name', 'a', 'b', 'c', 'd'], 'text ascending');
eq(LN.csv.sortRows([['x10'], ['x2'], ['X1']], 0, 1, false).map(function (r) { return r[0]; }), ['X1', 'x2', 'x10'], 'natural order, ignores case');

// ---- json helpers
var D = LN.datav;
try { JSON.parse('{"a":1,}'); } catch (e) {
  var je = D.jsonError('{"a":1,}', e);
  eq(je.line >= 1 && je.col >= 1, true, 'json error has a position (' + e.message + ')');
}
eq(D.jsonError('a\nb\nc', { message: 'Unexpected token } in JSON at position 4' }), { msg: 'Unexpected token } in JSON', line: 3, col: 1 }, 'old style error');
eq(D.jsonError('x', { message: "Expected ',' (line 2 column 7)" }), { msg: "Expected ','", line: 2, col: 7 }, 'new style error');
eq(D.formatJson('{"a":[1,2],"b":{"c":null}}'), '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}\n', 'format json');
eq(D.minifyJson('{ "a": [ 1, 2 ] }'), '{"a":[1,2]}\n', 'minify json');
eq(D.hasBigNumber('{"id":12345678901234567890}'), true, 'big number');
eq(D.hasBigNumber('{"id":"12345678901234567890"}'), false, 'big number in a string is fine');
eq(D.isJsonName('a.JSON'), true, 'json name');
eq(D.isJsonName('a.xml'), false, 'xml name');

console.log(n + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
