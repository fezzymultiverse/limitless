(function (LN) {
  'use strict';
  var A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };

  function ch(el, ns, name) {
    return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1 && n.localName === name && n.namespaceURI === ns; });
  }
  function xml(s) {
    var d = new DOMParser().parseFromString(s, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('Could not read this presentation');
    return d;
  }
  function resolve(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = base.split('/'); parts.pop();
    target.split('/').forEach(function (s) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); });
    return parts.join('/');
  }
  function norm(t) { return t === 'ctrTitle' ? 'title' : (t === 'subTitle' || t === 'obj' ? 'body' : t); }
  function lum(hex) {
    var n = parseInt(hex, 16);
    return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  }

  function paraText(p) {
    var out = '';
    Array.prototype.forEach.call(p.childNodes, function (c) {
      if (c.nodeType !== 1 || c.namespaceURI !== A) return;
      if (c.localName === 'r' || c.localName === 'fld') out += (ch(c, A, 't')[0] || { textContent: '' }).textContent;
      else if (c.localName === 'br') out += ' ';
    });
    return out;
  }

  function setParaText(doc, p, text) {
    var runs = ch(p, A, 'r');
    var r = runs[0];
    if (!r) {
      r = doc.createElementNS(A, 'a:r');
      var end = ch(p, A, 'endParaRPr')[0];
      p.insertBefore(r, end || null);
    }
    runs.slice(1).forEach(function (x) { p.removeChild(x); });
    ch(p, A, 'br').forEach(function (x) { p.removeChild(x); });
    var t = ch(r, A, 't')[0];
    if (!t) { t = doc.createElementNS(A, 'a:t'); r.appendChild(t); }
    t.textContent = text;
  }

  function mount(el, bytes, api) {
    var pkg = LN.zip.parse(bytes);
    var slides = [], size = { cx: 9144000, cy: 6858000 }, idx = 0, zoom = 1, urls = [], cache = {};
    el.textContent = '';
    el.classList.add('vw');
    var bar = document.createElement('div'); bar.className = 'vw-bar';
    var wrap = document.createElement('div'); wrap.className = 'slide-wrap';
    el.appendChild(bar); el.appendChild(wrap);

    function btn(label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', fn); bar.appendChild(b); return b;
    }
    var vertical = LN.store.get('slideLayout') !== 'single';
    var layoutBtn = btn(vertical ? 'Single' : 'Vertical', function () {
      vertical = !vertical;
      LN.store.set('slideLayout', vertical ? 'vertical' : 'single');
      layoutBtn.textContent = vertical ? 'Single' : 'Vertical';
      if (vertical) renderAll(); else go(idx);
    });
    layoutBtn.title = 'Switch between one long scroll and one slide at a time';
    btn('Prev', function () { go(idx - 1); });
    var pos = document.createElement('span'); pos.className = 'vw-note'; bar.appendChild(pos);
    btn('Next', function () { go(idx + 1); });
    btn('-', function () { zoom = Math.max(0.5, zoom - 0.25); fit(); });
    btn('+', function () { zoom = Math.min(4, zoom + 0.25); fit(); });

    function fit() {
      var w = Math.max(200, (wrap.clientWidth - 16) * zoom) + 'px';
      for (var i = 0; i < wrap.children.length; i++) wrap.children[i].style.width = w;
    }

    // vertical mode: every slide stacked in one scrolling column
    function renderAll() {
      wrap.textContent = '';
      wrap.classList.add('vert');
      var chain = Promise.resolve();
      slides.forEach(function (sl) {
        chain = chain.then(function () { return loadSlide(sl); }).then(function (s) {
          if (!vertical) return;
          wrap.appendChild(renderSlide(s));
          fit();
        });
      });
      chain.then(function () { if (vertical) { updatePos(); if (idx > 0) go(idx); } }).catch(fail);
    }

    function updatePos() {
      if (!vertical || !wrap.children.length) return;
      var top = wrap.getBoundingClientRect().top, best = 0, bestD = Infinity;
      for (var i = 0; i < wrap.children.length; i++) {
        var d = Math.abs(wrap.children[i].getBoundingClientRect().top - top - 8);
        if (d < bestD) { bestD = d; best = i; }
      }
      idx = best;
      pos.textContent = (idx + 1) + ' / ' + slides.length;
    }
    wrap.addEventListener('scroll', function () { if (vertical) updatePos(); });

    function relsOf(part) {
      var rp = part.replace(/[^/]+$/, '_rels/') + part.replace(/^.*\//, '') + '.rels';
      if (!pkg.has(rp)) return Promise.resolve({});
      return pkg.text(rp).then(function (t) {
        var m = {};
        Array.prototype.forEach.call(xml(t).getElementsByTagName('Relationship'), function (n) {
          m[n.getAttribute('Id')] = { type: n.getAttribute('Type'), path: resolve(part, n.getAttribute('Target')) };
        });
        return m;
      });
    }

    function docOf(path) {
      if (!path || !pkg.has(path)) return Promise.resolve(null);
      if (!cache[path]) cache[path] = pkg.text(path).then(xml);
      return cache[path];
    }

    function loadSlide(s) {
      if (s.doc) return Promise.resolve(s);
      return Promise.all([docOf(s.path), relsOf(s.path)]).then(function (r) {
        s.doc = r[0]; s.rels = r[1];
        var lay = Object.keys(s.rels).filter(function (k) { return /slideLayout$/.test(s.rels[k].type); })[0];
        s.layPath = lay ? s.rels[lay].path : null;
        return docOf(s.layPath);
      }).then(function (ld) {
        s.lay = ld;
        return s.layPath ? relsOf(s.layPath) : {};
      }).then(function (lr) {
        var m = Object.keys(lr).filter(function (k) { return /slideMaster$/.test(lr[k].type); })[0];
        return m ? docOf(lr[m].path) : null;
      }).then(function (md) { s.master = md; return s; });
    }

    function xfrmOf(sp) {
      var spPr = ch(sp, P, 'spPr')[0];
      var x = spPr ? ch(spPr, A, 'xfrm')[0] : null;
      if (!x) x = ch(sp, P, 'xfrm')[0];
      if (!x) return null;
      var off = ch(x, A, 'off')[0], ext = ch(x, A, 'ext')[0];
      if (!off || !ext) return null;
      return { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy') };
    }

    function phOf(sp) {
      var nv = ch(sp, P, 'nvSpPr')[0] || ch(sp, P, 'nvPicPr')[0];
      var nvPr = nv ? ch(nv, P, 'nvPr')[0] : null;
      var ph = nvPr ? ch(nvPr, P, 'ph')[0] : null;
      return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') } : null;
    }

    function inherit(ph, docs) {
      for (var i = 0; i < docs.length; i++) {
        if (!docs[i]) continue;
        var list = Array.prototype.slice.call(docs[i].getElementsByTagNameNS(P, 'sp'));
        for (var pass = 0; pass < 2; pass++) {
          for (var k = 0; k < list.length; k++) {
            var q = phOf(list[k]);
            if (!q) continue;
            var ok = pass === 0 ? (ph.idx != null && q.idx === ph.idx) : (norm(q.type) === norm(ph.type));
            if (ok) { var x = xfrmOf(list[k]); if (x) return x; }
          }
        }
      }
      return null;
    }

    function bgOf(docs) {
      for (var i = 0; i < docs.length; i++) {
        if (!docs[i]) continue;
        var c = docs[i].getElementsByTagNameNS(P, 'bg')[0];
        var clr = c ? c.getElementsByTagNameNS(A, 'srgbClr')[0] : null;
        if (clr) return clr.getAttribute('val');
      }
      return 'FFFFFF';
    }

    function mkPara(doc, p, ph, dark) {
      var d = document.createElement('div');
      d.className = 'sp-p';
      d.contentEditable = 'plaintext-only';
      d.spellcheck = false;
      d.textContent = paraText(p);
      d._p = p; d._doc = doc;
      var pPr = ch(p, A, 'pPr')[0];
      var r1 = ch(p, A, 'r')[0];
      var rPr = (r1 && ch(r1, A, 'rPr')[0]) || ch(p, A, 'endParaRPr')[0];
      var pt = rPr && rPr.getAttribute('sz') ? +rPr.getAttribute('sz') / 100 : (ph && /title/i.test(ph.type) ? 40 : (ph ? 24 : 18));
      d.style.fontSize = (pt * 12700 / size.cx * 100).toFixed(3) + 'cqw';
      if (rPr && rPr.getAttribute('b') === '1') d.style.fontWeight = '700';
      if (rPr && rPr.getAttribute('i') === '1') d.style.fontStyle = 'italic';
      var clr = rPr ? rPr.getElementsByTagNameNS(A, 'srgbClr')[0] : null;
      d.style.color = clr ? '#' + clr.getAttribute('val') : (dark ? '#fff' : '#111');
      if (pPr) {
        var al = pPr.getAttribute('algn');
        if (al) d.style.textAlign = al === 'ctr' ? 'center' : (al === 'r' ? 'right' : 'left');
        var lvl = +pPr.getAttribute('lvl') || 0;
        if (lvl) d.style.marginLeft = (lvl * 2) + 'cqw';
        var bu = ch(pPr, A, 'buChar')[0];
        if (bu) { d.dataset.bu = bu.getAttribute('char') || '-'; d.classList.add('bu'); }
      }
      return d;
    }

    function addImage(s, box, rid) {
      var rel = s.rels[rid];
      if (!rel || !pkg.has(rel.path)) return;
      var ext = rel.path.split('.').pop().toLowerCase();
      if (!MIME[ext]) { box.classList.add('noimg'); box.textContent = '[' + ext + ' image]'; return; }
      var img = document.createElement('img');
      img.alt = '';
      box.appendChild(img);
      pkg.bytes(rel.path).then(function (b) {
        var u = URL.createObjectURL(new Blob([b], { type: MIME[ext] }));
        urls.push(u);
        img.src = u;
      });
    }

    function collect(tree, tf, out, s) {
      Array.prototype.forEach.call(tree.childNodes, function (c) {
        if (c.nodeType !== 1 || c.namespaceURI !== P) return;
        if (c.localName === 'grpSp') {
          var g = ch(c, P, 'grpSpPr')[0], x = g ? ch(g, A, 'xfrm')[0] : null;
          var off = x && ch(x, A, 'off')[0], ext = x && ch(x, A, 'ext')[0], co = x && ch(x, A, 'chOff')[0], ce = x && ch(x, A, 'chExt')[0];
          var t2 = tf;
          if (off && ext && co && ce && +ce.getAttribute('cx') && +ce.getAttribute('cy')) {
            var kx = +ext.getAttribute('cx') / +ce.getAttribute('cx'), ky = +ext.getAttribute('cy') / +ce.getAttribute('cy');
            t2 = { ox: tf.ox + tf.sx * (+off.getAttribute('x') - +co.getAttribute('x') * kx), oy: tf.oy + tf.sy * (+off.getAttribute('y') - +co.getAttribute('y') * ky), sx: tf.sx * kx, sy: tf.sy * ky };
          }
          collect(c, t2, out, s);
        } else if (c.localName === 'sp' || c.localName === 'pic' || c.localName === 'graphicFrame') {
          out.push({ el: c, tf: tf });
        }
      });
    }

    function renderSlide(s) {
      var docs = [s.lay, s.master];
      var bg = bgOf([s.doc].concat(docs));
      var dark = lum(bg) < 0.45;
      var box = document.createElement('div');
      box.className = 'slide';
      box.style.aspectRatio = size.cx + ' / ' + size.cy;
      box.style.background = '#' + bg;
      var tree = s.doc.getElementsByTagNameNS(P, 'spTree')[0];
      var items = [];
      if (tree) collect(tree, { ox: 0, oy: 0, sx: 1, sy: 1 }, items, s);
      var stack = 0;
      items.forEach(function (it) {
        var sp = it.el, ph = phOf(sp), xf = xfrmOf(sp);
        if (!xf && ph) xf = inherit(ph, docs);
        if (!xf) { xf = { x: size.cx * 0.08, y: size.cy * (0.05 + 0.2 * stack), w: size.cx * 0.84, h: size.cy * 0.18 }; stack++; }
        else xf = { x: it.tf.ox + it.tf.sx * xf.x, y: it.tf.oy + it.tf.sy * xf.y, w: xf.w * it.tf.sx, h: xf.h * it.tf.sy };
        var b = document.createElement('div');
        b.className = 'shape';
        b.style.left = (xf.x / size.cx * 100) + '%'; b.style.top = (xf.y / size.cy * 100) + '%';
        b.style.width = (xf.w / size.cx * 100) + '%'; b.style.height = (xf.h / size.cy * 100) + '%';
        if (sp.localName === 'pic') {
          var blip = sp.getElementsByTagNameNS(A, 'blip')[0];
          if (blip) addImage(s, b, blip.getAttributeNS(R, 'embed'));
        } else if (sp.localName === 'graphicFrame') {
          var tbl = sp.getElementsByTagNameNS(A, 'tbl')[0];
          if (tbl) {
            var t = document.createElement('table'); t.className = 'sp-tbl';
            ch(tbl, A, 'tr').forEach(function (tr) {
              var r = document.createElement('tr');
              ch(tr, A, 'tc').forEach(function (tc) {
                var td = document.createElement('td'), tx = ch(tc, A, 'txBody')[0];
                if (tx) ch(tx, A, 'p').forEach(function (p) { td.appendChild(mkPara(s.doc, p, null, dark)); });
                r.appendChild(td);
              });
              t.appendChild(r);
            });
            b.appendChild(t);
          }
        } else {
          var spPr = ch(sp, P, 'spPr')[0];
          var fill = spPr ? ch(spPr, A, 'solidFill')[0] : null;
          var fc = fill ? ch(fill, A, 'srgbClr')[0] : null;
          if (fc) b.style.background = '#' + fc.getAttribute('val');
          var geom = spPr ? ch(spPr, A, 'prstGeom')[0] : null;
          if (geom && geom.getAttribute('prst') === 'ellipse') b.style.borderRadius = '50%';
          var tx2 = ch(sp, P, 'txBody')[0];
          if (tx2) {
            var bp = ch(tx2, A, 'bodyPr')[0], an = bp ? bp.getAttribute('anchor') : null;
            if (an === 'ctr') b.classList.add('mid'); else if (an === 'b') b.classList.add('bot');
            ch(tx2, A, 'p').forEach(function (p) { b.appendChild(mkPara(s.doc, p, ph, dark)); });
          }
        }
        box.appendChild(b);
      });
      box.addEventListener('input', function (e) {
        var d = e.target.closest ? e.target.closest('.sp-p') : null;
        if (!d || !d._p) return;
        setParaText(d._doc, d._p, d.textContent);
        s.dirty = true;
        api.dirty();
      });
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
      return box;
    }

    function go(i) {
      if (i < 0 || i >= slides.length) return;
      idx = i;
      if (vertical) {
        var target = wrap.children[i];
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' });
        pos.textContent = (i + 1) + ' / ' + slides.length;
        return;
      }
      wrap.classList.remove('vert');
      loadSlide(slides[i]).then(function (s) {
        wrap.textContent = '';
        wrap.appendChild(renderSlide(s));
        fit();
        pos.textContent = (i + 1) + ' / ' + slides.length;
      }).catch(fail);
    }
    function fail(e) { wrap.textContent = 'Could not open this file. ' + (e && e.message ? e.message : ''); }

    Promise.all([pkg.text('ppt/presentation.xml'), pkg.text('ppt/_rels/presentation.xml.rels')]).then(function (r) {
      var pd = xml(r[0]);
      var sz = pd.getElementsByTagNameNS(P, 'sldSz')[0];
      if (sz) size = { cx: +sz.getAttribute('cx') || size.cx, cy: +sz.getAttribute('cy') || size.cy };
      var rels = {};
      Array.prototype.forEach.call(xml(r[1]).getElementsByTagName('Relationship'), function (n) {
        rels[n.getAttribute('Id')] = resolve('ppt/presentation.xml', n.getAttribute('Target'));
      });
      Array.prototype.forEach.call(pd.getElementsByTagNameNS(P, 'sldId'), function (n) {
        var p = rels[n.getAttributeNS(R, 'id')];
        if (p) slides.push({ path: p });
      });
      if (!slides.length) throw new Error('No slides found');
      if (vertical) renderAll(); else go(0);
    }).catch(fail);

    return {
      bytes: function () {
        slides.forEach(function (s) {
          if (s.dirty) pkg.setText(s.path, LN.zip.ser(s.doc));
        });
        return pkg.build();
      },
      destroy: function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); el.textContent = ''; }
    };
  }

  LN.pptx = { mount: mount };
})(window.LN = window.LN || {});
