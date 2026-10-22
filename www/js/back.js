(function (LN) {
  'use strict';
  // V0.7.21: the phone's Back button.
  // The Android shell asks window.LNBack() on every Back press. Return 1 when the app used the press to close something
  // (a sheet, a settings page, the AI chat, a full-screen PDF, the left panel), 0 when nothing was open. On 0 the shell sends
  // the app to the background instead of closing it, so the page, the open note and everything else stay exactly as they are.
  function visible(node) { return !!node && !node.hidden && node.isConnected; }

  function handle() {
    // locked, loading or setting up: Back never peeks behind the lock screen, it just leaves the app in the background
    if (document.querySelector('.ln-lock, .ln-cover')) return 0;
    var boot = document.getElementById('vault-loading');
    if (visible(boot)) return 0;
    if (document.querySelector('.pm')) return 1; // first-run permissions: finish or skip them with the buttons

    // newest sheet first (settings and every dialog are sheets)
    var sheets = Array.prototype.filter.call(document.querySelectorAll('.sheet'), visible);
    if (sheets.length) {
      var top = sheets[sheets.length - 1];
      var st = LN.settings && LN.settings.sheetEl ? LN.settings.sheetEl() : null;
      if (top === st) { if (LN.settings.back()) return 1; }
      else if (LN.ui && LN.ui.closeEl && LN.ui.closeEl(top)) return 1;
      else { top.remove(); return 1; }
    }
    var egg = document.querySelector('.bj-egg');
    if (egg) { egg.remove(); return 1; }
    if (document.body.classList.contains('aic-open') && LN.ai && LN.ai.closePanel) { LN.ai.closePanel(); return 1; }
    var pdf = document.querySelector('.preview.pdf-full');
    if (pdf) { pdf.classList.remove('pdf-full'); return 1; }
    var app = document.getElementById('app');
    if (app && app.classList.contains('drawer-open')) { app.classList.remove('drawer-open'); return 1; }
    return 0;
  }

  window.LNBack = function () {
    try { return handle(); } catch (e) { return 0; }
  };
  LN.back = { handle: handle };
})(window.LN = window.LN || {});
