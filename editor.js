(function (LN) {
  'use strict';

  var ta, pv, stage, toolbar, btb, fileEl, statsEl, saveEl, attachmentEl;
  var IDLE_LINE = 'S.O.I. \u00d7 Bojack Security \u00b7 999';   // V0.7.17: shown in the footer while no file is open
  var attachmentUrl = null;
  var attachmentToken = 0;
  var cur = null;
  var timer = null;
  var pending = false;
  var kind = 'md';
  var mode = 'edit';
  var viewer = null;
  var frame = null;

  var DEFAULT_MODE = { md: null, html: 'split', csv: 'preview', data: 'edit', text: 'edit', bin: 'preview' };
  var VIEWERS = { pdf: 'pdfv', pptx: 'pptx', docx: 'docx', xlsx: 'xlsx', img: 'imgv', doc: 'docv', media: 'mediav', bin: 'binv' };

  function group(k) { return LN.isBin(k) ? 'bin' : k; }

  function setMode(m, persist) {
    mode = m;
    stage.dataset.mode = m;
    var b = toolbar.querySelectorAll('.seg button');
    for (var i = 0; i < b.length; i++) {
      var on = b[i].dataset.mode === m;
      b[i].classList.toggle('on', on);
      b[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (persist && kind === 'md') LN.store.set('viewMode', m);
    placeSeg();
    updateBar();
    renderPreview();
    captureSoon();
  }

  // Slides the highlight under the active view mode button. Skipped while the bar is hidden (width 0).
  function placeSeg() {
    var seg = toolbar && toolbar.querySelector('.seg');
    if (!seg) return;
    var on = seg.querySelector('button.on');
    if (!on || !on.offsetWidth) { seg.removeAttribute('data-ready'); seg.removeAttribute('data-anim'); return; }
    var first = !seg.hasAttribute('data-ready');
    seg.style.setProperty('--sx', on.offsetLeft + 'px');
    seg.style.setProperty('--sw', on.offsetWidth + 'px');
    seg.setAttribute('data-ready', '1');
    if (first) { window.requestAnimationFrame(function () { seg.setAttribute('data-anim', '1'); }); }
  }

  // HTML reader (V0.7.2). Scripts run inside an isolated runner page (htmlrun.html, sandbox allow-scripts, no network,
  // no access to the app). If the runner does not answer in time, or Settings > Editor turns scripts off, the page is
  // shown as static HTML in a fully sandboxed frame, which is what older versions did.
  var htmlTimer = null, htmlHandler = null, htmlLast = null;

  function staticFrame(html) {
    var f = document.createElement('iframe');
    f.setAttribute('sandbox', '');
    f.title = 'HTML preview';
    pv.textContent = '';
    pv.appendChild(f);
    f.srcdoc = html;
    frame = f;
  }

  function dropHtmlWait() {
    if (htmlTimer) { clearTimeout(htmlTimer); htmlTimer = null; }
    if (htmlHandler) { window.removeEventListener('message', htmlHandler); htmlHandler = null; }
  }

  function showHtml(html) {
    if (html === htmlLast && frame && frame.parentNode === pv) return;
    htmlLast = html;
    dropHtmlWait();
    if (LN.store.get('htmlScripts') === false) { staticFrame(html); return; }
    var f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.title = 'HTML preview';
    var settled = false;
    htmlHandler = function (e) {
      if (e.source !== f.contentWindow || !e.data || e.data.t !== 'ln-ready' || settled) return;
      settled = true;
      dropHtmlWait();
      f.contentWindow.postMessage({ t: 'ln-html', html: html }, '*');
    };
    window.addEventListener('message', htmlHandler);
    htmlTimer = setTimeout(function () {
      if (settled) return;
      settled = true;
      dropHtmlWait();
      staticFrame(html);
    }, 2500);
    pv.textContent = '';
    pv.appendChild(f);
    frame = f;
    f.src = 'htmlrun.html';
  }

  // V0.7.8: while you type, the preview waits for a short pause instead of rebuilding on every key.
  // Long notes and html pages wait a little longer. Everything else (mode switch, opening a file) renders at once.
  var pvTimer = null;
  function renderPreviewSoon() {
    if (mode === 'edit') return;
    if (pvTimer) clearTimeout(pvTimer);
    var wait = Math.min(700, 120 + Math.floor(ta.value.length / 60));
    if (kind === 'html') wait = Math.max(450, wait);
    pvTimer = setTimeout(function () { pvTimer = null; renderPreview(); }, wait);
  }

  function renderPreview() {
    if (pvTimer) { clearTimeout(pvTimer); pvTimer = null; }
    if (mode === 'edit') return;
    var keepTop = pv.scrollTop;
    if (kind === 'md') {
      pv.innerHTML = LN.md.render(ta.value, { copy: true });
      if (LN.hl) LN.hl.bind(pv);
      if (LN.imgv) LN.imgv.hydrate(pv);
      if (LN.plugins) LN.plugins.hydrate(pv);
    } else if (kind === 'html') {
      showHtml(ta.value);
    } else if (kind === 'csv') {
      var n = LN.vault.get(cur);
      LN.csv.table(pv, ta.value, n ? n.name : '', function (text) { ta.value = text; textChanged(true); });
    } else if (kind === 'data') {
      var dn = LN.vault.get(cur);
      LN.datav.tree(pv, ta.value, dn ? dn.name : '', function (text) { ta.value = text; textChanged(true); });
    }
    if (keepTop && kind !== 'html' && pv.scrollTop !== keepTop) pv.scrollTop = keepTop;
  }

  // No arrays and no slices: a plain scan, so a long note costs microseconds instead of a pause.
  function stats() {
    var v = ta.value;
    var n = v.length;
    var words = 0, inWord = false;
    for (var i = 0; i < n; i++) {
      var c = v.charCodeAt(i);
      if (c === 32 || c === 10 || c === 9 || c === 13 || c === 12 || c === 160) inWord = false;
      else if (!inWord) { inWord = true; words++; }
    }
    var caret = ta.selectionStart;
    var line = 1, last = -1, at = v.indexOf('\n');
    while (at >= 0 && at < caret) { line++; last = at; at = v.indexOf('\n', at + 1); }
    statsEl.textContent = words + ' words · ' + n + ' chars · Ln ' + line + ', Col ' + (caret - last);
  }
  var stTimer = null;
  function statsSoon() {
    if (stTimer) return;
    stTimer = setTimeout(function () { stTimer = null; stats(); }, 150);
  }

  // Only touches the page when the label really changes, so typing does not re-layout the status bar on every key.
  var lastSave = null;
  function setSave(text, ok) {
    var key = (ok ? '1' : '0') + text;
    if (key === lastSave) return;
    lastSave = key;
    saveEl.textContent = text;
    saveEl.className = ok ? 'ok' : '';
  }

  function saved(id) {
    LN.tabs.setDirty(id, false);
    if (cur === id && !pending) setSave('Saved', true);
  }

  function failed(e) { LN.toast('Couldn\'t save. ' + (e && e.message ? e.message : 'Try again')); }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (LN.wiping) { pending = false; return Promise.resolve(); }
    if (!pending || !cur) return Promise.resolve();
    pending = false;
    var id = cur;
    if (viewer) {
      return viewer.bytes().then(function (b) { return LN.vault.updateBlob(id, b); }).then(function () { saved(id); }).catch(failed);
    }
    return LN.vault.update(id, ta.value).then(function () { saved(id); }).catch(failed);
  }

  function markDirty(delay) {
    pending = true;
    LN.tabs.setDirty(cur, true);
    setSave('Saving…', false);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  function textChanged(fromTable) {
    if (!cur) return;
    if (!applying) scheduleSnap();
    markDirty(LN.store.get('autosaveMs') || 500);
    if (!fromTable) renderPreviewSoon();
    statsSoon();
    if (LN.editprefs) LN.editprefs.changed();
  }
  function onInput() { textChanged(false); }

  function refreshMeta() {
    var n = cur ? LN.vault.get(cur) : null;
    if (!n) { fileEl.textContent = IDLE_LINE; return; }
    fileEl.textContent = LN.vault.path(cur);
    var k = LN.kindOfNode(n);
    if (k !== kind) load(cur);
  }

  function labels(k) {
    var b = toolbar.querySelectorAll('.seg button');
    b[0].textContent = (k === 'csv' || k === 'data') ? 'Text' : 'Edit';
    b[2].textContent = k === 'csv' ? 'Table' : (k === 'data' ? 'Tree' : 'Preview');
  }

  function applyKind(k) {
    kind = k;
    var g = group(k);
    stage.dataset.kind = g;
    toolbar.dataset.kind = g;
    btb.dataset.kind = g;
    pv.classList.toggle('fill', k === 'html');
    labels(k);
    setMode(k === 'md' ? (LN.store.get('viewMode') || 'edit') : DEFAULT_MODE[g], false);
  }

  function clearView() {
    if (pvTimer) { clearTimeout(pvTimer); pvTimer = null; }
    if (viewer) { viewer.destroy(); viewer = null; }
    frame = null; htmlLast = null; dropHtmlWait();
    pv.textContent = '';
    pv.classList.remove('vw');
  }

  function clearAttachmentPreview() {
    attachmentToken++;
    if (attachmentUrl) { try { URL.revokeObjectURL(attachmentUrl); } catch (e) {} attachmentUrl = null; }
    if (attachmentEl) { attachmentEl.hidden = true; attachmentEl.textContent = ''; }
  }

  function showAttachmentPreview(n, k) {
    clearAttachmentPreview();
    if (!attachmentEl || !n || !LN.isBin(k)) return;
    var token = attachmentToken;
    attachmentEl.hidden = false;
    var media = document.createElement('div'); media.className = 'attachment-thumb';
    var meta = document.createElement('div'); meta.className = 'attachment-meta';
    var name = document.createElement('strong'); name.className = 'attachment-name'; name.textContent = n.name;
    var detail = document.createElement('span'); detail.className = 'attachment-detail';
    detail.textContent = String(k).toUpperCase() + ' · ' + (n.bytes ? Math.max(1, Math.round(n.bytes.length / 1024)) + ' KB' : 'Empty file');
    meta.appendChild(name); meta.appendChild(detail);
    attachmentEl.appendChild(media); attachmentEl.appendChild(meta);
    if (k === 'img' && n.bytes && n.bytes.length) {
      var ext = LN.ext(n.name); var mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' })[ext] || 'application/octet-stream';
      attachmentUrl = URL.createObjectURL(new Blob([n.bytes], { type: mime }));
      var img = document.createElement('img'); img.alt = 'Preview of ' + n.name; img.src = attachmentUrl; media.appendChild(img);
    } else if (k === 'pdf' && n.bytes && LN.pdfv && LN.pdfv.thumbnail) {
      var canvas = document.createElement('canvas'); canvas.className = 'attachment-pdf-thumb'; canvas.setAttribute('aria-label', 'First page preview'); media.appendChild(canvas);
      LN.pdfv.thumbnail(n.bytes, canvas, 220).catch(function () {
        if (token === attachmentToken) { media.textContent = 'PDF'; media.classList.add('attachment-generic'); }
      });
    } else {
      var badge = document.createElement('span'); badge.className = 'attachment-type'; badge.textContent = String(k).toUpperCase(); media.appendChild(badge);
    }
  }

  function mountViewer(n, k) {
    var api = {
      dirty: function () { if (cur === n.id) markDirty(900); },
      createNote: function (text) {
        var base = n.name.replace(/\.[^.]+$/, '') + '.txt';
        LN.vault.importFile(base, n.parent, text).then(function (f) {
          LN.tree.render();
          LN.tabs.open(f.id);
          LN.toast('Text saved as ' + f.name);
        }).catch(failed);
      }
    };
    if (!n.bytes) {
      pv.textContent = 'This file is empty. Import a real .' + k + ' file with the import button.';
      return;
    }
    viewer = LN[VIEWERS[k]].mount(pv, n.bytes, api);
  }

  function load(id) {
    flush();
    clearView();
    var n = id ? LN.vault.get(id) : null;
    if (!n || n.type !== 'file') {
      clearAttachmentPreview();
      cur = null;
      pending = false;
      ta.value = '';
      stage.setAttribute('data-empty', '1');
      toolbar.hidden = true;
      updateBar();
      fileEl.textContent = IDLE_LINE;
      statsEl.textContent = '';
      setSave('', false);
      if (LN.home) LN.home.refresh();
      return;
    }
    cur = id;
    if (LN.home) LN.home.touch(id);
    pending = false;
    var k = LN.kindOfNode(n);
    stage.removeAttribute('data-empty');
    fileEl.textContent = LN.vault.path(id);
    setSave('Saved', true);
    if (LN.isBin(k)) {
      showAttachmentPreview(n, k);
      toolbar.hidden = true;
      updateBar();
      ta.value = '';
      applyKind(k);
      statsEl.textContent = n.bytes ? Math.max(1, Math.round(n.bytes.length / 1024)) + ' KB' : '';
      mountViewer(n, k);
      return;
    }
    clearAttachmentPreview();
    toolbar.hidden = false;
    ta.value = n.content || '';
    histReset();
    applyKind(k);
    stats();
    ta.scrollTop = 0;
    if (LN.editprefs) LN.editprefs.refresh();
  }

  // V0.7.15 resume: the open note, view mode, both scroll positions and the caret are written to the vault's
  // own saved state (not session storage, which Android drops when the app is closed or reloaded). They are saved a
  // moment after each scroll, tap or key, and at once when the app is hidden, so a reload or a trip to another app
  // brings you back to the same spot.
  var resumeTimer = null;
  var resumeBlock = false;      // true while a restore is running so it cannot overwrite itself with half-loaded values

  function captureReloadState() {
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
    if (resumeBlock || !cur || !ta) return;
    try {
      LN.store.set('resume', {
        id: cur, mode: mode, at: Date.now(),
        top: LN.isBin(kind) ? 0 : Math.round(ta.scrollTop),
        pv: Math.round(pv ? pv.scrollTop : 0),
        s: LN.isBin(kind) ? 0 : ta.selectionStart, e: LN.isBin(kind) ? 0 : ta.selectionEnd
      });
    } catch (err) { /* storage can be full or blocked; the open tab is still remembered */ }
  }

  function captureSoon() {
    if (resumeBlock || resumeTimer) return;
    resumeTimer = setTimeout(captureReloadState, 350);
  }

  function restoreReloadState(id) {
    var state = null;
    try { state = LN.store.get('resume'); } catch (err) { state = null; }
    if (!state || !id || state.id !== id) return;
    resumeBlock = true;
    var apply = function () {
      try {
        if (kind === 'md' && (state.mode === 'edit' || state.mode === 'preview' || state.mode === 'split')) setMode(state.mode, true);
        if (ta && !LN.isBin(kind)) {
          var len = ta.value.length;
          try { ta.setSelectionRange(Math.min(len, Number(state.s) || 0), Math.min(len, Number(state.e) || 0)); } catch (err) { /* not a text view */ }
          ta.scrollTop = Math.max(0, Number(state.top) || 0);
        }
        if (pv && state.pv) pv.scrollTop = Math.max(0, Number(state.pv) || 0);
      } catch (err) { /* a view that cannot restore simply opens at the top */ }
    };
    apply();
    // layout is not final while the loading screen and fonts settle, so apply the position again a few times
    [60, 250, 700].forEach(function (ms) { setTimeout(apply, ms); });
    setTimeout(function () { resumeBlock = false; }, 800);
  }

  function replaceRange(a, b, text, selStart, selEnd) {
    ta.focus();
    ta.setSelectionRange(a, b);
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, a, b, 'end');
      onInput();
    }
    ta.setSelectionRange(selStart, selEnd);
    stats();
  }

  // ---------- undo and redo ----------
  // Own history, because the native one is wiped whenever the text is set from code
  // (opening a file, undoing, the csv table). Typing is grouped into steps after 600 ms of quiet;
  // every toolbar action is its own step.
  var hist = [];
  var hi = -1;
  var hTimer = null;
  var applying = false;

  function histReset() {
    if (hTimer) { clearTimeout(hTimer); hTimer = null; }
    hist = [{ v: ta.value, s: 0, e: 0 }];
    hi = 0;
    updateUndo();
  }

  function snap() {
    if (hTimer) { clearTimeout(hTimer); hTimer = null; }
    if (hi < 0 || hist[hi].v === ta.value) { updateUndo(); return; }
    hist.splice(hi + 1);
    hist.push({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd });
    if (hist.length > 300) hist.shift();
    // every step keeps a full copy of the note, so a big note keeps fewer steps (about 6 million characters in all)
    var total = 0;
    for (var k = 0; k < hist.length; k++) total += hist[k].v.length;
    while (total > 6000000 && hist.length > 2) { total -= hist[0].v.length; hist.shift(); }
    hi = hist.length - 1;
    updateUndo();
  }

  function scheduleSnap() {
    if (applying) return;
    if (hTimer) clearTimeout(hTimer);
    hTimer = setTimeout(snap, 600);
    updateUndo();
  }

  var undoBtn = null, redoBtn = null;
  function updateUndo() {
    if (!btb || hi < 0) return;
    if (!undoBtn) { undoBtn = btb.querySelector('[data-b="undo"]'); redoBtn = btb.querySelector('[data-b="redo"]'); }
    var pendingEdit = hist[hi].v !== ta.value;
    var u = !(hi > 0 || pendingEdit);
    var r = pendingEdit || hi >= hist.length - 1;
    if (undoBtn.disabled !== u) undoBtn.disabled = u;
    if (redoBtn.disabled !== r) redoBtn.disabled = r;
  }

  function applyHist() {
    var h = hist[hi];
    applying = true;
    ta.value = h.v;
    ta.setSelectionRange(Math.min(h.s, h.v.length), Math.min(h.e, h.v.length));
    textChanged(false);
    applying = false;
    updateUndo();
  }

  function undo() {
    if (!cur || LN.isBin(kind)) return;
    snap();
    if (hi <= 0) return;
    hi--;
    applyHist();
  }

  function redo() {
    if (!cur || LN.isBin(kind)) return;
    snap();
    if (hi >= hist.length - 1) return;
    hi++;
    applyHist();
  }

  // ---------- formatting ----------
  function wrap(before, after, placeholder) {
    snap();
    var v = ta.value;
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    var sel = v.slice(s, e);
    var single = before === '*' && after === '*';      // italic must not eat half of a bold pair
    var innerSel = sel.length >= before.length + after.length && sel.slice(0, before.length) === before &&
      sel.slice(sel.length - after.length) === after && !(single && (sel.charAt(1) === '*' || sel.charAt(sel.length - 2) === '*'));
    var outerSel = s >= before.length && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after &&
      !(single && (v.charAt(s - 2) === '*' || v.charAt(e + 1) === '*'));
    if (innerSel) {
      var inner = sel.slice(before.length, sel.length - after.length);
      replaceRange(s, e, inner, s, s + inner.length);
    } else if (outerSel) {
      replaceRange(s - before.length, e + after.length, sel, s - before.length, s - before.length + sel.length);
    } else {
      var body = sel || placeholder;
      replaceRange(s, e, before + body + after, s + before.length, s + before.length + body.length);
    }
    snap();
  }

  function mapLines(fn) {
    snap();
    var v = ta.value;
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    var end = (e > s && v.charAt(e - 1) === '\n') ? e - 1 : e;   // a selection ending at a line start doesn't include that line
    var a = v.lastIndexOf('\n', s - 1) + 1;
    var b = v.indexOf('\n', end);
    if (b < 0) b = v.length;
    var old = v.slice(a, b);
    var block = fn(old.split('\n')).join('\n');
    if (block === old) return;
    if (s === e) {
      var caret = Math.max(a, s + (block.length - old.length));
      replaceRange(a, b, block, caret, caret);
    } else {
      replaceRange(a, b, block, a, a + block.length);
    }
    snap();
  }

  function blank(l) { return !l.trim(); }
  function allBlank(lines) { return lines.every(blank); }
  // true when every non-blank line passes `test` (an all-blank block counts as "off")
  function allOn(lines, test) {
    if (allBlank(lines)) return false;
    return lines.every(function (l) { return blank(l) || test(l); });
  }
  var RE_BULLET = /^\s*- (?!\[[ xX]\] )/;
  var RE_TASK = /^\s*- \[[ xX]\] /;
  var RE_OPEN = /^\s*- \[ \] /;
  var RE_DONE = /^\s*- \[[xX]\] /;
  var RE_OL = /^\s*\d+\.\s/;
  var RE_QUOTE = /^\s*>/;
  var RE_LEAD = /^(\s*)(?:- (?:\[[ xX]\] )?|\d+\.\s+|>\s*)?/;

  function toggleBullet(lines) {
    if (allOn(lines, function (l) { return RE_BULLET.test(l); })) {
      return lines.map(function (l) { return blank(l) ? l : l.replace(/^(\s*)- /, '$1'); });
    }
    return lines.map(function (l) {
      if (blank(l) && !allBlank(lines)) return l;
      return RE_BULLET.test(l) ? l : l.replace(RE_LEAD, '$1- ');
    });
  }

  function toggleCheck(lines) {
    if (allOn(lines, function (l) { return RE_OPEN.test(l); })) {
      return lines.map(function (l) { return blank(l) ? l : l.replace('- [ ] ', '- [x] '); });
    }
    if (allOn(lines, function (l) { return RE_DONE.test(l); })) {
      return lines.map(function (l) { return blank(l) ? l : l.replace(/^(\s*)- \[[xX]\] /, '$1'); });
    }
    return lines.map(function (l) {
      if (blank(l) && !allBlank(lines)) return l;
      return RE_OPEN.test(l) ? l : RE_DONE.test(l) ? l.replace(/\[[xX]\]/, '[ ]') : l.replace(RE_LEAD, '$1- [ ] ');
    });
  }

  function toggleOrdered(lines) {
    if (allOn(lines, function (l) { return RE_OL.test(l); })) {
      return lines.map(function (l) { return blank(l) ? l : l.replace(/^(\s*)\d+\.\s+/, '$1'); });
    }
    var n = 0;
    return lines.map(function (l) {
      if (blank(l) && !allBlank(lines)) return l;
      n++;
      return l.replace(RE_LEAD, '$1' + n + '. ');
    });
  }

  function toggleQuote(lines) {
    if (allOn(lines, function (l) { return RE_QUOTE.test(l); })) {
      return lines.map(function (l) { return blank(l) ? l : l.replace(/^(\s*)>\s?/, '$1'); });
    }
    return lines.map(function (l) {
      if (blank(l) && !allBlank(lines)) return l;
      return RE_QUOTE.test(l) ? l : l.replace(/^(\s*)/, '$1> ');
    });
  }

  // # then ## then ### then none (based on the first non-blank line)
  function cycleHeading(lines) {
    var first = lines.filter(function (l) { return !blank(l); })[0] || '';
    var m = /^(#{1,6})\s/.exec(first);
    var level = m ? m[1].length : 0;
    var next = level >= 3 ? 0 : level + 1;
    var mark = next ? new Array(next + 1).join('#') + ' ' : '';
    return lines.map(function (l) {
      if (blank(l) && !allBlank(lines)) return l;
      return mark + l.replace(/^#{1,6}\s+/, '');
    });
  }

  function indentLines(lines) {
    return lines.map(function (l) { return blank(l) && !allBlank(lines) ? l : '  ' + l; });
  }
  function outdentLines(lines) {
    return lines.map(function (l) { return l.replace(/^(?: {1,2}|\t)/, ''); });
  }

  function insertTag() {
    snap();
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    var sel = ta.value.slice(s, e).trim();
    if (!sel) { replaceRange(s, e, '#', s + 1, s + 1); snap(); return; }
    var t = '#' + sel.replace(/^#+/, '').replace(/\s+/g, '-');
    replaceRange(s, e, t, s + t.length, s + t.length);
    snap();
  }

  function insertDivider() {
    snap();
    var v = ta.value;
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    var text = (s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '') + '---\n';
    replaceRange(s, e, text, s + text.length, s + text.length);
    snap();
  }

  function insertTable() {
    snap();
    var v = ta.value;
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '';
    var head = 'Column 1';
    var text = pre + '| ' + head + ' | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n';
    var a = s + pre.length + 2;
    replaceRange(s, e, text, a, a + head.length);
    snap();
  }

  function insertCodeBlock() {
    snap();
    var v = ta.value;
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    var sel = v.slice(s, e);
    var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '';
    var text = pre + '```\n' + sel + '\n```\n';
    var a = s + pre.length + 4;
    replaceRange(s, e, text, a, a + sel.length);
    snap();
  }

  function selectAll() {
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    stats();
  }

  function matcher(find, matchCase, flags) {
    return new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), (matchCase ? '' : 'i') + (flags || ''));
  }

  // From `from`, the next match, wrapping to the top. Returns { i, len } or null.
  function nextMatch(find, matchCase, from) {
    var re = matcher(find, matchCase, 'g');
    re.lastIndex = Math.min(from, ta.value.length);
    var m = re.exec(ta.value);
    if (!m) { re.lastIndex = 0; m = re.exec(ta.value); }
    return m ? { i: m.index, len: m[0].length } : null;
  }

  function showSelection(a, b) {
    ta.blur();
    ta.focus();
    ta.setSelectionRange(a, b);
    stats();
  }

  function findReplace() {
    var cur0 = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (cur0.indexOf('\n') >= 0) cur0 = '';
    return LN.ui.form({
      title: 'Find and replace',
      ok: 'Go',
      note: 'Spaces at the start or end of a field are ignored.',
      fields: [
        { key: 'find', label: 'Find', value: cur0, required: true },
        { key: 'rep', label: 'Replace with', value: '', placeholder: 'Leave empty to delete the matches' },
        { key: 'mode', label: 'Action', type: 'select', value: 'all', options: [['all', 'Replace all'], ['next', 'Replace next'], ['find', 'Find next']] },
        { key: 'case', label: 'Match case', type: 'select', value: 'no', options: [['no', 'No'], ['yes', 'Yes']] }
      ]
    }).then(function (v) {
      if (!v) return;
      var cs = v.case === 'yes';
      var text = ta.value;
      if (v.mode === 'all') {
        var count = 0;
        var out = text.replace(matcher(v.find, cs, 'g'), function () { count++; return v.rep; });
        if (!count) { LN.toast('No matches for "' + v.find + '"'); return; }
        snap();
        var caret = Math.min(ta.selectionStart, out.length);
        replaceRange(0, text.length, out, caret, caret);
        snap();
        LN.toast('Replaced ' + count + (count === 1 ? ' match' : ' matches'));
        return;
      }
      var m = nextMatch(v.find, cs, v.mode === 'find' ? ta.selectionEnd : ta.selectionStart);
      if (!m) { LN.toast('No matches for "' + v.find + '"'); return; }
      if (v.mode === 'find') { showSelection(m.i, m.i + m.len); return; }
      snap();
      replaceRange(m.i, m.i + m.len, v.rep, m.i, m.i + v.rep.length);
      snap();
      var n = nextMatch(v.find, cs, m.i + v.rep.length);
      if (n) showSelection(n.i, n.i + n.len);
    });
  }

  var MD_ACTS = ['table', 'codeblock', 'bold', 'italic', 'strike', 'code', 'link', 'wiki', 'heading', 'list', 'ol', 'check', 'quote', 'tag', 'hr', 'photo', 'gallery'];

  function act(name) {
    if (!cur || LN.isBin(kind)) return;
    if (name === 'options') { LN.tools.open(); return; }
    if (name === 'ai') { LN.ai.openPanel(); return; }
    if (name === 'add') { LN.addmenu.open(); return; }
    var md = kind === 'md';
    if (MD_ACTS.indexOf(name) >= 0 && !md) return;
    if (mode === 'preview') {
      if (!md) return;
      setMode('edit', true);
    }
    if (name === 'undo') undo();
    else if (name === 'redo') redo();
    else if (name === 'bold') wrap('**', '**', 'bold');
    else if (name === 'italic') wrap('*', '*', 'italic');
    else if (name === 'strike') wrap('~~', '~~', 'text');
    else if (name === 'code') wrap('`', '`', 'code');
    else if (name === 'link') wrap('[', '](https://)', 'text');
    else if (name === 'wiki') wrap('[[', ']]', 'Note name');
    else if (name === 'heading') mapLines(cycleHeading);
    else if (name === 'list') mapLines(toggleBullet);
    else if (name === 'ol') mapLines(toggleOrdered);
    else if (name === 'check') mapLines(toggleCheck);
    else if (name === 'quote') mapLines(toggleQuote);
    else if (name === 'indent') mapLines(indentLines);
    else if (name === 'outdent') mapLines(outdentLines);
    else if (name === 'table') insertTable();
    else if (name === 'codeblock') insertCodeBlock();
    else if (name === 'selectall') selectAll();
    else if (name === 'find') findReplace();
    else if (name === 'tag') insertTag();
    else if (name === 'hr') insertDivider();
    else if (name === 'photo' || name === 'gallery') {
      var p;
      try { p = name === 'gallery' ? LN.insert.gallery() : LN.insert.photo(); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).catch(function (e) { LN.toast(LN.native.msg(e)); });
    }
    if (name !== 'undo' && name !== 'redo') ta.focus();
  }

  // The bar shows for text files; for html and csv only while the text is on screen.
  function updateBar() {
    if (!btb) return;
    btb.hidden = toolbar.hidden || (kind !== 'md' && mode === 'preview');
    if (!toolbar.hidden) placeSeg();
  }

  // Keeps the layout and the bar right above the on-screen keyboard.
  function initKeyboard() {
    var vv = window.visualViewport;
    if (!vv) return;
    var root = document.documentElement;
    var baseW = window.innerWidth;
    var baseH = window.innerHeight;
    var lastPad = -1, lastOpen = null, kbRaf = 0;
    function run() {
      kbRaf = 0;
      if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = window.innerHeight; }
      baseH = Math.max(baseH, window.innerHeight);
      var open = baseH - vv.height > 120;
      // pad is only needed when the webview did not shrink itself
      var pad = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      var want = open && pad > 0 ? pad : 0;
      if (want !== lastPad) { lastPad = want; root.style.setProperty('--kb', want + 'px'); }
      if (open !== lastOpen) { lastOpen = open; document.body.classList.toggle('kb-open', open); }
    }
    // V0.7.15: one update per frame and no writes when nothing changed. Scroll events from the keyboard no longer shake the layout while typing.
    function upd() { if (!kbRaf) kbRaf = window.requestAnimationFrame(run); }
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    window.addEventListener('resize', upd);
    run();
  }

  function openNote(name) {
    var found = LN.vault.findNote(name);
    if (found) { LN.tabs.open(found.id); return; }
    var n = LN.vault.get(cur);
    var parent = n ? n.parent : null;
    var fname = /\.[A-Za-z0-9]+$/.test(name) ? name : name + '.md';
    LN.vault.create('file', fname, parent).then(function (f) {
      LN.tree.render();
      LN.tabs.open(f.id);
    }).catch(function (e) { LN.toast(e.message); });
  }

  function init() {
    ta = document.getElementById('editor');
    pv = document.getElementById('preview');
    stage = document.getElementById('stage');
    toolbar = document.getElementById('toolbar');
    btb = document.getElementById('btb');
    fileEl = document.getElementById('st-file');
    statsEl = document.getElementById('st-stats');
    saveEl = document.getElementById('st-save');
    attachmentEl = document.getElementById('attachment-preview');

    ta.addEventListener('input', onInput);
    ta.addEventListener('input', captureSoon);
    ta.addEventListener('scroll', captureSoon, { passive: true });
    ta.addEventListener('keyup', captureSoon);
    ta.addEventListener('touchend', captureSoon, { passive: true });
    pv.addEventListener('scroll', captureSoon, { passive: true });
    document.addEventListener('selectionchange', function () { if (document.activeElement === ta) captureSoon(); });
    ta.addEventListener('keyup', statsSoon);
    ta.addEventListener('click', statsSoon);
    ta.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Tab' && !e.shiftKey && !mod) {
        e.preventDefault();
        replaceRange(ta.selectionStart, ta.selectionEnd, '  ', ta.selectionStart + 2, ta.selectionStart + 2);
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flush().then(function () { LN.toast('Saved'); });
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      } else if (mod && e.key.toLowerCase() === 'b' && kind === 'md') {
        e.preventDefault(); act('bold');
      } else if (mod && e.key.toLowerCase() === 'i' && kind === 'md') {
        e.preventDefault(); act('italic');
      }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && viewer) {
        e.preventDefault();
        flush().then(function () { LN.toast('Saved'); });
      }
    });

    ta.addEventListener('beforeinput', function (e) {
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); }
      else if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); }
    });

    toolbar.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (b && b.dataset.mode) setMode(b.dataset.mode, true);
    });

    // Bottom bar: a mouse-down must not take focus from the editor or the keyboard closes.
    btb.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btb.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (b && b.dataset.b && !b.disabled) act(b.dataset.b);
    });
    initKeyboard();

    pv.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a && a.classList.contains('wl')) { e.preventDefault(); openNote(a.dataset.wl); }
    });

    document.addEventListener('visibilitychange', function () { if (document.hidden) { captureReloadState(); flush(); } });
    window.addEventListener('pagehide', function () { captureReloadState(); flush(); });
    document.addEventListener('freeze', function () { captureReloadState(); flush(); });
    window.addEventListener('blur', captureReloadState);

    // Double-tap (or double-click) on the preview opens the note for editing.
    var lastTap = { t: 0, x: 0, y: 0 };
    function toEdit(e) {
      if (!cur || kind !== 'md' || mode !== 'preview') return;
      var t = e && e.target && e.target.closest ? e.target.closest('a,button,input,summary,textarea,select,.copy,pre') : null;
      if (t) return;
      setMode('edit', true);
      try { ta.focus(); } catch (err) { /* focus is best effort */ }
    }
    pv.addEventListener('dblclick', toEdit);
    pv.addEventListener('touchend', function (e) {
      var c = e.changedTouches && e.changedTouches[0];
      if (!c) return;
      var now = Date.now();
      if (now - lastTap.t < 340 && Math.abs(c.clientX - lastTap.x) < 30 && Math.abs(c.clientY - lastTap.y) < 30) {
        lastTap.t = 0;
        toEdit(e);
      } else {
        lastTap = { t: now, x: c.clientX, y: c.clientY };
      }
    }, { passive: true });
  }

  // V0.3.0: used by the AI panel
  function selectionInfo() {
    if (!cur || LN.isBin(kind)) return null;
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    return { text: ta.value.slice(s, e), all: ta.value, start: s, end: e };
  }

  function insertText(text, replaceSel) {
    if (!cur || LN.isBin(kind)) return false;
    if (mode === 'preview') setMode('edit', false);
    snap();
    var s = ta.selectionStart;
    var e = replaceSel ? ta.selectionEnd : ta.selectionStart;
    replaceRange(s, e, text, s + text.length, s + text.length);
    snap();
    return true;
  }

  LN.editor = {
    init: init, load: load, flush: flush, refreshMeta: refreshMeta,
    currentId: function () { return cur; },
    editCurrent: function () {
      if (!cur || LN.isBin(kind)) return;
      if (kind === 'md') setMode('edit', true); else if (mode === 'preview') setMode('edit', false);
      try { ta.focus(); } catch (err) { /* focus is best effort */ }
    },
    captureReloadState: captureReloadState, restoreReloadState: restoreReloadState,
    selection: selectionInfo, insertText: insertText, undo: undo, redo: redo
  };
})(window.LN = window.LN || {});
