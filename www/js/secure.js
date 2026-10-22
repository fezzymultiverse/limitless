(function (LN) {
  'use strict';
  // Extra security: idle auto-lock, clipboard clearing, warnings before unencrypted exports.
  // The PIN lock, lock-on-return timer, fingerprint and encryption live in lock.js.

  var lastTouch = Date.now();
  var idleTimer = null;
  var clipTimer = null;
  var clipText = null;
  var clipAt = 0;
  var clipGeneration = 0;

  function log(l, m) { if (LN.log) LN.log(l, m); }
  function protectedApp() { return !!(LN.lock && LN.lock.hasPin()); }

  // ---------- idle auto-lock ----------
  function touch() { lastTouch = Date.now(); }

  function checkIdle() {
    var ms = Number(LN.store.get('lockIdle')) || 0;
    if (!ms || !protectedApp() || document.hidden) return;
    if (Date.now() - lastTouch >= ms) {
      log('info', 'Locked after ' + Math.round(ms / 60000) + ' min idle');
      LN.lock.lockNow();
    }
  }

  // ---------- clipboard clearing ----------
  function readClip() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.reject(new Error('no read'));
    return navigator.clipboard.readText();
  }
  function wipe() {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.reject(new Error('no write'));
    return navigator.clipboard.writeText('');
  }

  function clearNow() {
    var text = clipText;
    var generation = clipGeneration;
    if (text === null || !document.hasFocus()) return Promise.resolve(false);
    // Never clear without a readable comparison: Android may have replaced the clipboard
    // while the timeout/read was pending, and background access is intentionally best-effort.
    return readClip().then(function (cur) {
      if (generation !== clipGeneration || clipText !== text || cur !== text) {
        if (generation === clipGeneration && cur !== text) clipText = null;
        return false;
      }
      return wipe().then(function () {
        // A newer app copy can happen while writeText('') is pending. Do not clear its tracking.
        if (generation !== clipGeneration || clipText !== text) return false;
        clipText = null;
        log('info', 'Clipboard cleared');
        return true;
      });
    }).catch(function () { return false; });
  }

  function copied(text) {
    var sec = Number(LN.store.get('clipClear')) || 0;
    if (!sec || !text) return;
    clipText = String(text);
    clipGeneration++;
    clipAt = Date.now();
    if (clipTimer) clearTimeout(clipTimer);
    clipTimer = setTimeout(function () {
      clipTimer = null;
      clearNow().then(function (done) {
        if (!done && clipText !== null) log('warn', 'Clipboard could not be cleared while the app was in the background');
      });
    }, sec * 1000);
  }

  function selectedText(target) {
    try {
      if (target && typeof target.selectionStart === 'number' && target.selectionEnd > target.selectionStart) {
        return String(target.value).slice(target.selectionStart, target.selectionEnd);
      }
      var s = window.getSelection ? String(window.getSelection()) : '';
      return s;
    } catch (e) { return ''; }
  }

  function hookClipboard() {
    document.addEventListener('copy', function (e) { copied(selectedText(e.target)); }, true);
    document.addEventListener('cut', function (e) { copied(selectedText(e.target)); }, true);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        var orig = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = function (t) {
          return orig(t).then(function (r) { if (t !== '') copied(t); return r; });
        };
      }
    } catch (e) { /* read-only clipboard object */ }
    // back in front after the timer ran in the background: clear only if the clipboard still holds our text
    document.addEventListener('visibilitychange', function () {
      var sec = Number(LN.store.get('clipClear')) || 0;
      if (document.hidden || clipText === null || !sec) return;
      if (Date.now() - clipAt >= sec * 1000) setTimeout(function () { clearNow(); }, 400);
    });
  }

  // ---------- export warnings ----------
  // what: 'A backup', 'This file', ... Resolves true to go ahead. Only asks when the person uses a PIN
  // or encryption, because that is when they expect their notes to be protected.
  function warnExport(what) {
    if (LN.store.get('exportWarn') === false || !protectedApp()) return Promise.resolve(true);
    var enc = LN.lock.encOn();
    var text = what + ' leaves the app unprotected' + (enc ? ' even though encryption is on' : '') +
      '. Anyone who gets it can read it, and the app\'s PIN does not protect it. Continue?';
    return Promise.resolve(window.confirm(text));
  }

  function init() {
    ['pointerdown', 'keydown', 'input', 'touchstart', 'scroll'].forEach(function (ev) {
      document.addEventListener(ev, touch, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) touch(); });
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(checkIdle, 5000);
    hookClipboard();
  }

  LN.secure = { init: init, warnExport: warnExport, copied: copied, clearNow: clearNow, touch: touch };
})(window.LN = window.LN || {});
