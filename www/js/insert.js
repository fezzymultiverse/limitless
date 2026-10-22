(function (LN) {
  'use strict';

  var N = LN.native;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fail(e) { LN.toast(N.msg(e)); }

  // Put a block of text on its own line at the cursor of the open text note.
  function put(text) {
    var sel = LN.editor.selection();
    if (!sel) { LN.toast('Open a text note first'); return false; }
    var pre = sel.start > 0 && sel.all.charAt(sel.start - 1) !== '\n' ? '\n' : '';
    return LN.editor.insertText(pre + text + '\n', false);
  }

  function need(id, what) {
    return LN.access.ask(id).then(function (s) {
      if (s !== 'granted') throw new Error(what + ' is off. Allow it in Settings, Device access.');
    });
  }

  // ---------- date and time ----------
  function dateTime() { put(N.stampText(new Date())); return Promise.resolve(); }

  // ---------- location ----------
  function position() {
    var G = N.plugin('Geolocation');
    if (G) {
      return need('location', 'Location').then(function () {
        return G.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
      }).then(function (r) { return r.coords; });
    }
    if (!navigator.geolocation) return Promise.reject(new Error('Location isn\'t available here'));
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(function (r) { resolve(r.coords); }, function (e) {
        reject(new Error(e && e.code === 1 ? 'Location is blocked' : 'Couldn\'t get your location'));
      }, { enableHighAccuracy: true, timeout: 20000 });
    });
  }

  function location() {
    if (!LN.editor.selection()) { LN.toast('Open a text note first'); return Promise.resolve(); }
    LN.toast('Getting your location…');
    return position().then(function (c) {
      var lat = c.latitude.toFixed(5);
      var lon = c.longitude.toFixed(5);
      var line = 'Location: ' + lat + ', ' + lon + (c.accuracy ? ' (accuracy ' + Math.round(c.accuracy) + ' m, ' + N.stampText(new Date()) + ')' : '');
      if (LN.store.get('locationLink') !== false) {
        line += '\n[Open map](https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=17/' + lat + '/' + lon + ')';
      }
      put(line);
    }).catch(fail);
  }

  // ---------- contacts ----------
  function contactText(c) {
    var name = (c.name && (c.name.display || [c.name.given, c.name.family].filter(Boolean).join(' '))) || 'Unnamed contact';
    var lines = ['**' + name + '**' + (c.organization && c.organization.company ? ' (' + c.organization.company + ')' : '')];
    (c.phones || []).forEach(function (p) { if (p && p.number) lines.push('- Phone: ' + p.number); });
    (c.emails || []).forEach(function (e) { if (e && e.address) lines.push('- Email: ' + e.address); });
    return lines.join('\n');
  }

  function contact() {
    if (!LN.editor.selection()) { LN.toast('Open a text note first'); return Promise.resolve(); }
    var C = N.plugin('Contacts');
    if (C) {
      return need('contacts', 'Contacts').then(function () {
        return C.pickContact({ projection: { name: true, organization: true, phones: true, emails: true } });
      }).then(function (r) {
        if (r && r.contact) put(contactText(r.contact));
      }).catch(function (e) {
        var m = N.msg(e);
        if (/cancel|pick/i.test(m) && !/permission/i.test(m)) return;
        fail(e);
      });
    }
    if (navigator.contacts && navigator.contacts.select) {
      return navigator.contacts.select(['name', 'tel', 'email'], { multiple: false }).then(function (list) {
        if (!list || !list.length) return;
        var c = list[0];
        put(contactText({
          name: { display: (c.name || [])[0] }, phones: (c.tel || []).map(function (n) { return { number: n }; }),
          emails: (c.email || []).map(function (a) { return { address: a }; })
        }));
      }).catch(fail);
    }
    LN.toast('Contacts need the Android app');
    return Promise.resolve();
  }

  // ---------- calendar ----------
  function calendarPlugin() { return N.plugin('CapacitorCalendar'); }

  function todaysEvents() {
    var P = calendarPlugin();
    if (!P) { LN.toast('Calendar needs the Android app'); return Promise.resolve(); }
    if (!LN.editor.selection()) { LN.toast('Open a text note first'); return Promise.resolve(); }
    var from = new Date();
    from.setHours(0, 0, 0, 0);
    var to = new Date(from.getTime() + 86400000 - 1);
    return need('calendar', 'Calendar').then(function () {
      return P.listEventsInRange({ from: from.getTime(), to: to.getTime() });
    }).then(function (r) {
      var list = (r.result || []).slice().sort(function (a, b) { return a.startDate - b.startDate; });
      var head = '## Events ' + from.getFullYear() + '-' + pad(from.getMonth() + 1) + '-' + pad(from.getDate());
      if (!list.length) { put(head + '\nNo events today.'); return; }
      put(head + '\n' + list.map(function (e) {
        var when = e.isAllDay ? 'All day' : hhmm(e.startDate) + '-' + hhmm(e.endDate);
        return '- ' + when + ' ' + e.title + (e.location ? ' (' + e.location + ')' : '');
      }).join('\n'));
    }).catch(fail);
  }

  function addEvent() {
    var P = calendarPlugin();
    if (!P) { LN.toast('Calendar needs the Android app'); return Promise.resolve(); }
    var id = LN.editor.currentId();
    var note = id ? LN.vault.get(id) : null;
    var start = new Date(Date.now() + 3600000);
    start.setMinutes(0, 0, 0);
    var end = new Date(start.getTime() + 3600000);
    return LN.ui.form({
      title: 'Add to calendar',
      ok: 'Add event',
      fields: [
        { key: 'title', label: 'Title', value: note ? note.name.replace(/\.[^.]+$/, '') : '', required: true },
        { key: 'start', label: 'Starts', type: 'datetime', value: N.localInput(start), required: true },
        { key: 'end', label: 'Ends', type: 'datetime', value: N.localInput(end), required: true },
        { key: 'place', label: 'Place', value: '' },
        { key: 'text', label: 'Notes', type: 'textarea', value: '' }
      ],
      validate: function (v) {
        var a = new Date(v.start).getTime();
        var b = new Date(v.end).getTime();
        if (!isFinite(a) || !isFinite(b)) return 'Pick a start and end time.';
        if (b <= a) return 'The end has to be after the start.';
        return '';
      }
    }).then(function (v) {
      if (!v) return null;
      var opts = {
        title: v.title, startDate: new Date(v.start).getTime(), endDate: new Date(v.end).getTime(),
        location: v.place || undefined, description: v.text || undefined
      };
      var lead = Number(LN.store.get('calAlert'));
      if (isFinite(lead) && lead > 0) opts.alerts = [lead];
      function viaCalendarApp() {
        var p = { title: opts.title, startDate: opts.startDate, endDate: opts.endDate, location: opts.location, description: opts.description };
        if (opts.alerts) p.alerts = opts.alerts;
        return P.createEventWithPrompt(p).then(function () { LN.toast('Calendar opened'); });
      }
      return LN.access.ask('calendar').then(function (s) {
        if (s !== 'granted') return viaCalendarApp();
        return P.createEvent(opts).then(function () {
          LN.toast('Added to your calendar for ' + N.stampText(new Date(opts.startDate)));
        }, viaCalendarApp);
      });
    }).catch(fail);
  }

  // ---------- camera ----------
  function photoFolder() {
    var name = N.safeName(LN.store.get('photoFolder')) || 'Photos';
    var hit = LN.vault.children(null).filter(function (n) { return n.type === 'folder' && n.name.toLowerCase() === name.toLowerCase(); })[0];
    if (hit) return Promise.resolve(hit.id);
    return LN.vault.create('folder', name, null).then(function (f) { return f.id; });
  }

  // source: 'CAMERA' takes a new photo, 'PHOTOS' picks one from the gallery
  function capture(source) {
    var gallery = source === 'PHOTOS';
    var C = N.plugin('Camera');
    if (C) {
      // The gallery picker works even when photo access was declined (Android shows only the picture you choose),
      // so for the gallery we ask but carry on either way.
      var allowed = gallery ? LN.access.ask('images').catch(function () { return 'denied'; }) : need('camera', 'Camera');
      return allowed.then(function () {
        return C.getPhoto({ quality: 85, resultType: 'base64', source: source || 'CAMERA', correctOrientation: true, saveToGallery: false });
      }).then(function (r) {
        var ext = String(r.format || 'jpeg').toLowerCase();
        return { bytes: N.b64ToBytes(r.base64String), ext: ext === 'jpeg' ? 'jpg' : ext };
      });
    }
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      if (!gallery) inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) { reject(new Error('No photo taken')); return; }
        f.arrayBuffer().then(function (b) {
          var m = /\.([a-z0-9]+)$/i.exec(f.name || '');
          resolve({ bytes: new Uint8Array(b), ext: m ? m[1].toLowerCase() : 'jpg' });
        }, reject);
      });
      inp.click();
    });
  }

  function photo(source) {
    var had = LN.editor.selection();
    var label = source === 'PHOTOS' ? 'Image ' : 'Photo ';
    return capture(source).then(function (shot) {
      return photoFolder().then(function (fid) {
        return LN.vault.importFile(label + N.stampName() + '.' + shot.ext, fid, shot.bytes);
      });
    }).then(function (n) {
      LN.tree.render();
      if (had && LN.editor.selection()) {
        put('![[' + n.name + ']]');
        LN.toast((source === 'PHOTOS' ? 'Image' : 'Photo') + ' saved in ' + (N.safeName(LN.store.get('photoFolder')) || 'Photos'));
      } else {
        LN.tabs.open(n.id);
        LN.tree.select(n.id, true);
      }
    }).catch(function (e) {
      var m = N.msg(e);
      if (/cancel|no photo/i.test(m)) return;
      fail(e);
    });
  }

  LN.insert = {
    dateTime: dateTime, location: location, contact: contact, todaysEvents: todaysEvents,
    addEvent: addEvent, photo: photo, gallery: function () { return photo('PHOTOS'); }, put: put
  };
})(window.LN = window.LN || {});
