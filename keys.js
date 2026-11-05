(function (LN) {
  'use strict';
  // V0.7.5 API key vault.
  // Many keys per provider (Groq, Gemini). Paste text or upload files and every key in them is found and added.
  // Each key has a health state, a latency and a use bar. Calls rotate across healthy keys (see ai.js).
  // Keys live in the app settings on this phone, like the main key always did. They are never logged, backed up or synced.

  var PROV = {
    groq: { id: 'groq', label: 'Groq', legacy: 'groqKey', prefix: 'gsk_' },
    gemini: { id: 'gemini', label: 'Gemini', legacy: 'geminiKey', prefix: 'AIza or AQ.' },
    mistral: { id: 'mistral', label: 'Mistral', legacy: 'mistralKey', prefix: '32 letters and digits' }
  };
  var ORDER = ['groq', 'gemini', 'mistral'];
  var MAXK = 25;                       // most extra keys kept per provider
  var MAX_FILE = 25 * 1024 * 1024;
  var MAX_TEXT = 5000000;
  var COOL_DEFAULT = 60;               // seconds a rate limited key rests when the provider names no time
  var COOL_MAX = 900;

  // The boundary is matched by hand (no lookbehind) so old WebViews can still build these.
  var RX = {
    groq: /(^|[^A-Za-z0-9_\-])(gsk_[A-Za-z0-9]{30,70})(?![A-Za-z0-9_\-])/g,
    gemini: /(^|[^A-Za-z0-9_\-])(AIza[0-9A-Za-z_\-]{35}|AQ\.[0-9A-Za-z_\-]{16,120})(?![A-Za-z0-9_\-])/g
  };
  // Mistral keys have no prefix: 32 letters and digits. A bare token like that is only taken as a Mistral key
  // when the word "mistral" is on the same line (for example MISTRAL_API_KEY=...), so hashes and ids are never grabbed.
  var RX_MISTRAL = /(^|[^A-Za-z0-9_\-])([A-Za-z0-9]{32})(?![A-Za-z0-9_\-])/g;
  // Recognised only so the result can say they were skipped. These are never stored.
  var OTHER = [
    ['Anthropic', /(^|[^A-Za-z0-9_\-])(sk-ant-[A-Za-z0-9_\-]{30,})/g],
    ['OpenRouter', /(^|[^A-Za-z0-9_\-])(sk-or-[A-Za-z0-9_\-]{30,})/g],
    ['OpenAI', /(^|[^A-Za-z0-9_\-])(sk-(?!ant-|or-)(?:proj-|svcacct-)?[A-Za-z0-9_\-]{32,})/g],
    ['xAI', /(^|[^A-Za-z0-9_\-])(xai-[A-Za-z0-9]{40,})/g],
    ['Hugging Face', /(^|[^A-Za-z0-9_\-])(hf_[A-Za-z0-9]{30,})/g]
  ];

  function isStr(x) { return typeof x === 'string' && x.length > 0; }

  // ---------- storage ----------
  function pool() {
    var p = LN.store.get('aiKeys');
    return p && typeof p === 'object' ? p : {};
  }
  function extra(pid) {
    var a = pool()[pid];
    return Array.isArray(a) ? a.filter(isStr) : [];
  }
  function primary(pid) { return String(LN.store.get(PROV[pid].legacy) || '').trim(); }

  // A short, non-reversible tag for a key, used to file its stats without storing the key twice.
  function fp(pid, key) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < key.length; i++) {
      var c = key.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return pid + ':' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + key.length;
  }

  function metaAll() {
    var m = LN.store.get('aiKeyMeta');
    return m && typeof m === 'object' ? m : {};
  }
  function meta(f) {
    var all = metaAll();
    if (!all[f]) {
      all[f] = { label: '', added: 0, paused: false, uses: 0, ok: 0, fail: 0, last: 0, day: '', dayUses: 0, status: 'new', ms: 0, checked: 0, err: '', rl: null, cool: 0 };
      LN.store.set('aiKeyMeta', all);
    }
    return all[f];
  }
  function saveMeta() { LN.store.set('aiKeyMeta', metaAll()); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function roll(m) {
    var t = today();
    if (m.day !== t) { m.day = t; m.dayUses = 0; }
    return m;
  }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function mask(key) { return key.length > 10 ? key.slice(0, 4) + '…' + key.slice(-4) : '…'; }
  function short(s) { s = String(s || '').replace(/\s+/g, ' '); return s.length > 90 ? s.slice(0, 90) + '…' : s; }

  // Every key for a provider: the main key from Settings first, then the vault, no duplicates.
  function list(pid) {
    var seen = {}, out = [];
    function put(key, isMain) {
      if (!key || seen[key]) return;
      seen[key] = 1;
      var f = fp(pid, key);
      out.push({ pid: pid, key: key, fp: f, main: isMain, m: roll(meta(f)) });
    }
    put(primary(pid), true);
    extra(pid).forEach(function (k) { put(k, false); });
    return out;
  }
  function has(pid, key) { return list(pid).some(function (e) { return e.key === key; }); }
  function count(pid) { return list(pid).length; }

  function summary() {
    var parts = [];
    ORDER.forEach(function (p) { var n = count(p); if (n) parts.push(PROV[p].label + ' ' + n); });
    return parts.length ? parts.join(' · ') : 'None yet';
  }

  // ---------- finding keys in text ----------
  function labelBefore(text, at) {
    var ls = text.lastIndexOf('\n', at - 1) + 1;
    var pre = text.slice(Math.max(ls, at - 80), at);
    var m = /([A-Za-z][A-Za-z0-9_ .\-]{1,30})["']?\s*[:=|]\s*["'`]?\s*$/.exec(pre);
    return m ? m[1].trim().slice(0, 24) : '';
  }

  // Returns { found: [{ pid, key, label }], ignored: { OpenAI: 2 }, total }. Nothing is stored here.
  // Which provider a bare token belongs to, judged by its own line and the few lines above it (a heading such as
  // "Mistral:" over the key counts). The nearest provider word wins. Returns 'mistral', 'other' or ''.
  var RX_WORD = /mistral|groq|gemini|google|anthropic|claude|openai|chatgpt|openrouter|xai|grok|hugging/i;
  function ctxOf(text, at) {
    var ls = text.lastIndexOf('\n', at - 1) + 1;
    var le = text.indexOf('\n', at);
    var line = text.slice(ls, le < 0 ? text.length : le);
    var w = RX_WORD.exec(line);
    if (w) return /mistral/i.test(line.slice(0, at - ls)) || /mistral/i.test(line) && !/groq|gemini|google|anthropic|openai/i.test(line) ? 'mistral' : 'other';
    var pos = ls, hops = 0;
    while (pos > 0 && hops < 3) {
      var pe = pos - 1;
      var ps = text.lastIndexOf('\n', pe - 1) + 1;
      var pl = text.slice(ps, pe);
      pos = ps;
      if (!pl.trim()) continue;
      hops++;
      var m = RX_WORD.exec(pl);
      if (m) return /mistral/i.test(m[0]) ? 'mistral' : 'other';
    }
    return '';
  }

  // Returns { found: [{ pid, key, label }], ignored: { OpenAI: 2 }, total }. Nothing is stored here.
  // opts.loose (the key vault's own paste box and file import): a mixed letter-and-digit token of 32 characters with
  // no other provider named near it is taken as a Mistral key, because Mistral keys have no prefix.
  function scan(text, opts) {
    var out = { found: [], ignored: {}, total: 0 };
    var loose = !!(opts && opts.loose);
    text = String(text == null ? '' : text);
    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
    var seen = {};
    var rm = new RegExp(RX_MISTRAL.source, 'g');
    var mm;
    while ((mm = rm.exec(text)) !== null) {
      var mkey = mm[2];
      var mat = mm.index + mm[1].length;
      var c = ctxOf(text, mat);
      var mixed = /[A-Za-z]/.test(mkey) && /[0-9]/.test(mkey);
      if ((c === 'mistral' || (loose && c === '' && mixed)) && !seen['mistral' + mkey]) {
        seen['mistral' + mkey] = 1;
        out.found.push({ pid: 'mistral', key: mkey, label: labelBefore(text, mat) });
      }
      if (mm[0].length === 0) rm.lastIndex++;
    }
    ORDER.forEach(function (pid) {
      if (!RX[pid]) return;
      var rx = new RegExp(RX[pid].source, 'g');
      var m;
      while ((m = rx.exec(text)) !== null) {
        var key = m[2];
        var at = m.index + m[1].length;
        if (!seen[pid + key]) {
          seen[pid + key] = 1;
          out.found.push({ pid: pid, key: key, label: labelBefore(text, at) });
        }
        if (m[0].length === 0) rx.lastIndex++;
      }
    });
    var skip = {};
    OTHER.forEach(function (o) {
      var rx = new RegExp(o[1].source, 'g');
      var m;
      while ((m = rx.exec(text)) !== null) {
        if (!skip[m[2]]) { skip[m[2]] = 1; out.ignored[o[0]] = (out.ignored[o[0]] || 0) + 1; }
        if (m[0].length === 0) rx.lastIndex++;
      }
    });
    out.total = out.found.length;
    return out;
  }

  // ---------- reading files ----------
  function latin1(u) {
    try { return new TextDecoder('latin1').decode(u.length > 8388608 ? u.subarray(0, 8388608) : u); } catch (e) { return ''; }
  }
  function utf16(u) {
    try { return new TextDecoder('utf-16le').decode(u.length > 8388608 ? u.subarray(0, 8388608) : u); } catch (e) { return ''; }
  }
  function isZip(u) { return u.length > 30 && u[0] === 0x50 && u[1] === 0x4B && u[2] === 3 && u[3] === 4; }
  function isPdf(u) { return u.length > 8 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46; }

  // Office and ODF files keep text in XML. Paragraph ends become new lines so a key never glues to the next line.
  function xmlToText(s) {
    return String(s)
      .replace(/<\/(?:w:p|a:p|text:p|text:h|row|si|p|div|tr|li)\s*>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'')
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(Number(d)); })
      .replace(/&amp;/g, '&');
  }

  var MEDIA = /\.(png|jpe?g|gif|webp|bmp|ico|avif|mp3|mp4|m4a|wav|ogg|flac|webm|mkv|mov|ttf|otf|woff2?)$/i;

  function zipChunks(u, depth) {
    var pk;
    try { pk = LN.zip.parse(u); } catch (e) { return Promise.resolve([latin1(u)]); }
    var out = [];
    var chain = Promise.resolve();
    pk.list.slice(0, 500).forEach(function (ent) {
      var n = ent.name;
      if (/\/$/.test(n) || MEDIA.test(n) || !(ent.usize <= 8388608)) return;
      chain = chain.then(function () { return pk.bytes(n); }).then(function (b) {
        if (depth < 2 && isZip(b)) return chunksOf(b, depth + 1).then(function (c) { out = out.concat(c); });
        var d = LN.decodeText(b);
        if (!d) return null;
        out.push(/\.(xml|xhtml|html?|rels)$/i.test(n) || d.text.charAt(0) === '<' ? xmlToText(d.text) : d.text);
        return null;
      }).catch(function () { /* one bad entry never stops the rest */ });
    });
    return chain.then(function () { return out; });
  }

  function pdfChunks(u) {
    var raw = latin1(u);
    if (!LN.pdfv || !LN.pdfv.text) return Promise.resolve([raw]);
    return LN.pdfv.text(u).then(function (t) { return [t.spaced, t.tight, raw]; }, function () { return [raw]; });
  }

  // Bytes in, an array of text blocks out. Zips (docx, xlsx, pptx, odt, epub, plain zip) are opened, PDFs are read.
  function chunksOf(u, depth) {
    if (isZip(u)) return zipChunks(u, depth || 0);
    if (isPdf(u)) return pdfChunks(u);
    var d = LN.decodeText(u);
    if (d) return Promise.resolve([d.text]);
    return Promise.resolve([latin1(u), utf16(u)]);
  }

  function scanChunks(chunks) {
    var merged = { found: [], ignored: {}, total: 0 };
    var seen = {};
    chunks.forEach(function (c) {
      var r = scan(c, { loose: true });
      r.found.forEach(function (f) {
        if (seen[f.pid + f.key]) return;
        seen[f.pid + f.key] = 1;
        merged.found.push(f);
      });
      Object.keys(r.ignored).forEach(function (k) { merged.ignored[k] = Math.max(merged.ignored[k] || 0, r.ignored[k]); });
    });
    merged.total = merged.found.length;
    return merged;
  }

  function scanBytes(u) { return chunksOf(u, 0).then(scanChunks); }

  function scanFile(file) {
    if (file.size > MAX_FILE) return Promise.reject(new Error(file.name + ' is over 25 MB, so it was skipped.'));
    return file.arrayBuffer().then(function (buf) { return scanBytes(new Uint8Array(buf)); });
  }

  // ---------- changing the list ----------
  // found: [{ pid, key, label }]. Returns { added: [...], dup, full }.
  function add(found) {
    var res = { added: [], dup: 0, full: 0 };
    var pl = JSON.parse(JSON.stringify(pool()));
    var taken = {};
    found.forEach(function (f) {
      if (!PROV[f.pid] || !isStr(f.key)) return;
      var tag = f.pid + f.key;
      if (taken[tag] || has(f.pid, f.key)) { res.dup++; return; }
      var mine = Array.isArray(pl[f.pid]) ? pl[f.pid] : [];
      if (mine.length >= MAXK) { res.full++; return; }
      mine.push(f.key);
      pl[f.pid] = mine;
      taken[tag] = 1;
      var m = meta(fp(f.pid, f.key));
      m.label = f.label || '';
      m.added = Date.now();
      res.added.push(f);
    });
    LN.store.set('aiKeys', pl);
    saveMeta();
    if (res.added.length && LN.log) LN.log('info', 'Key vault: added ' + res.added.length + ' key' + (res.added.length === 1 ? '' : 's'));
    return res;
  }

  function remove(pid, key) {
    var pl = JSON.parse(JSON.stringify(pool()));
    pl[pid] = (Array.isArray(pl[pid]) ? pl[pid] : []).filter(function (k) { return k !== key; });
    LN.store.set('aiKeys', pl);
    if (primary(pid) === key) LN.store.set(PROV[pid].legacy, '');
    var all = metaAll();
    delete all[fp(pid, key)];
    LN.store.set('aiKeyMeta', all);
  }

  function clearAll() {
    LN.store.set('aiKeys', {});
    LN.store.set('aiKeyMeta', {});
    ORDER.forEach(function (p) { LN.store.set(PROV[p].legacy, ''); });
  }

  function setPaused(pid, key, on) {
    meta(fp(pid, key)).paused = !!on;
    saveMeta();
  }

  function rename(pid, key, label) {
    meta(fp(pid, key)).label = String(label || '').trim().slice(0, 24);
    saveMeta();
  }

  // ---------- choosing and reporting (called by ai.js) ----------
  // Best key first: not paused, not rejected, not resting, fewest calls today. Resting keys come last as a backup.
  function candidates(pid) {
    var now = Date.now();
    var good = [], rest = [], bad = [];
    list(pid).forEach(function (e, i) {
      if (e.m.paused) return;
      e.i = i;
      if (e.m.status === 'bad') bad.push(e);
      else if (e.m.cool > now) rest.push(e);
      else good.push(e);
    });
    good.sort(function (a, b) { return (a.m.dayUses - b.m.dayUses) || (a.m.last - b.m.last) || (a.i - b.i); });
    rest.sort(function (a, b) { return a.m.cool - b.m.cool; });
    var order = good.concat(rest);
    if (!order.length) order = bad.slice(0, 1);   // all rejected: still try one so the real error shows
    return order.map(function (e) { return e.key; });
  }

  // r: { ok, check, ms, kind, msg, retryAfter, rl }. A check (list models) is not counted as a call.
  function report(pid, key, r) {
    if (!PROV[pid] || !key) return;
    var m = roll(meta(fp(pid, key)));
    var now = Date.now();
    if (r.rl) m.rl = r.rl;
    if (r.ok) {
      m.status = 'ok';
      m.err = '';
      m.cool = 0;
      m.ms = r.ms || 0;
      m.checked = now;
      if (!r.check) { m.uses++; m.ok++; m.dayUses++; m.last = now; }
    } else {
      m.fail++;
      m.err = short(r.msg);
      if (r.kind === 'bad') m.status = 'bad';
      else if (r.kind === 'limit') {
        m.status = 'limited';
        var s = Number(r.retryAfter);
        if (!isFinite(s) || s <= 0) s = COOL_DEFAULT;
        m.cool = now + Math.min(s, COOL_MAX) * 1000;
      } else m.status = 'error';
    }
    saveMeta();
    if (listeners.length) listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a view that closed */ } });
  }

  var listeners = [];
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  // ---------- health ----------
  function check(pid, key) {
    return LN.ai.listModels(pid, key).then(function (l) { return { ok: true, models: l.length }; });
  }
  function testKey(pid, key) { return LN.ai.test(pid, key); }

  function sequence(items, fn, progress) {
    var chain = Promise.resolve();
    var done = 0;
    items.forEach(function (e) {
      chain = chain.then(function () {
        return fn(e.pid, e.key).catch(function () { /* the outcome is already recorded on the key */ }).then(function () {
          done++;
          if (progress) progress(done, items.length);
        });
      });
    });
    return chain;
  }
  function allKeys() {
    var out = [];
    ORDER.forEach(function (p) { list(p).forEach(function (e) { if (!e.m.paused) out.push(e); }); });
    return out;
  }
  function checkAll(progress) { return sequence(allKeys(), check, progress); }
  // Quietly checks every key that has never been checked, so its dot turns green (or shows why not) without a tap.
  function checkNew(progress) {
    var fresh = allKeys().filter(function (e) { return e.m.status === 'new'; });
    return fresh.length ? sequence(fresh, check, progress) : Promise.resolve();
  }
  function testAll(progress) { return sequence(allKeys(), testKey, progress); }

  // what to show for one key: { state, text }
  function health(e) {
    var m = e.m, now = Date.now();
    if (m.paused) return { state: 'paused', text: 'Paused' };
    if (m.status === 'bad') return { state: 'bad', text: 'Rejected' };
    if (m.cool > now) return { state: 'limited', text: 'Resting ' + Math.ceil((m.cool - now) / 1000) + ' s' };
    if (m.status === 'limited') return { state: 'limited', text: 'Was rate limited' };
    if (m.status === 'error') return { state: 'error', text: 'Error' };
    if (m.status === 'ok') return { state: 'ok', text: 'Healthy' + (m.ms ? ' · ' + fmt(m.ms) + ' ms' : '') };
    return { state: 'new', text: 'Not checked' };
  }

  // the use bar: { pct, low, cap }
  function usage(e, total) {
    var m = e.m, rl = m.rl;
    if (rl && rl.lim > 0 && rl.rem != null) {
      var used = Math.max(0, rl.lim - rl.rem);
      var cap = fmt(rl.rem) + ' of ' + fmt(rl.lim) + ' requests left (reported by ' + PROV[e.pid].label + ', ' + hhmm(rl.at) + ')';
      if (rl.tlim > 0 && rl.trem != null) cap += ' · tokens this minute ' + fmt(rl.trem) + ' of ' + fmt(rl.tlim);
      return { pct: Math.min(100, used / rl.lim * 100), low: rl.rem / rl.lim < 0.1, cap: cap };
    }
    var share = total > 0 ? m.dayUses / total * 100 : 0;
    return { pct: share, low: false, cap: m.dayUses + ' call' + (m.dayUses === 1 ? '' : 's') + ' today' + (total > 0 ? ' · ' + Math.round(share) + '% of ' + PROV[e.pid].label + ' calls' : '') + ' · ' + m.uses + ' in all (counted by this app' + (e.pid !== 'groq' ? ', ' + PROV[e.pid].label + ' does not report its quota here' : '') + ')' };
  }

  // ---------- paste and import watch ----------
  var lastWatch = { text: '', t: 0 };
  function mode() {
    var v = LN.store.get('aiKeyWatch');
    return v === 'auto' || v === 'off' ? v : 'ask';
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function autoCheck(added) {
    sequence(added.map(function (f) { return { pid: f.pid, key: f.key }; }), check);
  }

  function offer(r, source) {
    var fresh = r.found.filter(function (f) { return !has(f.pid, f.key); });
    if (!fresh.length) return;
    if (mode() === 'auto') {
      var a = add(fresh);
      if (a.added.length) { LN.toast('Added ' + plural(a.added.length, 'API key') + ' to the key vault'); autoCheck(a.added); }
      return;
    }
    LN.toast('Found ' + plural(fresh.length, 'API key') + ' in ' + source + '.', {
      label: 'Add', ms: 9000,
      run: function () {
        var a = add(fresh);
        LN.toast('Added ' + plural(a.added.length, 'API key') + ' to the key vault');
        autoCheck(a.added);
        return null;
      }
    });
  }

  // Text that was pasted into a note.
  function watch(text, source) {
    if (mode() === 'off' || !text || text.length < 24 || text.length > MAX_TEXT) return;
    if (!/gsk_|AIza|AQ\.|mistral/i.test(text)) return;
    var now = Date.now();
    if (lastWatch.text === text && now - lastWatch.t < 3000) return;
    lastWatch = { text: text, t: now };
    offer(scan(text), source || 'what you pasted');
  }

  // A file that was imported into the vault: text is the decoded text, or null for a binary file.
  function watchFile(name, u, text) {
    if (mode() === 'off') return;
    if (text != null) { watch(text, name); return; }
    if (!u || u.length > 10 * 1024 * 1024) return;
    scanBytes(u).then(function (r) { if (r.total) offer(r, name); }, function () { /* unreadable, nothing to offer */ });
  }

  // ---------- the vault screen ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, fn) {
    var b = el('button', 'btn small' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function resultText(r, add2, skipped) {
    var bits = [];
    if (!r.total && !Object.keys(r.ignored).length) return 'No Groq, Gemini or Mistral keys found. A Mistral key is 32 letters and digits; put the word Mistral on the same line or the line above it.';
    bits.push('Found ' + plural(r.total, 'key'));
    if (add2) {
      bits.push('added ' + add2.added.length);
      if (add2.dup) bits.push(add2.dup + ' already saved');
      if (add2.full) bits.push(add2.full + ' over the limit of ' + MAXK + ' per provider');
    }
    var ig = Object.keys(r.ignored).map(function (k) { return r.ignored[k] + ' ' + k; });
    if (ig.length) bits.push('skipped ' + ig.join(', ') + ' (not used by this app)');
    if (skipped && skipped.length) bits.push(skipped.join(' '));
    return bits.join(' · ') + '.';
  }

  function openVault() {
    var s = LN.ui.sheet('API key vault');
    var busy = false;
    var detach = null;

    // ----- add section -----
    var addBox = el('div', 'set-group kv-add');
    var addRow = el('div', 'set-row stack');
    var info = el('div', 'set-info');
    info.appendChild(el('div', 'set-label', 'Add keys'));
    info.appendChild(el('div', 'set-desc', 'Paste text or a whole document, or upload files (txt, md, json, env, csv, docx, xlsx, pptx, pdf, zip). Every Groq, Gemini and Mistral key in it is added and duplicates are skipped. A Mistral key has no prefix: keep the word Mistral on its line or the line above, or paste it here on its own. Reading happens on this phone.'));
    addRow.appendChild(info);
    var ta = document.createElement('textarea');
    ta.className = 'set-ctl set-input';
    ta.rows = 4;
    ta.placeholder = 'Paste keys or a whole document here';
    ta.setAttribute('aria-label', 'Paste text that contains API keys');
    ta.autocomplete = 'off';
    ta.spellcheck = false;
    ta.setAttribute('autocapitalize', 'off');
    addRow.appendChild(ta);
    var acts = el('div', 'ai-row');
    var scanBtn = btn('Scan and add', 'primary', function () { runText(ta.value); });
    var upBtn = btn('Upload files', '', function () { pick.click(); });
    acts.appendChild(scanBtn);
    acts.appendChild(upBtn);
    addRow.appendChild(acts);
    var pick = document.createElement('input');
    pick.type = 'file';
    pick.multiple = true;
    pick.hidden = true;
    addRow.appendChild(pick);
    addBox.appendChild(addRow);
    var res = el('div', 'kv-res');
    res.setAttribute('aria-live', 'polite');
    addBox.appendChild(res);
    s.body.appendChild(addBox);

    // ----- health actions -----
    var actBox = el('div', 'set-group');
    var actRow = el('div', 'set-row stack');
    var ai = el('div', 'set-info');
    ai.appendChild(el('div', 'set-label', 'Health'));
    ai.appendChild(el('div', 'set-desc', 'Check asks the provider for its model list: free, proves the key works. Test sends one tiny message with your chosen model and times it.'));
    actRow.appendChild(ai);
    var actBtns = el('div', 'ai-row');
    var checkAllBtn = btn('Check all', '', function () { runAll('Checking', checkAll); });
    var testAllBtn = btn('Test all', '', function () { runAll('Testing', testAll); });
    actBtns.appendChild(checkAllBtn);
    actBtns.appendChild(testAllBtn);
    var prog = el('span', 'ai-state');
    actBtns.appendChild(prog);
    actRow.appendChild(actBtns);
    actBox.appendChild(actRow);
    s.body.appendChild(actBox);

    // ----- providers -----
    var listBox = el('div', 'kv-lists');
    s.body.appendChild(listBox);

    var foot = el('p', 'hint',
      'Calls rotate across your healthy keys, the one used least today first. A key that hits its limit rests for a minute (or the time the provider gives) and the next key takes over. A rejected key is skipped until you Check it again. Keys stay on this phone and are only ever sent to their own provider.');
    s.body.appendChild(foot);

    function alive() { return s.el && s.el.isConnected; }

    function setBusy(on, text) {
      busy = on;
      [scanBtn, upBtn, checkAllBtn, testAllBtn].forEach(function (b) { b.disabled = on; });
      prog.textContent = text || '';
    }

    function draw() {
      if (!alive()) return;
      var top = s.body.scrollTop;
      listBox.textContent = '';
      ORDER.forEach(function (pid) {
        var P = PROV[pid];
        var keys = list(pid);
        var total = 0, healthy = 0;
        keys.forEach(function (e) { total += e.m.dayUses; if (health(e).state === 'ok') healthy++; });
        var g = el('div', 'set-group kv-prov');
        var head = el('div', 'kv-head');
        head.appendChild(el('b', '', P.label));
        head.appendChild(el('span', 'kv-sum', keys.length ? plural(keys.length, 'key') + ' · ' + healthy + ' healthy · ' + total + ' call' + (total === 1 ? '' : 's') + ' today' : 'No keys yet'));
        g.appendChild(head);
        keys.forEach(function (e, i) { g.appendChild(keyRow(e, i, total)); });
        if (!keys.length) g.appendChild(el('div', 'set-note kv-empty', 'Paste or upload something above, or type a key into Settings, AI.'));
        listBox.appendChild(g);
      });
      s.body.scrollTop = top;
    }

    function keyRow(e, i, total) {
      var h = health(e);
      var u = usage(e, total);
      var row = el('div', 'kv-key');
      var topLine = el('div', 'kv-top');
      var dot = el('span', 'kv-dot');
      dot.setAttribute('data-s', h.state);
      topLine.appendChild(dot);
      topLine.appendChild(el('span', 'kv-name', e.m.label || (e.main ? 'Main key' : 'Key ' + (i + 1))));
      if (e.main && e.m.label) topLine.appendChild(el('span', 'about-chip', 'Main'));
      topLine.appendChild(el('span', 'kv-st', h.text));
      row.appendChild(topLine);
      row.appendChild(el('div', 'kv-mask', mask(e.key) + (e.m.checked ? ' · checked ' + hhmm(e.m.checked) : '')));
      var bar = el('div', 'kv-bar');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(Math.round(u.pct)));
      bar.setAttribute('aria-label', 'Use of ' + (e.m.label || mask(e.key)));
      bar.setAttribute('data-s', h.state);
      if (u.low) bar.setAttribute('data-low', '1');
      var fill = document.createElement('i');
      fill.style.width = Math.max(u.pct > 0 ? 2 : 0, Math.min(100, u.pct)) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('div', 'kv-cap', u.cap));
      if (e.m.err && (h.state === 'bad' || h.state === 'error' || h.state === 'limited')) row.appendChild(el('div', 'kv-err', e.m.err));
      var bs = el('div', 'kv-btns');
      bs.appendChild(btn('Check', '', function () { one('Checking', check, e); }));
      bs.appendChild(btn('Test', '', function () { one('Testing', testKey, e); }));
      bs.appendChild(btn(e.m.paused ? 'Resume' : 'Pause', '', function () { setPaused(e.pid, e.key, !e.m.paused); draw(); }));
      bs.appendChild(btn('Name', '', function () {
        LN.ui.form({ title: 'Name this key', ok: 'Save', fields: [{ key: 'label', label: 'Name', value: e.m.label || '', placeholder: 'Key ' + (i + 1) }] }).then(function (r) {
          if (r) { rename(e.pid, e.key, r.label); draw(); }
        });
      }));
      bs.appendChild(btn('Remove', 'danger', function () {
        if (!window.confirm('Remove ' + (e.m.label || mask(e.key)) + ' from this phone?')) return;
        remove(e.pid, e.key);
        draw();
      }));
      row.appendChild(bs);
      return row;
    }

    function one(word, fn, e) {
      if (busy) return;
      setBusy(true, word + ' ' + (e.m.label || mask(e.key)) + '…');
      fn(e.pid, e.key).then(function () {
        LN.toast(word === 'Checking' ? 'Key is healthy' : 'Key answered');
      }, function (err) { LN.toast(err && err.message ? err.message : 'Failed'); }).then(function () {
        setBusy(false, '');
        draw();
      });
    }

    function runAll(word, fn) {
      if (busy) return;
      if (!allKeys().length) { LN.toast('No keys yet. Add some above.'); return; }
      setBusy(true, word + '…');
      fn(function (d, n) { if (alive()) prog.textContent = word + ' ' + d + ' of ' + n + '…'; }).then(function () {
        setBusy(false, 'Done');
        draw();
      });
    }

    function finish(r, skipped) {
      var a = r.total ? add(r.found) : null;
      res.textContent = resultText(r, a, skipped);
      if (a && a.added.length) {
        draw();
        setBusy(true, 'Checking new keys…');
        sequence(a.added.map(function (f) { return { pid: f.pid, key: f.key }; }), check).then(function () {
          setBusy(false, '');
          draw();
        });
      } else draw();
    }

    function runText(text) {
      if (busy) return;
      if (!String(text || '').trim()) { res.textContent = 'Paste some text first.'; return; }
      var r = scan(text, { loose: true });
      ta.value = '';
      finish(r, null);
    }

    function runFiles(files) {
      if (busy || !files.length) return;
      setBusy(true, 'Reading ' + plural(files.length, 'file') + '…');
      var merged = { found: [], ignored: {}, total: 0 };
      var seen = {};
      var skipped = [];
      var chain = Promise.resolve();
      Array.prototype.slice.call(files).forEach(function (f) {
        chain = chain.then(function () { return scanFile(f); }).then(function (r) {
          r.found.forEach(function (x) { if (!seen[x.pid + x.key]) { seen[x.pid + x.key] = 1; merged.found.push(x); } });
          Object.keys(r.ignored).forEach(function (k) { merged.ignored[k] = (merged.ignored[k] || 0) + r.ignored[k]; });
        }, function (e) { skipped.push(e && e.message ? e.message : f.name + ' could not be read.'); });
      });
      chain.then(function () {
        merged.total = merged.found.length;
        setBusy(false, '');
        finish(merged, skipped);
      });
    }

    ta.addEventListener('paste', function () {
      setTimeout(function () { if (ta.value.trim().length > 24) runText(ta.value); }, 0);
    });
    pick.addEventListener('change', function () { var fl = pick.files; if (fl && fl.length) runFiles(fl); pick.value = ''; });

    detach = onChange(function () { if (alive()) draw(); });
    var tick = setInterval(function () { if (!alive()) { clearInterval(tick); if (detach) detach(); return; } draw(); }, 5000);

    draw();
    if (allKeys().some(function (e) { return e.m.status === 'new'; })) {
      setBusy(true, 'Checking new keys…');
      checkNew(function (d, n) { if (alive()) prog.textContent = 'Checking ' + d + ' of ' + n + '…'; }).then(function () {
        if (alive()) { setBusy(false, ''); draw(); }
      });
    }
  }

  function init() {
    var ed = document.getElementById('editor');
    if (ed) {
      ed.addEventListener('paste', function (e) {
        var t = e.clipboardData && e.clipboardData.getData ? e.clipboardData.getData('text/plain') : '';
        if (t) watch(t, 'what you pasted');
      });
      ed.addEventListener('input', function (e) {
        if (e && e.data && e.data.length >= 24) watch(e.data, 'what you typed or pasted');
      });
    }
  }

  LN.keys = {
    init: init, openVault: openVault, scan: scan, scanBytes: scanBytes, scanFile: scanFile, xmlToText: xmlToText,
    add: add, remove: remove, clearAll: clearAll, setPaused: setPaused, rename: rename,
    list: list, count: count, summary: summary, candidates: candidates, report: report, onChange: onChange,
    check: check, testKey: testKey, checkAll: checkAll, checkNew: checkNew, testAll: testAll, health: health, usage: usage,
    watch: watch, watchFile: watchFile, mask: mask, providers: PROV
  };
})(window.LN = window.LN || {});
