(function (LN) {
  'use strict';

  var GROQ = 'https://api.groq.com/openai/v1';
  var GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  var MISTRAL = 'https://api.mistral.ai/v1';
  var TIMEOUT = 45000;

  var PROVIDERS = {
    groq: { id: 'groq', label: 'Groq', keyKey: 'groqKey', modelKey: 'groqModel' },
    gemini: { id: 'gemini', label: 'Gemini', keyKey: 'geminiKey', modelKey: 'geminiModel' },
    mistral: { id: 'mistral', label: 'Mistral', keyKey: 'mistralKey', modelKey: 'mistralModel' }
  };
  // Groq and Mistral both speak the OpenAI chat format.
  var OPENAI_STYLE = { groq: GROQ, mistral: MISTRAL };

  function cfg(id) {
    var p = PROVIDERS[id];
    return { label: p.label, key: String(LN.store.get(p.keyKey) || '').trim(), model: String(LN.store.get(p.modelKey) || '').trim() };
  }
  function current() { var p = LN.store.get('aiProvider'); return PROVIDERS[p] ? p : 'groq'; }

  // V0.7.5: every key for a provider, best first. Without the key vault loaded it is just the main key.
  function keysFor(id) {
    if (LN.keys && LN.keys.candidates) return LN.keys.candidates(id);
    var k = cfg(id).key;
    return k ? [k] : [];
  }
  function note(id, key, r) {
    if (LN.keys && LN.keys.report) { try { LN.keys.report(id, key, r); } catch (e) { /* never block a call on bookkeeping */ } }
  }

  function hdr(res, name) {
    try { return res && res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null; } catch (e) { return null; }
  }
  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  // Groq sends its limits in headers. Gemini does not, so this is null there.
  function readLimits(res) {
    var lim = num(hdr(res, 'x-ratelimit-limit-requests'));
    var rem = num(hdr(res, 'x-ratelimit-remaining-requests'));
    var tlim = num(hdr(res, 'x-ratelimit-limit-tokens'));
    var trem = num(hdr(res, 'x-ratelimit-remaining-tokens'));
    if (lim == null && rem == null && tlim == null && trem == null) return null;
    return { lim: lim, rem: rem, tlim: tlim, trem: trem, at: Date.now() };
  }

  function message(data) {
    if (data && data.error) return typeof data.error === 'string' ? data.error : (data.error.message || '');
    return '';
  }
  // bad = the key itself is refused, limit = the key is out of quota for now, other = not the key's fault
  function classify(status, data) {
    var m = message(data);
    if (status === 401 || status === 403) return 'bad';
    if (status === 400 && /api[_ ]key (is )?(not valid|expired|invalid)|invalid api key|API_KEY_INVALID/i.test(m + ' ' + JSON.stringify((data && data.error && data.error.details) || ''))) return 'bad';
    if (status === 429 || (data && data.error && data.error.status === 'RESOURCE_EXHAUSTED')) return 'limit';
    return 'other';
  }

  function explain(status, data, raw, kind) {
    var m = message(data);
    if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/.test(m + ' ' + JSON.stringify((data && data.error && data.error.details) || ''))) {
      return 'Google refused this AQ. key (ACCESS_TOKEN_TYPE_UNSUPPORTED). That is on Google\'s side for some accounts and projects. Create a new key in a new AI Studio project, or use Groq.';
    }
    if (kind === 'bad') return 'The API key was rejected. ' + (m || 'Check the key in Settings.');
    if (status === 404) return 'Model not found. ' + (m || 'Check the model name in Settings.');
    if (kind === 'limit') return 'Rate limit reached. Wait a moment and try again. ' + m;
    return 'AI error ' + status + (m ? ': ' + m : (raw ? ': ' + String(raw).slice(0, 120) : ''));
  }

  // Resolves { data, rl }. Errors carry kind (bad, limit, net, other), status and retryAfter (seconds).
  function request2(url, init) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : null;
    if (ctl) init.signal = ctl.signal;
    return fetch(url, init).then(function (res) {
      if (t) clearTimeout(t);
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var kind = classify(res.status, data);
          var err = new Error(explain(res.status, data, txt, kind));
          err.status = res.status;
          err.kind = kind;
          err.retryAfter = num(hdr(res, 'retry-after'));
          err.rl = readLimits(res);
          throw err;
        }
        return { data: data, rl: readLimits(res) };
      });
    }, function (err) {
      if (t) clearTimeout(t);
      var e = new Error(err && err.name === 'AbortError' ? 'The request timed out. Check your connection and try again.' : 'Couldn\'t reach the AI service. Check your connection.');
      e.kind = 'net';
      throw e;
    });
  }
  function request(url, init) { return request2(url, init).then(function (r) { return r.data; }); }

  // Shown when a live list cannot be loaded (no key yet, offline, key refused). A live list always replaces them.
  var FALLBACK = {
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b'],
    gemini: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemma-3-27b-it'],
    mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'open-mistral-nemo', 'ministral-8b-latest', 'codestral-latest']
  };
  // Neither provider says which models are free, so this is a best guess.
  // Groq: every model it lists runs on the free plan (with rate limits). Gemini: Flash, Flash-Lite and Gemma have free tiers; Pro and image or audio models mostly do not.
  function isFree(id, name) {
    name = String(name || '');
    if (id === 'groq' || id === 'mistral') return true;
    if (/image|imagen|veo|tts|live|native-audio|embedding|aqa|computer-use|robotics|deep-research/i.test(name)) return false;
    return /flash|lite|gemma|-latest$/i.test(name);
  }
  function pickDefault(id, list) {
    var order = id === 'groq'
      ? [/^llama-3\.3-70b-versatile$/, /^llama-3\.1-8b-instant$/, /gpt-oss-120b/, /./]
      : id === 'mistral'
      ? [/^mistral-small-latest$/, /^mistral-medium-latest$/, /^open-mistral-nemo$/, /^mistral-large-latest$/, /./]
      : [/^gemini-flash-latest$/, /^gemini-\d+(\.\d+)?-flash$/, /^gemini-flash-lite-latest$/, /^gemini-\d+(\.\d+)?-flash-lite$/, /flash/, /gemma/];
    for (var i = 0; i < order.length; i++) {
      var hit = list.filter(function (n) { return order[i].test(n) && isFree(id, n); });
      if (hit.length) return hit.sort().reverse()[0];
    }
    return list[0] || '';
  }

  function needModel(id) {
    var c = cfg(id);
    if (!c.model) throw new Error('Pick a ' + c.label + ' model in Settings, AI.');
    return c;
  }

  // One call with one key. Resolves { text, rl }.
  function attempt(id, c, key, messages, opts, temp, system) {
    if (OPENAI_STYLE[id]) {
      var msgs = [];
      if (system.trim()) msgs.push({ role: 'system', content: system });
      messages.forEach(function (m) { msgs.push({ role: m.role, content: m.content }); });
      var gb = { model: c.model, messages: msgs, temperature: temp };
      if (id === 'mistral') gb.safe_prompt = false;
      if (opts.maxTokens) gb.max_tokens = opts.maxTokens;
      return request2(OPENAI_STYLE[id] + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(gb)
      }).then(function (r) {
        var d = r.data;
        var t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (!t) throw new Error('The model returned no text.');
        return { text: String(t), rl: r.rl };
      });
    }
    var body = {
      contents: messages.map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      }),
      generationConfig: { temperature: temp }
    };
    if (system.trim()) body.systemInstruction = { parts: [{ text: system }] };
    return request2(GEMINI + '/models/' + encodeURIComponent(c.model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    }).then(function (r) {
      var d = r.data;
      var parts = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
      var t = parts ? parts.map(function (p) { return p.text || ''; }).join('') : '';
      if (!t) {
        var why = d && d.promptFeedback && d.promptFeedback.blockReason;
        throw new Error(why ? 'Gemini blocked the prompt (' + why + ').' : 'The model returned no text.');
      }
      return { text: t, rl: r.rl };
    });
  }

  // messages: [{ role: 'user' | 'assistant', content: string }]
  // opts.key forces one key and never fails over (used by the key vault's Test button).
  // Otherwise the keys for the provider are tried best first; a rejected or rate limited key moves on to the next.
  function ask(messages, opts) {
    opts = opts || {};
    var id = opts.provider || current();
    var keys = opts.key ? [String(opts.key)] : keysFor(id);
    var c = cfg(id);
    if (!keys.length) return Promise.reject(new Error('Add your ' + c.label + ' API key in Settings, AI, or the API key vault.'));
    if (opts.model) c = { label: c.label, key: '', model: String(opts.model) };
    else { try { c = needModel(id); } catch (e) { return Promise.reject(e); } }
    var temp = opts.temperature != null ? opts.temperature : Number(LN.store.get('aiTemp'));
    if (!isFinite(temp)) temp = 0.7;
    var system = opts.system != null ? opts.system : String(LN.store.get('aiSystem') || '');
    var i = 0;

    function next() {
      var key = keys[i++];
      var t0 = Date.now();
      return attempt(id, c, key, messages, opts, temp, system).then(function (r) {
        note(id, key, { ok: true, ms: Date.now() - t0, rl: r.rl });
        return r.text;
      }, function (e) {
        note(id, key, { ok: false, kind: e.kind || 'other', msg: e.message, retryAfter: e.retryAfter, rl: e.rl });
        if (i < keys.length && (e.kind === 'bad' || e.kind === 'limit')) return next();
        if (keys.length > 1 && (e.kind === 'bad' || e.kind === 'limit')) e.message += ' (all ' + keys.length + ' keys tried)';
        throw e;
      });
    }
    return next().catch(function (e) {
      // The chosen model no longer exists (providers retire models). Pick a working one from the live list once and retry.
      if (e.status !== 404 || opts.model || opts._retried) throw e;
      return listModels(id, keys[0]).then(function (list) {
        var pick = pickDefault(id, list);
        if (!pick || pick === c.model) throw e;
        LN.store.set(PROVIDERS[id].modelKey, pick);
        if (LN.toast) LN.toast(c.model + ' is gone. Switched to ' + pick + '.');
        var o2 = {}; Object.keys(opts).forEach(function (k) { o2[k] = opts[k]; });
        o2._retried = true;
        return ask(messages, o2);
      }, function () { throw e; });
    });
  }

  // key is optional: test one specific key. Without it the normal rotation is used.
  function test(id, key, model) {
    var started = Date.now();
    return ask([{ role: 'user', content: 'Reply with the single word: ready' }], { provider: id, system: '', temperature: 0, key: key || null, model: model || null, maxTokens: id === 'gemini' ? 0 : 16 })
      .then(function (t) { return { ok: true, ms: Date.now() - started, text: t.trim().slice(0, 40) }; });
  }

  // key is optional. A list-models call costs no tokens, so the key vault uses it as the quick health check.
  function listModels(id, key) {
    var c = cfg(id);
    var k = key || keysFor(id)[0] || '';
    if (!k) return Promise.reject(new Error('Add your ' + c.label + ' API key first.'));
    var t0 = Date.now();
    var job;
    if (OPENAI_STYLE[id]) {
      job = request2(OPENAI_STYLE[id] + '/models', { method: 'GET', headers: { 'Authorization': 'Bearer ' + k } }).then(function (r) {
        var list = (r.data && r.data.data) || [];
        return { rl: r.rl, list: list.filter(function (m) {
          return !(m && m.capabilities && m.capabilities.completion_chat === false);
        }).map(function (m) { return m.id; }).filter(function (n, i, a) {
          return n && a.indexOf(n) === i && !/whisper|tts|guard|embed|moderation|ocr|transcri|voxtral/i.test(n);
        }).sort() };
      });
    } else {
      var all = [];
      var page = function (token, n) {
        return request2(GEMINI + '/models?pageSize=1000' + (token ? '&pageToken=' + encodeURIComponent(token) : ''), { method: 'GET', headers: { 'x-goog-api-key': k } }).then(function (r) {
          all = all.concat((r.data && r.data.models) || []);
          var nt = r.data && r.data.nextPageToken;
          if (nt && n < 6) return page(nt, n + 1);
          return r;
        });
      };
      job = page('', 0).then(function (r) {
        return { rl: r.rl, list: all.filter(function (m) {
          return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
        }).map(function (m) { return String(m.name || '').replace(/^models\//, ''); }).filter(function (n, i, a) {
          return n && a.indexOf(n) === i && !/embedding|aqa/i.test(n);
        }).sort() };
      });
    }
    return job.then(function (r) {
      note(id, k, { ok: true, check: true, ms: Date.now() - t0, rl: r.rl });
      return r.list;
    }, function (e) {
      note(id, k, { ok: false, check: true, kind: e.kind || 'other', msg: e.message, retryAfter: e.retryAfter, rl: e.rl });
      throw e;
    });
  }

  // ---------- Ask AI chat (V0.7.8: full screen, grounded, markdown answers) ----------
  // Threads live in memory only. Notes can be encrypted at rest, so a chat about one is never written to storage.
  var panel = null;
  var els = {};
  var threads = {};
  var busy = false;
  var useNote = true;          // false = the note is not sent at all
  var MAX_SEND = 20;           // newest messages sent back to the model as memory
  var MAX_KEEP = 60;
  var NOTE_MAX = 60000;        // most note characters sent in one call

  // The note goes in the system prompt, not in the last user message: that way every follow-up still sees it,
  // and the model is told in plain words not to make things up.
  var GROUND =
    'You are the assistant built into Limitless Notepad, a notes app.\n' +
    'Rules:\n' +
    '1. The user\'s note is between <note> tags below. It is the source of truth. For questions about the note, answer only from it and point to the lines you used.\n' +
    '2. If the note does not contain the answer, say "That is not in the note." You may then add an answer from general knowledge, but label it clearly as general knowledge.\n' +
    '3. Never invent facts, names, numbers, dates, links, quotes or file contents. If you are unsure, say so.\n' +
    '4. When asked to rewrite, fix, translate, shorten, expand or continue text, return only the resulting text with the same formatting and no introduction.\n' +
    '5. Be concise. Reply in the language the user writes in.';

  var QUICK = [
    ['Summarize', 'Summarize this in a few short bullet points.'],
    ['Fix writing', 'Fix spelling and grammar. Keep the meaning and the formatting. Return only the corrected text.'],
    ['Shorter', 'Rewrite this to be shorter and clearer. Return only the rewritten text.'],
    ['Continue', 'Continue writing from where this ends, in the same style. Return only the new text.'],
    ['Expand', 'Expand this with more detail and examples. Keep the same style and formatting. Return only the expanded text.'],
    ['Translate', 'Translate this to English. Return only the translation.'],
    ['Make checklist', 'Turn this into a markdown checklist using "- [ ] " items. Return only the checklist.'],
    ['Title ideas', 'Suggest 5 short, clear titles for this note, one per line.'],
    ['Change tone', 'Rewrite this in a friendly but professional tone. Keep the meaning. Return only the rewritten text.']
  ];

  function thread(id) { return threads[id] || (threads[id] = []); }
  function kfmt(n) { return n >= 10000 ? Math.round(n / 1000) + 'k' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function iconBtn(cls, icon, label, fn) {
    var b = mk('button', cls);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = LN.icon(icon, 20);
    b.addEventListener('click', fn);
    return b;
  }

  function build() {
    panel = mk('div', 'aichat');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ask AI');

    var head = mk('div', 'aic-head');
    head.appendChild(iconBtn('aic-btn', 'back', 'Close', closePanel));
    var ttl = mk('div', 'aic-ttl');
    els.title = mk('div', 'aic-name', 'Ask AI');
    els.sub = mk('div', 'aic-sub', '');
    ttl.appendChild(els.title);
    ttl.appendChild(els.sub);
    head.appendChild(ttl);
    els.prov = document.createElement('select');
    els.prov.className = 'aic-prov';
    els.prov.setAttribute('aria-label', 'AI provider');
    Object.keys(PROVIDERS).forEach(function (id) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = PROVIDERS[id].label;
      els.prov.appendChild(o);
    });
    els.prov.addEventListener('change', function () {
      LN.store.set('aiProvider', els.prov.value);
      header();
      keyNote();
      loadModels(false);
    });
    head.appendChild(iconBtn('aic-btn', 'plus', 'New chat', newChat));
    panel.appendChild(head);

    // V0.7.15: switch AI and model without leaving the chat
    var pick = mk('div', 'aic-pick');
    pick.appendChild(els.prov);
    els.model = document.createElement('select');
    els.model.className = 'aic-model';
    els.model.setAttribute('aria-label', 'AI model');
    els.model.addEventListener('change', function () {
      var p = PROVIDERS[current()];
      LN.store.set(p.modelKey, els.model.value);
      header();
      els.state.textContent = '';
    });
    pick.appendChild(els.model);
    els.reload = iconBtn('aic-btn aic-reload', 'restore', 'Refresh models', function () { loadModels(true); });
    pick.appendChild(els.reload);
    panel.appendChild(pick);

    els.log = mk('div', 'aic-log');
    els.log.setAttribute('aria-live', 'polite');
    panel.appendChild(els.log);

    var foot = mk('div', 'aic-foot');
    els.ctx = mk('button', 'aic-ctx');
    els.ctx.type = 'button';
    els.ctx.addEventListener('click', function () { useNote = !useNote; ctxChip(); });
    foot.appendChild(els.ctx);
    els.quick = mk('div', 'aic-quick');
    QUICK.forEach(function (q) {
      var b = mk('button', 'chip', q[0]);
      b.type = 'button';
      b.addEventListener('click', function () { els.prompt.value = q[1]; grow(); els.prompt.focus(); });
      els.quick.appendChild(b);
    });
    foot.appendChild(els.quick);
    var row = mk('div', 'aic-compose');
    els.prompt = document.createElement('textarea');
    els.prompt.className = 'aic-input';
    els.prompt.rows = 1;
    els.prompt.placeholder = 'Ask about this note, or say what to do with it';
    els.prompt.setAttribute('aria-label', 'Message');
    els.prompt.addEventListener('input', grow);
    els.prompt.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
    });
    row.appendChild(els.prompt);
    els.send = iconBtn('aic-send', 'send', 'Send', function () { send(); });
    row.appendChild(els.send);
    foot.appendChild(row);
    els.state = mk('div', 'aic-state');
    els.state.addEventListener('click', function () {
      if (els.state.classList.contains('aic-link') && LN.settings && LN.settings.open) { closePanel(); LN.settings.open(); }
    });
    foot.appendChild(els.state);
    panel.appendChild(foot);

    document.getElementById('app').appendChild(panel);
  }

  var growRaf = 0, growH = 0;
  // One update per frame, and the box is only touched when its height really changes (the old version reset it on every key).
  function grow() {
    if (growRaf) return;
    growRaf = window.requestAnimationFrame(function () {
      growRaf = 0;
      var t = els.prompt;
      var max = Math.round(window.innerHeight * 0.3);
      var h = growH || 44;
      if (!t.value) h = 44;
      else if (t.scrollHeight > t.clientHeight + 1) h = Math.min(t.scrollHeight, max);
      else {
        var prev = t.style.height;
        t.style.height = '44px';
        h = Math.min(Math.max(44, t.scrollHeight), max);
        t.style.height = prev;
      }
      if (h !== growH) { growH = h; t.style.height = h + 'px'; }
    });
  }

  // ---- model list (cached per provider for this session) ----
  var modelCache = {};
  var modelBusy = false;

  function modelOptions(p) {
    var c = cfg(p);
    var live = modelCache[p] || null;
    var list = live ? live.slice() : (FALLBACK[p] || []).slice();
    if (live && p === 'gemini') {
      var free = list.filter(function (n) { return isFree(p, n); });
      if (free.length) list = free;
    }
    if (c.model && list.indexOf(c.model) < 0) list.unshift(c.model);
    return list;
  }

  function fillModels() {
    var p = current();
    var c = cfg(p);
    var list = modelOptions(p);
    els.model.textContent = '';
    if (!list.length) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = 'No models';
      els.model.appendChild(none);
      return;
    }
    list.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      els.model.appendChild(o);
    });
    els.model.value = c.model && list.indexOf(c.model) >= 0 ? c.model : list[0];
    // nothing chosen yet: take the first one so the chat works at once
    if (!c.model && els.model.value) LN.store.set(PROVIDERS[p].modelKey, els.model.value);
  }

  function loadModels(force) {
    var p = current();
    fillModels();
    header();
    if (modelBusy || (!force && modelCache[p])) return;
    if (!keysFor(p).length) return;
    modelBusy = true;
    els.reload.disabled = true;
    els.reload.classList.add('spin');
    listModels(p).then(function (list) {
      if (list && list.length) modelCache[p] = list;
    }, function (e) {
      if (force && els.state) els.state.textContent = 'Could not refresh models. ' + (e && e.message ? e.message : '');
    }).then(function () {
      modelBusy = false;
      els.reload.disabled = false;
      els.reload.classList.remove('spin');
      if (panel && !panel.hidden) { fillModels(); header(); }
    });
  }

  function keyNote() {
    var p = current();
    els.state.textContent = keysFor(p).length ? '' : 'No ' + cfg(p).label + ' key yet. Tap here to add one in Settings, AI.';
    els.state.classList.toggle('aic-link', !keysFor(p).length);
  }

  function header() {
    var p = current();
    var c = cfg(p);
    Array.prototype.forEach.call(els.prov.options, function (o) {
      var id = o.value;
      o.textContent = PROVIDERS[id].label + (keysFor(id).length ? '' : ' (no key)');
    });
    els.prov.value = p;
    els.title.textContent = 'Ask AI';
    var n = LN.editor.currentId() ? LN.vault.get(LN.editor.currentId()) : null;
    els.sub.textContent = (c.model || 'no model set') + (n ? ' · ' + n.name : '');
  }

  function ctxChip() {
    var sel = LN.editor.selection();
    if (!sel) { els.ctx.textContent = ''; return; }
    var chip;
    if (!useNote) chip = 'Note not sent. Tap to include it';
    else if (sel.text) chip = 'Using your selection · ' + kfmt(sel.text.length) + ' characters';
    else chip = 'Using the whole note · ' + kfmt(sel.all.length) + ' characters';
    els.ctx.textContent = chip;
    els.ctx.classList.toggle('off', !useNote);
  }

  function newChat() {
    var id = LN.editor.currentId();
    if (id) threads[id] = [];
    els.state.textContent = '';
    renderLog(false);
  }

  function actionBtn(label, fn) {
    var b = mk('button', 'btn small', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function aiBubble(m, isLast) {
    var d = mk('div', 'aic-msg ai');
    var body = mk('div', 'aic-md preview');
    body.innerHTML = LN.md.render(m.content, { copy: true, br: true });
    if (LN.hl && LN.hl.bind) { try { LN.hl.bind(body); } catch (e) { /* highlighting is cosmetic */ } }
    d.appendChild(body);
    var row = mk('div', 'aic-acts');
    row.appendChild(actionBtn('Insert', function () { place(m.content, false); }));
    row.appendChild(actionBtn('Replace selection', function () { place(m.content, true); }));
    row.appendChild(actionBtn('Copy', function () { copy(m.content); }));
    if (isLast) row.appendChild(actionBtn('Retry', retry));
    d.appendChild(row);
    return d;
  }

  function meBubble(text) {
    var d = mk('div', 'aic-msg me');
    d.appendChild(mk('div', 'aic-txt', text));
    return d;
  }

  // pending: true while a question is waiting for its answer (the question is already in the thread)
  function renderLog(pending, errText) {
    var id = LN.editor.currentId();
    var list = id ? thread(id) : [];
    els.log.textContent = '';
    if (!list.length && !pending) {
      var empty = mk('div', 'aic-empty');
      empty.appendChild(mk('div', 'aic-empty-t', 'Ask about this note'));
      empty.appendChild(mk('div', 'aic-empty-b', 'Answers come from the note. If it is not in the note, the AI says so. Pick a quick action below or type your own question.'));
      els.log.appendChild(empty);
      return;
    }
    list.forEach(function (m, i) {
      els.log.appendChild(m.role === 'user' ? meBubble(m.content) : aiBubble(m, i === list.length - 1 && !pending));
    });
    if (pending) {
      var w = mk('div', 'aic-msg ai aic-wait');
      w.innerHTML = '<span class="aic-dots"><i></i><i></i><i></i></span>';
      els.log.appendChild(w);
    }
    if (errText) {
      var e = mk('div', 'aic-msg ai aic-err');
      e.appendChild(mk('div', 'aic-txt', errText));
      var r = mk('div', 'aic-acts');
      r.appendChild(actionBtn('Retry', retry));
      e.appendChild(r);
      els.log.appendChild(e);
    }
    els.log.scrollTop = els.log.scrollHeight;
  }

  function openPanel(quiet) {
    var id = LN.editor.currentId();
    var sel = id ? LN.editor.selection() : null;
    if (!sel) { LN.toast('Open a text note first. AI works on text, markdown, csv and html files.'); return; }
    if (!panel) build();
    useNote = true;
    header();
    ctxChip();
    keyNote();
    loadModels(false);
    renderLog(false);
    panel.hidden = false;
    document.body.classList.add('aic-open');
    if (quiet !== true) els.prompt.focus();
  }

  function closePanel() {
    if (panel) panel.hidden = true;
    document.body.classList.remove('aic-open');
  }

  // The note text that goes with this turn, cut to a window around the cursor when it is very long.
  function noteContext(sel) {
    var txt = sel.text || sel.all;
    var cut = false;
    if (txt.length > NOTE_MAX) {
      var from = 0;
      if (!sel.text) from = Math.max(0, Math.min(sel.start - Math.floor(NOTE_MAX / 2), txt.length - NOTE_MAX));
      txt = txt.slice(from, from + NOTE_MAX);
      cut = true;
    }
    return { text: txt, cut: cut };
  }

  function systemFor(c, id) {
    var extra = String(LN.store.get('aiSystem') || '').trim();
    var s = GROUND;
    if (extra) s += '\n\nStanding instructions from the user:\n' + extra;
    if (c) {
      var n = LN.vault.get(id);
      s += '\n\n<note name="' + (n ? n.name.replace(/"/g, '') : 'note') + '"' + (c.cut ? ' partial="true"' : '') + '>\n' + c.text + '\n</note>';
    } else {
      s += '\n\nThe user chose not to send the note. Answer from general knowledge only.';
    }
    return s;
  }

  function ask1(id, prompt) {
    var sel = LN.editor.selection();
    if (!id || !sel) { els.state.textContent = 'No note is open.'; return; }
    var c = useNote ? noteContext(sel) : null;
    if (LN.store.get('aiConfirm') && c && !window.confirm('Send ' + c.text.length + ' characters of this note to ' + cfg(current()).label + '?')) {
      els.state.textContent = 'Not sent.';
      return;
    }
    var th = thread(id);
    // a question whose answer failed is replaced, so the thread never holds two user turns in a row
    if (th.length && th[th.length - 1].role === 'user') th.pop();
    var hist = th.slice(-MAX_SEND);
    th.push({ role: 'user', content: prompt });
    var msgs = hist.concat([{ role: 'user', content: prompt }]);
    busy = true;
    els.send.disabled = true;
    els.state.textContent = c && c.cut ? 'Note is long, sent ' + kfmt(c.text.length) + ' characters around your cursor.' : '';
    renderLog(true);
    ask(msgs, { system: systemFor(c, id) }).then(function (t) {
      thread(id).push({ role: 'assistant', content: t });
      var a = thread(id);
      if (a.length > MAX_KEEP) a.splice(0, a.length - MAX_KEEP);
      busy = false;
      els.send.disabled = false;
      if (LN.editor.currentId() === id) {
        renderLog(false);
        var last = els.log.lastElementChild;
        if (last && last.scrollIntoView) { try { last.scrollIntoView({ block: 'start' }); } catch (e) { /* older webview */ } }
      }
    }, function (e) {
      busy = false;
      els.send.disabled = false;
      if (LN.editor.currentId() === id) renderLog(false, e && e.message ? e.message : 'Something went wrong.');
    });
  }

  function send() {
    if (busy) return;
    var prompt = els.prompt.value.trim();
    if (!prompt) { els.state.textContent = 'Write a question or tap a quick action.'; return; }
    var id = LN.editor.currentId();
    els.prompt.value = '';
    grow();
    ask1(id, prompt);
  }

  // Asks the last question again: drops a failed or unwanted answer first.
  function retry() {
    if (busy) return;
    var id = LN.editor.currentId();
    var th = id ? thread(id) : [];
    if (th.length && th[th.length - 1].role === 'assistant') th.pop();
    var last = th.length ? th[th.length - 1] : null;
    if (!last || last.role !== 'user') { els.state.textContent = 'Nothing to retry.'; return; }
    th.pop();
    ask1(id, last.content);
  }

  function place(text, replaceSel) {
    if (!text) return;
    var sel = LN.editor.selection();
    if (replaceSel && sel && sel.start === sel.end) { els.state.textContent = 'Nothing is selected in the note.'; return; }
    if (LN.editor.insertText(text, replaceSel)) { closePanel(); LN.toast(replaceSel ? 'Replaced' : 'Inserted'); }
    else els.state.textContent = 'Open a text note first.';
  }

  function copy(text) {
    if (!text) return;
    var done = function () { LN.toast('Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { LN.toast('Copy failed. Select the text and copy it.'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { LN.toast('Select the text and copy it.'); }
      document.body.removeChild(ta);
    }
  }

  function clearChats() { threads = {}; if (panel && !panel.hidden) renderLog(false); }

  LN.ai = {
    clearChats: clearChats, providers: PROVIDERS, ask: ask, test: test, listModels: listModels,
    fallbackModels: function (id) { return (FALLBACK[id] || []).slice(); }, isFree: isFree, pickDefault: pickDefault,
    configured: function (id) { id = id || current(); var c = cfg(id); return !!(keysFor(id).length && c.model); },
    openPanel: openPanel, closePanel: closePanel
  };
})(window.LN = window.LN || {});
