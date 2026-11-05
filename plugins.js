(function (LN) {
  'use strict';
  // V0.7.18: Calendar (daily notes), Templater (templates with dates and prompts) and Dataview (queries and dashboards).
  // No eval anywhere: the app's security policy forbids it, so templates and queries are parsed by hand.
  var DAILY = 'Daily', TPL = 'Templates';
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var el = function (t, c, x) { return LN.ui.el(t, c, x); };
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function fail(e) { LN.toast(e && e.message ? e.message : 'Something went wrong'); }

  // ---------- dates ----------
  function fmt(d, f) {
    return String(f || 'YYYY-MM-DD').replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g, function (t, lit) {
      var h = d.getHours();
      switch (t) {
        case 'YYYY': return d.getFullYear();
        case 'YY': return String(d.getFullYear()).slice(2);
        case 'MMMM': return MON[d.getMonth()];
        case 'MMM': return MON[d.getMonth()].slice(0, 3);
        case 'MM': return p2(d.getMonth() + 1);
        case 'M': return d.getMonth() + 1;
        case 'DD': return p2(d.getDate());
        case 'D': return d.getDate();
        case 'dddd': return DAY[d.getDay()];
        case 'ddd': return DAY[d.getDay()].slice(0, 3);
        case 'HH': return p2(h);
        case 'H': return h;
        case 'hh': return p2(h % 12 || 12);
        case 'h': return h % 12 || 12;
        case 'mm': return p2(d.getMinutes());
        case 'ss': return p2(d.getSeconds());
        case 'A': return h < 12 ? 'AM' : 'PM';
        case 'a': return h < 12 ? 'am' : 'pm';
        default: return lit;
      }
    });
  }
  function ymd(d) { return fmt(d, 'YYYY-MM-DD'); }
  function plusDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  // ---------- vault helpers ----------
  function folderId(name, make) {
    var hit = LN.vault.children(null).filter(function (n) { return n.type === 'folder' && n.name.toLowerCase() === name.toLowerCase(); })[0];
    if (hit) return Promise.resolve(hit.id);
    if (!make) return Promise.resolve(null);
    return LN.vault.create('folder', name, null).then(function (n) { return n.id; });
  }
  function fileIn(parent, name) {
    return LN.vault.children(parent).filter(function (n) { return n.type === 'file' && n.name.toLowerCase() === name.toLowerCase(); })[0] || null;
  }
  function openNote(id) { LN.tabs.open(id); LN.tree.render(); if (LN.app && LN.app.closeDrawer) LN.app.closeDrawer(); }
  function textNotes() {
    return LN.vault.all().filter(function (n) { return n.type === 'file' && !LN.isBin(LN.kindOfNode(n)) && typeof n.content === 'string'; });
  }

  // ---------- Templater ----------
  var STARTERS = {
    'Daily.md': '# <% tp.date.now("dddd, D MMMM YYYY") %>\n\n## Plan\n- [ ] \n\n## Notes\n\n---\nYesterday: [[<% tp.date.yesterday("YYYY-MM-DD") %>]] | Tomorrow: [[<% tp.date.tomorrow("YYYY-MM-DD") %>]]\n',
    'Meeting.md': '---\ndate: <% tp.date.now("YYYY-MM-DD") %>\ntype: meeting\n---\n# <% tp.system.prompt("Meeting title", "Meeting") %>\n\nTime: <% tp.date.now("HH:mm") %>\n\n## Notes\n\n## Actions\n- [ ] \n',
    'Dashboard.md': '# Dashboard\n\n## Recently changed\n```dataview\nTABLE file.folder, file.mtime\nSORT file.mtime DESC\nLIMIT 10\n```\n\n## Open tasks\n```dataview\nTASK\nWHERE !completed\nLIMIT 25\n```\n\n## Daily notes\n```dataview\nLIST\nFROM "Daily"\nSORT file.name DESC\nLIMIT 7\n```\n'
  };
  function ensureTemplates() {
    return folderId(TPL, true).then(function (id) {
      var chain = Promise.resolve();
      Object.keys(STARTERS).forEach(function (name) {
        if (fileIn(id, name)) return;
        chain = chain.then(function () { return LN.vault.create('file', name, id); }).then(function (n) { return LN.vault.update(n.id, STARTERS[name]); });
      });
      return chain.then(function () { return id; });
    });
  }
  function args(s) {
    var out = [], re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)/g, m;
    while ((m = re.exec(s || ''))) out.push(m[3] != null ? parseFloat(m[3]) : (m[1] != null ? m[1] : m[2]));
    return out;
  }
  // Runs one template and returns the finished text. ctx: { title, folder }
  function runTemplate(text, ctx) {
    var re = /<%[-_]?\s*([\s\S]*?)\s*[-_]?%>/g;
    var parts = [], last = 0, m;
    while ((m = re.exec(text))) { parts.push(text.slice(last, m.index)); parts.push({ code: m[1] }); last = re.lastIndex; }
    parts.push(text.slice(last));
    var now = new Date();
    var chain = Promise.resolve(''), out = '';
    parts.forEach(function (part) {
      chain = chain.then(function () {
        if (typeof part === 'string') { out += part; return null; }
        var c = /^tp\.(\w+)\.(\w+)(?:\(([\s\S]*)\))?$/.exec(part.code.trim());
        if (!c) { out += '<% ' + part.code + ' %>'; return null; }
        var a = args(c[3]), key = c[1] + '.' + c[2];
        switch (key) {
          case 'date.now': out += fmt(plusDays(now, +a[1] || 0), a[0]); break;
          case 'date.today': out += fmt(now, a[0]); break;
          case 'date.tomorrow': out += fmt(plusDays(now, 1), a[0]); break;
          case 'date.yesterday': out += fmt(plusDays(now, -1), a[0]); break;
          case 'file.title': out += ctx.title || ''; break;
          case 'file.folder': out += ctx.folder || ''; break;
          case 'file.cursor': break;
          case 'system.prompt':
            var v = window.prompt(a[0] || 'Value', a[1] || '');
            out += v == null ? '' : v; break;
          case 'system.clipboard':
            return (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.resolve('')).then(function (t) { out += t || ''; }, function () { /* no clipboard access */ });
          default: out += '<% ' + part.code + ' %>';
        }
        return null;
      });
    });
    return chain.then(function () { return out; });
  }
  function pickTemplate(title) {
    return ensureTemplates().then(function (id) {
      var list = LN.vault.children(id).filter(function (n) { return n.type === 'file'; });
      return new Promise(function (resolve) {
        var picked = null;
        var s = LN.ui.sheet(title, function () { resolve(picked); });
        if (!list.length) s.body.appendChild(el('p', 'hint', 'Put notes in the Templates folder to use them here.'));
        var box = el('div', 'set-group nav');
        list.forEach(function (n) {
          var b = el('button', 'set-nav');
          b.type = 'button';
          b.appendChild(el('span', 'set-nav-label', n.name.replace(/\.[^.]+$/, '')));
          b.addEventListener('click', function () { picked = n; s.close(); });
          box.appendChild(b);
        });
        s.body.appendChild(box);
        s.body.appendChild(el('p', 'hint', 'Tags: tp.date.now("YYYY-MM-DD"), tp.date.tomorrow(), tp.date.yesterday(), tp.file.title, tp.system.prompt("Question"), tp.system.clipboard()'));
      });
    });
  }
  function insertTemplate() {
    if (!LN.editor.currentId()) { LN.toast('Open a note first'); return Promise.resolve(); }
    return pickTemplate('Insert template').then(function (t) {
      if (!t) return null;
      var cur = LN.vault.get(LN.editor.currentId());
      return runTemplate(t.content, { title: cur ? cur.name.replace(/\.[^.]+$/, '') : '', folder: cur && cur.parent ? LN.vault.get(cur.parent).name : '' })
        .then(function (txt) { LN.editor.insertText(txt, true); });
    });
  }
  function newFromTemplate() {
    return pickTemplate('New note from template').then(function (t) {
      if (!t) return null;
      var name = window.prompt('Note name', t.name.replace(/\.[^.]+$/, '') + ' ' + ymd(new Date()));
      if (!name || !name.trim()) return null;
      name = name.trim();
      if (!/\.[A-Za-z0-9]+$/.test(name)) name += '.md';
      var parent = LN.tree.destParent();
      return runTemplate(t.content, { title: name.replace(/\.[^.]+$/, ''), folder: parent ? LN.vault.get(parent).name : '' }).then(function (txt) {
        return LN.vault.create('file', name, parent).then(function (n) { return LN.vault.update(n.id, txt).then(function () { openNote(n.id); }); });
      });
    });
  }

  // ---------- Calendar ----------
  function dailyNote(date) {
    var name = ymd(date) + '.md';
    return folderId(DAILY, true).then(function (fid) {
      var hit = fileIn(fid, name);
      if (hit) return hit;
      return ensureTemplates().then(function (tid) {
        var t = fileIn(tid, 'Daily.md');
        var base = t ? t.content : '# ' + ymd(date) + '\n';
        return runTemplate(base, { title: ymd(date), folder: DAILY }).then(function (txt) {
          return LN.vault.create('file', name, fid).then(function (n) { return LN.vault.update(n.id, txt).then(function () { return n; }); });
        });
      });
    });
  }
  function openDaily(date) { return dailyNote(date || new Date()).then(function (n) { openNote(n.id); }); }

  function calendar() {
    var view = new Date(); view.setDate(1);
    var s = LN.ui.sheet('Calendar');
    var head = el('div', 'cal-head');
    var prev = el('button', 'btn', '‹'), next = el('button', 'btn', '›'), title = el('div', 'cal-title'), today = el('button', 'btn primary', 'Today');
    [prev, next, today].forEach(function (b) { b.type = 'button'; });
    head.appendChild(prev); head.appendChild(title); head.appendChild(next);
    var grid = el('div', 'cal-grid');
    s.body.appendChild(head); s.body.appendChild(grid); s.body.appendChild(today);
    s.body.appendChild(el('p', 'hint', 'Tap a day to open or create its daily note (Daily folder, Daily template). A dot marks days that have a note.'));
    function draw() {
      title.textContent = MON[view.getMonth()] + ' ' + view.getFullYear();
      grid.textContent = '';
      DAY.forEach(function (d) { grid.appendChild(el('div', 'cal-dow', d.slice(0, 1))); });
      var fid = LN.vault.children(null).filter(function (n) { return n.type === 'folder' && n.name.toLowerCase() === DAILY.toLowerCase(); })[0];
      var have = {};
      if (fid) LN.vault.children(fid.id).forEach(function (n) { have[n.name] = 1; });
      for (var i = 0; i < view.getDay(); i++) grid.appendChild(el('div', 'cal-pad'));
      var last = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate(), todayStr = ymd(new Date());
      for (var d = 1; d <= last; d++) (function (day) {
        var dt = new Date(view.getFullYear(), view.getMonth(), day), key = ymd(dt);
        var b = el('button', 'cal-day' + (key === todayStr ? ' now' : '') + (have[key + '.md'] ? ' has' : ''), String(day));
        b.type = 'button';
        b.addEventListener('click', function () { s.close(); openDaily(dt).catch(fail); });
        grid.appendChild(b);
      })(d);
    }
    prev.addEventListener('click', function () { view.setMonth(view.getMonth() - 1); draw(); });
    next.addEventListener('click', function () { view.setMonth(view.getMonth() + 1); draw(); });
    today.addEventListener('click', function () { s.close(); openDaily(new Date()).catch(fail); });
    draw();
  }

  // ---------- Dataview ----------
  function fm(n) {
    var meta = {}, c = n.content || '', m = /^---\n([\s\S]*?)\n---/.exec(c);
    if (m) m[1].split('\n').forEach(function (l) { var k = /^([\w -]+):\s*(.*)$/.exec(l); if (k) meta[k[1].trim().toLowerCase()] = k[2].trim().replace(/^\[|\]$/g, ''); });
    var re = /^([\w-]+)::\s*(.+)$/gm, i;
    while ((i = re.exec(c))) meta[i[1].toLowerCase()] = i[2].trim();
    return meta;
  }
  function tagsOf(n) {
    var out = {}, m, re = /(^|\s)#([A-Za-z][\w\/-]*)/g;
    (n.content || '').replace(/```[\s\S]*?```/g, '').split('\n').forEach(function (l) { if (/^#{1,6}\s/.test(l)) return; while ((m = re.exec(l))) out['#' + m[2].toLowerCase()] = 1; });
    var t = fm(n).tags; if (t) t.split(/[,\s]+/).forEach(function (x) { if (x) out['#' + x.replace(/^#/, '').toLowerCase()] = 1; });
    return Object.keys(out);
  }
  function field(n, name) {
    var k = name.toLowerCase().trim();
    switch (k) {
      case 'file.name': return n.name.replace(/\.[^.]+$/, '');
      case 'file.link': return { link: n.id, text: n.name.replace(/\.[^.]+$/, '') };
      case 'file.path': return LN.vault.path(n.id);
      case 'file.folder': return n.parent ? LN.vault.path(n.parent) : '';
      case 'file.ctime': return n.created || 0;
      case 'file.mtime': return n.updated || 0;
      case 'file.size': return (n.content || '').length;
      case 'file.tags': case 'tags': return tagsOf(n).join(' ');
      default: var v = fm(n)[k]; return v == null ? '' : v;
    }
  }
  function isLink(v) { return !!v && typeof v === 'object' && !!v.link; }
  function show(v) {
    if (isLink(v)) return v;
    if (typeof v === 'number' && v > 1e11) { var d = new Date(v); return ymd(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
    return v == null ? '' : String(v);
  }
  function sourceTest(src) {
    if (!src) return function () { return true; };
    var alts = src.split(/\s+or\s+/i).map(function (grp) {
      var ands = grp.split(/\s+and\s+/i).map(function (t) {
        t = t.trim(); var neg = false;
        if (t[0] === '-') { neg = true; t = t.slice(1).trim(); }
        var f = /^"(.*)"$/.exec(t), tg = /^#(\S+)$/.exec(t);
        return function (n) {
          var ok;
          if (f) { var p = LN.vault.path(n.id).toLowerCase(), q = f[1].toLowerCase().replace(/\/$/, ''); ok = p === q || p.indexOf(q + '/') === 0 || p === q + '.md'; }
          else if (tg) ok = tagsOf(n).indexOf('#' + tg[1].toLowerCase()) >= 0;
          else ok = true;
          return neg ? !ok : ok;
        };
      });
      return function (n) { return ands.every(function (f) { return f(n); }); };
    });
    return function (n) { return alts.some(function (f) { return f(n); }); };
  }
  function condTest(w) {
    if (!w) return function () { return true; };
    var groups = w.split(/\s+or\s+/i).map(function (grp) {
      var ands = grp.split(/\s+and\s+/i).map(function (c) {
        c = c.trim();
        var m = /^(.+?)\s*(>=|<=|!=|=|>|<|contains)\s*(.+)$/i.exec(c);
        if (!m) { var neg = c[0] === '!'; var f0 = neg ? c.slice(1).trim() : c; return function (r) { var v = r.get(f0); return neg ? !v : !!v; }; }
        var rhs = m[3].trim().replace(/^"|"$/g, ''), op = m[2].toLowerCase();
        return function (r) {
          var l = r.get(m[1]); if (isLink(l)) l = l.text;
          var a = String(l == null ? '' : l).toLowerCase(), b = rhs.toLowerCase(), na = parseFloat(a), nb = parseFloat(b);
          var num = !isNaN(na) && !isNaN(nb);
          switch (op) {
            case '=': return a === b; case '!=': return a !== b;
            case '>': return num ? na > nb : a > b; case '<': return num ? na < nb : a < b;
            case '>=': return num ? na >= nb : a >= b; case '<=': return num ? na <= nb : a <= b;
            default: return a.indexOf(b) >= 0;
          }
        };
      });
      return function (r) { return ands.every(function (f) { return f(r); }); };
    });
    return function (r) { return groups.some(function (f) { return f(r); }); };
  }
  function parseQuery(q) {
    q = q.replace(/\r/g, '');
    if (q.trim().indexOf('\n') < 0) q = q.replace(/\s+(FROM|WHERE|SORT|LIMIT)\b/gi, '\n$1');
    var lines = q.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var o = { type: '', fields: [], from: '', where: '', sort: '', dir: 1, limit: 0 };
    var first = /^(LIST|TABLE|TASK)\b\s*(.*)$/i.exec(lines[0] || '');
    if (!first) throw new Error('Dataview: start with LIST, TABLE or TASK');
    o.type = first[1].toUpperCase();
    o.fields = (first[2] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    for (var i = 1; i < lines.length; i++) {
      var m = /^(FROM|WHERE|SORT|LIMIT)\b\s*(.*)$/i.exec(lines[i]);
      if (!m) continue;
      var k = m[1].toUpperCase();
      if (k === 'FROM') o.from = m[2];
      else if (k === 'WHERE') o.where = o.where ? o.where + ' and ' + m[2] : m[2];
      else if (k === 'LIMIT') o.limit = parseInt(m[2], 10) || 0;
      else { var sm = /^(.+?)(?:\s+(ASC|DESC))?$/i.exec(m[2]); o.sort = sm[1]; o.dir = /desc/i.test(sm[2] || '') ? -1 : 1; }
    }
    return o;
  }
  function runQuery(q) {
    var o = parseQuery(q), inSrc = sourceTest(o.from), rows = [];
    textNotes().filter(inSrc).forEach(function (n) {
      if (o.type === 'TASK') {
        (n.content || '').split('\n').forEach(function (l) {
          var m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(l);
          if (m) rows.push({ n: n, text: m[2], completed: m[1] !== ' ', get: function (f) { f = f.toLowerCase().trim(); return f === 'completed' ? this.completed : (f === 'text' ? this.text : field(n, f)); } });
        });
      } else rows.push({ n: n, get: function (f) { return field(n, f); } });
    });
    rows = rows.filter(condTest(o.where));
    if (o.sort) rows.sort(function (a, b) {
      var x = a.get(o.sort), y = b.get(o.sort); if (isLink(x)) x = x.text; if (isLink(y)) y = y.text;
      var nx = parseFloat(x), ny = parseFloat(y);
      if (typeof x === 'number' || typeof y === 'number' || (!isNaN(nx) && !isNaN(ny))) return ((+x || 0) - (+y || 0)) * o.dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * o.dir;
    });
    var total = rows.length;
    if (o.limit) rows = rows.slice(0, o.limit);
    return { o: o, rows: rows, total: total };
  }
  function cell(parent, v) {
    v = show(v);
    if (isLink(v)) { var a = el('a', 'wl dv-open', v.text); a.href = '#'; a.dataset.id = v.link; parent.appendChild(a); }
    else parent.appendChild(document.createTextNode(v));
  }
  function renderQuery(host, q) {
    host.textContent = '';
    var r;
    try { r = runQuery(q); } catch (e) { host.appendChild(el('div', 'dv-err', e.message)); return; }
    if (!r.rows.length) { host.appendChild(el('div', 'dv-empty', 'Dataview: no results')); return; }
    if (r.o.type === 'TABLE') {
      var wrap = el('div', 'tbl'), t = el('table'), hr = el('tr');
      var cols = ['file.link'].concat(r.o.fields);
      cols.forEach(function (c, i) { hr.appendChild(el('th', null, i ? c.replace(/^file\./, '') : 'File')); });
      var th = el('thead'); th.appendChild(hr); t.appendChild(th);
      var tb = el('tbody');
      r.rows.forEach(function (row) { var tr = el('tr'); cols.forEach(function (c) { var td = el('td'); cell(td, row.get(c)); tr.appendChild(td); }); tb.appendChild(tr); });
      t.appendChild(tb); wrap.appendChild(t); host.appendChild(wrap);
    } else {
      var ul = el('ul', 'dv-list');
      r.rows.forEach(function (row) {
        var li = el('li');
        if (r.o.type === 'TASK') { var cb = document.createElement('input'); cb.type = 'checkbox'; cb.disabled = true; cb.checked = row.completed; li.appendChild(cb); li.appendChild(document.createTextNode(' ' + row.text + ' ')); cell(li, { link: row.n.id, text: '(' + row.n.name.replace(/\.[^.]+$/, '') + ')' }); }
        else { cell(li, row.get('file.link')); r.o.fields.forEach(function (f) { li.appendChild(document.createTextNode(' · ')); cell(li, row.get(f)); }); }
        ul.appendChild(li);
      });
      host.appendChild(ul);
    }
    if (r.total > r.rows.length) host.appendChild(el('div', 'dv-empty', r.rows.length + ' of ' + r.total + ' shown'));
  }
  // md.js leaves <div class="dv" data-dv="..."> for every dataview block; the preview calls this after it renders.
  function hydrate(root) {
    var list = root.querySelectorAll ? root.querySelectorAll('.dv[data-dv]') : [];
    Array.prototype.forEach.call(list, function (h) { renderQuery(h, h.getAttribute('data-dv')); });
    if (!root.__dvBound) {
      root.__dvBound = true;
      root.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('.dv-open') : null;
        if (!a) return;
        e.preventDefault();
        var id = a.dataset.id;
        if (LN.vault.get(id)) LN.tabs.open(id);
      });
    }
  }
  function makeDashboard() {
    return ensureTemplates().then(function (tid) {
      var t = fileIn(tid, 'Dashboard.md');
      var hit = LN.vault.children(null).filter(function (n) { return n.type === 'file' && n.name.toLowerCase() === 'dashboard.md'; })[0];
      if (hit) { openNote(hit.id); return null; }
      return LN.vault.create('file', 'Dashboard.md', null).then(function (n) { return LN.vault.update(n.id, t ? t.content : STARTERS['Dashboard.md']).then(function () { openNote(n.id); }); });
    });
  }

  LN.plugins = {
    calendar: calendar, openDaily: openDaily, insertTemplate: insertTemplate, newFromTemplate: newFromTemplate,
    dashboard: makeDashboard, hydrate: hydrate, runTemplate: runTemplate, runQuery: runQuery, fmt: fmt
  };
})(window.LN = window.LN || {});
