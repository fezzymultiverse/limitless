(function (LN) {
  'use strict';
  // Charts from table data (csv and xlsx). Pure SVG, no libraries.
  // LN.chart.open(title, rows, opts): rows is an array of arrays of strings. opts.header: true or false (guessed when left out).
  var SVGNS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['var(--accent)', '#4C8BF5', '#2EB67D', '#E8B923', '#C45AEC', '#EF5B5B', '#26C6DA', '#8D6E63', '#9E9E9E', '#FF8A65', '#7CB342', '#5C6BC0'];
  var MAX_POINTS = 40;
  var MAX_SLICES = 11;

  // "R 1 200", "$3,50", "12%" -> number. NaN when the text is not a number.
  function num(v) {
    if (v == null) return NaN;
    var s = String(v).trim().replace(/^[$€£R]\s?/, '').replace(/%$/, '').replace(/[\s,]/g, '');
    if (s === '' || !/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }

  // The first row is a header when none of its filled cells is a number.
  function guessHeader(rows) {
    if (rows.length < 2) return false;
    var any = false;
    for (var i = 0; i < rows[0].length; i++) {
      var v = rows[0][i];
      if (v === '' || v == null) continue;
      any = true;
      if (!isNaN(num(v))) return false;
    }
    return any;
  }

  function width(rows) {
    var w = 0;
    rows.forEach(function (r) { if (r.length > w) w = r.length; });
    return w;
  }

  // Columns where at least 60% of the filled cells are numbers.
  function numericCols(rows, header) {
    var w = width(rows), out = [];
    for (var c = 0; c < w; c++) {
      var filled = 0, nums = 0;
      for (var r = header ? 1 : 0; r < rows.length; r++) {
        var v = rows[r][c];
        if (v === '' || v == null) continue;
        filled++;
        if (!isNaN(num(v))) nums++;
      }
      if (nums > 0 && nums >= filled * 0.6) out.push(c);
    }
    return out;
  }

  // Picks the points: label from one column, value from another. Rows with no number are skipped.
  function points(rows, header, lc, vc) {
    var out = [];
    for (var r = header ? 1 : 0; r < rows.length; r++) {
      var v = num(rows[r][vc]);
      if (isNaN(v)) continue;
      var l = rows[r][lc];
      out.push({ l: (l == null || l === '') ? 'Row ' + (r + 1) : String(l), v: v });
    }
    return out;
  }

  function niceMax(max) {
    if (!(max > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var f = max / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function fmt(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return +(v / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return +(v / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return +(v / 1e3).toFixed(1) + 'K';
    return String(+v.toFixed(2));
  }

  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function svgEl(name, attrs, style, text) {
    var e = document.createElementNS(SVGNS, name);
    var k;
    if (attrs) for (k in attrs) e.setAttribute(k, attrs[k]);
    if (style) for (k in style) e.style[k] = style[k];
    if (text != null) e.textContent = text;
    return e;
  }

  function tip(node, text) { node.appendChild(svgEl('title', null, null, text)); }

  function drawAxes(svg, lo, hi, X0, X1, Y0, Y1) {
    var yOf = function (v) { return Y1 - (v - lo) / (hi - lo) * (Y1 - Y0); };
    for (var i = 0; i <= 4; i++) {
      var v = lo + (hi - lo) * i / 4, y = yOf(v);
      svg.appendChild(svgEl('line', { x1: X0, x2: X1, y1: y, y2: y }, { stroke: 'var(--line)', strokeWidth: '1' }));
      svg.appendChild(svgEl('text', { x: X0 - 4, y: y + 3, 'text-anchor': 'end', 'font-size': '9' }, { fill: 'var(--muted)' }, fmt(v)));
    }
    if (lo < 0 && hi > 0) svg.appendChild(svgEl('line', { x1: X0, x2: X1, y1: yOf(0), y2: yOf(0) }, { stroke: 'var(--ink)', strokeWidth: '1' }));
    return yOf;
  }

  function xLabels(svg, data, X0, step, Y1) {
    var every = Math.max(1, Math.ceil(data.length / 10));
    data.forEach(function (d, i) {
      if (i % every) return;
      var x = X0 + step * (i + 0.5);
      var t = svgEl('text', { x: x, y: Y1 + 12, 'text-anchor': 'end', 'font-size': '9', transform: 'rotate(-40 ' + x + ' ' + (Y1 + 12) + ')' }, { fill: 'var(--muted)' }, short(d.l, 10));
      svg.appendChild(t);
    });
  }

  function range(data) {
    var min = 0, max = 0;
    data.forEach(function (d) { if (d.v < min) min = d.v; if (d.v > max) max = d.v; });
    return { lo: min < 0 ? -niceMax(-min) : 0, hi: max > 0 ? niceMax(max) : (min < 0 ? 0 : 1) };
  }

  function bar(data) {
    var W = 360, H = 270, X0 = 40, X1 = 352, Y0 = 10, Y1 = 205;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var r = range(data);
    var yOf = drawAxes(svg, r.lo, r.hi, X0, X1, Y0, Y1);
    var step = (X1 - X0) / data.length, bw = Math.max(2, step * 0.7), zero = yOf(0);
    data.forEach(function (d, i) {
      var y = yOf(d.v);
      var rect = svgEl('rect', { x: X0 + step * i + (step - bw) / 2, y: Math.min(y, zero), width: bw, height: Math.max(1, Math.abs(zero - y)) }, { fill: 'var(--accent)' });
      tip(rect, d.l + ': ' + d.v);
      svg.appendChild(rect);
    });
    xLabels(svg, data, X0, step, Y1);
    return svg;
  }

  function line(data) {
    var W = 360, H = 270, X0 = 40, X1 = 352, Y0 = 10, Y1 = 205;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var r = range(data);
    var yOf = drawAxes(svg, r.lo, r.hi, X0, X1, Y0, Y1);
    var step = (X1 - X0) / data.length;
    var pts = data.map(function (d, i) { return (X0 + step * (i + 0.5)).toFixed(1) + ',' + yOf(d.v).toFixed(1); });
    svg.appendChild(svgEl('polyline', { points: pts.join(' '), fill: 'none' }, { stroke: 'var(--accent)', strokeWidth: '2', strokeLinejoin: 'round' }));
    if (data.length <= 30) {
      data.forEach(function (d, i) {
        var c = svgEl('circle', { cx: X0 + step * (i + 0.5), cy: yOf(d.v), r: 3 }, { fill: 'var(--accent)' });
        tip(c, d.l + ': ' + d.v);
        svg.appendChild(c);
      });
    }
    xLabels(svg, data, X0, step, Y1);
    return svg;
  }

  function pie(data) {
    var list = data.filter(function (d) { return d.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (list.length > MAX_SLICES + 1) {
      var rest = list.slice(MAX_SLICES), sum = 0;
      rest.forEach(function (d) { sum += d.v; });
      list = list.slice(0, MAX_SLICES).concat([{ l: 'Other (' + rest.length + ')', v: sum }]);
    }
    var total = 0;
    list.forEach(function (d) { total += d.v; });
    var W = 360, cx = 180, cy = 105, R = 92, H = 225 + list.length * 16;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    if (!total) return svg;
    var a0 = -Math.PI / 2;
    list.forEach(function (d, i) {
      var col = PALETTE[i % PALETTE.length], pct = d.v / total * 100;
      var node;
      if (list.length === 1) node = svgEl('circle', { cx: cx, cy: cy, r: R }, { fill: col });
      else {
        var a1 = a0 + d.v / total * Math.PI * 2;
        var big = a1 - a0 > Math.PI ? 1 : 0;
        node = svgEl('path', { d: 'M' + cx + ' ' + cy + ' L' + (cx + R * Math.cos(a0)).toFixed(2) + ' ' + (cy + R * Math.sin(a0)).toFixed(2) +
          ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + (cx + R * Math.cos(a1)).toFixed(2) + ' ' + (cy + R * Math.sin(a1)).toFixed(2) + ' Z' }, { fill: col, stroke: 'var(--bg)', strokeWidth: '1' });
        a0 = a1;
      }
      tip(node, d.l + ': ' + d.v + ' (' + pct.toFixed(1) + '%)');
      svg.appendChild(node);
      var y = 222 + i * 16;
      svg.appendChild(svgEl('rect', { x: 20, y: y - 9, width: 10, height: 10 }, { fill: col }));
      svg.appendChild(svgEl('text', { x: 36, y: y, 'font-size': '11' }, { fill: 'var(--ink)' }, short(d.l, 28) + '  ' + pct.toFixed(1) + '%'));
    });
    return svg;
  }

  function colName(c) { return LN.colName ? LN.colName(c) : String(c + 1); }

  function open(title, rows, opts) {
    opts = opts || {};
    var w = width(rows);
    if (rows.length < 2 || w < 1) { LN.toast('Nothing to chart yet.'); return; }
    var state = { header: opts.header != null ? !!opts.header : guessHeader(rows), type: 'bar', lc: 0, vc: 0 };

    var s = LN.ui.sheet('Chart: ' + title);
    var ctl = LN.ui.el('div', 'chart-ctl');
    var box = LN.ui.el('div', 'chart-box');
    var note = LN.ui.el('p', 'hint');
    s.body.appendChild(ctl);
    s.body.appendChild(box);
    s.body.appendChild(note);

    function select(label, options, value, onChange) {
      var wrap = LN.ui.el('label', 'chart-field');
      wrap.appendChild(LN.ui.el('span', 'set-label', label));
      var sel = document.createElement('select');
      sel.className = 'set-ctl set-input';
      sel.setAttribute('aria-label', label);
      options.forEach(function (o) {
        var op = document.createElement('option');
        op.value = String(o[0]); op.textContent = o[1];
        if (String(o[0]) === String(value)) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { onChange(sel.value); });
      wrap.appendChild(sel);
      ctl.appendChild(wrap);
      return sel;
    }

    function colOptions() {
      var out = [];
      for (var c = 0; c < w; c++) {
        var h = state.header ? rows[0][c] : '';
        out.push([c, colName(c) + (h ? ' · ' + short(h, 18) : '')]);
      }
      return out;
    }

    function pickDefaults() {
      var nc = numericCols(rows, state.header);
      var txt = [];
      for (var c = 0; c < w; c++) if (nc.indexOf(c) < 0) txt.push(c);
      state.lc = txt.length ? txt[0] : 0;
      var vals = nc.filter(function (c) { return c !== state.lc; });
      state.vc = vals.length ? vals[0] : (nc.length ? nc[0] : Math.min(1, w - 1));
    }

    var selL, selV;
    function build() {
      ctl.textContent = '';
      select('Chart', [['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie']], state.type, function (v) { state.type = v; draw(); });
      select('First row', [['h', 'Header'], ['d', 'Data']], state.header ? 'h' : 'd', function (v) {
        state.header = v === 'h'; pickDefaults(); build(); draw();
      });
      selL = select('Labels from', colOptions(), state.lc, function (v) { state.lc = +v; draw(); });
      selV = select('Values from', colOptions(), state.vc, function (v) { state.vc = +v; draw(); });
    }

    function draw() {
      box.textContent = '';
      var data = points(rows, state.header, state.lc, state.vc);
      if (!data.length) { note.textContent = 'No numbers in that column. Pick another under Values from.'; return; }
      var cut = false;
      if (state.type !== 'pie' && data.length > MAX_POINTS) { data = data.slice(0, MAX_POINTS); cut = true; }
      box.appendChild(state.type === 'pie' ? pie(data) : state.type === 'line' ? line(data) : bar(data));
      note.textContent = cut ? 'Showing the first ' + MAX_POINTS + ' rows.' : data.length + ' values. Tap a bar, point or slice for its value.';
    }

    pickDefaults();
    build();
    draw();
  }

  LN.chart = { open: open, num: num, guessHeader: guessHeader, numericCols: numericCols, points: points };
})(window.LN = window.LN || {});
