(function (LN) {
  'use strict';
  // Viewers for everything else: LN.mediav (audio, video), LN.docv (odt, ods, odp, epub, rtf), LN.binv (any other binary).
  // All three are read only: bytes() hands back what was opened.

  var MIME = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4',
    aac: 'audio/aac', flac: 'audio/flac', weba: 'audio/webm', amr: 'audio/amr', m4b: 'audio/mp4', wma: 'audio/x-ms-wma',
    mka: 'audio/x-matroska', mid: 'audio/midi', midi: 'audio/midi', aif: 'audio/aiff', aiff: 'audio/aiff',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
    '3gp': 'video/3gpp', ogv: 'video/ogg'
  };
  var VIDEO = { mp4: 1, m4v: 1, webm: 1, mkv: 1, mov: 1, '3gp': 1, ogv: 1 };

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function size(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function current() {
    var id = LN.editor && LN.editor.currentId ? LN.editor.currentId() : null;
    var n = id ? LN.vault.get(id) : null;
    return n || { name: 'file' };
  }
  function button(bar, text, label, fn) {
    var b = make('button', '', text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  }

  // ---------- audio and video ----------
  function mountMedia(el, bytes, api) {
    el.textContent = '';
    el.classList.add('vw');
    var n = current();
    var e = LN.ext(n.name);
    var type = MIME[e] || 'application/octet-stream';
    var url = URL.createObjectURL(new Blob([bytes], { type: type }));
    var bar = make('div', 'vw-bar');
    bar.appendChild(make('span', 'vw-note', n.name + ' · ' + size(bytes.length)));
    var wrap = make('div', 'media-wrap');
    var m = document.createElement(VIDEO[e] ? 'video' : 'audio');
    m.className = VIDEO[e] ? 'media-video' : 'media-audio';
    m.controls = true;
    m.preload = 'metadata';
    if (VIDEO[e]) m.setAttribute('playsinline', '');
    var msg = make('div', 'media-msg', '');
    m.addEventListener('error', function () {
      msg.textContent = 'This device can\'t play this ' + (e || 'media') + ' file. Export it and open it in a media app.';
    });
    m.src = url;
    wrap.appendChild(m);
    wrap.appendChild(msg);
    el.appendChild(bar);
    el.appendChild(wrap);
    return {
      bytes: function () { return bytes; },
      destroy: function () {
        try { m.pause(); } catch (x) { /* nothing playing */ }
        m.removeAttribute('src');
        try { m.load(); } catch (x2) { /* already unloaded */ }
        try { URL.revokeObjectURL(url); } catch (x3) { /* already gone */ }
        el.textContent = '';
        el.classList.remove('vw');
      }
    };
  }

  // ---------- readable documents ----------
  var enc1252 = null;
  function latin(bytes) {
    try { enc1252 = enc1252 || new TextDecoder('windows-1252'); return enc1252.decode(bytes); }
    catch (e) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
  }

  function odfInline(n) {
    var out = '';
    Array.prototype.forEach.call(n.childNodes, function (c) {
      if (c.nodeType === 3) out += c.data;
      else if (c.nodeType === 1) {
        if (c.localName === 's') out += new Array((parseInt(c.getAttribute('text:c'), 10) || 1) + 1).join(' ');
        else if (c.localName === 'tab') out += '\t';
        else if (c.localName === 'line-break') out += '\n';
        else out += odfInline(c);
      }
    });
    return out;
  }

  function odfText(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('The document XML is damaged');
    var out = [], slide = 0;
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType !== 1) return;
        var l = c.localName;
        if (l === 'h') out.push('# ' + odfInline(c));
        else if (l === 'p') out.push(odfInline(c));
        else if (l === 'table-row') {
          var cells = [];
          Array.prototype.forEach.call(c.childNodes, function (k) {
            if (k.nodeType === 1 && (k.localName === 'table-cell' || k.localName === 'covered-table-cell')) {
              var parts = [];
              Array.prototype.forEach.call(k.childNodes, function (q) { if (q.nodeType === 1) parts.push(odfInline(q)); });
              cells.push(parts.join(' '));
            }
          });
          while (cells.length && cells[cells.length - 1] === '') cells.pop();
          if (cells.length) out.push(cells.join(' | '));
        } else if (l === 'table') {
          out.push('', '[Table ' + (c.getAttribute('table:name') || '') + ']');
          walk(c);
          out.push('');
        } else if (l === 'page') {
          slide++;
          out.push('', '--- Slide ' + slide + ' ---');
          walk(c);
        } else walk(c);
      });
    })(doc.documentElement);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function htmlText(src) {
    var doc = new DOMParser().parseFromString(src, 'text/html');
    var body = doc.body || doc.documentElement;
    Array.prototype.forEach.call(body.querySelectorAll('script,style,svg,img'), function (x) { x.parentNode.removeChild(x); });
    var BLOCK = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, LI: 1, TR: 1, BR: 1, BLOCKQUOTE: 1, PRE: 1, SECTION: 1, ARTICLE: 1, UL: 1, OL: 1, TABLE: 1 };
    var out = '';
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) out += c.data.replace(/\s+/g, ' ');
        else if (c.nodeType === 1) {
          var tag = c.tagName.toUpperCase();
          var b = BLOCK[tag];
          if (b) out += '\n';
          if (/^H[1-6]$/.test(tag)) out += '\n';
          walk(c);
          if (b) out += '\n';
        }
      });
    })(body);
    return out.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
  function joinPath(base, rel) {
    var parts = (base + rel).split('/'), out = [];
    parts.forEach(function (x) { if (x === '..') out.pop(); else if (x !== '.' && x !== '') out.push(x); });
    return out.join('/');
  }

  function epubChapters(pkg) {
    return pkg.text('META-INF/container.xml').then(function (cx) {
      var c = new DOMParser().parseFromString(cx, 'application/xml');
      var rf = c.getElementsByTagName('rootfile')[0];
      var opfPath = rf ? rf.getAttribute('full-path') : '';
      if (!opfPath || !pkg.has(opfPath)) throw new Error('This book has no package file');
      return pkg.text(opfPath).then(function (ox) {
        var o = new DOMParser().parseFromString(ox, 'application/xml');
        var base = dirOf(opfPath), manifest = {}, list = [];
        Array.prototype.forEach.call(o.getElementsByTagName('item'), function (it) { manifest[it.getAttribute('id')] = it.getAttribute('href'); });
        Array.prototype.forEach.call(o.getElementsByTagName('itemref'), function (r) {
          var href = manifest[r.getAttribute('idref')];
          if (href) {
            var path = joinPath(base, decodeURI(href.split('#')[0]));
            if (pkg.has(path)) list.push(path);
          }
        });
        if (!list.length) throw new Error('This book has no readable chapters');
        return list;
      });
    });
  }

  function rtfText(bytes) {
    var s = latin(bytes), out = '', i = 0, n = s.length;
    var stack = [], skip = 0, uc = 1, skipChars = 0;
    var DEST = { fonttbl: 1, colortbl: 1, stylesheet: 1, info: 1, pict: 1, header: 1, footer: 1, object: 1, themedata: 1, colorschememapping: 1, latentstyles: 1, datastore: 1, listtable: 1, listoverridetable: 1, rsidtbl: 1, generator: 1 };
    var cp1252 = new TextDecoder('windows-1252');
    while (i < n) {
      var ch = s.charAt(i);
      if (ch === '{') { stack.push({ skip: skip, uc: uc }); i++; if (s.charAt(i) === '\\' && s.charAt(i + 1) === '*') { skip++; } }
      else if (ch === '}') { var t = stack.pop(); if (t) { skip = t.skip; uc = t.uc; } i++; }
      else if (ch === '\\') {
        i++;
        var c = s.charAt(i);
        if (c === '\\' || c === '{' || c === '}') { if (!skip && !skipChars) out += c; else if (skipChars) skipChars--; i++; }
        else if (c === '\'') {
          var hex = parseInt(s.substr(i + 1, 2), 16);
          i += 3;
          if (skipChars) skipChars--;
          else if (!skip && !isNaN(hex)) out += cp1252.decode(new Uint8Array([hex]));
        } else if (c === '~') { if (!skip) out += ' '; i++; }
        else if (c === '-' || c === '_') { if (!skip && c === '_') out += '-'; i++; }
        else if (/[a-zA-Z]/.test(c)) {
          var j = i;
          while (j < n && /[a-zA-Z]/.test(s.charAt(j))) j++;
          var word = s.slice(i, j), k = j;
          if (s.charAt(k) === '-') k++;
          while (k < n && /[0-9]/.test(s.charAt(k))) k++;
          var param = s.slice(j, k);
          if (s.charAt(k) === ' ') k++;
          i = k;
          if (DEST[word]) skip++;
          else if (word === 'uc') uc = parseInt(param, 10) || 0;
          else if (word === 'u') {
            var cc = parseInt(param, 10);
            if (cc < 0) cc += 65536;
            if (!skip && !isNaN(cc)) out += String.fromCharCode(cc);
            skipChars = uc;
          } else if (!skip) {
            if (word === 'par' || word === 'line' || word === 'row') out += '\n';
            else if (word === 'tab' || word === 'cell') out += '\t';
            else if (word === 'emdash') out += '—';
            else if (word === 'endash') out += '–';
            else if (word === 'lquote') out += '‘';
            else if (word === 'rquote') out += '’';
            else if (word === 'ldblquote') out += '“';
            else if (word === 'rdblquote') out += '”';
            else if (word === 'bullet') out += '•';
          }
        } else i++;
      } else if (ch === '\r' || ch === '\n') i++;
      else {
        if (skipChars) skipChars--;
        else if (!skip) out += ch;
        i++;
      }
    }
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  function mountDoc(el, bytes, api) {
    el.textContent = '';
    el.classList.add('vw');
    var n = current();
    var e = LN.ext(n.name);
    var bar = make('div', 'vw-bar');
    var note = make('span', 'vw-note', n.name + ' · ' + size(bytes.length));
    var body = make('pre', 'doc-text', 'Reading...');
    var text = '';
    var dead = false;
    var chapters = null, at = 0, pkg = null;

    var save = button(bar, 'Save as text note', 'Save the text as a note', function () {
      if (text && api.createNote) api.createNote(text);
    });
    save.disabled = true;
    var prev = null, next = null;

    function show(t) {
      text = t;
      body.textContent = t || '(No readable text found in this file)';
      save.disabled = !t;
    }
    function failed(err) {
      if (dead) return;
      body.textContent = 'Could not read this file. ' + (err && err.message ? err.message : '');
    }

    function chapter(i) {
      if (!chapters) return;
      at = Math.max(0, Math.min(chapters.length - 1, i));
      note.textContent = n.name + ' · chapter ' + (at + 1) + ' of ' + chapters.length;
      prev.disabled = at === 0;
      next.disabled = at === chapters.length - 1;
      pkg.text(chapters[at]).then(function (src) {
        if (dead) return;
        show(htmlText(src));
        body.scrollTop = 0;
        el.scrollTop = 0;
      }).catch(failed);
    }

    bar.appendChild(note);
    el.appendChild(bar);
    el.appendChild(body);

    try {
      if (e === 'rtf') {
        show(rtfText(bytes));
      } else {
        pkg = LN.zip.parse(bytes);
        if (e === 'epub') {
          prev = button(bar, 'Prev', 'Previous chapter', function () { chapter(at - 1); });
          next = button(bar, 'Next', 'Next chapter', function () { chapter(at + 1); });
          prev.disabled = next.disabled = true;
          epubChapters(pkg).then(function (list) { if (!dead) { chapters = list; chapter(0); } }).catch(failed);
        } else {
          var part = pkg.has('content.xml') ? 'content.xml' : '';
          if (!part) throw new Error('This is not an OpenDocument file');
          pkg.text(part).then(function (xml) { if (!dead) show(odfText(xml)); }).catch(failed);
        }
      }
    } catch (err) { failed(err); }

    return {
      bytes: function () { return bytes; },
      destroy: function () { dead = true; el.textContent = ''; el.classList.remove('vw'); }
    };
  }

  // ---------- any other binary ----------
  var MAGIC = [
    [[0x25, 0x50, 0x44, 0x46], 'PDF document'],
    [[0x50, 0x4B, 0x03, 0x04], 'ZIP archive (also APK, JAR, Office and OpenDocument files)'],
    [[0x89, 0x50, 0x4E, 0x47], 'PNG image'],
    [[0xFF, 0xD8, 0xFF], 'JPEG image'],
    [[0x47, 0x49, 0x46, 0x38], 'GIF image'],
    [[0x1F, 0x8B], 'GZIP compressed data'],
    [[0x37, 0x7A, 0xBC, 0xAF], '7-Zip archive'],
    [[0x52, 0x61, 0x72, 0x21], 'RAR archive'],
    [[0x7F, 0x45, 0x4C, 0x46], 'ELF executable'],
    [[0x53, 0x51, 0x4C, 0x69], 'SQLite database'],
    [[0x49, 0x44, 0x33], 'MP3 audio with ID3 tag'],
    [[0x4F, 0x67, 0x67, 0x53], 'Ogg media'],
    [[0x66, 0x4C, 0x61, 0x43], 'FLAC audio'],
    [[0x4D, 0x5A], 'Windows executable'],
    [[0xD0, 0xCF, 0x11, 0xE0], 'Legacy Office file (doc, xls, ppt)'],
    [[0x42, 0x4D], 'BMP image'],
    [[0x64, 0x65, 0x78, 0x0A], 'Android DEX code'],
    [[0x00, 0x01, 0x00, 0x00], 'TrueType font'],
    [[0x77, 0x4F, 0x46, 0x46], 'WOFF font'],
    [[0x77, 0x4F, 0x46, 0x32], 'WOFF2 font']
  ];
  function detect(u) {
    for (var i = 0; i < MAGIC.length; i++) {
      var m = MAGIC[i][0], ok = u.length >= m.length;
      for (var j = 0; ok && j < m.length; j++) if (u[j] !== m[j]) ok = false;
      if (ok) return MAGIC[i][1];
    }
    if (u.length > 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46) {
      var t = String.fromCharCode(u[8], u[9], u[10], u[11]);
      return t === 'WAVE' ? 'WAV audio' : (t === 'WEBP' ? 'WebP image' : 'RIFF container (' + t + ')');
    }
    if (u.length > 12 && u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70) return 'MP4 / QuickTime media';
    return 'Unknown binary data';
  }

  var STRINGS_MAX = 400000;
  function strings(u) {
    var out = [], total = 0, cur = '', i, b;
    function flush() { if (cur.length >= 4) { out.push(cur); total += cur.length + 1; } cur = ''; }
    for (i = 0; i < u.length && total < STRINGS_MAX; i++) {
      b = u[i];
      if (b >= 32 && b < 127) cur += String.fromCharCode(b); else flush();
    }
    flush();
    var wide = [];
    cur = '';
    for (i = 0; i + 1 < u.length && total < STRINGS_MAX * 2; i += 2) {
      if (u[i] >= 32 && u[i] < 127 && u[i + 1] === 0) cur += String.fromCharCode(u[i]);
      else { if (cur.length >= 4) { wide.push(cur); total += cur.length + 1; } cur = ''; }
    }
    if (cur.length >= 4) wide.push(cur);
    return out.concat(wide).join('\n');
  }

  var PAGE = 2048;
  function hexPage(u, page) {
    var from = page * PAGE, to = Math.min(u.length, from + PAGE), lines = [];
    for (var o = from; o < to; o += 16) {
      var h = '', a = '';
      for (var k = 0; k < 16; k++) {
        if (o + k < to) {
          var v = u[o + k];
          h += (v < 16 ? '0' : '') + v.toString(16) + ' ';
          a += v >= 32 && v < 127 ? String.fromCharCode(v) : '.';
        } else h += '   ';
        if (k === 7) h += ' ';
      }
      var off = o.toString(16);
      lines.push('00000000'.slice(off.length) + off + '  ' + h + ' |' + a + '|');
    }
    return lines.join('\n');
  }

  function mountBin(el, bytes, api) {
    el.textContent = '';
    el.classList.add('vw');
    var n = current();
    var bar = make('div', 'vw-bar');
    var tabs = make('div', 'vw-tabs');
    var body = make('pre', 'doc-text bin-text', '');
    var nav = make('div', 'vw-bar bin-nav');
    var mode = 'info', page = 0, strs = null, listing = null;
    var pages = Math.max(1, Math.ceil(bytes.length / PAGE));
    var btns = {};

    function setTab(m) {
      mode = m;
      Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === m); });
      nav.hidden = m !== 'hex';
      draw();
    }
    ['info', 'text', 'hex'].forEach(function (m) {
      btns[m] = button(tabs, m === 'info' ? 'Info' : (m === 'text' ? 'Text' : 'Hex'), 'Show ' + m, function () { setTab(m); });
    });
    var save = button(tabs, 'Save text as note', 'Save the readable text as a note', function () {
      strs = strs === null ? strings(bytes) : strs;
      if (strs && api.createNote) api.createNote(strs);
      else LN.toast('No readable text in this file');
    });
    bar.appendChild(tabs);

    var pos = make('span', 'vw-note', '');
    var pv = button(nav, 'Prev', 'Previous page', function () { if (page > 0) { page--; draw(); } });
    button(nav, 'Next', 'Next page', function () { if (page < pages - 1) { page++; draw(); } });
    nav.appendChild(pos);

    function infoText() {
      var lines = [
        'Name:  ' + n.name,
        'Size:  ' + size(bytes.length) + ' (' + bytes.length + ' bytes)',
        'Type:  ' + detect(bytes),
        '',
        'This file is stored as it came in and can be exported unchanged.',
        'Text shows the readable strings inside it; Hex shows the raw bytes.'
      ];
      if (listing && listing.length) {
        lines.push('', 'Archive contents (' + listing.length + ' entries):');
        listing.slice(0, 500).forEach(function (x) { lines.push('  ' + x.name + '  (' + size(x.usize) + ')'); });
        if (listing.length > 500) lines.push('  ... and ' + (listing.length - 500) + ' more');
      }
      return lines.join('\n');
    }
    function draw() {
      if (mode === 'info') body.textContent = infoText();
      else if (mode === 'text') {
        if (strs === null) strs = strings(bytes);
        body.textContent = strs || '(No readable text found in this file)';
      } else {
        pos.textContent = 'Page ' + (page + 1) + ' of ' + pages;
        pv.disabled = page === 0;
        body.textContent = hexPage(bytes, page);
      }
    }

    if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B) {
      try { listing = LN.zip.parse(bytes).list.filter(function (x) { return !/\/$/.test(x.name); }); } catch (err) { listing = null; }
    }

    el.appendChild(bar);
    el.appendChild(nav);
    el.appendChild(body);
    setTab('info');

    return {
      bytes: function () { return bytes; },
      destroy: function () { el.textContent = ''; el.classList.remove('vw'); }
    };
  }

  LN.mediav = { mount: mountMedia };
  LN.docv = { mount: mountDoc, rtfText: rtfText, odfText: odfText, htmlText: htmlText };
  LN.binv = { mount: mountBin, detect: detect, strings: strings, hexPage: hexPage };
})(window.LN = window.LN || {});
