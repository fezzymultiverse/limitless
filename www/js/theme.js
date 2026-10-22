(function (LN) {
  'use strict';

  var btn = null;

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (btn) {
      btn.innerHTML = LN.icon(theme === 'dark' ? 'sun' : 'moon', 18);
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      btn.title = btn.getAttribute('aria-label');
    }
  }

  function init() {
    btn = document.getElementById('btn-theme');
    var t = LN.store.get('theme');
    if (t !== 'dark' && t !== 'light') t = 'light';
    apply(t);
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      LN.store.set('theme', next);
      apply(next);
    });
  }

  LN.theme = { init: init, apply: apply };
})(window.LN = window.LN || {});
