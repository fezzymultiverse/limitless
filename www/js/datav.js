(function (LN) {
  'use strict';
  // JSON and XML files: a collapsible tree, Format, Validate (and Minify for JSON).
  // The text in the editor stays the truth. Format rewrites it, and nothing else does.
  // LN.datav.tree(host, text, name, setText) draws into host (the preview pane).

  var CHUNK = 200;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function isJsonName(name) { return /\.(json|geojson)$/i.test(name || ''); }

  // ---------- JSON ----------

  function lineCol(text, pos) {
    var upto = text.slice(0, pos);
    return { line: upto.split('\n').length, col: pos - upto.lastIndexOf('\n') };
  }

  // Turns a JSON.parse error into { msg, line, col }. WebViews word it differently, so read both styles.
  function jsonError(text, e) {
    var msg = String((e && e.message) || e);
    var lc = /line (\d+) column (\d+)/.exec(msg);
    if (lc) return { msg: msg.replace(/\s*\(line \d+ column \d+\)/, ''), line: +lc[1], col: +lc[2] };
    var p = /position (\d+)/.exec(msg);
    if (p) {
      var at = lineCol(text, +p[1]);
      return { msg: msg.replace(/\s*at position \d+/, ''), line: at.line, col: at.col };
    }
    return { msg: msg, line: 0, col: 0 };
  }

  // JSON.parse turns 12345678901234567890 into 12345678901234567000. Formatting would write that back, so say no.
  function hasBigNumber(text) {
    return /\d{16,}/.test(String(text).replace(/"(?:[^"\\]|\\.)*"/g, '""'));
  }

  function formatJson(text) {
    var v = JSON.parse(text);
    return JSON.stringify(v, null, 2) + '\n';
  }
  function minifyJson(text) { return JSON.stringify(JSON.parse(text)) + '\n'; }

  function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }

  function keySpan(k) {
    var s = el('span', 'dt-key', String(k));
    return s;
  }

  function jsonNode(key, v, open) {
    var t = typeOf(v);
    var isObj = t === 'object' || t === 'array';
    var keys = t === 'object' ? Object.keys(v) : null;
    var n = !isObj ? 0 : (keys ? keys.length : v.length);
    if (!isObj || n === 0) {
      var row = el('div', 'dt-row');
      if (key != null) row.appendChild(keySpan(key));
      var val = el('span', 'dt-' + (isObj ? 'meta' : t), isObj ? (t === 'array' ? '[]' : '{}') : (t === 'string' ? JSON.stringify(v) : String(v)));
      row.appendChild(val);
      return row;
    }
    var d = document.createElement('details');
    d.className = 'dt-node';
    var sum = document.createElement('summary');
    if (key != null) sum.appendChild(keySpan(key));
    sum.appendChild(el('span', 'dt-meta', t === 'array' ? '[' + n + ']' : '{' + n + '}'));
    d.appendChild(sum);
    var filled = false;
    d._fill = function () {
      if (filled) return;
      filled = true;
      var box = el('div', 'dt-kids');
      d.appendChild(box);
      var i = 0;
      function more() {
        var end = Math.min(i + CHUNK, n);
        for (; i < end; i++) box.appendChild(jsonNode(keys ? keys[i] : i, keys ? v[keys[i]] : v[i], false));
        if (i < n) {
          var b = el('button', 'dt-more', 'Show more (' + (n - i) + ' left)');
          b.type = 'button';
          b.addEventListener('click', function () { b.remove(); more(); });
          box.appendChild(b);
        }
      }
      more();
    };
    d.addEventListener('toggle', function () { if (d.open) d._fill(); });
    if (open) { d._fill(); d.open = true; }
    return d;
  }

  // ---------- XML ----------

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  // Chrome words the error as "error on line 3 at column 5: ...". Keep it short.
  function xmlError(doc) {
    var pe = doc.getElementsByTagName('parsererror')[0];
    if (!pe) return null;
    var raw = (pe.textContent || '').replace(/\s+/g, ' ').trim();
    var m = /error on line (\d+) at column (\d+):\s*(.*?)(?: Below is a rendering|$)/i.exec(raw);
    if (m) return { msg: m[3] || 'Not well formed', line: +m[1], col: +m[2] };
    return { msg: raw.slice(0, 160) || 'Not well formed', line: 0, col: 0 };
  }

  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    return { doc: doc, err: xmlError(doc) };
  }

  function attrText(node) {
    var out = '';
    for (var i = 0; i < node.attributes.length; i++) out += ' ' + node.attributes[i].name + '="' + escAttr(node.attributes[i].value) + '"';
    return out;
  }

  function meaningful(node) {
    return Array.prototype.filter.call(node.childNodes, function (k) {
      return k.nodeType === 1 || k.nodeType === 8 || k.nodeType === 4 || k.nodeType === 7 || (k.nodeType === 3 && k.nodeValue.trim() !== '');
    });
  }

  function leafText(k) {
    if (k.nodeType === 4) return '<![CDATA[' + k.nodeValue + ']]>';
    return esc(k.nodeValue);
  }

  function otherNode(k, ind, out) {
    if (k.nodeType === 8) out.push(ind + '<!--' + k.nodeValue + '-->');
    else if (k.nodeType === 7) out.push(ind + '<?' + k.target + (k.data ? ' ' + k.data : '') + '?>');
  }

  // Elements with text and child elements mixed together are written back unchanged, because spaces there carry meaning.
  function plain(node) {
    var out = '<' + node.nodeName + attrText(node);
    if (!node.childNodes.length) return out + '/>';
    out += '>';
    Array.prototype.forEach.call(node.childNodes, function (k) {
      if (k.nodeType === 1) out += plain(k);
      else if (k.nodeType === 3 || k.nodeType === 4) out += leafText(k);
      else if (k.nodeType === 8) out += '<!--' + k.nodeValue + '-->';
      else if (k.nodeType === 7) out += '<?' + k.target + (k.data ? ' ' + k.data : '') + '?>';
    });
    return out + '</' + node.nodeName + '>';
  }

  function pretty(node, ind, out) {
    var kids = meaningful(node);
    var open = '<' + node.nodeName + attrText(node);
    if (!kids.length) {
      var ws = node.textContent;
      out.push(ind + open + (ws ? '>' + esc(ws) + '</' + node.nodeName + '>' : '/>'));
      return;
    }
    var hasEl = kids.some(function (k) { return k.nodeType === 1; });
    var hasText = kids.some(function (k) { return k.nodeType === 3 || k.nodeType === 4; });
    if (!hasEl) {
      if (kids.every(function (k) { return k.nodeType === 3 || k.nodeType === 4; })) {
        out.push(ind + open + '>' + kids.map(leafText).join('') + '</' + node.nodeName + '>');
      } else {
        out.push(ind + plain(node));
      }
      return;
    }
    if (hasText) { out.push(ind + plain(node)); return; }
    out.push(ind + open + '>');
    kids.forEach(function (k) {
      if (k.nodeType === 1) pretty(k, ind + '  ', out);
      else otherNode(k, ind + '  ', out);
    });
    out.push(ind + '</' + node.nodeName + '>');
  }

  function formatXml(text, doc) {
    var out = [];
    var decl = /^\s*(<\?xml[\s\S]*?\?>)/.exec(text);
    if (decl) out.push(decl[1]);
    var dt = /<!DOCTYPE[^>\[]*(\[[\s\S]*?\])?\s*>/i.exec(text);
    if (dt) out.push(dt[0]);
    Array.prototype.forEach.call(doc.childNodes, function (k) {
      if (k.nodeType === 1) pretty(k, '', out);
      else otherNode(k, '', out);
    });
    return out.join('\n') + '\n';
  }

  function tagRow(node, closed) {
    var s = el('span', 'dt-tag');
    s.appendChild(el('span', 'dt-name', '<' + node.nodeName));
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      s.appendChild(el('span', 'dt-attr', ' ' + a.name));
      s.appendChild(el('span', 'dt-meta', '='));
      s.appendChild(el('span', 'dt-string', '"' + a.value + '"'));
    }
    s.appendChild(el('span', 'dt-name', closed ? '/>' : '>'));
    return s;
  }

  function shortText(t) { t = t.replace(/\s+/g, ' ').trim(); return t.length > 400 ? t.slice(0, 400) + '…' : t; }

  function xmlNode(node, open) {
    var kids = meaningful(node);
    var hasEl = kids.some(function (k) { return k.nodeType !== 3 && k.nodeType !== 4; });
    if (!hasEl) {
      var row = el('div', 'dt-row');
      row.appendChild(tagRow(node, !kids.length));
      if (kids.length) {
        row.appendChild(el('span', 'dt-text', shortText(kids.map(function (k) { return k.nodeValue; }).join(''))));
        row.appendChild(el('span', 'dt-name', '</' + node.nodeName + '>'));
      }
      return row;
    }
    var d = document.createElement('details');
    d.className = 'dt-node';
    var sum = document.createElement('summary');
    sum.appendChild(tagRow(node, false));
    sum.appendChild(el('span', 'dt-meta', ' ' + kids.length));
    d.appendChild(sum);
    var filled = false;
    d._fill = function () {
      if (filled) return;
      filled = true;
      var box = el('div', 'dt-kids');
      d.appendChild(box);
      kids.slice(0, 2000).forEach(function (k) {
        if (k.nodeType === 1) box.appendChild(xmlNode(k, false));
        else if (k.nodeType === 8) box.appendChild(el('div', 'dt-row dt-meta', '<!-- ' + shortText(k.nodeValue) + ' -->'));
        else if (k.nodeType === 7) box.appendChild(el('div', 'dt-row dt-meta', '<?' + k.target + ' ' + shortText(k.data || '') + '?>'));
        else box.appendChild(el('div', 'dt-row dt-text', shortText(k.nodeValue)));
      });
      if (kids.length > 2000) box.appendChild(el('div', 'dt-row dt-meta', (kids.length - 2000) + ' more not shown'));
    };
    d.addEventListener('toggle', function () { if (d.open) d._fill(); });
    if (open) { d._fill(); d.open = true; }
    return d;
  }

  // ---------- the screen ----------

  function tree(host, text, name, setText) {
    var json = isJsonName(name);
    host.textContent = '';
    var bar = el('div', 'vw-bar');
    var body = el('div', 'dt-wrap');
    var note = el('span', 'vw-note');
    host.appendChild(bar);
    host.appendChild(body);

    function btn(label, fn) {
      var b = el('button', null, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }

    var parsed = null, err = null;
    if (!String(text).trim()) {
      err = { msg: 'The file is empty.', line: 0, col: 0 };
    } else if (json) {
      try { parsed = JSON.parse(text); } catch (e) { err = jsonError(text, e); }
    } else {
      var px = parseXml(text);
      if (px.err) err = px.err; else parsed = px.doc;
    }

    function status(msg, bad) { note.textContent = msg; note.classList.toggle('bad', !!bad); }
    function where(e) { return e.line ? ' (line ' + e.line + ', column ' + e.col + ')' : ''; }

    function redraw(newText) { setText(newText); tree(host, newText, name, setText); }

    btn('Format', function () {
      if (err) { LN.toast('Fix the error first. ' + err.msg + where(err)); return; }
      if (json && hasBigNumber(text)) { LN.toast('Not formatted: a number has more than 15 digits and would lose its last digits.'); return; }
      var out = json ? formatJson(text) : formatXml(text, parsed);
      if (out === text) { LN.toast('Already formatted.'); return; }
      redraw(out);
    });
    if (json) {
      btn('Minify', function () {
        if (err) { LN.toast('Fix the error first. ' + err.msg + where(err)); return; }
        if (hasBigNumber(text)) { LN.toast('Not minified: a number has more than 15 digits and would lose its last digits.'); return; }
        redraw(minifyJson(text));
      });
    }
    btn('Validate', function () {
      if (err) { status(err.msg + where(err), true); LN.toast('Not valid. ' + err.msg + where(err)); }
      else { status('Valid ' + (json ? 'JSON' : 'XML'), false); LN.toast('Valid ' + (json ? 'JSON' : 'XML') + '.'); }
    });
    btn('Expand', function () {
      var budget = 3000;
      for (var pass = 0; pass < 8 && budget > 0; pass++) {
        var list = body.querySelectorAll('details:not([open])');
        if (!list.length) break;
        for (var i = 0; i < list.length && budget > 0; i++) {
          if (list[i]._fill) list[i]._fill();
          list[i].open = true;
          budget -= 1 + list[i].children.length;
        }
      }
      if (budget <= 0) LN.toast('Opened the first levels. Open the rest by hand.');
    });
    btn('Collapse', function () {
      Array.prototype.forEach.call(body.querySelectorAll('details'), function (d) { d.open = false; });
    });
    bar.appendChild(note);

    if (err) {
      status(err.msg + where(err), true);
      var box = el('div', 'dt-err');
      box.appendChild(el('strong', null, 'Not valid ' + (json ? 'JSON' : 'XML')));
      box.appendChild(el('div', null, err.msg + where(err)));
      box.appendChild(el('div', 'hint', 'Switch to Text to fix it. This view comes back when the file is valid.'));
      body.appendChild(box);
      return;
    }
    status(json ? 'Valid JSON' : 'Valid XML', false);
    body.appendChild(json ? jsonNode(null, parsed, true) : xmlNode(parsed.documentElement, true));
  }

  LN.datav = { tree: tree, jsonError: jsonError, formatJson: formatJson, minifyJson: minifyJson, hasBigNumber: hasBigNumber, formatXml: formatXml, parseXml: parseXml, isJsonName: isJsonName };
})(window.LN = window.LN || {});
