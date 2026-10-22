(function (LN) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inline(raw) {
    var s = esc(raw);
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (m, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/!\[\[([^\]\n]+)\]\]/g, function (m, n) {
      return '<img data-ln-img="' + n + '" alt="' + n + '">';
    });
    s = s.replace(/\[\[([^\]\n]+)\]\]/g, function (m, n) {
      return '<a href="#" class="wl" data-wl="' + n + '">' + n + '</a>';
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return '<code>' + codes[+i] + '</code>'; });
    return s;
  }

  var RE_TASK = /^\[( |x|X)\]\s+(.*)$/;
  function item(text) {
    var m = RE_TASK.exec(text);
    if (m) {
      return '<input type="checkbox" disabled' + (m[1] === ' ' ? '' : ' checked') + '> ' + inline(m[2]);
    }
    return inline(text);
  }

  // ---- lists, with nesting by indentation ----
  var RE_HR = /^(-{3,}|\*{3,})\s*$/;
  var RE_LI = /^([ \t]*)([-*+]|\d+\.)[ \t]+(.*)$/;
  function indentOf(s) { return s.replace(/\t/g, '    ').length; }

  function readItems(lines, i) {
    var items = [];
    while (i < lines.length) {
      var l = lines[i];
      var m = RE_LI.exec(l);
      if (m && !RE_HR.test(l)) {
        items.push({ ind: indentOf(m[1]), ord: /\d/.test(m[2]), num: parseInt(m[2], 10), text: m[3] });
        i++;
        continue;
      }
      // an indented line under an item continues that item
      if (items.length && /^[ \t]{2,}\S/.test(l)) {
        items[items.length - 1].text += ' ' + l.trim();
        i++;
        continue;
      }
      break;
    }
    return { items: items, next: i };
  }

  function buildList(items) {
    var pos = 0;
    function level(ind) {
      var first = items[pos];
      var tag = first.ord ? 'ol' : 'ul';
      var html = '<' + tag + (first.ord && isFinite(first.num) && first.num !== 1 ? ' start="' + first.num + '"' : '') + '>';
      while (pos < items.length && items[pos].ind >= ind) {
        var it = items[pos++];
        var nested = '';
        if (pos < items.length && items[pos].ind > it.ind) nested = level(items[pos].ind);
        html += '<li' + (RE_TASK.test(it.text) ? ' class="task"' : '') + '>' + item(it.text) + nested + '</li>';
      }
      return html + '</' + tag + '>';
    }
    var out = '';
    while (pos < items.length) out += level(items[pos].ind);
    return out;
  }

  // ---- tables ----
  var RE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  function cells(l) {
    var t = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map(function (c) { return c.trim(); });
  }
  function aligns(l) {
    return cells(l).map(function (c) {
      var a = c.charAt(0) === ':', b = c.charAt(c.length - 1) === ':';
      return a && b ? 'center' : b ? 'right' : a ? 'left' : '';
    });
  }
  function isTableAt(lines, i) {
    return i + 1 < lines.length && lines[i].indexOf('|') >= 0 && RE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf('-') >= 0 &&
      cells(lines[i]).length === cells(lines[i + 1]).length;
  }

  // ---- code blocks ----
  function codeBlock(code, lang, o) {
    var key = String(lang || '').toLowerCase();
    if (key === 'dataview') return '<div class="dv" data-dv="' + esc(code) + '"></div>';
    var body = LN.hl ? LN.hl.highlight(code, key) : esc(code);
    return '<div class="cb" data-lang="' + esc(key) + '"><div class="cb-head"><span class="cb-lang">' + (lang ? esc(lang) : 'code') + '</span>' +
      (o.copy ? '<button type="button" class="cb-copy" data-copy aria-label="Copy code">Copy</button>' : '') +
      '</div><pre><code' + (key ? ' class="lang-' + esc(key) + '"' : '') + '>' + body + '</code></pre></div>';
  }

  // ---- callouts: > [!tip] Title   (add + or - after ] to make it fold open or closed) ----
  var CO = {
    note: 'note', info: 'note', abstract: 'note', summary: 'note', tldr: 'note', todo: 'note', example: 'note',
    tip: 'tip', hint: 'tip', important: 'tip',
    success: 'ok', check: 'ok', done: 'ok',
    warning: 'warn', warn: 'warn', caution: 'warn', attention: 'warn',
    danger: 'danger', error: 'danger', bug: 'danger', failure: 'danger', fail: 'danger', missing: 'danger',
    question: 'quest', help: 'quest', faq: 'quest',
    quote: 'quote', cite: 'quote'
  };
  var GLYPH = { note: 'i', tip: '\u2605', ok: '\u2713', warn: '!', danger: '\u00d7', quest: '?', quote: '\u201c' };
  var RE_CO = /^\[!([A-Za-z]+)\]([+-]?)[ \t]*(.*)$/;

  function callout(co, rest, o, depth) {
    var raw = co[1].toLowerCase();
    var type = CO.hasOwnProperty(raw) ? CO[raw] : 'note';
    var title = co[3].trim() || (raw.charAt(0).toUpperCase() + raw.slice(1));
    var head = '<span class="co-ico" aria-hidden="true">' + GLYPH[type] + '</span><span class="co-t">' + inline(title) + '</span>';
    var inner = rest.join('\n').trim();
    var body = inner ? '<div class="co-body">' + render(inner, { copy: o.copy, br: true }, depth + 1) + '</div>' : '';
    if (co[2]) {
      return '<details class="co" data-co="' + type + '"' + (co[2] === '+' ? ' open' : '') + '><summary class="co-title">' + head + '</summary>' + body + '</details>';
    }
    return '<div class="co" data-co="' + type + '" role="note"><div class="co-title">' + head + '</div>' + body + '</div>';
  }

  var BLOCK_START = /^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+\.\s+|(-{3,}|\*{3,})\s*$)/;

  function render(src, opts, depth) {
    var o = opts || {};
    depth = depth || 0;
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var i = 0;
    var m;
    while (i < lines.length) {
      var l = lines[i];

      if (/^```/.test(l)) {
        var lang = (/^```[ \t]*([\w+#.-]*)/.exec(l) || [])[1] || '';
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push(codeBlock(buf.join('\n'), lang, o));
        continue;
      }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
        out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>');
        i++;
        continue;
      }
      if (RE_HR.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        var co = depth < 6 ? RE_CO.exec(q[0]) : null;
        if (co) out.push(callout(co, q.slice(1), o, depth));
        else if (depth < 6) out.push('<blockquote>' + render(q.join('\n'), { copy: o.copy, br: true }, depth + 1) + '</blockquote>');
        else out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>');
        continue;
      }
      if (RE_LI.test(l)) {
        var r = readItems(lines, i);
        if (r.items.length) {
          out.push(buildList(r.items));
          i = r.next;
          continue;
        }
      }
      if (isTableAt(lines, i)) {
        var head = cells(l);
        var al = aligns(lines[i + 1]);
        var th = head.map(function (c, k) { return '<th' + (al[k] ? ' style="text-align:' + al[k] + '"' : '') + '>' + inline(c) + '</th>'; }).join('');
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && !/^\s*$/.test(lines[i])) {
          var cs = cells(lines[i]);
          rows.push('<tr>' + head.map(function (h, k) {
            return '<td' + (al[k] ? ' style="text-align:' + al[k] + '"' : '') + '>' + inline(cs[k] || '') + '</td>';
          }).join('') + '</tr>');
          i++;
        }
        out.push('<div class="tbl"><table><thead><tr>' + th + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
        continue;
      }
      if (/^\s*$/.test(l)) { i++; continue; }

      var p = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !BLOCK_START.test(lines[i]) && !(p.length && isTableAt(lines, i))) { p.push(lines[i]); i++; }
      if (!p.length) { p.push(lines[i]); i++; }
      out.push('<p>' + (o.br ? inline(p.join('\n')).replace(/\n/g, '<br>') : inline(p.join(' '))) + '</p>');
    }
    return out.join('\n');
  }

  LN.md = { render: render, escape: esc };
})(window.LN = window.LN || {});
