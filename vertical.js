(function (LN) {
  'use strict';
  // V0.7.22: documents are read top to bottom, using the whole height of the phone.
  // Wraps the existing viewers (pdfv, pptx, docx, xlsx) without changing them:
  //  1. the file card above the viewer shrinks to one line (it used to take about a third of the screen),
  //  2. slides, documents and sheets get the same Full button as PDFs (the phone's Back button already closes it),
  //  3. slides get two-finger pinch zoom.
  var FULL_KINDS = { pptx: 1, docx: 1, xlsx: 1 };

  function card() { return document.getElementById('attachment-preview'); }

  function addFull(el) {
    var bar = el.querySelector('.vw-bar');
    if (!bar && el.querySelector('.docpage')) {
      // the Word viewer has no toolbar of its own: give it a thin one that stays at the top while the page scrolls
      bar = document.createElement('div');
      bar.className = 'vw-bar vbar-only';
      var note = document.createElement('span');
      note.className = 'vw-note';
      note.textContent = 'Word document';
      bar.appendChild(note);
      el.insertBefore(bar, el.firstChild);
    }
    if (!bar || bar.querySelector('.vw-full')) return null;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vw-full';
    b.textContent = 'Full';
    b.setAttribute('aria-label', 'Full screen');
    b.addEventListener('click', function () {
      var on = el.classList.toggle('pdf-full');
      document.body.classList.toggle('pdf-fs', on);
      b.textContent = on ? 'Exit' : 'Full';
      b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* older webview */ }
    });
    bar.appendChild(b);
    return b;
  }

  function dist(e) {
    var a = e.touches[0], b = e.touches[1];
    var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // The slide viewer zooms in steps of 25% with its + and - buttons. A pinch is turned into those same clicks when the fingers lift.
  function addPinch(el) {
    var wrap = el.querySelector('.slide-wrap');
    if (!wrap) return;
    var start = 0, ratio = 1;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { start = dist(e) || 1; ratio = 1; }
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (start && e.touches.length === 2) { ratio = dist(e) / start; if (e.cancelable) e.preventDefault(); }
    }, { passive: false });
    function end(e) {
      if (!start || e.touches.length >= 2) return;
      var r = ratio;
      start = 0; ratio = 1;
      if (Math.abs(r - 1) < 0.12) return;
      var steps = Math.max(1, Math.min(6, Math.round(Math.abs(r - 1) / 0.25)));
      var want = r > 1 ? '+' : '-';
      var btn = Array.prototype.filter.call(el.querySelectorAll('.vw-bar button'), function (x) { return x.textContent === want; })[0];
      for (var i = 0; i < steps && btn; i++) btn.click();
    }
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }

  function wrapKind(name, kind) {
    var mod = LN[name];
    if (!mod || mod._vert || typeof mod.mount !== 'function') return false;
    var orig = mod.mount;
    mod.mount = function (el, bytes, api) {
      var c = card();
      if (c) c.classList.add('slim');
      var v = orig.call(mod, el, bytes, api);
      try {
        if (FULL_KINDS[kind]) addFull(el);
        if (kind === 'pptx') addPinch(el);
      } catch (e) { /* the viewer works without the extras */ }
      if (v && typeof v.destroy === 'function') {
        var d = v.destroy;
        v.destroy = function () {
          var c2 = card();
          if (c2) c2.classList.remove('slim');
          el.classList.remove('pdf-full');
          document.body.classList.remove('pdf-fs');
          return d.apply(v, arguments);
        };
      }
      return v;
    };
    mod._vert = true;
    return true;
  }

  function init() {
    wrapKind('pdfv', 'pdf');
    wrapKind('pptx', 'pptx');
    wrapKind('docx', 'docx');
    wrapKind('xlsx', 'xlsx');
  }
  init();

  LN.vertical = { init: init, wrapKind: wrapKind, addFull: addFull };
})(window.LN = window.LN || {});
