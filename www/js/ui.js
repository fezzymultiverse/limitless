(function (LN) {
  'use strict';

  var open = [];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // A bottom sheet with a title, a close button and a scrolling body.
  function sheet(title, onClose) {
    var root = el('div', 'sheet ai-sheet');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', title);
    var card = el('div', 'sheet-card');
    var head = el('div', 'sheet-head');
    var t = el('div', 'sheet-title', title);
    var x = el('button', 'sheet-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = LN.icon('x', 18);
    head.appendChild(t);
    head.appendChild(x);
    var body = el('div', 'sheet-body');
    card.appendChild(head);
    card.appendChild(body);
    root.appendChild(card);
    document.getElementById('app').appendChild(root);
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      root.remove();
      open = open.filter(function (s) { return s !== api; });
      if (onClose) onClose();
    }
    x.addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    var api = { el: root, body: body, close: close, setTitle: function (s) { t.textContent = s; } };
    open.push(api);
    return api;
  }

  function closeAll() {
    var list = open.slice();
    list.forEach(function (s) { s.close(); });
    return list.length > 0;
  }

  // opts: { title, fields: [{key,label,type,value,options,placeholder,required}], ok, note }
  // type: text, textarea, datetime, select. Resolves with an object of values, or null if cancelled.
  function form(opts) {
    return new Promise(function (resolve) {
      var done = false;
      var s = sheet(opts.title, function () { if (!done) { done = true; resolve(null); } });
      var inputs = {};
      var group = el('div', 'set-group');
      (opts.fields || []).forEach(function (f) {
        var row = el('div', 'set-row stack');
        var lab = el('div', 'set-info');
        lab.appendChild(el('div', 'set-label', f.label));
        if (f.desc) lab.appendChild(el('div', 'set-desc', f.desc));
        row.appendChild(lab);
        var inp;
        if (f.type === 'textarea') { inp = document.createElement('textarea'); inp.rows = 3; }
        else if (f.type === 'select') {
          inp = document.createElement('select');
          (f.options || []).forEach(function (o) {
            var op = document.createElement('option');
            op.value = String(o[0]);
            op.textContent = o[1];
            if (String(o[0]) === String(f.value)) op.selected = true;
            inp.appendChild(op);
          });
        } else {
          inp = document.createElement('input');
          inp.type = f.type === 'datetime' ? 'datetime-local' : 'text';
        }
        inp.className = 'set-ctl set-input';
        inp.setAttribute('aria-label', f.label);
        if (f.type !== 'select' && f.value != null) inp.value = String(f.value);
        if (f.placeholder) inp.placeholder = f.placeholder;
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        row.appendChild(inp);
        inputs[f.key] = inp;
        group.appendChild(row);
      });
      s.body.appendChild(group);
      if (opts.note) s.body.appendChild(el('p', 'hint', opts.note));
      var state = el('div', 'ai-state');
      var actions = el('div', 'ai-row');
      var okBtn = el('button', 'btn primary', opts.ok || 'OK');
      okBtn.type = 'button';
      var cancel = el('button', 'btn', 'Cancel');
      cancel.type = 'button';
      actions.appendChild(okBtn);
      actions.appendChild(cancel);
      actions.appendChild(state);
      s.body.appendChild(actions);
      cancel.addEventListener('click', function () { s.close(); });
      okBtn.addEventListener('click', function () {
        var out = {};
        for (var i = 0; i < opts.fields.length; i++) {
          var f = opts.fields[i];
          var v = inputs[f.key].value.trim();
          if (f.required && !v) { state.textContent = f.label + ' is required.'; inputs[f.key].focus(); return; }
          out[f.key] = v;
        }
        if (opts.validate) {
          var bad = opts.validate(out);
          if (bad) { state.textContent = bad; return; }
        }
        done = true;
        s.close();
        resolve(out);
      });
      var first = opts.fields && opts.fields[0] ? inputs[opts.fields[0].key] : null;
      if (first && first.tagName !== 'SELECT') first.focus();
    });
  }

  // V0.7.21: close the sheet that owns this element (used by the phone's Back button)
  function closeEl(node) {
    var s = open.filter(function (x) { return x.el === node; })[0];
    if (!s) return false;
    s.close();
    return true;
  }

  LN.ui = { sheet: sheet, form: form, closeAll: closeAll, closeEl: closeEl, el: el };
})(window.LN = window.LN || {});
