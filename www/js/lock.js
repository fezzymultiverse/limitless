(function (LN) {
  'use strict';

  // V0.5.0 security: PIN lock, fingerprint unlock and encryption of notes at rest.
  // Design: a random notes key (DEK, AES-GCM 256) is wrapped by a key made from the PIN
  // (PBKDF2-SHA256). Changing the PIN only re-wraps the DEK, so notes are not re-encrypted.
  // With fingerprint on, the DEK is also sealed by an Android Keystore key that needs a
  // fingerprint for every use (native helper LNSecure). The DEK lives in memory only.
  var KEY = 'ln.lock.v1';
  var ATT = 'ln.lock.att';
  var STASH = 'ln.lock.stash';
  var ITER = 250000;
  var te = new TextEncoder();
  var td = new TextDecoder();
  var dek = null;
  var dekRaw = null;
  var bound = false;
  var hiddenAt = 0;
  var coverEl = null;

  // ---------- helpers ----------
  function subtle() { return window.crypto && window.crypto.subtle; }
  function rand(n) { var a = new Uint8Array(n); window.crypto.getRandomValues(a); return a; }
  function b64(bytes) { return LN.native.bytesToB64(bytes); }
  function unb64(s) { return LN.native.b64ToBytes(s); }
  function sec() { return LN.native.plugin('LNSecure'); }
  function el(tag, cls, text) { return LN.ui.el(tag, cls, text); }

  function rec() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || 'null');
      return r && r.v === 1 ? r : null;
    } catch (e) { return null; }
  }
  function saveRec(r) { localStorage.setItem(KEY, JSON.stringify(r)); }
  function att() {
    try { return JSON.parse(localStorage.getItem(ATT) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveAtt(a) { try { localStorage.setItem(ATT, JSON.stringify(a)); } catch (e) { /* ignore */ } }
  function clearAtt() { try { localStorage.removeItem(ATT); } catch (e) { /* ignore */ } }
  function lockedUntil() { var a = att(); return a.until && a.until > Date.now() ? a.until : 0; }
  function delayFor(n) { return n <= 5 ? 30 : n <= 10 ? 60 : n <= 15 ? 300 : 900; }
  function fmtSecs(s) { return s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s'; }

  function kekFrom(pin, salt, iter) {
    return subtle().importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle().deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function seal(key, bytes) {
    var iv = rand(12);
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, bytes).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(ct), 12);
      return out;
    });
  }
  function unseal(key, blob) {
    blob = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
    return subtle().decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12) }, key, blob.subarray(12)).then(function (pt) {
      return new Uint8Array(pt);
    });
  }
  function importDek(raw) { return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }

  // adopt a raw key if it opens the check blob
  function adopt(raw, r) {
    return importDek(raw).then(function (k) {
      return unseal(k, unb64(r.chk)).then(function (chk) {
        if (td.decode(chk) !== 'ln') throw new Error('Bad key');
        dek = k;
        dekRaw = raw;
      });
    });
  }

  function tryPin(pin) {
    var r = rec();
    if (!r) return Promise.reject(new Error('No PIN'));
    return kekFrom(pin, unb64(r.salt), r.iter).then(function (kek) { return unseal(kek, unb64(r.wrap)); })
      .then(function (raw) { return adopt(raw, r); });
  }

  function setup(pin) {
    var salt = rand(16);
    var raw = rand(32);
    var r = { v: 1, salt: b64(salt), iter: ITER, enc: false, bio: false, weak: pin.length < 8 };
    return Promise.all([kekFrom(pin, salt, ITER), importDek(raw)]).then(function (a) {
      return Promise.all([seal(a[0], raw), seal(a[1], te.encode('ln'))]).then(function (s) {
        r.wrap = b64(s[0]);
        r.chk = b64(s[1]);
        dek = a[1];
        dekRaw = raw;
        saveRec(r);
      });
    });
  }

  function rewrap(pin) {
    var r = rec();
    var salt = rand(16);
    return kekFrom(pin, salt, ITER).then(function (kek) { return seal(kek, dekRaw); }).then(function (w) {
      r.salt = b64(salt);
      r.iter = ITER;
      r.wrap = b64(w);
      r.weak = pin.length < 8;
      saveRec(r);
    });
  }

  // ---------- note encryption (used by vault.js) ----------
  function encodeNode(n, on) {
    if (on === undefined) { var r = rec(); on = !!(r && r.enc); }
    if (!on || !dek || !n || n.type !== 'file') return Promise.resolve(n);
    var hasText = typeof n.content === 'string' && n.content.length > 0;
    var hasBytes = n.bytes && n.bytes.length > 0;
    if (!hasText && !hasBytes) return Promise.resolve(n);
    var c = Object.assign({}, n);
    var jobs = [];
    if (hasText) jobs.push(seal(dek, te.encode(n.content)).then(function (x) { c.ctt = x; c.content = ''; }));
    if (hasBytes) jobs.push(seal(dek, n.bytes).then(function (x) { c.ctb = x; delete c.bytes; }));
    return Promise.all(jobs).then(function () { c.enc = 1; return c; });
  }

  function decodeNode(n) {
    if (!n || !n.enc) return Promise.resolve(n);
    if (!dek) return Promise.reject(new Error('The vault is locked'));
    var jobs = [];
    if (n.ctt) jobs.push(unseal(dek, n.ctt).then(function (b) { n.content = td.decode(b); }));
    if (n.ctb) jobs.push(unseal(dek, n.ctb).then(function (b) { n.bytes = b; }));
    return Promise.all(jobs).then(function () { delete n.enc; delete n.ctt; delete n.ctb; return n; });
  }

  // ---------- lock screen ----------
  function lockScreen() {
    return new Promise(function (resolve) {
      var r = rec();
      document.documentElement.setAttribute('data-theme', LN.store.get('theme') === 'dark' ? 'dark' : 'light');
      var root = el('div', 'ln-lock');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'Unlock Limitless Notepad');
      var head = el('div', 'ln-head');
      var logo = document.createElement('img');
      logo.className = 'ln-logo';
      logo.src = 'img/leaf.png';
      logo.alt = '';
      head.appendChild(logo);
      head.appendChild(el('h1', '', 'LIMITLESS NOTEPAD'));
      head.appendChild(el('div', 'ln-sub', 'Your vault is locked'));
      root.appendChild(head);
      var dots = el('div', 'ln-dots');
      var msg = el('div', 'ln-msg', 'Enter your PIN');
      var pad = el('div', 'ln-pad');
      var pin = '';
      var busy = false;
      var tick = null;
      var keys = [];

      function paint() {
        dots.textContent = '';
        for (var i = 0; i < pin.length; i++) dots.appendChild(document.createElement('i'));
      }
      function disabled(on) { keys.forEach(function (b) { b.disabled = on; }); okBtn.disabled = on; }
      function refresh() {
        var u = lockedUntil();
        if (u) {
          msg.textContent = 'Too many wrong PINs. Try again in ' + fmtSecs(Math.ceil((u - Date.now()) / 1000)) + '.';
          disabled(true);
          if (!tick) tick = setInterval(refresh, 1000);
        } else if (tick) {
          clearInterval(tick);
          tick = null;
          disabled(false);
          msg.textContent = 'Enter your PIN';
        }
      }
      function finish() {
        if (tick) clearInterval(tick);
        document.removeEventListener('keydown', onKey, true);
        root.remove();
        resolve();
      }
      function submit() {
        if (busy || pin.length < 4 || lockedUntil()) return;
        busy = true;
        msg.textContent = 'Checking…';
        tryPin(pin).then(function () { clearAtt(); finish(); }, function () {
          var a = att();
          a.n = (a.n || 0) + 1;
          if (a.n % 5 === 0) a.until = Date.now() + delayFor(a.n) * 1000;
          saveAtt(a);
          pin = '';
          paint();
          busy = false;
          msg.textContent = 'Wrong PIN';
          if (navigator.vibrate) navigator.vibrate(120);
          refresh();
        });
      }
      function press(d) { if (busy || lockedUntil() || pin.length >= 12) return; pin += d; paint(); }
      function back() { if (busy) return; pin = pin.slice(0, -1); paint(); }
      function onKey(e) {
        if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
        else if (e.key === 'Backspace') { back(); e.preventDefault(); }
        else if (e.key === 'Enter') { submit(); e.preventDefault(); }
      }
      function bio() {
        var p = sec();
        var cur = rec();
        if (!cur || !cur.bio || !p || busy) return;
        busy = true;
        p.unlock().then(function (res) { return adopt(unb64(res.data), cur); }).then(function () {
          clearAtt();
          finish();
        }, function (e) {
          busy = false;
          if (e && e.code === 'invalidated') {
            var c2 = rec();
            if (c2) { c2.bio = false; saveRec(c2); }
            bioBtn.style.visibility = 'hidden';
            msg.textContent = 'Your fingerprints changed. Use your PIN, then turn fingerprint on again.';
          } else if (e && e.code !== 'cancelled') {
            msg.textContent = 'Fingerprint failed. Use your PIN.';
          }
        });
      }

      '123456789'.split('').forEach(function (d) {
        var b = el('button', '', d);
        b.type = 'button';
        b.addEventListener('click', function () { press(d); });
        pad.appendChild(b);
        keys.push(b);
      });
      var bioBtn = el('button', 'ln-bio');
      bioBtn.type = 'button';
      bioBtn.setAttribute('aria-label', 'Use fingerprint');
      bioBtn.innerHTML = LN.icon('finger', 26);
      bioBtn.style.visibility = (r && r.bio && sec()) ? 'visible' : 'hidden';
      bioBtn.addEventListener('click', bio);
      pad.appendChild(bioBtn);
      var zero = el('button', '', '0');
      zero.type = 'button';
      zero.addEventListener('click', function () { press('0'); });
      pad.appendChild(zero);
      keys.push(zero);
      var del = el('button', '', '⌫');
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete digit');
      del.addEventListener('click', back);
      pad.appendChild(del);
      var okBtn = el('button', 'ln-ok', 'Unlock');
      okBtn.type = 'button';
      okBtn.addEventListener('click', submit);

      var entry = el('div', 'ln-entry');
      entry.appendChild(dots);
      entry.appendChild(msg);
      root.appendChild(entry);
      root.appendChild(pad);
      root.appendChild(okBtn);
      document.body.appendChild(root);
      document.addEventListener('keydown', onKey, true);
      paint();
      refresh();
      if (r && r.bio && sec() && !lockedUntil()) bio();
    });
  }

  // ---------- boot and auto-lock ----------
  function applySecure() {
    var p = sec();
    if (!p) return;
    var on = !!rec() && !!LN.store.get('lockSecure');
    try { p.setSecure({ on: on }); } catch (e) { /* ignore */ }
  }

  function boot() {
    var r = rec();
    applySecure();
    if (!r) return Promise.resolve();
    try {
      var s = sessionStorage.getItem(STASH);
      if (s) {
        sessionStorage.removeItem(STASH);
        var m = /^(\d+):(.+)$/.exec(s);
        if (m && Date.now() - Number(m[1]) < 15000) {
          return adopt(unb64(m[2]), r).then(bind, function () { return lockScreen().then(bind); });
        }
      }
    } catch (e) { /* fall through to the lock screen */ }
    return lockScreen().then(bind);
  }

  function showCover() {
    if (coverEl) return;
    coverEl = el('div', 'ln-cover', 'LIMITLESS NOTEPAD');
    document.body.appendChild(coverEl);
  }
  function hideCover() { if (coverEl) { coverEl.remove(); coverEl = null; } }

  // V0.7.21: locking no longer reloads the page. The lock screen is drawn over whatever you were doing, so after you unlock
  // you are on the same note, the same panel and the same scroll position. (A reload used to throw all of that away.)
  var locking = false;
  function lockNow() {
    if (document.querySelector('.ln-lock')) { hideCover(); return Promise.resolve(); }
    if (locking) return Promise.resolve();
    locking = true;
    showCover();
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
    var f;
    try { f = LN.editor && LN.editor.flush ? LN.editor.flush() : null; } catch (e) { f = null; }
    return Promise.resolve(f).catch(function () { /* still lock */ }).then(function () {
      hideCover();
      return lockScreen();
    }).then(function () { locking = false; hiddenAt = Date.now(); }, function () { locking = false; });
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('visibilitychange', function () {
      var r = rec();
      if (!r) { hideCover(); return; }
      if (document.hidden) {
        hiddenAt = Date.now();
        showCover();
        try { if (LN.editor && LN.editor.flush) LN.editor.flush(); } catch (e) { /* ignore */ }
      } else {
        var wait = LN.store.get('lockBg') ? 0 : Number(LN.store.get('lockAuto'));
        if (wait >= 0 && Date.now() - hiddenAt >= wait) lockNow();
        else hideCover();
      }
    });
  }

  function keep() {
    if (dekRaw && rec()) { try { sessionStorage.setItem(STASH, Date.now() + ':' + b64(dekRaw)); } catch (e) { /* ignore */ } }
  }

  // ---------- settings flows ----------
  function askPins(title, labels, note, validate) {
    return new Promise(function (resolve) {
      var done = false;
      var s = LN.ui.sheet(title, function () { if (!done) { done = true; resolve(null); } });
      var g = el('div', 'set-group');
      var inputs = labels.map(function (lab) {
        var row = el('div', 'set-row stack');
        var info = el('div', 'set-info');
        info.appendChild(el('div', 'set-label', lab));
        row.appendChild(info);
        var i = document.createElement('input');
        i.type = 'password';
        i.inputMode = 'numeric';
        i.maxLength = 12;
        i.autocomplete = 'off';
        i.className = 'set-ctl set-input';
        i.setAttribute('aria-label', lab);
        row.appendChild(i);
        g.appendChild(row);
        return i;
      });
      s.body.appendChild(g);
      if (note) s.body.appendChild(el('p', 'hint', note));
      var state = el('div', 'ai-state');
      var actions = el('div', 'ai-row');
      var ok = el('button', 'btn primary', 'OK');
      ok.type = 'button';
      var cancel = el('button', 'btn', 'Cancel');
      cancel.type = 'button';
      actions.appendChild(ok);
      actions.appendChild(cancel);
      actions.appendChild(state);
      s.body.appendChild(actions);
      cancel.addEventListener('click', function () { s.close(); });
      ok.addEventListener('click', function () {
        var vals = inputs.map(function (i) { return i.value; });
        var bad = validate ? validate(vals) : '';
        if (bad) { state.textContent = bad; return; }
        done = true;
        s.close();
        resolve(vals);
      });
      inputs[0].focus();
    });
  }

  function validNew(a, b) {
    if (!/^\d{4,12}$/.test(a)) return 'Use 4 to 12 digits.';
    if (a !== b) return 'The two PINs differ.';
    return '';
  }

  function setPinFlow() {
    return askPins('Set PIN', ['New PIN (4 to 12 digits)', 'Repeat PIN'],
      'Use 8 or more digits if you plan to encrypt your notes. A short PIN can be guessed offline.',
      function (v) { return validNew(v[0], v[1]); }).then(function (v) {
      if (!v) return null;
      return setup(v[0]).then(function () { bind(); applySecure(); LN.toast('PIN set'); });
    });
  }

  function changePinFlow() {
    return askPins('Change PIN', ['Current PIN', 'New PIN (4 to 12 digits)', 'Repeat new PIN'], '',
      function (v) { return validNew(v[1], v[2]); }).then(function (v) {
      if (!v) return null;
      return tryPin(v[0]).then(function () { return rewrap(v[1]); }).then(function () { LN.toast('PIN changed'); },
        function (e) { if (e && e.message === 'Bad key') throw new Error('Wrong PIN'); throw new Error(e && e.name === 'OperationError' ? 'Wrong PIN' : (e && e.message) || 'Wrong PIN'); });
    });
  }

  function removePinFlow() {
    return askPins('Remove PIN', ['Current PIN'], 'This turns off the lock, fingerprint and encryption. Encrypted notes are decrypted first.', null).then(function (v) {
      if (!v) return null;
      return tryPin(v[0]).then(function () {
        var r = rec();
        LN.toast('Removing…');
        return (r && r.enc ? LN.vault.reencryptAll(false) : Promise.resolve()).then(function () {
          var p = sec();
          if (p) { try { p.clear(); } catch (e) { /* ignore */ } }
          localStorage.removeItem(KEY);
          clearAtt();
          dek = null;
          dekRaw = null;
          applySecure();
          LN.toast('PIN removed');
        });
      }, function () { throw new Error('Wrong PIN'); });
    });
  }

  function setEncryption(on) {
    var r = rec();
    if (!r || !dek) return Promise.reject(new Error('Set a PIN first'));
    if (on && r.weak && !window.confirm('Your PIN is short, so encrypted notes could be cracked by guessing it offline. Change to 8 or more digits first, or continue anyway?')) return Promise.resolve();
    if (on && !window.confirm('Notes will be encrypted on this device. If you forget your PIN (and fingerprint stops working) they cannot be recovered. Turn on encryption?')) return Promise.resolve();
    LN.toast(on ? 'Encrypting…' : 'Decrypting…');
    return LN.vault.reencryptAll(on).then(function () {
      var c = rec();
      c.enc = on;
      saveRec(c);
      LN.toast(on ? 'Notes encrypted' : 'Notes decrypted');
    });
  }

  function setBiometric(on) {
    var r = rec();
    var p = sec();
    if (!r || !dekRaw) return Promise.reject(new Error('Set a PIN first'));
    if (!p) return Promise.reject(new Error('Fingerprint only works in the installed Android app'));
    if (!on) {
      return Promise.resolve(p.clear()).then(function () { var c = rec(); c.bio = false; saveRec(c); LN.toast('Fingerprint off'); });
    }
    return p.status().then(function (s) {
      if (!s.available) throw new Error('No usable fingerprint found. Add one in Android settings first.');
      return p.enroll({ data: b64(dekRaw) });
    }).then(function () { var c = rec(); c.bio = true; saveRec(c); LN.toast('Fingerprint on'); },
      function (e) { throw new Error(e && e.code === 'cancelled' ? 'Fingerprint cancelled' : LN.native.msg(e)); });
  }

  function summary() {
    var r = rec();
    if (!r) return 'Off';
    var parts = ['PIN'];
    if (r.bio) parts.push('fingerprint');
    parts.push(r.enc ? 'notes encrypted' : 'notes not encrypted');
    return parts.join(', ');
  }

  LN.lock = {
    boot: boot, keep: keep, lockNow: lockNow, applySecure: applySecure,
    hasPin: function () { return !!rec(); },
    encOn: function () { var r = rec(); return !!(r && r.enc); },
    bioOn: function () { var r = rec(); return !!(r && r.bio); },
    summary: summary, setPinFlow: setPinFlow, changePinFlow: changePinFlow, removePinFlow: removePinFlow,
    setEncryption: setEncryption, setBiometric: setBiometric,
    encodeNode: encodeNode, decodeNode: decodeNode
  };
})(window.LN = window.LN || {});
