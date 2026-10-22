(function (LN) {
  'use strict';

  // Share: a view-only link (through a hosted viewer page, via sharecodec), a self-contained
  // .html page with embedded images, the raw file (through the Share sheet), or plain text.

  var N = LN.native;
  var LINK_WARN = 20000;

  function fail(e) { LN.toast(N.msg(e)); }
  function currentNote() {
    var id = LN.editor.currentId();
    return id ? LN.vault.get(id) : null;
  }

  function mimeForImg(name) {
    var e = LN.ext(name);
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[e] || 'application/octet-stream';
  }

  function bytesToDataUrl(bytes, mime) { return 'data:' + mime + ';base64,' + N.bytesToB64(bytes); }

  // ---------- link ----------
  function viewerBase() {
    var b = String(LN.store.get('shareBase') || '').trim();
    return b.replace(/\/+$/, '');
  }

  function buildPayload(n) {
    var k = LN.kindOfNode(n);
    if (LN.isBin(k) && k !== 'img') throw new Error('This file type can\'t be shared as a link. Share the file instead.');
    if (k === 'img') throw new Error('Images can\'t be shared as a link. Share the file instead.');
    return { v: 1, n: n.name, k: k, t: n.content || '' };
  }

  function shareViaPlugin(opts) {
    var S = N.plugin('Share');
    if (S) return S.share(opts).then(function () { return true; }, function (e) {
      var m = N.msg(e);
      if (/cancel/i.test(m)) return false;
      throw e;
    });
    return Promise.resolve(false);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function link() {
    var n = currentNote();
    if (!n) { LN.toast('Open a note first'); return Promise.resolve(); }
    var base = viewerBase();
    if (!base) { LN.toast('Set a viewer address in Settings, Share, first.'); return Promise.resolve(); }
    if (!/^https?:\/\/[^\s<>]+$/i.test(base) || /[<>]/.test(base)) { LN.toast('The viewer address must start with https:// and have no spaces. Fix it in Settings, Share.'); return Promise.resolve(); }
    var payload;
    try { payload = buildPayload(n); } catch (e) { LN.toast(e.message); return Promise.resolve(); }
    return LN.sharecodec.encode(payload).then(function (data) {
      var url = base + '#' + data;
      if (url.length > LINK_WARN && !window.confirm('This link is ' + url.length + ' characters long. Some apps truncate very long links. Share it anyway?')) return null;
      return shareViaPlugin({ title: n.name, url: url, dialogTitle: 'Share ' + n.name }).then(function (shared) {
        if (shared) return;
        return copyText(url).then(function () { LN.toast('Link copied (' + url.length + ' characters)'); });
      });
    }).catch(fail);
  }

  // ---------- self-contained html page ----------
  function escHtml(s) { return LN.md.escape(s); }

  function inlineImages(html) {
    var names = [];
    var re = /data-ln-img="([^"]+)"/g, m;
    while ((m = re.exec(html))) names.push(m[1]);
    var chain = Promise.resolve();
    names.forEach(function (name) {
      chain = chain.then(function () {
        var f = LN.vault.findNote(name);
        if (!f || !f.bytes) return;
        var url = bytesToDataUrl(f.bytes, mimeForImg(f.name));
        html = html.split('data-ln-img="' + name + '"').join('src="' + url + '"');
      });
    });
    return chain.then(function () { return html; });
  }

  function pageHtml(n, bodyHtml, title) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escHtml(title) + '</title>' +
      '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:72ch;margin:0 auto;padding:24px 16px 60px;' +
      'line-height:1.6;color:#0a0a0a;background:#fff}h1,h2,h3{line-height:1.25}' +
      'code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f4f4f1;padding:1px 5px;border-radius:4px}' +
      'pre{background:#f4f4f1;border:1px solid #d3d1c7;border-radius:6px;padding:12px;overflow:auto}' +
      'img{max-width:100%;height:auto}blockquote{margin:.8em 0;padding:2px 14px;border-left:3px solid #ff6a00;color:#5f5e5a}' +
      'a{color:#0a0a0a;text-decoration-color:#ff6a00}table{border-collapse:collapse}td,th{border:1px solid #d3d1c7;padding:4px 8px}' +
      '.cb{margin:1em 0;border:1px solid #d3d1c7;border-radius:10px;overflow:hidden;background:#f4f4f1}.cb-head{padding:6px 12px;border-bottom:1px solid #d3d1c7;border-left:3px solid #ff6a00;font:600 11px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5f5e5a}.cb pre{margin:0;border:0;border-radius:0;font-size:13px}.cb pre code{background:none;padding:0}' +
      '.tk-k{color:#c2410c;font-weight:600}.tk-s{color:#15803d}.tk-n{color:#1d4ed8}.tk-c{color:#6b6a64;font-style:italic}.tk-f{color:#7c3aed}.tk-t{color:#0e7490}.tk-a{color:#a16207}.tk-v{color:#be185d}.tk-ins{color:#15803d}.tk-del{color:#b91c1c}' +
      '.co{margin:1em 0;border:1px solid #bcd;border-left:4px solid #2563eb;border-radius:8px;background:#eff5ff;overflow:hidden}.co[data-co="tip"]{border-left-color:#0d9488;background:#eefaf8}.co[data-co="ok"]{border-left-color:#16a34a;background:#effaf2}.co[data-co="warn"]{border-left-color:#d97706;background:#fff7ea}.co[data-co="danger"]{border-left-color:#dc2626;background:#fdeeee}.co[data-co="quest"]{border-left-color:#7c3aed;background:#f5f0ff}.co[data-co="quote"]{border-left-color:#6b7280;background:#f3f4f6}.co-title{display:flex;gap:8px;align-items:center;padding:8px 12px;font-weight:600}.co-ico{width:22px;height:22px;border-radius:50%;background:#2563eb;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px}.co-body{padding:0 14px 10px}.co-body>:last-child{margin-bottom:0}' +
      '.tbl{overflow:auto}.tbl tbody tr:nth-child(even) td{background:#f7f7f4}th{background:#f4f4f1;border-bottom:2px solid #ff6a00}' +
      '.ln-foot{margin-top:40px;color:#5f5e5a;font-size:.85em;border-top:1px solid #d3d1c7;padding-top:12px}</style>' +
      '</head><body><article>' + bodyHtml + '</article>' +
      '<p class="ln-foot">Shared from Limitless Notepad.</p></body></html>';
  }

  function renderBody(n, k) {
    if (k === 'md') return inlineImages(LN.md.render(n.content || ''));
    if (k === 'csv' || k === 'text' || !LN.isBin(k)) return Promise.resolve('<pre>' + escHtml(n.content || '') + '</pre>');
    return Promise.reject(new Error('This file type can\'t be shared as a page.'));
  }

  function writeAndShare(filename, bytes, mime) {
    var fs = N.plugin('Filesystem');
    var S = N.plugin('Share');
    if (fs && S) {
      return fs.writeFile({ path: filename, directory: 'CACHE', data: N.bytesToB64(bytes), recursive: true }).then(function () {
        return fs.getUri({ path: filename, directory: 'CACHE' });
      }).then(function (u) {
        return S.share({ title: filename, url: u.uri, dialogTitle: 'Share ' + filename });
      }).then(function () { return true; }, function (e) {
        if (/cancel/i.test(N.msg(e))) return false;
        throw e;
      });
    }
    // browser fallback: a plain download
    var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve(true);
  }

  function asPage() {
    var n = currentNote();
    if (!n) { LN.toast('Open a note first'); return Promise.resolve(); }
    var k = LN.kindOfNode(n);
    return renderBody(n, k).then(function (body) {
      var html = pageHtml(n, body, n.name.replace(/\.[^.]+$/, ''));
      var bytes = new TextEncoder().encode(html);
      var filename = n.name.replace(/\.[^.]+$/, '') + '.html';
      return writeAndShare(filename, bytes, 'text/html').then(function (shared) {
        if (shared) LN.toast('Shared as ' + filename);
      });
    }).catch(fail);
  }

  // ---------- raw file ----------
  function file() {
    var n = currentNote();
    if (!n) { LN.toast('Open a note first'); return Promise.resolve(); }
    var bytes, mime;
    if (n.bytes) {
      bytes = n.bytes;
      mime = 'application/octet-stream';
    } else {
      bytes = new TextEncoder().encode(n.content || '');
      mime = 'text/plain';
    }
    return writeAndShare(n.name, bytes, mime).then(function (shared) {
      if (shared) LN.toast('Shared ' + n.name);
    }).catch(fail);
  }

  // ---------- plain text ----------
  function text() {
    var sel = LN.editor.selection();
    var body = sel && sel.text ? sel.text : (currentNote() ? currentNote().content || '' : '');
    if (!body) { LN.toast('Open a note first'); return Promise.resolve(); }
    return shareViaPlugin({ text: body, dialogTitle: 'Share text' }).then(function (shared) {
      if (shared) return;
      return copyText(body).then(function () { LN.toast('Text copied'); });
    }).catch(fail);
  }

  // Each way of sending a note out asks first when a PIN or encryption is on.
  function guard(what, fn) {
    return function () {
      return LN.secure.warnExport(what).then(function (ok) { return ok ? fn() : undefined; });
    };
  }

  LN.share = {
    link: guard('A share link', link), asPage: guard('This web page', asPage),
    file: guard('This file', file), text: guard('This text', text)
  };
})(window.LN = window.LN || {});
