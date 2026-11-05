(function () {
  'use strict';
  // V0.7.16: runs before anything else. Paints the saved theme at once (no white flash for dark users) and, if the vault
  // takes too long or fails, turns the loading screen into a message with a Retry button instead of leaving it stuck.
  try {
    var s = JSON.parse(localStorage.getItem('ln.settings.v1') || '{}') || {};
    if (s.theme === 'dark' || s.theme === 'light') document.documentElement.setAttribute('data-theme', s.theme);
  } catch (e) { /* first launch or storage blocked: the light theme stays */ }

  function slow() {
    var p = document.getElementById('vault-loading');
    if (!p || p.hidden) return;
    var d = document.getElementById('vault-loading-detail');
    if (d) d.textContent = 'This is taking longer than usual. Your notes are safe on this device.';
    var b = document.getElementById('boot-retry');
    if (b) b.hidden = false;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('boot-retry');
    if (b) b.addEventListener('click', function () { window.location.reload(); });
    setTimeout(slow, 12000);
  });
  window.LNBootSlow = slow;
})();
