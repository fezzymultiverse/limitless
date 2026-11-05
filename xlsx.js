(function (LN) {
  'use strict';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var PAGE = 200;

  function parseXml(s) {
    var d = new DOMParser().parseFromString(s, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('Could not read this workbook');
    return d;
  }
  function kids(el, name) {
    return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1 && n.localName === name; });
  }
  function colNum(ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(ref);
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  function rowNum(ref) { return +/(\d+)$/.exec(ref)[1]; }
  function allText(el) {
    var out = '';
    Array.prototype.forEach.call(el.getElementsByTagNameNS(NS, 't'), function (t) {
      if (!t.parentNode || t.parentNode.localName !== 'rPh') out += t.textContent;
    });
    return out;
  }


  // ---------- dates (V0.7.4) ----------
  // A date in a sheet is a number plus a style. These turn it into text, and typed text back into a number.
  var BUILTIN_DATE = {
    14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
    22: 'yyyy-mm-dd h:mm', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0'
  };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // The date format code for a style's numFmtId, or null when it is not a date.
  function dateCode(id, custom) {
    if (BUILTIN_DATE[id]) return BUILTIN_DATE[id];
    if ((id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return 'yyyy-mm-dd';
    var code = custom[id];
    if (!code) return null;
    var c = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/_./g, '').replace(/\*./g, '');
    return /[ymdhs]/i.test(c) ? code : null;
  }

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  function fmtSerial(serial, code, d1904) {
    if (!isFinite(serial)) return null;
    var ms = Math.round(serial * 86400) * 1000;
    var base = d1904 ? Date.UTC(1904, 0, 1) : (serial >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31));
    var d = new Date(base + ms);
    if (isNaN(d.getTime())) return null;
    var Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds(), wd = d.getUTCDay();
    var toks = String(code).match(/"[^"]*"|\\.|_.|\*.|\[[^\]]*\]|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|\.0+|[\s\S]/gi) || [];
    var ampm = toks.some(function (t) { return /^(AM\/PM|A\/P)$/i.test(t); });
    // m and mm are minutes right after hours or right before seconds, months anywhere else
    function kind(t) { var l = t.toLowerCase(); return (l === 'h' || l === 'hh') ? 'h' : (l === 's' || l === 'ss') ? 's' : (/^(m|mm)$/.test(l) ? 'm' : 'x'); }
    var out = '';
    toks.forEach(function (t, i) {
      var l = t.toLowerCase(), k = kind(t), minute = false;
      if (k === 'm') {
        var j, prev = null, next = null;
        for (j = i - 1; j >= 0; j--) if (kind(toks[j]) !== 'x') { prev = kind(toks[j]); break; } else if (/^[ymd]/i.test(toks[j])) break;
        for (j = i + 1; j < toks.length; j++) if (kind(toks[j]) !== 'x') { next = kind(toks[j]); break; } else if (/^[ymd]/i.test(toks[j])) break;
        minute = prev === 'h' || next === 's';
      }
      if (l === 'yyyy') out += pad(Y, 4);
      else if (l === 'yy') out += pad(Y % 100, 2);
      else if (l === 'mmmm') out += MONTHS[M];
      else if (l === 'mmm') out += MONTHS[M].slice(0, 3);
      else if (l === 'mm') out += pad(minute ? mi : M + 1, 2);
      else if (l === 'm') out += String(minute ? mi : M + 1);
      else if (l === 'dddd') out += DAYS[wd];
      else if (l === 'ddd') out += DAYS[wd].slice(0, 3);
      else if (l === 'dd') out += pad(D, 2);
      else if (l === 'd') out += String(D);
      else if (l === 'hh') out += pad(ampm ? (h % 12 || 12) : h, 2);
      else if (l === 'h') out += String(ampm ? (h % 12 || 12) : h);
      else if (l === 'ss') out += pad(s, 2);
      else if (l === 's') out += String(s);
      else if (l === 'am/pm') out += h < 12 ? 'AM' : 'PM';
      else if (l === 'a/p') out += h < 12 ? 'A' : 'P';
      else if (/^\[h+\]$/.test(l)) out += String(Math.floor(serial * 24));
      else if (t.charAt(0) === '"') out += t.slice(1, -1);
      else if (t.charAt(0) === '\\' || t.charAt(0) === '_' || t.charAt(0) === '*') out += t.length > 1 && t.charAt(0) === '\\' ? t.slice(1) : (t.charAt(0) === '_' ? ' ' : '');
      else if (t.charAt(0) === '[' || /^\.0+$/.test(t)) out += '';
      else out += t;
    });
    return out;
  }

  // The text shown while a date cell is being edited, and the text we read back.
  function isoFor(serial) {
    if (serial < 1) return 'hh:mm:ss';
    return serial % 1 ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd';
  }

  function textToSerial(text, d1904) {
    var t = String(text).trim(), m;
    var day = 0, frac = 0;
    if ((m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t))) {
      var ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      if (new Date(ms).getUTCMonth() !== +m[2] - 1) return null;
      var base = d1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      day = Math.round((ms - base) / 86400000);
      if (!d1904 && day < 61) day -= 1;
      if (m[4] != null) frac = (+m[4] * 3600 + +m[5] * 60 + (+m[6] || 0)) / 86400;
    } else if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t))) {
      frac = (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400;
    } else return null;
    return +(day + frac).toFixed(9);
  }

  function mount(el, bytes, api) {
    var pkg = LN.zip.parse(bytes);
    var wbDoc = null, shared = [], sheets = [], cur = null, page = 0, calcTouched = false;
    var extraR = 0, extraC = 0;
    var dateXf = [], date1904 = false;
    el.textContent = '';
    el.classList.add('vw');
    var bar = document.createElement('div'); bar.className = 'vw-bar';
    var wrap = document.createElement('div'); wrap.className = 'tbl-wrap';
    el.appendChild(bar); el.appendChild(wrap);

    function dateOf(c) {
      var si = c.getAttribute('s');
      return si != null ? (dateXf[+si] || null) : null;
    }

    function cellText(c) {
      var t = c.getAttribute('t');
      var v = kids(c, 'v')[0];
      if (t === 'inlineStr') { var is = kids(c, 'is')[0]; return is ? allText(is) : ''; }
      if (t === 's') return v ? (shared[+v.textContent] || '') : '';
      if (t === 'b') return v && v.textContent === '1' ? 'TRUE' : 'FALSE';
      var f = kids(c, 'f')[0];
      if ((!v || !v.textContent) && f && f.textContent) return '=' + f.textContent;
      var code = dateOf(c);
      if (code && v && v.textContent !== '' && (!t || t === 'n')) {
        var shown = fmtSerial(parseFloat(v.textContent), code, date1904);
        if (shown != null) return shown;
      }
      return v ? v.textContent : '';
    }

    function loadSheet(s) {
      if (s.doc) return Promise.resolve(s);
      return pkg.text(s.path).then(function (x) {
        s.doc = parseXml(x);
        s.cells = {};
        var maxR = 0, maxC = 0;
        Array.prototype.forEach.call(s.doc.getElementsByTagNameNS(NS, 'c'), function (c) {
          var ref = c.getAttribute('r');
          if (!ref) return;
          s.cells[ref] = c;
          if (rowNum(ref) > maxR) maxR = rowNum(ref);
          if (colNum(ref) + 1 > maxC) maxC = colNum(ref) + 1;
        });
        s.maxR = Math.max(maxR, 1); s.maxC = Math.max(maxC, 1);
        return s;
      });
    }

    function getRow(s, r) {
      var sd = s.doc.getElementsByTagNameNS(NS, 'sheetData')[0];
      var rows = kids(sd, 'row'), before = null;
      for (var i = 0; i < rows.length; i++) {
        var n = +rows[i].getAttribute('r');
        if (n === r) return rows[i];
        if (n > r) { before = rows[i]; break; }
      }
      var row = s.doc.createElementNS(NS, 'row');
      row.setAttribute('r', r);
      sd.insertBefore(row, before);
      return row;
    }

    function getCell(s, ref) {
      if (s.cells[ref]) return s.cells[ref];
      var row = getRow(s, rowNum(ref));
      var cn = colNum(ref), before = null;
      kids(row, 'c').some(function (c) {
        if (colNum(c.getAttribute('r')) > cn) { before = c; return true; }
        return false;
      });
      var c = s.doc.createElementNS(NS, 'c');
      c.setAttribute('r', ref);
      row.insertBefore(c, before);
      s.cells[ref] = c;
      return c;
    }

    function writeCell(s, ref, text) {
      var c = s.cells[ref], ser = null;
      if (!c && text === '') return;
      c = getCell(s, ref);
      if (kids(c, 'f')[0]) calcTouched = true;
      ['f', 'v', 'is'].forEach(function (n) { kids(c, n).forEach(function (x) { c.removeChild(x); }); });
      c.removeAttribute('t');
      if (text === '') return;
      if (text.charAt(0) === '=' && text.length > 1) {
        var f = s.doc.createElementNS(NS, 'f');
        f.textContent = text.slice(1);
        c.appendChild(f);
        calcTouched = true;
      } else if (dateOf(c) && (ser = textToSerial(text, date1904)) !== null) {
        var sv = s.doc.createElementNS(NS, 'v');
        sv.textContent = String(ser);
        c.appendChild(sv);
      } else if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) && !/^-?0\d/.test(text)) {
        var v = s.doc.createElementNS(NS, 'v');
        v.textContent = text;
        c.appendChild(v);
      } else {
        c.setAttribute('t', 'inlineStr');
        var is = s.doc.createElementNS(NS, 'is');
        var t = s.doc.createElementNS(NS, 't');
        t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        t.textContent = text;
        is.appendChild(t); c.appendChild(is);
      }
      s.dirty = true;
      var r = rowNum(ref), cc = colNum(ref) + 1;
      if (r > s.maxR) s.maxR = r;
      if (cc > s.maxC) s.maxC = cc;
      api.dirty();
    }

    function rowsOf(s) { return s.maxR + 1 + extraR; }

    function draw() {
      var s = cur;
      wrap.textContent = '';
      var rows = rowsOf(s), cols = s.maxC + 1 + extraC;
      var from = page * PAGE + 1, to = Math.min(rows, from + PAGE - 1);
      var tb = document.createElement('table'); tb.className = 'grid';
      var hr = document.createElement('tr');
      hr.appendChild(document.createElement('th'));
      for (var c = 0; c < cols; c++) { var th = document.createElement('th'); th.textContent = LN.colName(c); hr.appendChild(th); }
      tb.appendChild(hr);
      for (var r = from; r <= to; r++) {
        var tr = document.createElement('tr');
        var rh = document.createElement('th'); rh.textContent = r; tr.appendChild(rh);
        for (c = 0; c < cols; c++) {
          var ref = LN.colName(c) + r, cell = s.cells[ref];
          var td = document.createElement('td');
          td.contentEditable = 'plaintext-only'; td.spellcheck = false;
          td.dataset.ref = ref;
          td.textContent = cell ? cellText(cell) : '';
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
      wrap.appendChild(tb);
      pager.textContent = 'Rows ' + from + '-' + to + ' of ' + rows;
    }

    wrap.addEventListener('focusin', function (e) {
      var td = e.target, cell = td.dataset && td.dataset.ref ? cur.cells[td.dataset.ref] : null;
      if (!cell) return;
      var f = kids(cell, 'f')[0];
      td._orig = td.textContent;
      if (f && f.textContent) { td.textContent = '=' + f.textContent; td._formula = td.textContent; }
      else if (dateOf(cell)) {
        var dv = kids(cell, 'v')[0], dt = cell.getAttribute('t');
        if (dv && dv.textContent !== '' && (!dt || dt === 'n')) {
          var sn = parseFloat(dv.textContent), iso = fmtSerial(sn, isoFor(sn), date1904);
          if (iso != null) { td.textContent = iso; td._formula = iso; }
        }
      }
    });
    wrap.addEventListener('focusout', function (e) {
      var td = e.target;
      if (!td.dataset || !td.dataset.ref) return;
      var now = td.textContent;
      var was = td._formula != null ? td._formula : (td._orig != null ? td._orig : (cur.cells[td.dataset.ref] ? cellText(cur.cells[td.dataset.ref]) : ''));
      td._orig = null; td._formula = null;
      if (now !== was) writeCell(cur, td.dataset.ref, now);
      else if (cur.cells[td.dataset.ref]) td.textContent = cellText(cur.cells[td.dataset.ref]);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });

    function btn(label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', fn); bar.appendChild(b); return b;
    }
    var tabsEl = document.createElement('span'); tabsEl.className = 'vw-tabs'; bar.appendChild(tabsEl);
    btn('Prev', function () { if (page > 0) { page--; draw(); } });
    btn('Next', function () { if ((page + 1) * PAGE < rowsOf(cur)) { page++; draw(); } });
    btn('+ Row', function () { extraR++; page = Math.floor((rowsOf(cur) - 1) / PAGE); draw(); });
    btn('+ Col', function () { extraC++; draw(); });
    btn('Chart', function () {
      var s = cur, data = [], mr = Math.min(s.maxR, 5000), r, c, row, cell;
      for (r = 1; r <= mr; r++) {
        row = [];
        for (c = 0; c < s.maxC; c++) { cell = s.cells[LN.colName(c) + r]; row.push(cell ? cellText(cell) : ''); }
        data.push(row);
      }
      LN.chart.open(s.name, data, {});
    });
    var pager = document.createElement('span'); pager.className = 'vw-note'; bar.appendChild(pager);

    function show(i) {
      loadSheet(sheets[i]).then(function (s) {
        cur = s; page = 0; extraR = 0; extraC = 0;
        Array.prototype.forEach.call(tabsEl.children, function (b, k) { b.classList.toggle('on', k === i); });
        draw();
      }).catch(fail);
    }
    function fail(e) { wrap.textContent = 'Could not open this file. ' + (e && e.message ? e.message : ''); }

    pkg.text('xl/workbook.xml').then(function (x) {
      wbDoc = parseXml(x);
      return Promise.all([pkg.text('xl/_rels/workbook.xml.rels'),
        pkg.has('xl/sharedStrings.xml') ? pkg.text('xl/sharedStrings.xml') : Promise.resolve(''),
        pkg.has('xl/styles.xml') ? pkg.text('xl/styles.xml') : Promise.resolve('')]);
    }).then(function (r) {
      var rels = {};
      Array.prototype.forEach.call(parseXml(r[0]).getElementsByTagName('Relationship'), function (n) {
        var t = n.getAttribute('Target');
        rels[n.getAttribute('Id')] = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t;
      });
      if (r[1]) Array.prototype.forEach.call(parseXml(r[1]).getElementsByTagNameNS(NS, 'si'), function (si) { shared.push(allText(si)); });
      try {
        var wp = wbDoc.getElementsByTagNameNS(NS, 'workbookPr')[0];
        date1904 = !!wp && /^(1|true)$/i.test(wp.getAttribute('date1904') || '');
        if (r[2]) {
          var st = parseXml(r[2]), custom = {};
          Array.prototype.forEach.call(st.getElementsByTagNameNS(NS, 'numFmt'), function (nf) { custom[+nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || ''; });
          var cx = kids(st.documentElement, 'cellXfs')[0];
          if (cx) kids(cx, 'xf').forEach(function (xf, i) { dateXf[i] = dateCode(+(xf.getAttribute('numFmtId') || 0), custom); });
        }
      } catch (e) { dateXf = []; }
      Array.prototype.forEach.call(wbDoc.getElementsByTagNameNS(NS, 'sheet'), function (n) {
        var p = rels[n.getAttributeNS(RNS, 'id')];
        if (p) sheets.push({ name: n.getAttribute('name'), path: p });
      });
      if (!sheets.length) throw new Error('No sheets found');
      sheets.forEach(function (s, i) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = s.name;
        b.addEventListener('click', function () { show(i); });
        tabsEl.appendChild(b);
      });
      show(0);
    }).catch(fail);

    function stripCalc() {
      if (!calcTouched) return Promise.resolve();
      var root = wbDoc.documentElement, cp = kids(root, 'calcPr')[0];
      if (!cp) {
        cp = wbDoc.createElementNS(NS, 'calcPr');
        var after = null;
        ['definedNames', 'externalReferences', 'functionGroups', 'sheets'].some(function (n) {
          var k = kids(root, n)[0]; if (k) { after = k; return true; } return false;
        });
        root.insertBefore(cp, after ? after.nextSibling : null);
      }
      cp.setAttribute('fullCalcOnLoad', '1');
      pkg.setText('xl/workbook.xml', LN.zip.ser(wbDoc));
      if (!pkg.has('xl/calcChain.xml')) return Promise.resolve();
      pkg.remove('xl/calcChain.xml');
      return Promise.all([pkg.text('[Content_Types].xml'), pkg.text('xl/_rels/workbook.xml.rels')]).then(function (t) {
        pkg.setText('[Content_Types].xml', t[0].replace(/<Override[^>]*calcChain[^>]*\/>/g, ''));
        pkg.setText('xl/_rels/workbook.xml.rels', t[1].replace(/<Relationship [^>]*calcChain[^>]*\/>/g, ''));
      });
    }

    return {
      bytes: function () {
        sheets.forEach(function (s) {
          if (s.dirty) pkg.setText(s.path, LN.zip.ser(s.doc));
        });
        return stripCalc().then(function () { return pkg.build(); });
      },
      destroy: function () { el.textContent = ''; }
    };
  }

  function blank() {
    var CT = XMLDECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    var RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var WB = XMLDECL + '<workbook xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
    var WBR = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    var SH = XMLDECL + '<worksheet xmlns="' + NS + '"><sheetData/></worksheet>';
    return LN.zip.blankPkg({ '[Content_Types].xml': CT, '_rels/.rels': RELS, 'xl/workbook.xml': WB, 'xl/_rels/workbook.xml.rels': WBR, 'xl/worksheets/sheet1.xml': SH });
  }

  LN.xlsx = { mount: mount, blank: blank, fmtSerial: fmtSerial, textToSerial: textToSerial, dateCode: dateCode };
})(window.LN = window.LN || {});
