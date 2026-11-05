(function (LN) {
  'use strict';
  // V0.7.16 Add menu: links, voice notes, music, documents, photos and the quick inserts, from one sheet.
  // Files are copied into the vault under Attachments (Voice, Music, Documents) so they sync and back up like any note.
  var N = LN.native;
  var ROOT = 'Attachments';

  function fail(e) { LN.toast(N.msg(e)); }
  function textOpen() { return !!(LN.editor && LN.editor.selection && LN.editor.selection()); }

  function child(parent, name) {
    var l = name.toLowerCase();
    return LN.vault.children(parent || null).filter(function (n) { return n.type === 'folder' && n.name.toLowerCase() === l; })[0] || null;
  }
  function ensure(parent, name) {
    var hit = child(parent, name);
    if (hit) return Promise.resolve(hit.id);
    return LN.vault.create('folder', name, parent || null).then(function (f) { return f.id; });
  }
  function folderFor(sub) {
    return ensure(null, ROOT).then(function (rid) { return ensure(rid, sub); });
  }

  function pickFiles(accept, multiple) {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      if (accept) inp.accept = accept;
      inp.multiple = !!multiple;
      inp.addEventListener('change', function () { resolve(Array.prototype.slice.call(inp.files || [])); });
      inp.addEventListener('cancel', function () { resolve([]); });
      inp.click();
    });
  }

  function payloadOf(f, bytes) {
    if (LN.isBin(LN.kindOf(f.name))) return bytes;
    var dec = LN.decodeText ? LN.decodeText(bytes) : null;
    return dec ? dec.text : bytes;
  }

  function importInto(files, sub) {
    var done = [];
    return folderFor(sub).then(function (fid) {
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () { return f.arrayBuffer(); }).then(function (buf) {
          var u = new Uint8Array(buf);
          return LN.vault.importFile(f.name, fid, payloadOf(f, u)).then(function (n) { done.push(n); });
        });
      });
      return chain;
    }).then(function () { LN.tree.render(); return done; });
  }

  // ---------- link ----------
  function cleanUrl(raw) {
    var u = String(raw || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';        // javascript:, data: and the like are refused
    if (/^[^\s]+\.[a-z]{2,}([/?#].*)?$/i.test(u)) return 'https://' + u;
    return '';
  }
  function link() {
    var sel = LN.editor.selection();
    if (!sel) { LN.toast('Open a text note first'); return Promise.resolve(); }
    var clip = navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().catch(function () { return ''; }) : Promise.resolve('');
    return clip.then(function (c) {
      var pre = cleanUrl(String(c || '').split(/\s/)[0]);
      return LN.ui.form({
        title: 'Add a link',
        ok: 'Insert link',
        fields: [
          { key: 'url', label: 'Link', type: 'text', value: pre, placeholder: 'https://example.com' },
          { key: 'title', label: 'Title (optional)', type: 'text', value: sel.text || '', placeholder: 'Shown instead of the address' }
        ],
        note: 'Only web, email and phone links are accepted. The link goes into the note as Markdown.'
      });
    }).then(function (v) {
      if (!v) return;
      var url = cleanUrl(v.url);
      if (!url) { LN.toast('That is not a web, email or phone link'); return; }
      var title = String(v.title || '').trim().replace(/[\[\]]/g, '') || url.replace(/^https?:\/\//i, '').replace(/^mailto:|^tel:/i, '');
      LN.editor.insertText('[' + title + '](' + url + ')', true);
      LN.toast('Link added');
    });
  }

  // ---------- voice note ----------
  function pickMime() {
    if (!window.MediaRecorder) return null;
    var list = [['audio/webm;codecs=opus', 'weba'], ['audio/mp4', 'm4a'], ['audio/ogg;codecs=opus', 'ogg'], ['audio/webm', 'weba']];
    for (var i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i][0])) return list[i]; } catch (e) { /* try the next type */ }
    }
    return ['', 'weba'];
  }
  function clock(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function voice() {
    if (!textOpen()) { LN.toast('Open a text note first'); return Promise.resolve(); }
    var fmt = pickMime();
    if (!fmt || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { LN.toast('Voice recording is not available on this device'); return Promise.resolve(); }
    return LN.access.ask('mic').then(function (st) {
      if (st !== 'granted') throw new Error('Microphone is off. Allow it in Settings, Device access.');
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }).then(function (stream) {
      var chunks = [], rec, started = 0, tick = null, saving = false, discard = false;
      try { rec = fmt[0] ? new MediaRecorder(stream, { mimeType: fmt[0] }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); throw new Error('Could not start the recorder'); }
      var sh = LN.ui.sheet('Voice note', function () { if (rec.state !== 'inactive') { discard = true; try { rec.stop(); } catch (e) { /* already stopped */ } } cleanup(); });
      var big = LN.ui.el('div', 'vn-time', '0:00');
      var hint = LN.ui.el('p', 'hint', 'Recording. Tap Stop and save when you are done.');
      var row = LN.ui.el('div', 'ai-row');
      var stop = LN.ui.el('button', 'btn primary', 'Stop and save');
      stop.type = 'button';
      var cancel = LN.ui.el('button', 'btn', 'Discard');
      cancel.type = 'button';
      row.appendChild(stop); row.appendChild(cancel);
      var dot = LN.ui.el('div', 'vn-dot');
      sh.body.appendChild(dot); sh.body.appendChild(big); sh.body.appendChild(hint); sh.body.appendChild(row);
      function cleanup() {
        if (tick) { clearInterval(tick); tick = null; }
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* already stopped */ } });
      }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function () { discard = true; cleanup(); sh.close(); LN.toast('Recording failed'); };
      rec.onstop = function () {
        cleanup();
        if (discard || !chunks.length) return;
        var type = fmt[0] ? fmt[0].split(';')[0] : 'audio/webm';
        new Blob(chunks, { type: type }).arrayBuffer().then(function (buf) {
          return folderFor('Voice').then(function (fid) {
            return LN.vault.importFile('Voice ' + N.stampName() + '.' + fmt[1], fid, new Uint8Array(buf));
          });
        }).then(function (n) {
          LN.tree.render();
          LN.editor.insertText((LN.editor.selection() && LN.editor.selection().start > 0 ? '\n' : '') + '![[' + n.name + ']]\n', false);
          LN.toast('Voice note saved in ' + ROOT + '/Voice');
        }).catch(fail);
      };
      stop.addEventListener('click', function () { if (saving) return; saving = true; try { rec.stop(); } catch (e) { /* already stopped */ } sh.close(); });
      cancel.addEventListener('click', function () { discard = true; try { rec.stop(); } catch (e) { /* already stopped */ } sh.close(); });
      rec.start(1000);
      started = Date.now();
      tick = setInterval(function () { big.textContent = clock(Date.now() - started); }, 500);
    });
  }

  // ---------- music and documents ----------
  function music() {
    if (!textOpen()) { LN.toast('Open a text note first'); return Promise.resolve(); }
    return pickFiles('audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac', true).then(function (files) {
      if (!files.length) return;
      return importInto(files, 'Music').then(function (ns) {
        LN.editor.insertText(ns.map(function (n) { return '![[' + n.name + ']]'; }).join('\n') + '\n', false);
        LN.toast(ns.length === 1 ? 'Music added' : ns.length + ' songs added');
      });
    });
  }

  function documents() {
    if (!textOpen()) { LN.toast('Open a text note first'); return Promise.resolve(); }
    return pickFiles('', true).then(function (files) {
      if (!files.length) return;
      return importInto(files, 'Documents').then(function (ns) {
        LN.editor.insertText(ns.map(function (n) { return '[[' + n.name + ']]'; }).join('\n') + '\n', false);
        LN.toast(ns.length === 1 ? 'Document added' : ns.length + ' documents added');
      });
    });
  }

  // ---------- the sheet ----------
  function open() {
    if (!textOpen()) { LN.toast('Open a text note first'); return; }
    var groups = [
      { title: 'Add to this note', rows: [
        { icon: 'link', label: 'Link', run: link },
        { icon: 'mic', label: 'Voice note', run: voice },
        { icon: 'music', label: 'Music', run: music },
        { icon: 'file-plus', label: 'Document', run: documents }
      ] },
      { title: 'Pictures', rows: [
        { icon: 'camera', label: 'Take a photo', run: function () { return LN.insert.photo(); } },
        { icon: 'gallery', label: 'Image from gallery', run: function () { return LN.insert.gallery(); } }
      ] },
      { title: 'Quick inserts', rows: [
        { icon: 'calendar', label: 'Date and time', run: function () { return LN.insert.dateTime(); } },
        { icon: 'pin', label: 'My location', run: function () { return LN.insert.location(); } },
        { icon: 'user', label: 'Contact', run: function () { return LN.insert.contact(); } }
      ] }
    ];
    var s = LN.ui.sheet('Add');
    groups.forEach(function (g) {
      s.body.appendChild(LN.ui.el('div', 'set-section', g.title));
      var box = LN.ui.el('div', 'set-group nav');
      g.rows.forEach(function (r) {
        var b = LN.ui.el('button', 'set-nav');
        b.type = 'button';
        var ic = LN.ui.el('span', 'set-ico');
        ic.innerHTML = LN.icon(r.icon, 18);
        b.appendChild(ic);
        b.appendChild(LN.ui.el('span', 'set-nav-label', r.label));
        b.addEventListener('click', function () {
          s.close();
          var p;
          try { p = r.run(); } catch (e) { p = Promise.reject(e); }
          Promise.resolve(p).catch(fail);
        });
        box.appendChild(b);
      });
      s.body.appendChild(box);
    });
    s.body.appendChild(LN.ui.el('p', 'hint', 'Voice notes, music and documents are copied into the Attachments folder, so they sync and back up with your vault. Connect a folder in Settings, Sync to folder to copy everything both ways.'));
  }

  LN.addmenu = { open: open, link: link, voice: voice, music: music, documents: documents };
})(window.LN = window.LN || {});
