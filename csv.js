(function (LN) {
  'use strict';

  function detect(text, name) {
    if (/\.tsv$/i.test(name || '')) return '\t';
    var first = String(text).split('\n', 1)[0];
    var best = ',', n = -1;
    [',', ';', '\t', '|'].forEach(function (d) {
      var c = first.split(d).length - 1;
      if (c > n) { n = c; best = d; }
    });
    return best;
  }

  function parse(text, d) {
    var rows = [], row = [], f = '', q = false, i = 0, s = String(text).replace(/^\uFEFF/, '');
    for (; i < s.length; i++) {
      var ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"' && f === '') q = true;
      else if (ch === d) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  function stringify(rows, d) {
    return rows.map(function (r) {
      return r.map(function (v) {
        v = v == null ? '' : String(v);
        return (v.indexOf(d) >= 0 || /["\n\r]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(d);
    }).join('\n') + '\n';
  }

  // Sorts rows by column c. dir 1 is A to Z (or low to high), -1 the reverse. Blanks always go last.
  // A column where every filled cell is a number sorts as numbers. The header row, when there is one, stays on top.
  function sortRows(rows, c, dir, hasHeader) {
    var num = LN.chart ? LN.chart.num : function (v) { return parseFloat(v); };
    var head = hasHeader && rows.length ? rows.shift() : null;
    var filled = 0, nums = 0;
    rows.forEach(function (r) { if (r[c] !== '' && r[c] != null) { filled++; if (!isNaN(num(r[c]))) nums++; } });
    var numeric = filled > 0 && nums === filled;
    rows.sort(function (a, b) {
      var x = a[c], y = b[c];
      var ex = x === '' || x == null, ey = y === '' || y == null;
      if (ex || ey) return ex && ey ? 0 : (ex ? 1 : -1);
      var r = numeric ? num(x) - num(y) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
      return r * dir;
    });
    if (head) rows.unshift(head);
    return rows;
  }

  // Editable table. host: container element. getText/setText: link to the editor text.
  function table(host, text, name, setText) {
    var d = detect(text, name);
    var rows = parse(text, d);
    if (!rows.length) rows = [['']];
    var w = 0;
    rows.forEach(function (r) { if (r.length > w) w = r.length; });
    rows.forEach(function (r) { while (r.length < w) r.push(''); });
    var focus = { r: 0, c: 0 };
    var hasHeader = LN.chart ? LN.chart.guessHeader(rows) : false;
    var filterText = '';
    host.textContent = '';

    var bar = document.createElement('div');
    bar.className = 'vw-bar';
    var wrap = document.createElement('div');
    wrap.className = 'tbl-wrap';
    var tb = document.createElement('table');
    tb.className = 'grid';
    wrap.appendChild(tb);
    host.appendChild(bar);
    host.appendChild(wrap);

    function commit() { setText(stringify(rows, d)); }
    function btn(label, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }

    // Filter hides rows on screen only. The data and the file are not touched.
    function applyFilter() {
      var q = filterText.toLowerCase(), shown = 0, i;
      for (i = 1; i < tb.rows.length; i++) {
        var row = rows[i - 1];
        var hide = !!q && !(hasHeader && i === 1) && !row.some(function (v) { return String(v).toLowerCase().indexOf(q) >= 0; });
        tb.rows[i].style.display = hide ? 'none' : '';
        if (!hide) shown++;
      }
      note.textContent = q ? shown + ' of ' + rows.length + ' rows' : '';
    }

    function draw() {
      tb.textContent = '';
      var hr = document.createElement('tr');
      hr.appendChild(document.createElement('th'));
      rows[0].forEach(function (_, c) {
        var th = document.createElement('th');
        th.textContent = LN.colName(c);
        hr.appendChild(th);
      });
      tb.appendChild(hr);
      rows.forEach(function (r, ri) {
        var tr = document.createElement('tr');
        var th = document.createElement('th');
        th.textContent = ri + 1;
        tr.appendChild(th);
        r.forEach(function (v, ci) {
          var td = document.createElement('td');
          td.contentEditable = 'plaintext-only';
          td.spellcheck = false;
          td.dataset.r = ri; td.dataset.c = ci;
          td.textContent = v;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      applyFilter();
    }

    tb.addEventListener('input', function (e) {
      var td = e.target;
      if (!td.dataset || td.dataset.r == null) return;
      rows[+td.dataset.r][+td.dataset.c] = td.textContent.replace(/\n/g, ' ');
      commit();
    });
    tb.addEventListener('focusin', function (e) {
      var td = e.target;
      if (td.dataset && td.dataset.r != null) { focus.r = +td.dataset.r; focus.c = +td.dataset.c; }
    });
    tb.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });

    btn('+ Row', function () { rows.splice(focus.r + 1, 0, rows[0].map(function () { return ''; })); commit(); draw(); });
    btn('+ Col', function () { rows.forEach(function (r) { r.splice(focus.c + 1, 0, ''); }); commit(); draw(); });
    btn('Del row', function () { if (rows.length > 1) { rows.splice(focus.r, 1); focus.r = Math.min(focus.r, rows.length - 1); commit(); draw(); } });
    btn('Del col', function () { if (rows[0].length > 1) { rows.forEach(function (r) { r.splice(focus.c, 1); }); focus.c = Math.min(focus.c, rows[0].length - 1); commit(); draw(); } });
    btn('A-Z', function () { sortRows(rows, focus.c, 1, hasHeader); commit(); draw(); });
    btn('Z-A', function () { sortRows(rows, focus.c, -1, hasHeader); commit(); draw(); });
    var hb = btn('Header', function () { hasHeader = !hasHeader; hb.classList.toggle('on', hasHeader); applyFilter(); });
    hb.classList.toggle('on', hasHeader);
    hb.title = 'First row is a header: stays on top when sorting';
    btn('Chart', function () { LN.chart.open(name || 'Table', rows, { header: hasHeader }); });
    var fi = document.createElement('input');
    fi.type = 'search'; fi.className = 'vw-find'; fi.placeholder = 'Filter rows';
    fi.setAttribute('aria-label', 'Filter rows'); fi.autocomplete = 'off'; fi.spellcheck = false;
    fi.addEventListener('input', function () { filterText = fi.value; applyFilter(); });
    bar.appendChild(fi);
    var note = document.createElement('span');
    note.className = 'vw-note';
    bar.appendChild(note);
    draw();
  }

  LN.colName = function (i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };
  LN.csv = { parse: parse, stringify: stringify, detect: detect, table: table, sortRows: sortRows };
})(window.LN = window.LN || {});
