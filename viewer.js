(function () {
  'use strict';

  var LN = window.LN || {};
  var stateEl = document.getElementById('state');
  var outEl = document.getElementById('out');
  var nameEl = document.getElementById('st-name');

  function show(el) {
    stateEl.hidden = true;
    outEl.hidden = false;
    outEl.textContent = '';
    outEl.appendChild(el);
  }

  function fail(msg) {
    stateEl.textContent = msg;
    stateEl.hidden = false;
    outEl.hidden = true;
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // ---------- csv (read-only table, no dependency on the app's editor) ----------
  function parseCsv(text) {
    var first = String(text).split('\n', 1)[0];
    var d = ',', best = -1;
    [',', ';', '\t', '|'].forEach(function (c) {
      var n = first.split(c).length - 1;
      if (n > best) { best = n; d = c; }
    });
    var rows = [], row = [], f = '', q = false, s = String(text).replace(/^﻿/, '');
    for (var i = 0; i < s.length; i++) {
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

  function renderCsv(text) {
    var rows = parseCsv(text);
    var wrap = el('div', 'tbl-wrap');
    var table = document.createElement('table');
    table.className = 'grid';
    rows.forEach(function (r, ri) {
      var tr = document.createElement('tr');
      r.forEach(function (v) {
        var cell = document.createElement(ri === 0 ? 'th' : 'td');
        cell.textContent = v;
        tr.appendChild(cell);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }

  function renderHtml(text) {
    var holder = el('div', 'html-wrap');
    var f = document.createElement('iframe');
    f.title = 'Shared HTML';
    f.className = 'html-frame';
    var settled = false;
    function fallback() {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMsg);
      var s = document.createElement('iframe');
      s.setAttribute('sandbox', '');
      s.title = 'Shared HTML';
      s.className = 'html-frame';
      holder.textContent = '';
      holder.appendChild(s);
      s.srcdoc = text;
    }
    function onMsg(e) {
      if (settled || e.source !== f.contentWindow || !e.data || e.data.t !== 'ln-ready') return;
      settled = true;
      window.removeEventListener('message', onMsg);
      f.contentWindow.postMessage({ t: 'ln-html', html: text }, '*');
    }
    // V0.7.2: scripts run in an isolated runner (no allow-same-origin, no network, cannot touch this page)
    f.setAttribute('sandbox', 'allow-scripts');
    window.addEventListener('message', onMsg);
    holder.appendChild(f);
    setTimeout(function () { f.src = 'htmlrun.html'; }, 0);
    setTimeout(fallback, 2500);
    return holder;
  }

  function renderMd(text) {
    var art = el('div', 'md');
    art.innerHTML = LN.md ? LN.md.render(text) : '<pre></pre>';
    // wiki links go nowhere in a read-only viewer; just stop the # jump
    art.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a && a.classList.contains('wl')) e.preventDefault();
    });
    return art;
  }

  function renderText(text) {
    var pre = document.createElement('pre');
    pre.className = 'plain';
    pre.textContent = text;
    return pre;
  }

  function render(obj) {
    nameEl.textContent = obj.n || '';
    document.title = (obj.n || 'Shared note') + ' - Limitless Notepad';
    var body = String(obj.t || '');
    var k = obj.k;
    var node;
    if (k === 'md') node = renderMd(body);
    else if (k === 'csv') node = renderCsv(body);
    else if (k === 'html') node = renderHtml(body);
    else node = renderText(body);
    show(node);
  }

  function run() {
    var hash = window.location.hash.slice(1);
    if (!hash) { fail('No note to show. Open this page from a Limitless Notepad share link.'); return; }
    if (!LN.sharecodec) { fail('This page is missing a file it needs. Try reloading.'); return; }
    LN.sharecodec.decode(hash).then(function (obj) {
      if (!obj || typeof obj.t !== 'string') throw new Error('This link is not a note.');
      render(obj);
    }).catch(function (e) {
      fail(e && e.message ? e.message : 'Could not read this link.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
