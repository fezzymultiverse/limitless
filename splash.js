(function (LN) {
  'use strict';
  // V0.7.20 loading screen content. Runs the moment the loading markup is parsed, before the heavy scripts, so the clock,
  // greeting and quote are on screen straight away. Clock ticks every second while the vault loads.
  var q = LN.quotes;
  if (!q) return;
  function $(id) { return document.getElementById(id); }
  function paint() {
    var d = new Date();
    var g = $('boot-greet'), t = $('boot-time'), dt = $('boot-date');
    if (g) g.textContent = q.greeting(d);
    if (t) t.textContent = q.timeText(d);
    if (dt) dt.textContent = q.dateText(d);
  }
  // Back from another app within 30 minutes: this is a resume, not a fresh launch. Show only the spinner and "back where you left off".
  try {
    var h = parseInt(localStorage.getItem('ln.hiddenAt') || '0', 10);
    if (h && Date.now() - h < 30 * 60 * 1000) {
      var p0 = $('vault-loading');
      if (p0) p0.classList.add('boot-resume');
      var tt = $('vault-loading-title');
      if (tt) tt.textContent = 'Back where you left off\u2026';
    }
  } catch (e) { /* normal launch screen */ }
  paint();
  var c = q.current();
  var qt = $('boot-quote'), by = $('boot-by');
  if (qt) qt.textContent = '“' + c.t + '”';
  if (by) by.textContent = '— ' + c.by + ' · ' + c.src;
  // V0.7.21: the ring is turned by the browser's animation engine, which keeps going even while the vault is busy loading.
  // If a phone has animations switched off or refuses to start it, a backup turns it by hand so it is never frozen.
  setTimeout(function () {
    try {
      var sp = document.querySelector('#vault-loading .vault-loading-spinner svg');
      if (!sp) return;
      var run = sp.getAnimations ? sp.getAnimations().filter(function (a) { return a.playState === 'running'; }).length : 0;
      if (run) return;
      var a0 = 0;
      (function spin() {
        var p = $('vault-loading');
        if (!p || p.hidden) return;
        a0 = (a0 + 6) % 360;
        sp.style.transform = 'rotate(' + a0 + 'deg)';
        requestAnimationFrame(spin);
      })();
    } catch (e) { /* the CSS spin is the main one */ }
  }, 500);
  var tick = setInterval(function () {
    var p = $('vault-loading');
    if (!p || p.hidden) { clearInterval(tick); return; }
    paint();
  }, 1000);
})(window.LN = window.LN || {});
