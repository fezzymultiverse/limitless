(function (LN) {
  'use strict';
  // Editor preferences that need code: line numbers (kept in step with wrapped lines), spellcheck, line spacing.
  // Word wrap, font and font size are CSS variables set by settings.js applyAppearance().

  var ta = null, stage = null, gut = null, inner = null, mirror = null;
  var raf = 0, built = false;
  var MAX_MEASURE = 4000;
  var chTimer = 0;

  function build() {
    if (built) return true;
    ta = document.getElementById('editor');
    stage = document.getElementById('stage');
    if (!ta || !stage) return false;
    gut = document.createElement('div');
    gut.className = 'ln-gutter';
    gut.setAttribute('aria-hidden', 'true');
    gut.hidden = true;
    inner = document.createElement('div');
    inner.className = 'ln-inner';
    gut.appendChild(inner);
    mirror = document.createElement('div');
    mirror.className = 'ln-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    stage.appendChild(gut);
    stage.appendChild(mirror);
    ta.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(ta);
    if (window.MutationObserver) new MutationObserver(schedule).observe(stage, { attributes: true, attributeFilter: ['data-mode', 'data-kind', 'data-empty'] });
    built = true;
    return true;
  }

  function sync() {
    if (inner && !gut.hidden) inner.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)';
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; paint(); });
  }

  function applyBasic() {
    var ed = document.getElementById('editor');
    if (!ed) return;
    var spell = !!LN.store.get('spellcheck');
    ed.spellcheck = spell;
    ed.setAttribute('autocorrect', spell ? 'on' : 'off');
    var lh = Number(LN.store.get('editorLine')) || 1.7;
    document.documentElement.style.setProperty('--elh', String(lh));
  }

  function shown() {
    return !!ta && ta.offsetParent !== null && stage.getAttribute('data-empty') !== '1' && getComputedStyle(ta).display !== 'none';
  }

  function paint() {
    if (!built && !build()) return;
    var want = !!LN.store.get('lineNumbers') && shown();
    if (!want) {
      gut.hidden = true;
      ta.style.paddingLeft = '';
      return;
    }
    var cs = getComputedStyle(ta);
    var fs = parseFloat(cs.fontSize) || 14;
    var lh = parseFloat(cs.lineHeight) || fs * 1.7;
    var lines = ta.value.split('\n');
    var n = lines.length;
    var digits = String(n).length;
    var cw = fs * 0.62;
    var gw = Math.ceil(Math.max(2, digits) * cw + 18);
    var padL = 16;

    gut.style.fontFamily = cs.fontFamily;
    gut.style.fontSize = cs.fontSize;
    gut.style.lineHeight = lh + 'px';
    gut.style.paddingTop = cs.paddingTop;
    gut.style.width = gw + 'px';
    gut.style.left = ta.offsetLeft + 'px';
    gut.style.top = ta.offsetTop + 'px';
    gut.style.height = ta.clientHeight + 'px';
    ta.style.paddingLeft = (gw + padL - 6) + 'px';

    var wrap = LN.store.get('lineWrap') !== false && n <= MAX_MEASURE;
    var rows = null;
    if (wrap) {
      var textW = ta.clientWidth - (gw + padL - 6) - (parseFloat(cs.paddingRight) || 0);
      mirror.style.width = Math.max(40, textW) + 'px';
      mirror.style.fontFamily = cs.fontFamily;
      mirror.style.fontSize = cs.fontSize;
      mirror.style.fontWeight = cs.fontWeight;
      mirror.style.lineHeight = lh + 'px';
      mirror.style.letterSpacing = cs.letterSpacing;
      mirror.style.tabSize = cs.tabSize;
      mirror.textContent = '';
      var frag = document.createDocumentFragment();
      for (var i = 0; i < n; i++) {
        var d = document.createElement('div');
        d.textContent = lines[i] === '' ? '​' : lines[i];
        frag.appendChild(d);
      }
      mirror.appendChild(frag);
      rows = new Array(n);
      var kids = mirror.children;
      for (var j = 0; j < n; j++) rows[j] = Math.max(1, Math.round(kids[j].offsetHeight / lh));
      mirror.textContent = '';
    }

    var out = [];
    for (var k = 0; k < n; k++) {
      out.push(String(k + 1));
      if (rows) for (var r = 1; r < rows[k]; r++) out.push('');
    }
    inner.textContent = out.join('\n');
    gut.hidden = false;
    sync();
  }

  function refresh() { applyBasic(); schedule(); }

  // V0.7.8: called on every keystroke. Does nothing unless line numbers are on, and then waits for a pause,
  // because re-measuring every wrapped line on each key was what made long notes freeze while typing.
  function changed() {
    if (!LN.store.get('lineNumbers')) return;
    if (chTimer) clearTimeout(chTimer);
    chTimer = setTimeout(function () { chTimer = 0; schedule(); }, 160);
  }

  function init() { build(); refresh(); }

  LN.editprefs = { init: init, refresh: refresh, applyBasic: applyBasic, changed: changed };
})(window.LN = window.LN || {});
