(function (LN) {
  'use strict';
  // V0.7.17 Bojack Easter egg. Tap the LIMITLESS NOTEPAD logo 5 times quickly (header logo or the home hero logo):
  // paw prints walk across the screen, then a "Bojack Security: on watch" card barks. Nothing is stored, no sound.

  var TAPS = 5;
  var WINDOW_MS = 2500;       // all five taps must land inside this
  var STEPS = 12;             // paw prints
  var STEP_MS = 140;          // gap between prints
  var taps = [];
  var running = false;
  var layer = null;
  var egg = null;
  var timers = [];

  function el(tag, cls, text) { return LN.ui.el(tag, cls, text); }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  var PAW = '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="21" rx="7.5" ry="6"/>' +
    '<ellipse cx="6.5" cy="13" rx="3" ry="4" transform="rotate(-20 6.5 13)"/><ellipse cx="12.5" cy="7.5" rx="3" ry="4.2"/>' +
    '<ellipse cx="19.5" cy="7.5" rx="3" ry="4.2"/><ellipse cx="25.5" cy="13" rx="3" ry="4" transform="rotate(20 25.5 13)"/></svg>';

  // A husky/lab mix, simple on purpose: dark head, cream muzzle, upright ears, a jaw that moves.
  var DOG = '<svg class="bj-dog" viewBox="0 0 160 150" aria-hidden="true">' +
    '<g class="bj-arcs"><path d="M128 52q14 8 0 24" /><path d="M138 44q22 16 0 40" /><path d="M148 36q30 24 0 56" /></g>' +
    '<g class="bj-head">' +
    '<path class="bj-ear" d="M34 62L30 14l36 26z"/><path class="bj-ear" d="M126 62l4-48-36 26z"/>' +
    '<path class="bj-ear-in" d="M38 54l-2-26 18 14z"/><path class="bj-ear-in" d="M122 54l2-26-18 14z"/>' +
    '<ellipse class="bj-skull" cx="80" cy="76" rx="52" ry="46"/>' +
    '<path class="bj-mask" d="M80 34c-14 0-26 8-30 22 10-4 20 0 30 14 10-14 20-18 30-14-4-14-16-22-30-22z"/>' +
    '<ellipse class="bj-muzzle" cx="80" cy="96" rx="30" ry="24"/>' +
    '<circle class="bj-eye" cx="60" cy="72" r="6"/><circle class="bj-eye" cx="100" cy="72" r="6"/>' +
    '<circle class="bj-shine" cx="62" cy="70" r="2"/><circle class="bj-shine" cx="102" cy="70" r="2"/>' +
    '<path class="bj-brow" d="M50 60l14-4M110 60l-14-4"/>' +
    '<path class="bj-nose" d="M70 86q10-6 20 0q-2 10-10 12q-8-2-10-12z"/>' +
    '<g class="bj-jaw"><path class="bj-jaw-s" d="M62 106q18 6 36 0q-2 20-18 22q-16-2-18-22z"/>' +
    '<path class="bj-tongue" d="M72 116q8 12 16 0q-8-4-16 0z"/></g>' +
    '<path class="bj-lip" d="M62 104q18 8 36 0"/>' +
    '</g></svg>';

  function closeEgg() {
    clearTimers();
    if (layer) { layer.remove(); layer = null; }
    if (egg) {
      var back = egg._back;
      egg.remove();
      egg = null;
      document.removeEventListener('keydown', onKey, true);
      if (back && back.focus) { try { back.focus(); } catch (e) { /* focus is best effort */ } }
    }
    running = false;
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeEgg(); }
  }

  function showCard() {
    if (layer) { layer.remove(); layer = null; }
    egg = el('div', 'bj-egg');
    egg._back = document.activeElement;
    egg.setAttribute('role', 'dialog');
    egg.setAttribute('aria-modal', 'true');
    egg.setAttribute('aria-label', 'Bojack Security: on watch');
    var card = el('div', 'bj-card');
    var stage = el('div', 'bj-stage');
    stage.innerHTML = DOG;
    stage.appendChild(el('span', 'bj-woof w1', 'WOOF!'));
    stage.appendChild(el('span', 'bj-woof w2', 'WOOF!'));
    card.appendChild(stage);
    var t = el('div', 'bj-title');
    var dot = el('span', 'bj-dot');
    dot.setAttribute('aria-hidden', 'true');
    t.appendChild(dot);
    t.appendChild(el('span', '', 'Bojack Security: on watch'));
    card.appendChild(t);
    card.appendChild(el('div', 'bj-sub', 'S.O.I. × Bojack Security · 999'));
    card.appendChild(el('div', 'bj-line', 'Strategy Over Impulse. Nobody gets past Bojack.'));
    var close = el('button', 'btn primary bj-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', closeEgg);
    card.appendChild(close);
    egg.appendChild(card);
    egg.addEventListener('click', function (e) { if (e.target === egg) closeEgg(); });
    document.getElementById('app').appendChild(egg);
    document.addEventListener('keydown', onKey, true);
    try { if (navigator.vibrate) navigator.vibrate([30, 60, 30]); } catch (e) { /* haptics are optional */ }
    try { close.focus(); } catch (e) { /* focus is best effort */ }
  }

  function walk() {
    var W = window.innerWidth || 360, H = window.innerHeight || 640;
    layer = el('div', 'bj-paws');
    layer.setAttribute('aria-hidden', 'true');
    var x0 = W * 0.1, y0 = H * 0.86, dx = W * 0.8, dy = -H * 0.74;
    var ang = Math.atan2(dx, -dy) * 180 / Math.PI;      // the paw points the way he is walking
    var len = Math.sqrt(dx * dx + dy * dy);
    var px = -dy / len, py = dx / len;                  // sideways, so left and right paws alternate
    for (var i = 0; i < STEPS; i++) {
      var t = i / (STEPS - 1);
      var side = (i % 2 ? 1 : -1) * 16;
      var p = el('span', 'bj-paw');
      p.innerHTML = PAW;
      p.style.left = (x0 + dx * t + px * side - 15) + 'px';
      p.style.top = (y0 + dy * t + py * side - 15) + 'px';
      p.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
      p.style.animationDelay = (i * STEP_MS) + 'ms';
      layer.appendChild(p);
    }
    document.getElementById('app').appendChild(layer);
    later(showCard, STEPS * STEP_MS + 700);
  }

  function start() {
    if (running) return;
    running = true;
    if (LN.ui && LN.ui.closeAll) LN.ui.closeAll();
    if (reduced()) showCard(); else walk();
  }

  function tap() {
    if (running) return;
    var now = Date.now();
    taps.push(now);
    while (taps.length > TAPS) taps.shift();
    if (taps.length === TAPS && now - taps[0] <= WINDOW_MS) {
      taps = [];
      start();
    }
  }

  // Attach the five-tap trigger to any element (header logo, home hero logo).
  function bind(node) {
    if (!node || node._bj) return;
    node._bj = true;
    node.style.touchAction = 'manipulation';
    node.addEventListener('click', tap);
  }

  function init() {
    bind(document.querySelector('.bar .logo'));
  }

  LN.bojack = { init: init, bind: bind, start: start, close: closeEgg, isOpen: function () { return running; } };
})(window.LN = window.LN || {});
