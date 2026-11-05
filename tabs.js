(function (LN) {
  'use strict';

  var el = null;
  var open = [];
  var active = null;
  var dirty = {};

  function persist() {
    LN.store.set('openTabs', open);
    LN.store.set('activeTab', active);
  }

  function render() {
    if (!el) return;
    el.textContent = '';
    open.forEach(function (id) {
      var n = LN.vault.get(id);
      if (!n) return;
      var t = document.createElement('div');
      t.className = 'tab' + (id === active ? ' active' : '') + (dirty[id] ? ' dirty' : '');
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', id === active ? 'true' : 'false');
      t.tabIndex = 0;
      t.dataset.id = id;
      t.title = LN.vault.path(id);
      var tl = document.createElement('span');
      tl.className = 'tl';
      tl.textContent = n.name;
      var dot = document.createElement('span');
      dot.className = 'dot';
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.setAttribute('aria-label', 'Close ' + n.name);
      x.dataset.close = id;
      x.innerHTML = LN.icon('x', 14);
      t.appendChild(tl);
      t.appendChild(dot);
      t.appendChild(x);
      el.appendChild(t);
    });
    var cal = document.createElement('button');
    cal.type = 'button';
    cal.className = 'tab-add tab-cal';
    cal.setAttribute('aria-label', 'Calendar');
    cal.title = 'Calendar';
    cal.innerHTML = LN.icon('calendar', 18);
    el.appendChild(cal);
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'tab-add';
    add.setAttribute('aria-label', 'New note');
    add.title = 'New note';
    add.innerHTML = LN.icon('plus', 18);
    el.appendChild(add);
    var a = el.querySelector('.tab.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function activate(id) {
    active = id;
    persist();
    render();
    LN.editor.load(id);
    LN.tree.select(id, true);
  }

  function openTab(id) {
    if (!LN.vault.get(id)) return;
    if (open.indexOf(id) < 0) open.push(id);
    activate(id);
  }

  function close(id) {
    var idx = open.indexOf(id);
    if (idx < 0) return;
    if (id === active) LN.editor.flush();
    open.splice(idx, 1);
    delete dirty[id];
    if (active === id) active = open[idx] || open[idx - 1] || null;
    persist();
    render();
    if (LN.editor.currentId() !== active) LN.editor.load(active);
    if (active) LN.tree.select(active, true);
  }

  function closeMany(ids) {
    var changed = false;
    ids.forEach(function (id) {
      var idx = open.indexOf(id);
      if (idx >= 0) { open.splice(idx, 1); delete dirty[id]; changed = true; }
    });
    if (!changed) return;
    if (ids.indexOf(active) >= 0) active = open[open.length - 1] || null;
    persist();
    render();
    LN.editor.load(active);
    if (active) LN.tree.select(active, true);
  }

  function setDirty(id, v) {
    if (!!dirty[id] === !!v) return;      // nothing changed: do not touch the page on every key
    if (v) dirty[id] = true; else delete dirty[id];
    if (!el) return;
    var t = el.querySelector('.tab[data-id="' + id + '"]');
    if (t) t.classList.toggle('dirty', !!v);
  }

  function init() {
    el = document.getElementById('tabs');
    var saved = LN.store.get('openTabs') || [];
    open = saved.filter(function (id) { var n = LN.vault.get(id); return n && n.type === 'file'; });
    var a = LN.store.get('activeTab');
    active = open.indexOf(a) >= 0 ? a : (open[open.length - 1] || null);
    persist();
    render();

    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.tab-cal')) { LN.plugins.calendar(); return; }
      if (e.target.closest && e.target.closest('.tab-add')) { LN.tree.newItem('file'); return; }
      var x = e.target.closest ? e.target.closest('[data-close]') : null;
      if (x) { close(x.dataset.close); return; }
      var t = e.target.closest ? e.target.closest('.tab') : null;
      if (t && t.dataset.id !== active) activate(t.dataset.id);
    });
    el.addEventListener('auxclick', function (e) {
      if (e.button !== 1) return;
      var t = e.target.closest ? e.target.closest('.tab') : null;
      if (t) { e.preventDefault(); close(t.dataset.id); }
    });
    el.addEventListener('keydown', function (e) {
      var t = e.target.closest ? e.target.closest('.tab') : null;
      if (!t || e.target !== t) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(t.dataset.id); }
    });
  }

  LN.tabs = {
    init: init, open: openTab, close: close, closeMany: closeMany, render: render,
    setDirty: setDirty, active: function () { return active; }
  };
})(window.LN = window.LN || {});
