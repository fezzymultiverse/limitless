(function (LN) {
  'use strict';

  var el = null;
  var searchEl = null;
  var selected = null;
  var query = '';
  var dragId = null;
  var editing = false;   // V0.7.20 Edit order mode

  function expanded() { return LN.store.get('expanded') || {}; }
  function isOpen(id) { return !!expanded()[id]; }
  function setOpen(id, v) {
    var m = Object.assign({}, expanded());
    if (v) m[id] = true; else delete m[id];
    LN.store.set('expanded', m);
  }

  function iconFor(n) {
    if (n.type === 'folder') return 'folder';
    var ext = (/\.([^.]+)$/.exec(n.name) || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    var kd = LN.kindOfNode(n);
    if (kd === 'img') return 'image';
    if (kd === 'media') return 'music';
    if (ext === 'csv' || ext === 'tsv' || ext === 'xlsx') return 'table';
    if (['sh', 'js', 'json', 'html', 'css', 'xml', 'yml', 'yaml'].indexOf(ext) >= 0) return 'code';
    return 'file';
  }

  function makeRow(n, depth, pathLabel) {
    var row = document.createElement('div');
    row.className = 'row' + (n.id === selected ? ' sel' : '') + (!query && n.type === 'folder' && n.id === dest() && (LN.store.get('newDest') || 'tapped') === 'tapped' ? ' dest' : '');
    row.setAttribute('role', 'treeitem');
    row.tabIndex = 0;
    row.dataset.id = n.id;
    row.style.setProperty('--depth', depth);
    row.draggable = !query && !editing;
    if (n.type === 'folder' && !query) row.setAttribute('aria-expanded', isOpen(n.id) ? 'true' : 'false');

    var lead = document.createElement('span');
    if (n.type === 'folder' && !query) {
      lead.className = 'chev' + (isOpen(n.id) ? ' open' : '');
      lead.innerHTML = LN.icon('chevron', 14);
    } else {
      lead.className = 'gap';
    }
    var ico = document.createElement('span');
    ico.className = 'ico';
    ico.innerHTML = LN.icon(iconFor(n), 16);
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = n.name;
    row.appendChild(lead);
    row.appendChild(ico);
    row.appendChild(nm);
    if (editing && !query) {
      var ctl = document.createElement('span');
      ctl.className = 'ord-ctl';
      var sibs = LN.vault.children(n.parent);
      var pos = sibs.indexOf(n);
      [['up', 'arrow-up', 'Move up', pos <= 0], ['down', 'arrow-down', 'Move down', pos >= sibs.length - 1]].forEach(function (d) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ord-btn';
        b.dataset.ord = d[0];
        b.setAttribute('aria-label', d[2] + ': ' + n.name);
        b.disabled = d[3];
        b.innerHTML = LN.icon(d[1], 16);
        ctl.appendChild(b);
      });
      row.appendChild(ctl);
    }
    if (pathLabel) {
      var p = document.createElement('span');
      p.className = 'pth';
      p.textContent = pathLabel;
      row.appendChild(p);
    }
    return row;
  }

  function orderBanner() {
    var b = document.createElement('div');
    b.className = 'ord-banner';
    var t = document.createElement('span');
    t.textContent = 'Edit order: use the arrows to place your folders and notes';
    var d = document.createElement('button');
    d.type = 'button';
    d.className = 'ord-done';
    d.textContent = 'Done';
    d.addEventListener('click', function () { setEditing(false); });
    b.appendChild(t);
    b.appendChild(d);
    return b;
  }
  function setEditing(v) {
    editing = !!v;
    var b = document.getElementById('t-order');
    if (b) { b.setAttribute('aria-pressed', editing ? 'true' : 'false'); b.classList.toggle('on', editing); }
    if (el) el.classList.toggle('ordering', editing);
    render();
  }

  function render() {
    if (!el) return;
    var keepTop = el.scrollTop;
    el.textContent = '';
    var frag = document.createDocumentFragment();
    if (editing && !query) frag.appendChild(orderBanner());
    if (query) {
      var hits = LN.vault.search(query);
      hits.forEach(function (h) {
        frag.appendChild(makeRow(h, 0, h.parent ? LN.vault.path(h.parent) : ''));
      });
      if (!hits.length) {
        var none = document.createElement('div');
        none.className = 'tree-empty';
        none.textContent = 'No matches for "' + query + '"';
        frag.appendChild(none);
      }
    } else {
      var root = document.createElement('div');
      root.className = 'row root' + (dest() === null && (LN.store.get('newDest') || 'tapped') === 'tapped' ? ' dest' : '');
      root.setAttribute('role', 'treeitem');
      root.tabIndex = 0;
      root.dataset.root = '1';
      root.style.setProperty('--depth', 0);
      var rg = document.createElement('span'); rg.className = 'gap';
      var ri = document.createElement('span'); ri.className = 'ico'; ri.innerHTML = LN.icon('folder', 16);
      var rn = document.createElement('span'); rn.className = 'nm'; rn.textContent = 'Top level';
      root.appendChild(rg); root.appendChild(ri); root.appendChild(rn);
      frag.appendChild(root);
      (function walk(pid, depth) {
        LN.vault.children(pid).forEach(function (n) {
          frag.appendChild(makeRow(n, depth));
          if (n.type === 'folder' && isOpen(n.id)) walk(n.id, depth + 1);
        });
      })(null, 0);
      if (!frag.childNodes.length) {
        var empty = document.createElement('div');
        empty.className = 'tree-empty';
        empty.textContent = 'Your vault is empty. Create a file with the new file button.';
        frag.appendChild(empty);
      }
    }
    el.appendChild(frag);
    el.scrollTop = keepTop;
  }

  function expandAncestors(id) {
    var n = LN.vault.get(id);
    var p = n ? LN.vault.get(n.parent) : null;
    while (p) { setOpen(p.id, true); p = LN.vault.get(p.parent); }
  }

  function select(id, silent) {
    selected = id || null;
    if (selected && !query) expandAncestors(selected);
    render();
    if (selected && !silent) { /* selection only, no tab change */ }
    var row = el.querySelector('.row.sel');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function activate(id, deferClose) {
    var n = LN.vault.get(id);
    if (!n) return;
    if (n.type === 'folder') {
      if (query) {
        query = '';
        searchEl.value = '';
        selected = id;
        setDest(id);
        setOpen(id, true);
        expandAncestors(id);
        render();
        return;
      }
      selected = id;
      setDest(id);
      setOpen(id, !isOpen(id));
      render();
      return;
    }
    selected = id;
    // tapping the note that is already open must not reload it (that threw away the scroll position and caret)
    if (!(LN.editor && LN.editor.currentId && LN.editor.currentId() === id)) LN.tabs.open(id);
    else render();
    if (deferClose) closeSoon(); else closeNow();
  }

  // On a phone the panel used to close on the first tap, so the second tap of a double-tap landed on the editor.
  // Now it waits long enough for the second tap.
  var closeTimer = null;
  function closeNow() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (LN.app && LN.app.closeDrawer) LN.app.closeDrawer();
  }
  function closeSoon() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { closeTimer = null; if (LN.app && LN.app.closeDrawer) LN.app.closeDrawer(); }, 460);
  }

  // V0.7.15: where a new file or folder lands no longer follows whatever happened to be selected last (that is why
  // notes seemed to turn up in random folders). It is the folder you tapped, or Top level, unless Settings says otherwise.
  function dest() {
    var id = LN.store.get('destId');
    var n = id ? LN.vault.get(id) : null;
    return n && n.type === 'folder' ? id : null;
  }
  function setDest(id) { LN.store.set('destId', id || null); }
  function destParent() {
    var how = LN.store.get('newDest') || 'tapped';
    if (how === 'top') return null;
    if (how === 'current') {
      var cur = LN.editor && LN.editor.currentId ? LN.vault.get(LN.editor.currentId()) : null;
      return cur ? (cur.parent || null) : dest();
    }
    return dest();
  }
  function destLabel(id) { return id ? LN.vault.path(id) : 'Top level'; }
  function targetParent() { return destParent(); }

  function fail(e) { LN.toast(e && e.message ? e.message : 'Something went wrong'); }

  function newItem(type) {
    var ext = LN.store.get('defaultExt');
    if (['md', 'txt', 'html', 'csv', 'sh', 'json'].indexOf(ext) < 0) ext = 'md';
    var where = destParent();
    var label = (type === 'file' ? 'File name (for example notes.' + ext + ')' : 'Folder name') + '\nIn: ' + destLabel(where);
    var name = window.prompt(label, '');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    if (type === 'file' && !/\.[A-Za-z0-9]+$/.test(name)) name += '.' + ext;
    var parent = where;
    LN.vault.create(type, name, parent).then(seedBlank).then(function (n) {
      if (parent) setOpen(parent, true);
      if (type === 'folder') setDest(n.id);
      selected = n.id;
      if (query) { query = ''; searchEl.value = ''; }
      render();
      if (type === 'file') LN.tabs.open(n.id);
      if (type === 'file' && LN.app && LN.app.closeDrawer) LN.app.closeDrawer();
    }).catch(fail);
  }

  function seedBlank(n) {
    var e = LN.ext(n.name);
    var make = n.type === 'file' ? (e === 'docx' ? LN.docx.blank : (e === 'xlsx' ? LN.xlsx.blank : null)) : null;
    if (!make) return Promise.resolve(n);
    return make().then(function (b) { return LN.vault.updateBlob(n.id, b); }).then(function () { return n; });
  }

  function importFiles(files) {
    var list = Array.prototype.slice.call(files);
    var parent = targetParent();
    var last = null;
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () { return f.arrayBuffer(); }).then(function (buf) {
        var u = new Uint8Array(buf);
        var payload;
        if (LN.isBin(LN.kindOf(f.name))) payload = u;
        else {
          var dec = LN.decodeText(u);
          if (!dec) payload = u;
          else {
            payload = dec.text;
            if (dec.enc !== 'UTF-8') LN.toast(f.name + ' was read as ' + dec.enc);
          }
        }
        if (LN.keys) LN.keys.watchFile(f.name, u, typeof payload === 'string' ? payload : null);
        return LN.vault.importFile(f.name, parent, payload).then(function (n) { last = n; });
      });
    });
    chain.then(function () {
      if (parent) setOpen(parent, true);
      render();
      if (last) { selected = last.id; LN.tabs.open(last.id); render(); }
    }).catch(fail);
  }

  function exportSelected() {
    var n = LN.vault.get(selected);
    if (!n || n.type !== 'file') { LN.toast('Select a file first'); return; }
    LN.secure.warnExport('This file').then(function (ok) {
      if (!ok) return null;
      return LN.editor.flush().then(function () {
        var blob = new Blob([n.bytes ? n.bytes : (n.content || '')], { type: 'application/octet-stream' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = n.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      });
    });
  }

  function renameSelected() {
    var n = LN.vault.get(selected);
    if (!n) { LN.toast('Select a file or folder first'); return; }
    var name = window.prompt('New name', n.name);
    if (name == null) return;
    LN.vault.rename(n.id, name).then(function () {
      render();
      LN.tabs.render();
      LN.editor.refreshMeta();
    }).catch(fail);
  }

  function moveSelected() {
    var n = LN.vault.get(selected);
    if (!n) { LN.toast('Select a file or folder first'); return; }
    var here = n.parent ? LN.vault.path(n.parent) : '';
    var dest = window.prompt('Move to folder (for example Welcome). Leave blank for the top level.', here);
    if (dest == null) return;
    var r = LN.vault.resolvePath(dest);
    if (!r.ok) { LN.toast('No folder named "' + dest.trim() + '"'); return; }
    moveTo(n.id, r.id);
  }

  function moveTo(id, parent) {
    LN.vault.move(id, parent).then(function () {
      if (parent) setOpen(parent, true);
      render();
      LN.editor.refreshMeta();
    }).catch(fail);
  }

  function deleteSelected() {
    var n = LN.vault.get(selected);
    if (!n) { LN.toast('Select a file or folder first'); return; }
    var inside = n.type === 'folder' ? ' and everything inside it' : '';
    var msg = LN.bin.enabled() ? 'Move "' + n.name + '"' + inside + ' to the Recycle bin?' : 'Delete "' + n.name + '"' + inside + ' for good? This can\'t be undone.';
    if (LN.store.get('confirmDelete') !== false && !window.confirm(msg)) return;
    LN.editor.flush().then(function () { return LN.bin.discard(n); }).then(function (ids) {
      LN.tabs.closeMany(ids);
      if (ids.indexOf(selected) >= 0) selected = null;
      render();
    }).catch(fail);
  }

  function rowOf(target) { return target && target.closest ? target.closest('.row') : null; }

  function dropDestination(row) {
    if (!row) return null;
    var n = LN.vault.get(row.dataset.id);
    if (!n) return null;
    return n.type === 'folder' ? n.id : n.parent;
  }

  function clearDrop() {
    var l = el.querySelectorAll('.drop-target');
    for (var i = 0; i < l.length; i++) l[i].classList.remove('drop-target');
    el.classList.remove('drop-root');
  }

  function bindDrag() {
    el.addEventListener('dragstart', function (e) {
      var row = rowOf(e.target);
      if (!row) return;
      dragId = row.dataset.id;
      e.dataTransfer.setData('text/plain', dragId);
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', function (e) {
      if (!dragId) return;
      e.preventDefault();
      clearDrop();
      var row = rowOf(e.target);
      if (row) {
        var n = LN.vault.get(row.dataset.id);
        if (n && n.type === 'folder') row.classList.add('drop-target');
      } else {
        el.classList.add('drop-root');
      }
    });
    el.addEventListener('dragleave', function (e) {
      if (e.target === el) clearDrop();
    });
    el.addEventListener('drop', function (e) {
      if (!dragId) return;
      e.preventDefault();
      var id = dragId;
      var dest = dropDestination(rowOf(e.target));
      dragId = null;
      clearDrop();
      moveTo(id, dest);
    });
    el.addEventListener('dragend', function () { dragId = null; clearDrop(); });
  }

  function init() {
    el = document.getElementById('tree');
    searchEl = document.getElementById('search');

    var lastTap = { id: null, at: 0 };
    function openForEdit(id) {
      if (!(LN.editor && LN.editor.currentId && LN.editor.currentId() === id)) LN.tabs.open(id);
      selected = id;
      if (LN.editor && LN.editor.editCurrent) LN.editor.editCurrent();
      render();
      closeNow();
    }
    el.addEventListener('click', function (e) {
      var ob = e.target.closest ? e.target.closest('.ord-btn') : null;
      if (ob) {
        e.stopPropagation();
        var orow = rowOf(ob);
        if (orow && !ob.disabled) {
          var oid = orow.dataset.id;
          LN.vault.reorder(oid, ob.dataset.ord === 'up' ? -1 : 1).then(function () {
            render();
            var r2 = el.querySelector('.row[data-id="' + oid + '"]');
            if (r2 && r2.scrollIntoView) r2.scrollIntoView({ block: 'nearest' });
            try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* haptics are optional */ }
          }).catch(fail);
        }
        return;
      }
      var row = rowOf(e.target);
      if (!row) return;
      if (editing) {
        var en = row.dataset.id ? LN.vault.get(row.dataset.id) : null;
        if (en && en.type === 'folder') { setOpen(en.id, !isOpen(en.id)); render(); }
        return;
      }
      if (row.dataset.root) { setDest(null); selected = null; render(); return; }
      var id = row.dataset.id;
      var now = Date.now();
      var n = LN.vault.get(id);
      // Touch devices do not consistently dispatch dblclick; detect a quick second tap too.
      if (n && n.type === 'file' && lastTap.id === id && now - lastTap.at <= 420) {
        lastTap = { id: null, at: 0 };
        openForEdit(id);
        return;
      }
      lastTap = { id: id, at: now };
      activate(id, true);
    });
    el.addEventListener('dblclick', function (e) {
      if (editing) return;
      var row = rowOf(e.target);
      if (!row || row.dataset.root) return;
      var n = LN.vault.get(row.dataset.id);
      if (!n || n.type !== 'file') return;
      e.preventDefault();
      openForEdit(n.id);
    });
    el.addEventListener('keydown', function (e) {
      var row = rowOf(e.target);
      if (!row) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (row.dataset.root) { setDest(null); selected = null; render(); } else activate(row.dataset.id); }
      else if (e.key === 'F2') { e.preventDefault(); selected = row.dataset.id; renameSelected(); }
      else if (e.key === 'Delete') { e.preventDefault(); selected = row.dataset.id; deleteSelected(); }
      else if (e.key === 'ArrowDown' && row.nextElementSibling) { e.preventDefault(); row.nextElementSibling.focus(); }
      else if (e.key === 'ArrowUp' && row.previousElementSibling) { e.preventDefault(); row.previousElementSibling.focus(); }
    });
    searchEl.addEventListener('input', function () {
      query = searchEl.value.trim();
      render();
    });
    document.getElementById('t-newfile').addEventListener('click', function () { newItem('file'); });
    document.getElementById('t-newfolder').addEventListener('click', function () { newItem('folder'); });
    document.getElementById('t-rename').addEventListener('click', renameSelected);
    document.getElementById('t-move').addEventListener('click', moveSelected);
    document.getElementById('t-delete').addEventListener('click', deleteSelected);
    var pick = document.getElementById('t-file');
    document.getElementById('t-import').addEventListener('click', function () { pick.click(); });
    pick.addEventListener('change', function () { if (pick.files.length) importFiles(pick.files); pick.value = ''; });
    document.getElementById('t-export').addEventListener('click', exportSelected);
    document.getElementById('t-order').addEventListener('click', function () { setEditing(!editing); });
    bindDrag();
    render();
  }

  LN.tree = {
    init: init, render: render, setEditing: setEditing, select: select, newItem: newItem, destParent: destParent,
    selectedId: function () { return selected; }
  };
})(window.LN = window.LN || {});
