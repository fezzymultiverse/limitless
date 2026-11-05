(function (LN) {
  'use strict';
  var lib = null;

  function load() {
    if (lib) return Promise.resolve(lib);
    var base = new URL('vendor/pdfjs/', document.baseURI).href;
    return import(base + 'pdf.min.mjs').then(function (m) {
      m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
      lib = m;
      return m;
    });
  }

  // V0.7.8: every page is laid out in one scrolling column, top to bottom, fitted to the screen width.
  // Pages draw only while they are near the screen and give their memory back when they are far away,
  // so a 300 page PDF scrolls like a web page. Pinch or the + and - buttons zoom, Full takes the whole screen.
  function mount(el, bytes, api) {
    var pdf = null, zoom = 1, dead = false, io = null, ro = null;
    var pages = [];            // { n, box, cv, w1, h1, rendered, busy, task, key }
    var tops = [];
    var cur = 1, lastW = 0, relayoutTimer = null, rafScroll = 0;
    var MAX_PX = 16000000;     // most canvas pixels one page may use

    el.textContent = '';
    el.classList.add('vw', 'pdfx');
    var bar = document.createElement('div'); bar.className = 'vw-bar pdf-bar';
    var wrap = document.createElement('div'); wrap.className = 'pdf-wrap pdf-scroll';
    var col = document.createElement('div'); col.className = 'pdf-col';
    wrap.appendChild(col);
    el.appendChild(bar); el.appendChild(wrap);

    function btn(label, fn, aria) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      if (aria) b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn); bar.appendChild(b); return b;
    }
    btn('Prev', function () { jump(cur - 1); }, 'Previous page');
    var pos = document.createElement('button'); pos.type = 'button'; pos.className = 'pdf-pos';
    pos.setAttribute('aria-label', 'Go to page');
    pos.addEventListener('click', function () {
      if (!pdf) return;
      LN.ui.form({ title: 'Go to page', ok: 'Go', fields: [{ key: 'p', label: 'Page 1 to ' + pdf.numPages, value: String(cur), required: true }] }).then(function (v) {
        if (v) jump(parseInt(v.p, 10));
      });
    });
    bar.appendChild(pos);
    btn('Next', function () { jump(cur + 1); }, 'Next page');
    btn('-', function () { setZoom(zoom / 1.25); }, 'Zoom out');
    btn('+', function () { setZoom(zoom * 1.25); }, 'Zoom in');
    btn('Fit', function () { setZoom(1); }, 'Fit to width');
    var fullBtn = btn('Full', toggleFull, 'Full screen');
    btn('Text', extract, 'Extract text into a note');

    function fail(e) { col.textContent = 'Could not open this PDF. ' + (e && e.message ? e.message : ''); }

    function showPos() { pos.textContent = pdf ? cur + ' / ' + pdf.numPages : ''; }

    function onKey(e) { if (e.key === 'Escape' && el.classList.contains('pdf-full')) toggleFull(); }
    document.addEventListener('keydown', onKey);
    function toggleFull() {
      var on = el.classList.toggle('pdf-full');
      document.body.classList.toggle('pdf-fs', on);
      fullBtn.textContent = on ? 'Exit' : 'Full';
      fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      relayoutSoon(true);
    }

    // ----- layout -----
    function width() { return Math.max(160, wrap.clientWidth - 16); }

    // Every page is fitted to the screen width on its own, so a landscape page in a portrait file never pushes the others sideways.
    function size(p) {
      p.sc = (width() / p.w1) * zoom;
      p.box.style.width = Math.floor(p.w1 * p.sc) + 'px';
      p.box.style.height = Math.floor(p.h1 * p.sc) + 'px';
    }

    function measure() {
      tops = pages.map(function (p) { return p.box.offsetTop; });
    }

    // Keeps the same spot on screen (page and how far down it) when the size of the pages changes.
    function layout() {
      if (!pages.length) return;
      var a = anchor();
      lastW = wrap.clientWidth;
      pages.forEach(size);
      measure();
      restore(a);
      invalidate();
    }

    function anchor() {
      if (!pages.length || !tops.length) return null;
      var i = Math.max(0, cur - 1);
      var p = pages[i];
      var h = p.box.offsetHeight || 1;
      return { i: i, f: (wrap.scrollTop - tops[i]) / h };
    }
    function restore(a) {
      if (!a) return;
      var p = pages[a.i];
      wrap.scrollTop = Math.max(0, p.box.offsetTop + a.f * p.box.offsetHeight);
    }

    function relayoutSoon(now) {
      if (relayoutTimer) clearTimeout(relayoutTimer);
      relayoutTimer = setTimeout(function () { relayoutTimer = null; if (!dead) layout(); }, now ? 30 : 160);
    }

    function setZoom(z) {
      if (!pdf) return;
      zoom = Math.max(0.5, Math.min(5, z));
      if (Math.abs(zoom - 1) < 0.06) zoom = 1;
      layout();
    }

    function jump(n) {
      if (!pdf) return;
      n = Math.max(1, Math.min(pdf.numPages, n || 1));
      cur = n;
      wrap.scrollTop = tops[n - 1] != null ? tops[n - 1] - 4 : 0;
      showPos();
    }

    function currentPage() {
      var y = wrap.scrollTop + wrap.clientHeight / 3;
      var lo = 0, hi = tops.length - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (tops[mid] <= y) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    }
    wrap.addEventListener('scroll', function () {
      if (rafScroll) return;
      rafScroll = requestAnimationFrame(function () {
        rafScroll = 0;
        if (dead || !pdf) return;
        var n = currentPage();
        if (n !== cur) { cur = n; showPos(); }
      });
    }, { passive: true });

    // ----- drawing -----
    function release(p) {
      if (p.task) { try { p.task.cancel(); } catch (e) { /* already done */ } p.task = null; }
      if (p.cv) { p.cv.width = 0; p.cv.height = 0; if (p.cv.parentNode) p.cv.parentNode.removeChild(p.cv); p.cv = null; }
      p.rendered = false;
      p.busy = false;
      p.key = 0;
      p.gen = (p.gen || 0) + 1;      // a draw that was waiting for this page now knows it is out of date
    }

    function invalidate() {
      pages.forEach(release);
      if (!io) return;
      io.disconnect();
      pages.forEach(function (p) { io.observe(p.box); });
    }

    function draw(p) {
      if (p.rendered || p.busy || dead || !pdf) return;
      p.busy = true;
      var want = p.sc;
      var gen = p.gen || 0;
      pdf.getPage(p.n).then(function (pg) {
        if (dead || gen !== (p.gen || 0)) return null;
        var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        var px = want * dpr;
        var area = (p.w1 * px) * (p.h1 * px);
        if (area > MAX_PX) px *= Math.sqrt(MAX_PX / area);
        var vp = pg.getViewport({ scale: px });
        var cv = document.createElement('canvas');
        cv.className = 'pdf-page';
        cv.width = Math.floor(vp.width);
        cv.height = Math.floor(vp.height);
        cv.style.width = '100%';
        cv.style.height = '100%';
        p.task = pg.render({ canvasContext: cv.getContext('2d'), viewport: vp });
        return p.task.promise.then(function () {
          if (dead || gen !== (p.gen || 0)) return;
          p.cv = cv;
          p.box.appendChild(cv);
          p.rendered = true;
          p.key = want;
          p.box.classList.add('done');
        });
      }).catch(function () { /* cancelled or page failed: the blank page stays */ }).then(function () {
        if (gen !== (p.gen || 0)) return;
        p.busy = false;
        p.task = null;
      });
    }

    function observe() {
      if (typeof IntersectionObserver !== 'function') { pages.forEach(draw); return; }
      io = new IntersectionObserver(function (list) {
        list.forEach(function (en) {
          var p = en.target._p;
          if (!p) return;
          if (en.isIntersecting) draw(p); else if (p.rendered || p.busy) release(p);
        });
      }, { root: wrap, rootMargin: '150% 0px 150% 0px', threshold: 0 });
      pages.forEach(function (p) { io.observe(p.box); });
    }

    // ----- two finger pinch -----
    var pinch = null;
    function dist(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.sqrt((a.clientX - b.clientX) * (a.clientX - b.clientX) + (a.clientY - b.clientY) * (a.clientY - b.clientY));
    }
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) pinch = { d: dist(e) || 1, r: 1 };
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        pinch.r = dist(e) / pinch.d;
        col.style.transformOrigin = '50% 0';
        col.style.transform = 'scale(' + Math.max(0.4, Math.min(3, pinch.r)) + ')';
      }
    }, { passive: false });
    function endPinch(e) {
      if (!pinch || e.touches.length >= 2) return;
      var r = pinch.r;
      pinch = null;
      col.style.transform = '';
      if (Math.abs(r - 1) > 0.05) setZoom(zoom * r);
    }
    wrap.addEventListener('touchend', endPinch, { passive: true });
    wrap.addEventListener('touchcancel', endPinch, { passive: true });

    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () {
        if (dead || !pages.length) return;
        if (Math.abs(wrap.clientWidth - lastW) > 2) relayoutSoon(false);
      });
      ro.observe(wrap);
    }

    function extract() {
      if (!pdf) return;
      var all = [];
      var chain = Promise.resolve();
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (n) {
          chain = chain.then(function () { return pdf.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            all.push(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join('').trim());
          });
        })(i);
      }
      chain.then(function () {
        var text = all.join('\n\n');
        if (!text.trim()) { LN.toast('No text found. This PDF may be scanned images.'); return; }
        api.createNote(text);
      }).catch(fail);
    }

    // Page sizes beyond the first are read in the background; the layout only moves if a page is a different size.
    function readSizes(from) {
      if (dead || !pdf) return;
      var changed = false;
      var end = Math.min(pdf.numPages, from + 12);
      var chain = Promise.resolve();
      for (var n = from; n <= end; n++) {
        (function (k) {
          chain = chain.then(function () { return pdf.getPage(k); }).then(function (pg) {
            var v = pg.getViewport({ scale: 1 });
            var p = pages[k - 1];
            if (Math.abs(p.w1 - v.width) > 0.5 || Math.abs(p.h1 - v.height) > 0.5) { p.w1 = v.width; p.h1 = v.height; changed = true; }
          });
        })(n);
      }
      chain.then(function () {
        if (dead) return;
        if (end >= pdf.numPages) { if (changed || sizesChanged) layout(); return; }
        if (changed) sizesChanged = true;
        setTimeout(function () { readSizes(end + 1); }, 0);
      }).catch(function () { /* a bad page keeps the size of the first one */ });
    }
    var sizesChanged = false;

    load().then(function (m) {
      return m.getDocument({ data: new Uint8Array(bytes) }).promise;
    }).then(function (d) {
      if (dead) { d.destroy(); return null; }
      pdf = d;
      return pdf.getPage(1);
    }).then(function (pg) {
      if (!pg || dead) return;
      var v1 = pg.getViewport({ scale: 1 });
      for (var n = 1; n <= pdf.numPages; n++) {
        var box = document.createElement('div');
        box.className = 'pdf-box';
        box.setAttribute('role', 'img');
        box.setAttribute('aria-label', 'Page ' + n);
        var p = { n: n, box: box, cv: null, w1: v1.width, h1: v1.height, rendered: false, busy: false, task: null, key: 0 };
        box._p = p;
        pages.push(p);
        col.appendChild(box);
      }
      lastW = wrap.clientWidth;
      pages.forEach(size);
      measure();
      showPos();
      observe();
      if (pdf.numPages > 1) readSizes(2);
    }).catch(function (e) {
      col.textContent = e && /import|fetch|load/i.test(String(e.message || e))
        ? 'The PDF engine could not load. The app is missing www/vendor/pdfjs (pdf.min.mjs and pdf.worker.min.mjs). Reinstall the app, or restore that folder and reload.'
        : 'Could not open this PDF. ' + (e && e.message ? e.message : '');
    });

    return {
      bytes: function () { return Promise.resolve(bytes); },
      destroy: function () {
        dead = true;
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        document.removeEventListener('keydown', onKey);
        pages.forEach(release);
        el.classList.remove('pdf-full', 'pdfx');
        document.body.classList.remove('pdf-fs');
        if (pdf) pdf.destroy();
        el.textContent = '';
      }
    };
  }

  // Render a small first-page thumbnail for the attachment strip. The caller owns the canvas.
  function thumbnail(bytes, canvas, maxWidth) {
    return load().then(function (m) {
      return m.getDocument({ data: new Uint8Array(bytes) }).promise;
    }).then(function (pdf) {
      return pdf.getPage(1).then(function (page) {
        var base = page.getViewport({ scale: 1 });
        var scale = Math.min((maxWidth || 220) / base.width, 1);
        var vp = page.getViewport({ scale: scale });
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        var ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          pdf.destroy(); return { width: canvas.width, height: canvas.height };
        }, function (e) { pdf.destroy(); throw e; });
      }, function (e) { pdf.destroy(); throw e; });
    });
  }

  // V0.7.5: all text of a PDF, once with spaces between words and once without (so a key split across text runs still reads whole).
  function text(bytes) {
    return load().then(function (m) { return m.getDocument({ data: new Uint8Array(bytes) }).promise; }).then(function (pdf) {
      var spaced = [], tight = [], chain = Promise.resolve();
      var pages = Math.min(pdf.numPages, 300);
      for (var i = 1; i <= pages; i++) {
        (function (n) {
          chain = chain.then(function () { return pdf.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            spaced.push(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join(''));
            tight.push(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ''); }).join(''));
          });
        })(i);
      }
      return chain.then(function () { pdf.destroy(); return { spaced: spaced.join('\n'), tight: tight.join('\n') }; }, function (e) { pdf.destroy(); throw e; });
    });
  }

  LN.pdfv = { mount: mount, text: text, thumbnail: thumbnail };
})(window.LN = window.LN || {});
