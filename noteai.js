(function (LN) {
  'use strict';
  // V0.7.22: AI actions baked into the note. A slim strip above the editor with four one-tap actions:
  //   Summarize     3-bullet TL;DR block at the top of the note (replaces the old one)
  //   Extract tasks clean "- [ ]" checklist added at the end of the note (skips tasks already there)
  //   Continue      finishes the thought at the cursor in the tone of the note
  //   Auto-tag      suggests tags, you tick the ones you want, they go on the last line as #tags
  // Uses the provider, key and model already set in Settings > AI (LN.ai.ask), so it needs no new key.
  var NOTE_MAX = 60000;
  var CONT_MAX = 12000;
  var strip = null, busy = false, sheet = null;
  var KINDS = { md: 1, text: 1 };
  var TAG_HINT = 'Code, Personal, Research, Work, Ideas, Finance, Health, Learning, Travel, Music, Security';

  // ---------- pure helpers (no DOM, no network) ----------
  function frontEnd(t) {
    if (!/^---[ \t]*\r?\n/.test(t)) return 0;
    var re = /\r?\n---[ \t]*(\r?\n|$)/g;
    re.lastIndex = 3;
    var m = re.exec(t);
    return m ? m.index + m[0].length : 0;
  }
  var TLDR_RX = /^> \*\*TL;DR\*\*[ \t]*\r?\n(?:> .*(?:\r?\n|$))*\r?\n*/;

  function tldrSpan(t) {
    var fe = frontEnd(t);
    var m = TLDR_RX.exec(t.slice(fe));
    return { start: fe, end: m ? fe + m[0].length : fe, had: !!m };
  }
  function withoutTldr(t) {
    var s = tldrSpan(t);
    return s.had ? t.slice(0, s.start) + t.slice(s.end) : t;
  }
  function clean(s) { return String(s).replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim(); }

  function parseBullets(s, n) {
    var out = [];
    String(s || '').split(/\r?\n/).forEach(function (line) {
      var m = /^\s*(?:[-*\u2022]|\d+[.)])\s+(.+?)\s*$/.exec(line);
      if (m && clean(m[1])) out.push(clean(m[1]));
    });
    return out.slice(0, n || 3);
  }
  function tldrBlock(bullets) {
    return '> **TL;DR**\n' + bullets.map(function (b) { return '> - ' + b; }).join('\n') + '\n\n';
  }

  function parseTasks(s) {
    if (/^\s*NONE\s*$/i.test(String(s || ''))) return [];
    var seen = {}, out = [];
    String(s || '').split(/\r?\n/).forEach(function (line) {
      var m = /^\s*[-*]\s*(?:\[[ xX]?\]\s*)?(.+?)\s*$/.exec(line);
      if (!m) return;
      var t = clean(m[1]);
      if (!t || /^none$/i.test(t)) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push(t);
    });
    return out.slice(0, 40);
  }
  function existingTasks(text) {
    var set = {};
    text.split(/\r?\n/).forEach(function (l) {
      var m = /^\s*[-*]\s*\[[ xX]?\]\s+(.+?)\s*$/.exec(l);
      if (m) set[clean(m[1]).toLowerCase()] = 1;
    });
    return set;
  }
  // What to append at the very end of the note. Empty string when every task is already there.
  function tasksAddition(text, tasks) {
    var have = existingTasks(text);
    var fresh = tasks.filter(function (t) { return !have[t.toLowerCase()]; });
    if (!fresh.length) return '';
    var lead = /\n\n$/.test(text) || !text ? '' : (/\n$/.test(text) ? '\n' : '\n\n');
    var head = /^##\s+Tasks\s*$/mi.test(text) ? '' : '## Tasks\n';
    return lead + head + fresh.map(function (t) { return '- [ ] ' + t; }).join('\n') + '\n';
  }

  function parseTags(s, text) {
    var have = {};
    (String(text || '').match(/(^|\s)#[A-Za-z][\w-]*/g) || []).forEach(function (x) { have[x.trim().slice(1).toLowerCase()] = 1; });
    var seen = {}, out = [];
    String(s || '').split(/[\s,;]+/).forEach(function (w) {
      w = w.replace(/^#+/, '');
      if (!/^[A-Za-z][A-Za-z0-9_-]{1,23}$/.test(w)) return;
      var k = w.toLowerCase();
      if (seen[k] || have[k]) return;
      seen[k] = 1;
      out.push(w.charAt(0).toUpperCase() + w.slice(1));
    });
    return out.slice(0, 6);
  }
  // Where and what to insert so tags land on the last line. A last line that is only tags is extended instead of starting a new one.
  function tagsAddition(text, tags) {
    if (!tags.length) return null;
    var line = tags.map(function (t) { return '#' + t; }).join(' ');
    var trimmed = text.replace(/\s+$/, '');
    var lastNl = trimmed.lastIndexOf('\n');
    var last = trimmed.slice(lastNl + 1);
    if (trimmed && /^(\s*#[A-Za-z][\w-]*)+\s*$/.test(last)) return { pos: trimmed.length, text: ' ' + line };
    var lead = !text ? '' : (/\n\n$/.test(text) ? '' : (/\n$/.test(text) ? '\n' : '\n\n'));
    return { pos: text.length, text: lead + line + '\n' };
  }

  function continueAdd(ctx, out) {
    var o = String(out || '').replace(/^\s*```[a-z]*\s*\n?|\n?```\s*$/g, '');
    o = o.replace(/^\s+$/, '');
    if (!o) return '';
    // the model sometimes repeats the last words of the note; drop that echo
    var tail = ctx.slice(-80);
    for (var n = Math.min(tail.length, o.length); n >= 8; n--) {
      if (o.slice(0, n) === tail.slice(tail.length - n)) { o = o.slice(n); break; }
    }
    if (!o.trim()) return '';
    if (ctx && !/\s$/.test(ctx) && !/^[\s.,;:!?)\]}]/.test(o)) o = ' ' + o;
    return o;
  }

  // ---------- prompts ----------
  var SYS = {
    sum: 'You write TL;DR summaries for a notes app. Output exactly 3 markdown bullets, each starting with "- " and under 22 words. No title, no intro, no closing line. Use only facts that are in the note. Reply in the language of the note.',
    tasks: 'You extract tasks from a note. Output one task per line as "- [ ] task". Each task is short and starts with a verb. Include only things the note says need doing or clearly implies. Do not invent tasks, dates or people. If the note has no tasks, output exactly NONE. No intro, no closing line.',
    cont: 'You continue the text the user is writing. Continue exactly where the text stops, in the same tone, voice, language and formatting. If it stops in the middle of a sentence, finish that sentence first, starting with the next word and without repeating anything already written. Then add at most one short paragraph. Return only the new text, no quotes and no introduction.',
    tags: 'You tag notes. Suggest 3 to 5 short single-word tags for the note. Prefer these when they fit: ' + TAG_HINT + '. Use another word only when none of them fits. Output only the tags on one line separated by spaces, each starting with #. No other text.'
  };

  // ---------- editor glue ----------
  function taEl() { return document.getElementById('editor'); }
  function say(m) { if (LN.toast) LN.toast(m); }

  function insertAt(pos, text, replaceTo) {
    var ta = taEl();
    if (!ta) return false;
    var end = replaceTo == null ? pos : replaceTo;
    try { ta.setSelectionRange(pos, end); } catch (e) { return false; }
    return LN.editor.insertText(text, end > pos);
  }

  function setBusy(action, on) {
    busy = on;
    if (!strip) return;
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-a]'), function (b) {
      b.disabled = on;
      var hit = b.getAttribute('data-a') === action;
      b.classList.toggle('busy', on && hit);
      if (hit) b.textContent = on ? 'Working\u2026' : b.getAttribute('data-label');
    });
  }

  function request(action, user) {
    return LN.ai.ask([{ role: 'user', content: user }], { system: SYS[action], temperature: 0.2 });
  }

  function closeSheet() { if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); sheet = null; }

  function tagSheet(id, tags) {
    closeSheet();
    var picked = {};
    tags.forEach(function (t) { picked[t] = true; });
    sheet = document.createElement('div');
    sheet.className = 'noteai-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Suggested tags');
    var h = document.createElement('h3'); h.textContent = 'Suggested tags';
    var p = document.createElement('p'); p.textContent = 'Tap to untick the ones you do not want. They are added on the last line of the note.';
    var chips = document.createElement('div'); chips.className = 'noteai-chips';
    tags.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'on'; b.textContent = '#' + t;
      b.addEventListener('click', function () { picked[t] = !picked[t]; b.classList.toggle('on', picked[t]); });
      chips.appendChild(b);
    });
    var row = document.createElement('div'); row.className = 'noteai-row';
    var no = document.createElement('button'); no.type = 'button'; no.textContent = 'Cancel'; no.addEventListener('click', closeSheet);
    var go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.textContent = 'Add tags';
    go.addEventListener('click', function () {
      var chosen = tags.filter(function (t) { return picked[t]; });
      closeSheet();
      if (!chosen.length) return;
      if (LN.editor.currentId() !== id) { say('The note changed, tags not added.'); return; }
      var s = LN.editor.selection();
      var add = s ? tagsAddition(s.all, chosen) : null;
      if (add && insertAt(add.pos, add.text)) say('Tags added');
    });
    row.appendChild(no); row.appendChild(go);
    sheet.appendChild(h); sheet.appendChild(p); sheet.appendChild(chips); sheet.appendChild(row);
    document.body.appendChild(sheet);
  }

  function run(action) {
    if (busy) return Promise.resolve();
    var sel = LN.editor && LN.editor.selection ? LN.editor.selection() : null;
    if (!sel) { say('Open a text note first'); return Promise.resolve(); }
    if (!LN.ai || !LN.ai.configured()) { say('Add an AI key and model in Settings, AI.'); return Promise.resolve(); }
    var id = LN.editor.currentId();
    var all = sel.all;
    if (!all.trim()) { say('The note is empty.'); return Promise.resolve(); }
    var label = LN.ai.providers && LN.ai.providers[LN.store.get('aiProvider')] ? LN.ai.providers[LN.store.get('aiProvider')].label : 'the AI provider';
    var user, caret = sel.start;
    if (action === 'cont') {
      if (caret === 0 && sel.end === 0) caret = all.length;
      var before = all.slice(Math.max(0, caret - CONT_MAX), caret);
      if (!before.trim()) { say('Write a few words first, then tap Continue.'); return Promise.resolve(); }
      user = before;
    } else {
      var body = action === 'sum' ? withoutTldr(all) : all;
      user = body.slice(0, NOTE_MAX);
    }
    if (LN.store.get('aiConfirm') && !window.confirm('Send ' + user.length + ' characters of this note to ' + label + '?')) { say('Not sent.'); return Promise.resolve(); }
    setBusy(action, true);
    return request(action, user).then(function (out) {
      setBusy(action, false);
      if (LN.editor.currentId() !== id) { say('The note changed, result discarded.'); return; }
      var now = LN.editor.selection();
      if (!now) return;
      var text = now.all;
      if (action === 'sum') {
        var b = parseBullets(out, 3);
        if (!b.length) { say('The AI did not return a summary. Try again.'); return; }
        var span = tldrSpan(text);
        if (insertAt(span.start, tldrBlock(b), span.had ? span.end : span.start)) say(span.had ? 'Summary updated' : 'Summary added');
      } else if (action === 'tasks') {
        var tasks = parseTasks(out);
        if (!tasks.length) { say('No tasks found in this note.'); return; }
        var add = tasksAddition(text, tasks);
        if (!add) { say('Those tasks are already in the note.'); return; }
        if (insertAt(text.length, add)) say('Tasks added');
      } else if (action === 'cont') {
        var more = continueAdd(text.slice(0, caret), out);
        if (!more) { say('The AI had nothing to add.'); return; }
        var at = text.slice(0, caret) === all.slice(0, caret) ? caret : now.start;
        if (insertAt(at, more)) say('Continued');
      } else if (action === 'tags') {
        var tags = parseTags(out, text);
        if (!tags.length) { say('No new tags to suggest.'); return; }
        tagSheet(id, tags);
      }
    }, function (e) {
      setBusy(action, false);
      say(e && e.message ? e.message : 'The AI request failed.');
    });
  }

  // ---------- strip ----------
  function addButton(label, fn, key) {
    if (!strip) return null;
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-a', key);
    b.setAttribute('data-label', label);
    b.addEventListener('click', fn);
    strip.appendChild(b);
    return b;
  }

  function sync() {
    if (!strip) return;
    var st = document.getElementById('stage');
    var show = !!st && st.getAttribute('data-empty') !== '1' && !!KINDS[st.getAttribute('data-kind')];
    strip.hidden = !show;
  }

  function build() {
    var st = document.getElementById('stage');
    if (!st || !st.parentNode || strip) return;
    strip = document.createElement('div');
    strip.id = 'noteai';
    strip.className = 'noteai';
    strip.hidden = true;
    strip.setAttribute('role', 'toolbar');
    strip.setAttribute('aria-label', 'AI actions for this note');
    var l = document.createElement('button');
    l.type = 'button'; l.className = 'noteai-l'; l.textContent = 'AI';
    l.setAttribute('aria-label', 'Show or hide AI actions');
    if (LN.store && LN.store.get('noteAiMin')) strip.classList.add('min');
    l.addEventListener('click', function () {
      var on = strip.classList.toggle('min');
      if (LN.store) LN.store.set('noteAiMin', on);
    });
    strip.appendChild(l);
    addButton('Summarize', function () { run('sum'); }, 'sum');
    addButton('Extract tasks', function () { run('tasks'); }, 'tasks');
    addButton('Continue', function () { run('cont'); }, 'cont');
    addButton('Auto-tag', function () { run('tags'); }, 'tags');
    st.parentNode.insertBefore(strip, st);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(st, { attributes: true, attributeFilter: ['data-empty', 'data-kind'] });
    }
    sync();
  }

  build();

  LN.noteai = {
    run: run, addButton: addButton, sync: sync,
    _t: {
      frontEnd: frontEnd, tldrSpan: tldrSpan, withoutTldr: withoutTldr, parseBullets: parseBullets, tldrBlock: tldrBlock,
      parseTasks: parseTasks, tasksAddition: tasksAddition, parseTags: parseTags, tagsAddition: tagsAddition, continueAdd: continueAdd
    }
  };
})(window.LN = window.LN || {});
