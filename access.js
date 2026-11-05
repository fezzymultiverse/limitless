(function (LN) {
  'use strict';

  // Device access: one registry for every permission and feature switch the app uses.
  // Each entry: id, label, desc, check() -> state, request() -> state, kind ('perm' or 'switch').
  // States: granted, denied, prompt, limited, na.

  var N = LN.native;
  var wakeSentinel = null;
  var asked = {};

  function dev() { return N.plugin('LNDevice'); }
  function ok(v) { return Promise.resolve(v); }
  function norm(s) {
    s = String(s || '');
    if (s === 'granted' || s === 'limited') return s;
    if (s === 'denied') return 'denied';
    if (s === 'prompt' || s === 'prompt-with-rationale') return 'prompt';
    return 'prompt';
  }
  function worst(list) {
    var order = ['denied', 'prompt', 'limited', 'granted'];
    var w = 3;
    list.forEach(function (s) { var i = order.indexOf(s); if (i >= 0 && i < w) w = i; });
    return order[w];
  }

  function devStatus() {
    var d = dev();
    if (!d) return Promise.reject(new Error('Native helper missing. Reinstall the app from the latest build.'));
    return d.status();
  }

  function openAppSettings() {
    var d = dev();
    if (!d) return Promise.reject(new Error('Open Android Settings, Apps, Limitless Notepad, Permissions'));
    return d.openAppSettings();
  }

  // ---------- notifications ----------
  var notifyDef = {
    id: 'notify', label: 'Notifications', desc: 'Reminders and the permanent notification.',
    check: function () {
      var p = N.plugin('LocalNotifications');
      if (p) return p.checkPermissions().then(function (r) { return norm(r.display); });
      if (typeof Notification !== 'undefined') return ok(Notification.permission === 'default' ? 'prompt' : (Notification.permission === 'granted' ? 'granted' : 'denied'));
      return ok('na');
    },
    request: function () {
      var p = N.plugin('LocalNotifications');
      if (p) return p.requestPermissions().then(function (r) { return norm(r.display); });
      if (typeof Notification !== 'undefined') return Notification.requestPermission().then(function (r) { return r === 'default' ? 'prompt' : (r === 'granted' ? 'granted' : 'denied'); });
      return ok('na');
    }
  };

  // ---------- files ----------
  var filesDef = {
    id: 'files', label: 'Files access', desc: 'All files access lets Folder watch and Sync see files other apps add.',
    check: function () {
      if (!N.isNative()) return ok('na');
      return devStatus().then(function (s) {
        if (s.sdk >= 30) return s.allFiles ? 'granted' : 'denied';
        var fs = N.plugin('Filesystem');
        return fs ? fs.checkPermissions().then(function (r) { return norm(r.publicStorage); }) : 'na';
      });
    },
    request: function () {
      if (!N.isNative()) return ok('na');
      return devStatus().then(function (s) {
        if (s.sdk >= 30) return dev().requestAllFiles().then(function () { return s.allFiles ? 'granted' : 'denied'; });
        var fs = N.plugin('Filesystem');
        return fs ? fs.requestPermissions().then(function (r) { return norm(r.publicStorage); }) : 'na';
      });
    },
    opensScreen: true
  };

  // ---------- location ----------
  var locationDef = {
    id: 'location', label: 'Location', desc: 'Insert where you are into a note.',
    check: function () {
      var p = N.plugin('Geolocation');
      if (p) return p.checkPermissions().then(function (r) { return norm(r.location); });
      if (navigator.permissions && navigator.permissions.query) {
        return navigator.permissions.query({ name: 'geolocation' }).then(function (r) { return norm(r.state); }, function () { return 'prompt'; });
      }
      return ok(navigator.geolocation ? 'prompt' : 'na');
    },
    request: function () {
      var p = N.plugin('Geolocation');
      if (p) return p.requestPermissions({ permissions: ['location'] }).then(function (r) { return norm(r.location); });
      if (!navigator.geolocation) return ok('na');
      return new Promise(function (resolve) {
        navigator.geolocation.getCurrentPosition(function () { resolve('granted'); }, function (e) { resolve(e && e.code === 1 ? 'denied' : 'prompt'); }, { timeout: 15000 });
      });
    }
  };

  // ---------- calendar ----------
  function calScopes() { return ['readCalendar', 'writeCalendar']; }
  var calendarDef = {
    id: 'calendar', label: 'Calendar', desc: 'Read today\'s events and add notes as events.',
    check: function () {
      var p = N.plugin('CapacitorCalendar');
      if (!p) return ok('na');
      return Promise.all(calScopes().map(function (s) {
        return p.checkPermission({ scope: s }).then(function (r) { return norm(r.result); });
      })).then(worst);
    },
    request: function () {
      var p = N.plugin('CapacitorCalendar');
      if (!p) return ok('na');
      return calScopes().reduce(function (chain, s) {
        return chain.then(function () { return p.requestPermission({ scope: s }); });
      }, Promise.resolve()).then(function () { return calendarDef.check(); });
    }
  };

  // ---------- contacts ----------
  var contactsDef = {
    id: 'contacts', label: 'Contacts', desc: 'Pick a contact and insert it into a note.',
    check: function () {
      var p = N.plugin('Contacts');
      if (p) return p.checkPermissions().then(function (r) { return norm(r.contacts); });
      return ok(navigator.contacts && navigator.contacts.select ? 'granted' : 'na');
    },
    request: function () {
      var p = N.plugin('Contacts');
      if (p) return p.requestPermissions().then(function (r) { return norm(r.contacts); });
      return contactsDef.check();
    }
  };

  // ---------- camera ----------
  var cameraDef = {
    id: 'camera', label: 'Camera', desc: 'Take a photo and save it in the vault.',
    check: function () {
      var p = N.plugin('Camera');
      if (p) return p.checkPermissions().then(function (r) { return norm(r.camera); });
      return ok(navigator.mediaDevices ? 'granted' : 'na');
    },
    request: function () {
      var p = N.plugin('Camera');
      if (p) return p.requestPermissions({ permissions: ['camera'] }).then(function (r) { return norm(r.camera); });
      return cameraDef.check();
    }
  };

  // ---------- microphone ----------
  var micDef = {
    id: 'mic', label: 'Microphone', desc: 'Record voice and sound for notes.',
    check: function () {
      if (N.isNative()) return devStatus().then(function (s) { return norm(s.mic); });
      if (navigator.permissions && navigator.permissions.query) {
        return navigator.permissions.query({ name: 'microphone' }).then(function (r) { return norm(r.state); }, function () { return navigator.mediaDevices ? 'prompt' : 'na'; });
      }
      return ok(navigator.mediaDevices ? 'prompt' : 'na');
    },
    request: function () {
      if (N.isNative()) return dev().requestMic().then(function (r) { return norm(r.mic); });
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return ok('na');
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
        st.getTracks().forEach(function (t) { t.stop(); });
        return 'granted';
      }, function (e) { return e && e.name === 'NotAllowedError' ? 'denied' : 'prompt'; });
    }
  };

  // ---------- photos and images ----------
  // Android 13+: READ_MEDIA_IMAGES. Android 14+ also lets the user share only some photos ("limited").
  var imagesDef = {
    id: 'images', label: 'Photos and images', desc: 'Pick pictures from your gallery and add them to notes. Android 14 and newer may let you share only some photos.',
    check: function () {
      if (!N.isNative()) return ok('na');
      return devStatus().then(function (s) { return norm(s.images); });
    },
    request: function () {
      if (!N.isNative()) return ok('na');
      return dev().requestImages().then(function (r) { return norm(r.images); });
    }
  };

  // ---------- music ----------
  var musicDef = {
    id: 'music', label: 'Music', desc: 'Lets the player scan your Music folder.',
    check: function () {
      if (!N.isNative()) return ok('na');
      return devStatus().then(function (s) { return norm(s.audio); });
    },
    request: function () {
      if (!N.isNative()) return ok('na');
      return dev().requestAudio().then(function (r) { return norm(r.audio); });
    }
  };

  // ---------- battery optimiser ----------
  var batteryDef = {
    id: 'battery', label: 'Battery optimiser', desc: 'Set to unrestricted so Android doesn\'t stop reminders and music. On Honor, also open Battery, App launch and set this app to manage manually.',
    check: function () {
      if (!N.isNative()) return ok('na');
      return devStatus().then(function (s) { return s.battery ? 'granted' : 'denied'; });
    },
    request: function () {
      if (!N.isNative()) return ok('na');
      return dev().requestBattery().then(function () { return devStatus(); }).then(function (s) { return s.battery ? 'granted' : 'denied'; });
    },
    opensScreen: true
  };

  // ---------- persistent storage ----------
  var persistDef = {
    id: 'persist', label: 'Permanent storage', desc: 'Asks the system to never clear the vault to free space.',
    check: function () {
      if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted().then(function (v) { return v ? 'granted' : 'prompt'; });
      return ok('na');
    },
    request: function () {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().then(function (v) { return v ? 'granted' : 'denied'; });
      return ok('na');
    }
  };

  var DEFS = [notifyDef, musicDef, filesDef, locationDef, contactsDef, micDef, calendarDef, cameraDef, imagesDef, batteryDef, persistDef];

  function get(id) {
    for (var i = 0; i < DEFS.length; i++) if (DEFS[i].id === id) return DEFS[i];
    return null;
  }

  function status(id) {
    var d = get(id);
    if (!d) return Promise.resolve('na');
    return d.check().catch(function () { return 'na'; });
  }

  function label(state) {
    return { granted: 'Allowed', limited: 'Limited', denied: 'Blocked', prompt: 'Not asked yet', na: 'Not on this device' }[state] || state;
  }

  // Ask for one permission. When the system won't show the prompt again, open the app's settings.
  function ask(id) {
    var d = get(id);
    if (!d) return Promise.reject(new Error('Unknown permission'));
    return d.check().then(function (before) {
      if (before === 'granted' || before === 'na') return before;
      return d.request().then(function (after) {
        if (after === 'granted' || after === 'limited' || after === 'na') { asked[id] = true; return after; }
        if (d.opensScreen) { asked[id] = true; return after; }
        if (before === 'denied' || asked[id]) {
          asked[id] = true;
          return openAppSettings().then(function () {
            LN.toast('Turn ' + d.label + ' on in Android Settings, then come back.');
            return after;
          }, function () { return after; });
        }
        asked[id] = true;
        return after;
      });
    });
  }

  function allowAll() {
    var done = 0;
    var total = 0;
    var chain = Promise.resolve();
    DEFS.forEach(function (d) {
      chain = chain.then(function () { return d.check().catch(function () { return 'na'; }); }).then(function (s) {
        if (s === 'na') return null;
        total++;
        if (s === 'granted') { done++; return null; }
        return d.request().then(function (r) { if (r === 'granted' || r === 'limited') done++; }, function () { /* leave it for the manual row */ });
      });
    });
    return chain.then(function () { return { done: done, total: total }; });
  }

  // ---------- wake lock ----------
  function applyWake() {
    var on = !!LN.store.get('wakeLock');
    var KA = N.plugin('KeepAwake');
    if (KA) {
      return (on ? KA.keepAwake() : KA.allowSleep()).catch(function () { /* the status row shows the state */ });
    }
    if (!('wakeLock' in navigator)) return Promise.resolve();
    if (!on) {
      if (wakeSentinel) { var s = wakeSentinel; wakeSentinel = null; return s.release().catch(function () {}); }
      return Promise.resolve();
    }
    if (wakeSentinel && !wakeSentinel.released) return Promise.resolve();
    return navigator.wakeLock.request('screen').then(function (s) { wakeSentinel = s; }, function () { wakeSentinel = null; });
  }

  function wakeState() {
    var KA = N.plugin('KeepAwake');
    if (KA) return KA.isKeptAwake().then(function (r) { return r.isKeptAwake ? 'On' : 'Off'; }, function () { return 'Unknown'; });
    if (!('wakeLock' in navigator)) return Promise.resolve('Not on this device');
    return Promise.resolve(wakeSentinel && !wakeSentinel.released ? 'On' : 'Off');
  }

  // One-time offer on the first start of the installed app: photos and camera, because the image
  // features need them. Android only shows its own prompt after the person taps Allow here.
  function firstRun() {
    if (!N.isNative() || LN.store.get('permsIntro')) return Promise.resolve();
    return Promise.all([status('images'), status('camera')]).then(function (st) {
      LN.store.set('permsIntro', true);
      if (st.every(function (s) { return s === 'granted' || s === 'limited' || s === 'na'; })) return null;
      var s = LN.ui.sheet('Photos and camera');
      var ic = LN.ui.el('div', 'priv-ico');
      ic.style.margin = '12px auto';
      ic.innerHTML = LN.icon('image', 34);
      s.body.appendChild(ic);
      s.body.appendChild(LN.ui.el('p', 'about-p', 'Limitless Notepad can show your pictures, add photos from your gallery to a note and take new ones with the camera. Android needs your permission for that.'));
      s.body.appendChild(LN.ui.el('p', 'set-note', 'Photos are only read when you pick one. Nothing is uploaded. You can change this any time in Settings, Device access.'));
      var row = LN.ui.el('div', 'ai-row');
      var yes = LN.ui.el('button', 'btn primary', 'Allow photos and camera');
      yes.type = 'button';
      var no = LN.ui.el('button', 'btn', 'Not now');
      no.type = 'button';
      var state = LN.ui.el('span', 'ai-state');
      row.appendChild(yes);
      row.appendChild(no);
      row.appendChild(state);
      s.body.appendChild(row);
      no.addEventListener('click', function () { s.close(); });
      yes.addEventListener('click', function () {
        yes.disabled = true;
        state.textContent = 'Asking Android…';
        ask('images').then(function () { return ask('camera'); }).then(function () {
          s.close();
          LN.toast('Done. Manage this in Settings, Device access.');
        }, function (e) {
          yes.disabled = false;
          state.textContent = e && e.message ? e.message : 'Could not ask Android.';
        });
      });
      return null;
    }).catch(function () { /* the Device access page still works */ });
  }

  // V0.7.20: the important permissions are asked for FIRST, before the vault opens, on the first start of the installed app.
  // Order matters: notifications, files, photos, music, microphone, camera, battery (so reminders and sync keep running).
  var ONBOARD = [
    ['notify', 'Notifications', 'Reminders, sync results and alerts.'],
    ['files', 'Files access', 'See every file in your sync folders, not just some.'],
    ['images', 'Photos and images', 'Add pictures to notes.'],
    ['music', 'Music', 'Let the player find your music.'],
    ['mic', 'Microphone', 'Voice notes: capture ideas the second they hit.'],
    ['camera', 'Camera', 'Take a photo straight into a note.'],
    ['battery', 'Battery: unrestricted', 'Keeps sync and reminders alive in the background.']
  ];
  function onboard() {
    if (!N.isNative() || LN.store.get('permsOnboard')) return Promise.resolve();
    return new Promise(function (resolve) {
      var root = LN.ui.el('div', 'pm');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Permissions');
      root.appendChild(LN.ui.el('h2', '', 'Let\u2019s set you up'));
      root.appendChild(LN.ui.el('p', 'pm-sub', 'These come first so nothing interrupts your work later. Nothing is uploaded. You can change any of them in Settings, Device access.'));
      var listEl = LN.ui.el('div', 'pm-list');
      var rows = {};
      ONBOARD.forEach(function (o) {
        var r = LN.ui.el('div', 'pm-row');
        var t = LN.ui.el('div', 'pm-t');
        t.appendChild(LN.ui.el('b', '', o[1]));
        t.appendChild(LN.ui.el('small', '', o[2]));
        var st = LN.ui.el('span', 'pm-st', '\u2026');
        r.appendChild(t);
        r.appendChild(st);
        listEl.appendChild(r);
        rows[o[0]] = st;
      });
      root.appendChild(listEl);
      var go = LN.ui.el('button', 'pm-go', 'Allow all');
      go.type = 'button';
      var skip = LN.ui.el('button', 'pm-skip', 'Not now');
      skip.type = 'button';
      root.appendChild(go);
      root.appendChild(skip);
      document.body.appendChild(root);
      function mark(id, s) {
        var n = rows[id];
        if (!n) return;
        n.textContent = s === 'granted' ? 'Allowed' : s === 'limited' ? 'Limited' : s === 'na' ? 'N/A' : s === 'denied' ? 'Blocked' : 'Ask';
        n.className = 'pm-st' + (s === 'granted' || s === 'limited' || s === 'na' ? ' ok' : s === 'denied' ? ' no' : '');
      }
      function refreshAll() {
        return ONBOARD.reduce(function (p, o) { return p.then(function () { return status(o[0]).then(function (s) { mark(o[0], s); }); }); }, Promise.resolve());
      }
      function finish() {
        LN.store.set('permsOnboard', true);
        LN.store.set('permsIntro', true);
        root.remove();
        resolve();
      }
      refreshAll();
      skip.addEventListener('click', finish);
      go.addEventListener('click', function () {
        go.disabled = true;
        skip.disabled = true;
        go.textContent = 'Asking Android\u2026';
        // one at a time: Android shows one system prompt at a time, and some of these open a settings screen
        ONBOARD.reduce(function (p, o) {
          return p.then(function () { return ask(o[0]).catch(function () { return 'denied'; }); }).then(function () { return status(o[0]); }).then(function (s) { mark(o[0], s); });
        }, Promise.resolve()).then(function () {
          go.textContent = 'Continue';
          go.disabled = false;
          go.onclick = finish;
        }, finish);
      });
    });
  }

  function init() {
    applyWake();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && LN.store.get('wakeLock')) applyWake();
    });
  }

  LN.access = {
    defs: DEFS, get: get, status: status, label: label, ask: ask, allowAll: allowAll,
    applyWake: applyWake, wakeState: wakeState, openAppSettings: openAppSettings, init: init, firstRun: firstRun, onboard: onboard
  };
})(window.LN = window.LN || {});
