(function (LN) {
  'use strict';

  // Music player: one <audio> element, a queue built from local blobs (added via file
  // input, stored in their own IndexedDB so the vault stays text/note-sized) and songs
  // found by scanning the device's Music folder (played straight from their content URI,
  // never copied into the app). Shuffle, repeat, prev/next, and a small sheet UI.

  var N = LN.native;
  var DB = 'limitless-notepad-music';
  var STORE = 'blobs';
  var db = null;
  var audio = null;
  var queue = [];      // [{id, name, kind:'local'|'scan', url}]
  var order = [];      // indexes into queue, shuffled or not
  var pos = -1;
  var shuffleOn = false;
  var repeatMode = 'off'; // off, all, one
  var urlCache = {};    // blob id -> object URL, revoked on close
  var listeners = [];
  var sheetBody = null;
  var sheetFn = null;
  var filterText = '';
  var failStreak = 0;
  var sleepAt = 0;
  var sleepTimer = 0;
  var lastSaved = 0;
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  var SLEEPS = [0, 15, 30, 60];

  function notify(kind) { listeners.slice().forEach(function (fn) { try { fn(kind); } catch (e) { /* a listener must not break playback */ } }); }
  function onChange(fn) { if (typeof fn === 'function' && listeners.indexOf(fn) < 0) listeners.push(fn); }
  function offChange(fn) { listeners = listeners.filter(function (f) { return f !== fn; }); }

  // ---------- local blob storage ----------
  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Storage is not available on this device')); return; }
      var r = window.indexedDB.open(DB, 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { db = r.result; resolve(db); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function putBlob(id, name, bytes) {
    return openDb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id: id, name: name, bytes: bytes });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getBlob(id) {
    return openDb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var q = d.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        q.onsuccess = function () { resolve(q.result || null); };
        q.onerror = function () { reject(q.error); };
      });
    });
  }

  function deleteBlob(id) {
    return openDb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* nothing to clean up */ });
  }

  function uid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var EXTS = 'mp3|m4a|m4b|aac|ogg|oga|opus|wav|flac|weba|amr|wma|mka|mid|midi|aif|aiff|3gp|mp4|m4v|webm|mkv|mov|ogv';
  var SCAN = new RegExp('\\.(' + EXTS + ')$', 'i');
  var MIME = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
    wav: 'audio/wav', flac: 'audio/flac', weba: 'audio/webm', amr: 'audio/amr', wma: 'audio/x-ms-wma', mka: 'audio/x-matroska',
    mid: 'audio/midi', midi: 'audio/midi', aif: 'audio/aiff', aiff: 'audio/aiff', '3gp': 'audio/3gpp',
    mp4: 'audio/mp4', m4v: 'audio/mp4', webm: 'audio/webm', mkv: 'audio/x-matroska', mov: 'audio/mp4', ogv: 'audio/ogg'
  };

  function mimeFor(name) {
    var e = (LN.ext ? LN.ext(name) : '').toLowerCase();
    return MIME[e] || 'audio/mpeg';
  }

  // ---------- list persistence ----------
  function list() { return (LN.store.get('musicList') || []).slice(); }
  function saveList(l) { LN.store.set('musicList', l); }

  function addEntry(entry) {
    var l = list();
    l.push(entry);
    saveList(l);
    return entry;
  }

  function removeEntry(id) {
    var c = current();
    if (c && c.id === id && audio) {
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch (e) { /* nothing loaded */ }
      pos = -1;
    }
    if (urlCache[id]) { try { URL.revokeObjectURL(urlCache[id]); } catch (e2) { /* already gone */ } delete urlCache[id]; }
    saveList(list().filter(function (e) { return e.id !== id; }));
    return deleteBlob(id);
  }

  // ---------- add songs (file input) ----------
  function addFiles() {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'audio/*,video/*,' + EXTS.split('|').map(function (x) { return '.' + x; }).join(',');
      inp.multiple = true;
      inp.addEventListener('change', function () {
        var files = Array.prototype.slice.call(inp.files || []);
        if (!files.length) { resolve(0); return; }
        var chain = Promise.resolve();
        var added = 0;
        var have = {};
        list().forEach(function (e) { if (e.kind === 'local') have[e.name + '|' + (e.size || 0)] = true; });
        files.forEach(function (f) {
          if (have[f.name + '|' + f.size]) return;
          have[f.name + '|' + f.size] = true;
          chain = chain.then(function () {
            return f.arrayBuffer().then(function (buf) {
              var id = uid();
              return putBlob(id, f.name, new Uint8Array(buf)).then(function () {
                addEntry({ id: id, name: f.name, kind: 'local', size: f.size });
                added++;
              });
            });
          });
        });
        chain.then(function () { resolve(added); }, reject);
      });
      inp.click();
    });
  }

  // ---------- scan the Music folder ----------
  function scanFolder() {
    if (!N.isNative()) { LN.toast('Scanning needs the Android app'); return Promise.resolve(0); }
    var fs = N.plugin('Filesystem');
    if (!fs) return Promise.reject(new Error('Filesystem plugin missing'));
    return LN.access.ask('music').then(function (s) {
      if (s !== 'granted') throw new Error('Music access is off. Allow it in Settings, Device access.');
      var folder = N.safeName(LN.store.get('musicFolder')) || 'Music';
      return fs.readdir({ path: folder, directory: 'EXTERNAL_STORAGE' });
    }).then(function (r) {
      var files = (r.files || []).filter(function (f) {
        return f.type !== 'directory' && SCAN.test(f.name || '');
      });
      var existing = list();
      var already = {};
      existing.forEach(function (e) { if (e.kind === 'scan') already[e.name] = true; });
      var added = 0;
      var chain = Promise.resolve();
      files.forEach(function (f) {
        if (already[f.name]) return;
        chain = chain.then(function () {
          return fs.getUri({ path: folder + '/' + f.name, directory: 'EXTERNAL_STORAGE' });
        }).then(function (u) {
          addEntry({ id: uid(), name: f.name, kind: 'scan', uri: u.uri });
          added++;
        }).catch(function () { /* skip a file we can't resolve a uri for */ });
      });
      return chain.then(function () { return added; });
    });
  }

  // ---------- queue / playback ----------
  function urlFor(entry) {
    if (entry.kind === 'scan') return Promise.resolve(N.fileUrl(entry.uri));
    if (urlCache[entry.id]) return Promise.resolve(urlCache[entry.id]);
    return getBlob(entry.id).then(function (b) {
      if (!b) throw new Error('"' + entry.name + '" is missing. Add it again.');
      var u = URL.createObjectURL(new Blob([b.bytes], { type: mimeFor(b.name) }));
      urlCache[entry.id] = u;
      return u;
    });
  }

  function buildQueue() {
    var playingId = current() ? current().id : null;
    queue = list();
    order = queue.map(function (_, i) { return i; });
    if (shuffleOn) shuffleOrder();
    pos = -1;
    if (playingId) {
      for (var i = 0; i < queue.length; i++) if (queue[i].id === playingId) { pos = order.indexOf(i); break; }
    }
  }

  function shuffleOrder() {
    order = queue.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.addEventListener('ended', function () {
      if (repeatMode === 'one') { audio.currentTime = 0; audio.play().catch(function () {}); return; }
      next();
    });
    audio.preservesPitch = true;
    audio.playbackRate = speed();
    audio.addEventListener('timeupdate', function () { saveLast(false); notify('time'); });
    audio.addEventListener('play', function () { notify(); });
    audio.addEventListener('pause', function () { saveLast(true); notify(); });
    audio.addEventListener('playing', function () { failStreak = 0; });
    audio.addEventListener('error', function () {
      var c = current();
      if (!c || !audio.getAttribute('src')) return;
      LN.toast('Can\'t play "' + c.name + '" on this device');
      skipBroken();
    });
    return audio;
  }

  function orderIndexOf(qi) { return order.indexOf(qi); }

  function playAt(oi) {
    if (!queue.length) return Promise.resolve();
    oi = ((oi % order.length) + order.length) % order.length;
    pos = oi;
    var entry = queue[order[oi]];
    var a = ensureAudio();
    if (a.canPlayType && a.canPlayType(mimeFor(entry.name)) === '') {
      LN.toast('This device can\'t play ' + (LN.ext(entry.name) || 'this').toUpperCase() + ' files: "' + entry.name + '"');
      notify();
      return skipBroken();
    }
    return urlFor(entry).then(function (url) {
      a.src = url;
      a.playbackRate = speed();
      return a.play();
    }).then(function () { setSession(entry); notify(); }).catch(function (e) {
      if (e && e.name === 'AbortError') return;   // another song was chosen while this one loaded
      LN.toast(N.msg(e));
      notify();
    });
  }

  function open() {
    buildQueue();
    if (!queue.length) { LN.toast('No songs yet. Add songs or scan your Music folder.'); return; }
    resumeLast();
    renderSheet();
  }

  function playId(id) {
    buildQueue();
    var qi = queue.map(function (e) { return e.id; }).indexOf(id);
    if (qi < 0) return;
    playAt(orderIndexOf(qi));
    renderSheet();
  }

  function toggle() {
    var a = ensureAudio();
    if (!a.getAttribute('src')) { if (queue.length) playAt(pos >= 0 ? pos : 0); return; }
    if (a.paused) a.play().catch(function (e) { LN.toast(N.msg(e)); }); else a.pause();
  }

  function next() {
    if (!queue.length) return;
    if (pos < 0) { playAt(0); return; }
    if (repeatMode !== 'all' && pos >= order.length - 1) { ensureAudio().pause(); return; }
    playAt(pos + 1);
  }

  function prev() {
    if (!queue.length) return;
    var a = ensureAudio();
    if (a.currentTime > 3) { a.currentTime = 0; return; }
    if (pos < 0) { playAt(0); return; }
    playAt(pos - 1);
  }

  function setShuffle(on) {
    shuffleOn = !!on;
    LN.store.set('musicShuffle', shuffleOn);
    var cur = pos >= 0 ? order[pos] : -1;
    if (shuffleOn) shuffleOrder(); else order = queue.map(function (_, i) { return i; });
    if (cur >= 0) pos = orderIndexOf(cur);
    notify();
  }

  function cycleRepeat() {
    repeatMode = repeatMode === 'off' ? 'all' : (repeatMode === 'all' ? 'one' : 'off');
    LN.store.set('musicRepeat', repeatMode);
    notify();
  }

  function speed() {
    var v = Number(LN.store.get('musicSpeed'));
    return SPEEDS.indexOf(v) >= 0 ? v : 1;
  }

  function cycleSpeed() {
    var i = SPEEDS.indexOf(speed());
    var v = SPEEDS[(i + 1) % SPEEDS.length];
    LN.store.set('musicSpeed', v);
    ensureAudio().playbackRate = v;
    notify();
  }

  function sleepLeft() { return sleepAt ? Math.max(0, sleepAt - Date.now()) : 0; }

  function setSleep(min) {
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = 0; }
    sleepAt = 0;
    if (min > 0) {
      sleepAt = Date.now() + min * 60000;
      sleepTimer = setTimeout(function () {
        sleepTimer = 0;
        sleepAt = 0;
        if (audio) audio.pause();
        LN.toast('Sleep timer: music stopped');
        notify();
      }, min * 60000);
    }
    notify();
  }

  function cycleSleep() {
    var mins = sleepAt ? Math.round(sleepLeft() / 60000) : 0;
    var cur = 0;
    for (var i = 0; i < SLEEPS.length; i++) if (SLEEPS[i] > 0 && mins > 0 && mins <= SLEEPS[i]) { cur = i; break; }
    if (mins > SLEEPS[SLEEPS.length - 1]) cur = SLEEPS.length - 1;
    setSleep(SLEEPS[(cur + 1) % SLEEPS.length]);
  }

  // Lets the lock screen and headset buttons control playback.
  function setSession(entry) {
    var ms = navigator.mediaSession;
    if (!ms || typeof window.MediaMetadata !== 'function') return;
    try {
      ms.metadata = new window.MediaMetadata({ title: entry.name.replace(/\.[^.]+$/, ''), artist: 'Limitless Notepad', album: 'Music' });
      ms.setActionHandler('play', function () { toggle(); });
      ms.setActionHandler('pause', function () { toggle(); });
      ms.setActionHandler('previoustrack', function () { prev(); });
      ms.setActionHandler('nexttrack', function () { next(); });
      ms.setActionHandler('seekto', function (d) { if (d && isFinite(d.seekTime)) ensureAudio().currentTime = d.seekTime; });
    } catch (e) { /* this WebView has no media session support */ }
  }

  // Remembers the song and the second you stopped at.
  function saveLast(force) {
    var c = current();
    if (!c || !audio) return;
    var now = Date.now();
    if (!force && now - lastSaved < 5000) return;
    lastSaved = now;
    LN.store.set('musicLast', { id: c.id, t: Math.floor(audio.currentTime || 0) });
  }

  // Loads the last song without playing it, so the player opens where you left off.
  function resumeLast() {
    var a = ensureAudio();
    if (a.getAttribute('src') || !queue.length) return;
    var last = LN.store.get('musicLast');
    if (!last || !last.id) return;
    var qi = -1;
    for (var i = 0; i < queue.length; i++) if (queue[i].id === last.id) { qi = i; break; }
    if (qi < 0) return;
    pos = orderIndexOf(qi);
    urlFor(queue[qi]).then(function (url) {
      if (a.getAttribute('src')) return;
      a.src = url;
      var t = Number(last.t) || 0;
      a.addEventListener('loadedmetadata', function once() {
        a.removeEventListener('loadedmetadata', once);
        if (t > 0 && t < a.duration) a.currentTime = t;
        notify();
      });
      notify();
    }).catch(function () { /* the song is gone, start fresh */ });
  }

  // A song the device cannot play is skipped, but never more than a few in a row.
  function skipBroken() {
    failStreak++;
    if (failStreak > 3 || queue.length < 2) { failStreak = 0; notify(); return Promise.resolve(); }
    if (repeatMode !== 'all' && pos >= order.length - 1) { failStreak = 0; notify(); return Promise.resolve(); }
    return playAt(pos + 1);
  }

  function current() { return pos >= 0 && queue[order[pos]] ? queue[order[pos]] : null; }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---------- sheet UI ----------
  function paintList() {
    if (!sheetBody || !sheetBody.isConnected) return;
    var box = sheetBody.querySelector('.music-list');
    if (!box) return;
    box.textContent = '';
    if (!queue.length) { box.appendChild(LN.ui.el('div', 'set-empty', 'No songs yet.')); return; }
    var q = filterText.trim().toLowerCase();
    var shown = 0;
    queue.forEach(function (e, qi) {
      if (q && e.name.toLowerCase().indexOf(q) < 0) return;
      shown++;
      var row = LN.ui.el('div', 'set-row music-row');
      var info = LN.ui.el('div', 'set-info');
      info.appendChild(LN.ui.el('div', 'set-label', e.name));
      info.appendChild(LN.ui.el('div', 'set-desc', e.kind === 'scan' ? 'Music folder' : 'Added song'));
      row.appendChild(info);
      var playing = current() && current().id === e.id;
      row.classList.toggle('on', !!playing);
      var rm = LN.ui.el('button', 'btn small', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removeEntry(e.id).then(open);
      });
      row.appendChild(rm);
      row.addEventListener('click', function () { playAt(orderIndexOf(qi)); paint(); });
      box.appendChild(row);
    });
    if (q && !shown) box.appendChild(LN.ui.el('div', 'set-empty', 'No song matches "' + filterText.trim() + '".'));
  }

  function paintTransport() {
    if (!sheetBody || !sheetBody.isConnected) return;
    var a = ensureAudio();
    var box = sheetBody.querySelector('.music-transport');
    if (!box) return;
    var cur = current();
    box.querySelector('.music-now').textContent = cur ? cur.name : 'Nothing playing';
    box.querySelector('.music-time').textContent = fmtTime(a.currentTime) + ' / ' + fmtTime(a.duration);
    var scrub = box.querySelector('.music-scrub');
    if (document.activeElement !== scrub) {
      scrub.max = String(isFinite(a.duration) ? a.duration : 0);
      scrub.value = String(a.currentTime || 0);
    }
    var playBtn = box.querySelector('.music-play');
    playBtn.innerHTML = LN.icon(a.paused ? 'play' : 'pause', 18);
    playBtn.setAttribute('aria-label', a.paused ? 'Play' : 'Pause');
    var spd = box.querySelector('.music-speed');
    if (spd) spd.textContent = speed() + '\u00d7';
    var slp = box.querySelector('.music-sleep');
    if (slp) {
      var left = sleepLeft();
      slp.textContent = left ? 'Sleep ' + Math.ceil(left / 60000) + 'm' : 'Sleep';
      slp.classList.toggle('on', !!left);
    }
    box.querySelector('.music-shuffle').classList.toggle('on', shuffleOn);
    var rbtn = box.querySelector('.music-repeat');
    rbtn.classList.toggle('on', repeatMode !== 'off');
    rbtn.innerHTML = LN.icon('repeat', 16) + (repeatMode === 'one' ? '<sup>1</sup>' : '');
  }

  function paint() { paintTransport(); paintList(); }

  function renderSheet() {
    if (sheetFn) offChange(sheetFn);
    var s = LN.ui.sheet('Music', function () { if (sheetFn) { offChange(sheetFn); sheetFn = null; } sheetBody = null; });
    sheetBody = s.body;
    filterText = '';

    var transport = LN.ui.el('div', 'music-transport');
    var now = LN.ui.el('div', 'music-now', 'Nothing playing');
    transport.appendChild(now);

    var scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.className = 'music-scrub';
    scrub.min = '0';
    scrub.step = '1';
    scrub.setAttribute('aria-label', 'Seek');
    scrub.addEventListener('input', function () { ensureAudio().currentTime = Number(scrub.value) || 0; });
    transport.appendChild(scrub);

    var time = LN.ui.el('div', 'music-time', '0:00 / 0:00');
    transport.appendChild(time);

    var row = LN.ui.el('div', 'music-controls');
    var shuf = LN.ui.el('button', 'btn small music-shuffle');
    shuf.type = 'button';
    shuf.setAttribute('aria-label', 'Shuffle');
    shuf.innerHTML = LN.icon('shuffle', 16);
    shuf.addEventListener('click', function () { setShuffle(!shuffleOn); paint(); });
    var pr = LN.ui.el('button', 'btn music-prev');
    pr.type = 'button';
    pr.setAttribute('aria-label', 'Previous');
    pr.innerHTML = LN.icon('skip-back', 18);
    pr.addEventListener('click', function () { prev(); });
    var pl = LN.ui.el('button', 'btn primary music-play');
    pl.type = 'button';
    pl.setAttribute('aria-label', 'Play');
    pl.innerHTML = LN.icon('play', 18);
    pl.addEventListener('click', toggle);
    var nx = LN.ui.el('button', 'btn music-next');
    nx.type = 'button';
    nx.setAttribute('aria-label', 'Next');
    nx.innerHTML = LN.icon('skip-forward', 18);
    nx.addEventListener('click', function () { next(); });
    var rep = LN.ui.el('button', 'btn small music-repeat');
    rep.type = 'button';
    rep.setAttribute('aria-label', 'Repeat');
    rep.innerHTML = LN.icon('repeat', 16);
    rep.addEventListener('click', function () { cycleRepeat(); });
    row.appendChild(shuf);
    row.appendChild(pr);
    row.appendChild(pl);
    row.appendChild(nx);
    row.appendChild(rep);
    transport.appendChild(row);

    var extras = LN.ui.el('div', 'music-extras');
    var spd = LN.ui.el('button', 'btn small music-speed', speed() + '\u00d7');
    spd.type = 'button';
    spd.setAttribute('aria-label', 'Playback speed');
    spd.addEventListener('click', function () { cycleSpeed(); });
    var slp = LN.ui.el('button', 'btn small music-sleep', 'Sleep');
    slp.type = 'button';
    slp.setAttribute('aria-label', 'Sleep timer');
    slp.addEventListener('click', function () { cycleSleep(); });
    extras.appendChild(spd);
    extras.appendChild(slp);
    transport.appendChild(extras);
    sheetBody.appendChild(transport);

    var actions = LN.ui.el('div', 'ai-row');
    var addBtn = LN.ui.el('button', 'btn', 'Add songs');
    addBtn.type = 'button';
    addBtn.addEventListener('click', function () {
      addFiles().then(function (n) { if (n) { buildQueue(); paint(); paintList(); LN.toast(n + ' song' + (n === 1 ? '' : 's') + ' added'); } }).catch(function (e) { LN.toast(N.msg(e)); });
    });
    var scanBtn = LN.ui.el('button', 'btn', 'Scan Music folder');
    scanBtn.type = 'button';
    scanBtn.addEventListener('click', function () {
      scanBtn.disabled = true;
      scanFolder().then(function (n) {
        scanBtn.disabled = false;
        buildQueue();
        paint();
        LN.toast(n ? n + ' song' + (n === 1 ? '' : 's') + ' found' : 'No new songs found');
      }, function (e) { scanBtn.disabled = false; LN.toast(N.msg(e)); });
    });
    actions.appendChild(addBtn);
    actions.appendChild(scanBtn);
    sheetBody.appendChild(actions);

    var find = document.createElement('input');
    find.type = 'search';
    find.className = 'music-find';
    find.placeholder = 'Search songs';
    find.setAttribute('aria-label', 'Search songs');
    find.addEventListener('input', function () { filterText = find.value; paintList(); });
    sheetBody.appendChild(find);

    var listBox = LN.ui.el('div', 'set-group music-list');
    sheetBody.appendChild(listBox);

    sheetFn = function (kind) { if (kind === 'time') paintTransport(); else paint(); };
    onChange(sheetFn);
    paint();
  }

  function init() {
    // the <audio> element and db open lazily on first use; only the saved modes are read here
    shuffleOn = LN.store.get('musicShuffle') === true;
    var r = LN.store.get('musicRepeat');
    repeatMode = r === 'all' || r === 'one' ? r : 'off';
  }

  LN.music = {
    init: init, open: open, playId: playId, toggle: toggle, next: next, prev: prev,
    setShuffle: setShuffle, cycleRepeat: cycleRepeat, cycleSpeed: cycleSpeed, setSleep: setSleep, addFiles: addFiles, scanFolder: scanFolder,
    list: list, current: current, onChange: onChange
  };
})(window.LN = window.LN || {});
