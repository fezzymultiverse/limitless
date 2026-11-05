(function (LN) {
  'use strict';
  // V0.7.22: a soundtrack for a note.
  //  - "Add audio" (in the AI strip above the note) copies an audio file from the phone into Attachments/Music in the vault
  //    and writes one line, `soundtrack:: file.mp3`, at the top of the note (after any frontmatter).
  //  - While a note with that line is open, a minimal player sits at the bottom: play/pause, progress bar (tap or drag to seek),
  //    time, and a remove button (takes the line out of the note, the file stays in the vault).
  //  - Not built: pasting a YouTube link and saving its audio. The app has no server, and saving YouTube audio is against YouTube's terms.
  var MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', weba: 'audio/webm' };
  var LINE_RX = /^soundtrack::[ \t]*(.+?)[ \t]*$/mi;
  var bar = null, playBtn = null, range = null, nameEl = null, timeEl = null, audio = null;
  var url = null, curId = null, curName = null, lastAll = null, seeking = false, timer = 0, inputTimer = 0;

  function say(m) { if (LN.toast) LN.toast(m); }
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function frontEnd(t) {
    if (!/^---[ \t]*\r?\n/.test(t)) return 0;
    var re = /\r?\n---[ \t]*(\r?\n|$)/g;
    re.lastIndex = 3;
    var m = re.exec(t);
    return m ? m.index + m[0].length : 0;
  }
  function parse(text) {
    var m = LINE_RX.exec(text);
    return m ? m[1].replace(/^\[\[|\]\]$/g, '').trim() : null;
  }

  // ---------- vault ----------
  function child(parent, name) {
    var l = name.toLowerCase();
    return LN.vault.children(parent || null).filter(function (n) { return n.type === 'folder' && n.name.toLowerCase() === l; })[0] || null;
  }
  function ensure(parent, name) {
    var hit = child(parent, name);
    if (hit) return Promise.resolve(hit.id);
    return LN.vault.create('folder', name, parent || null).then(function (f) { return f.id; });
  }
  function findAudio(name) {
    var l = name.toLowerCase(), best = null;
    LN.vault.all().forEach(function (n) {
      if (n.type !== 'file' || !n.bytes || n.name.toLowerCase() !== l) return;
      var p = n.parent ? LN.vault.get(n.parent) : null;
      if (!best || (p && p.name.toLowerCase() === 'music')) best = n;
    });
    return best;
  }

  // ---------- note text ----------
  function insertAt(pos, text, to) {
    var ta = document.getElementById('editor');
    if (!ta) return false;
    var end = to == null ? pos : to;
    try { ta.setSelectionRange(pos, end); } catch (e) { return false; }
    return LN.editor.insertText(text, end > pos);
  }
  function setLine(name) {
    var sel = LN.editor.selection();
    if (!sel) return false;
    var text = sel.all, m = /^soundtrack::.*(\r?\n|$)/mi.exec(text);
    if (m) return insertAt(m.index, 'soundtrack:: ' + name + (m[1] || '\n'), m.index + m[0].length);
    var at = frontEnd(text);
    return insertAt(at, 'soundtrack:: ' + name + '\n');
  }
  function removeLine() {
    var sel = LN.editor.selection();
    if (!sel) return;
    var m = /^soundtrack::.*(\r?\n|$)/mi.exec(sel.all);
    if (m) insertAt(m.index, '', m.index + m[0].length);
    refresh(true);
  }

  // ---------- adding audio ----------
  function pick() {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac';
      inp.addEventListener('change', function () { resolve((inp.files && inp.files[0]) || null); });
      inp.addEventListener('cancel', function () { resolve(null); });
      inp.click();
    });
  }
  function addAudio() {
    if (!LN.editor || !LN.editor.selection || !LN.editor.selection()) { say('Open a text note first'); return Promise.resolve(); }
    var id = LN.editor.currentId();
    return pick().then(function (f) {
      if (!f) return;
      return f.arrayBuffer().then(function (buf) {
        return ensure(null, 'Attachments').then(function (rid) { return ensure(rid, 'Music'); }).then(function (fid) {
          return LN.vault.importFile(f.name, fid, new Uint8Array(buf));
        });
      }).then(function (n) {
        if (LN.tree && LN.tree.render) LN.tree.render();
        if (LN.editor.currentId() !== id) { say('Audio saved in Attachments/Music. The note changed, so it was not attached.'); return; }
        if (setLine(n.name)) { say('Audio added'); refresh(true); }
      });
    }).catch(function (e) { say(e && e.message ? e.message : 'Could not add the audio.'); });
  }

  // ---------- player ----------
  function build() {
    var btb = document.getElementById('btb');
    if (!btb || !btb.parentNode || bar) return;
    bar = document.createElement('div');
    bar.id = 'soundtrack';
    bar.className = 'soundtrack';
    bar.hidden = true;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Note soundtrack');
    playBtn = document.createElement('button');
    playBtn.type = 'button'; playBtn.className = 'st-play'; playBtn.textContent = '\u25B6';
    playBtn.setAttribute('aria-label', 'Play');
    var mid = document.createElement('div'); mid.className = 'st-mid';
    nameEl = document.createElement('div'); nameEl.className = 'st-name';
    range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '1000'; range.step = '1'; range.value = '0';
    range.setAttribute('aria-label', 'Progress');
    mid.appendChild(nameEl); mid.appendChild(range);
    timeEl = document.createElement('div'); timeEl.className = 'st-time'; timeEl.textContent = '0:00 / 0:00';
    var rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'st-rm'; rm.textContent = '\u2715';
    rm.setAttribute('aria-label', 'Remove soundtrack from this note');
    bar.appendChild(playBtn); bar.appendChild(mid); bar.appendChild(timeEl); bar.appendChild(rm);
    btb.parentNode.insertBefore(bar, btb);

    playBtn.addEventListener('click', function () {
      if (!audio) return;
      if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () { say('This phone cannot play that file.'); }); }
      else audio.pause();
    });
    range.addEventListener('input', function () {
      seeking = true;
      if (audio && isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = (range.value / 1000) * audio.duration;
        paintTime();
      }
    });
    range.addEventListener('change', function () { seeking = false; });
    rm.addEventListener('click', removeLine);
  }

  function paintTime() {
    if (!audio || !timeEl) return;
    timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
    if (!seeking && isFinite(audio.duration) && audio.duration > 0) range.value = String(Math.round(audio.currentTime / audio.duration * 1000));
  }
  function paintPlay() {
    if (!playBtn || !audio) return;
    var playing = !audio.paused && !audio.ended;
    playBtn.textContent = playing ? '\u275A\u275A' : '\u25B6';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function unload() {
    if (audio) {
      try { audio.pause(); } catch (e) { /* nothing playing */ }
      audio.removeAttribute('src');
      try { audio.load(); } catch (e2) { /* already unloaded */ }
      audio = null;
    }
    if (url) { try { URL.revokeObjectURL(url); } catch (e3) { /* already gone */ } url = null; }
    curId = null; curName = null;
    if (bar) bar.hidden = true;
  }

  function load(id, name) {
    unload();
    curId = id; curName = name;
    bar.hidden = false;
    nameEl.textContent = name;
    range.value = '0';
    timeEl.textContent = '0:00 / 0:00';
    playBtn.textContent = '\u25B6';
    var n = findAudio(name);
    if (!n) { nameEl.textContent = name + ' (file not found in the vault)'; playBtn.disabled = true; range.disabled = true; return; }
    playBtn.disabled = false; range.disabled = false;
    var ext = LN.ext ? LN.ext(n.name) : '';
    url = URL.createObjectURL(new Blob([n.bytes], { type: MIME[ext] || 'audio/mpeg' }));
    audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('timeupdate', paintTime);
    audio.addEventListener('loadedmetadata', paintTime);
    audio.addEventListener('play', paintPlay);
    audio.addEventListener('pause', paintPlay);
    audio.addEventListener('ended', function () { audio.currentTime = 0; paintPlay(); paintTime(); });
    audio.addEventListener('error', function () { nameEl.textContent = name + ' (this phone cannot play it)'; });
    audio.src = url;
  }

  // Looks at the open note and shows, changes or hides the player. force re-reads even when the text looks the same.
  function refresh(force) {
    if (!bar) return;
    var id = LN.editor && LN.editor.currentId ? LN.editor.currentId() : null;
    var sel = id && LN.editor.selection ? LN.editor.selection() : null;
    if (!sel) { lastAll = null; if (curId) unload(); return; }
    if (!force && id === curId && sel.all === lastAll) return;
    lastAll = sel.all;
    var name = parse(sel.all);
    if (!name) { if (curId) unload(); return; }
    if (id === curId && name === curName && !force) return;
    if (id === curId && name === curName && audio) return;
    load(id, name);
  }

  function init() {
    build();
    if (LN.noteai && LN.noteai.addButton) LN.noteai.addButton('\uD83C\uDFB5 Add audio', addAudio, 'audio');
    var ta = document.getElementById('editor');
    if (ta) ta.addEventListener('input', function () {
      if (inputTimer) clearTimeout(inputTimer);
      inputTimer = setTimeout(function () { inputTimer = 0; refresh(false); }, 700);
    });
    timer = setInterval(function () { refresh(false); }, 600);
  }
  init();

  LN.soundtrack = { add: addAudio, refresh: refresh, remove: removeLine, _t: { parse: parse, frontEnd: frontEnd, fmt: fmt } };
})(window.LN = window.LN || {});
