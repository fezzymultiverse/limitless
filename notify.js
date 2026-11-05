(function (LN) {
  'use strict';

  var N = LN.native;
  var PERM_ID = 1;
  var ICON = 'ic_stat_ln';
  var COLOR = '#FF6A00';
  var ready = null;

  function plug() { return N.plugin('LocalNotifications'); }

  function setup() {
    var p = plug();
    if (!p) return Promise.reject(new Error('Notifications need the Android app'));
    if (ready) return ready;
    ready = Promise.resolve()
      .then(function () { return p.createChannel({ id: 'reminders', name: 'Reminders', description: 'Note reminders', importance: 4, visibility: 1, vibration: true }); })
      .then(function () { return p.createChannel({ id: 'permanent', name: 'Permanent notification', description: 'Stays in the shade so the app is one tap away', importance: 2, visibility: 1, vibration: false }); })
      .then(function () {
        return p.registerActionTypes({ types: [{ id: 'LN_QUICK', actions: [{ id: 'new', title: 'New note' }] }] });
      })
      .catch(function () { /* channels may already exist; scheduling still works */ });
    return ready;
  }

  function allowed() {
    return LN.access.ask('notify').then(function (s) {
      if (s !== 'granted') throw new Error('Notifications are off. Allow them in Settings, Device access.');
    });
  }

  function reminders() {
    var list = (LN.store.get('reminders') || []).filter(function (r) { return r.at > Date.now(); });
    list.sort(function (a, b) { return a.at - b.at; });
    return list;
  }
  function saveReminders(list) { LN.store.set('reminders', list); }

  // ---------- reminders ----------
  function remind() {
    var p = plug();
    if (!p) { LN.toast('Reminders need the Android app'); return Promise.resolve(); }
    var id = LN.editor.currentId();
    var note = id ? LN.vault.get(id) : null;
    var soon = new Date(Date.now() + 3600000);
    soon.setSeconds(0, 0);
    return LN.ui.form({
      title: 'Remind me',
      ok: 'Set reminder',
      fields: [
        { key: 'title', label: 'What', value: note ? note.name.replace(/\.[^.]+$/, '') : 'Reminder', required: true },
        { key: 'when', label: 'When', type: 'datetime', value: N.localInput(soon), required: true }
      ],
      note: note ? 'Tapping the notification opens "' + note.name + '".' : 'No note is open, so the notification just opens the app.',
      validate: function (v) {
        var t = new Date(v.when).getTime();
        if (!isFinite(t)) return 'Pick a date and time.';
        if (t < Date.now() + 5000) return 'Pick a time in the future.';
        return '';
      }
    }).then(function (v) {
      if (!v) return null;
      var at = new Date(v.when).getTime();
      var nid = (Date.now() % 2000000000) + 100;
      return allowed().then(setup).then(function () {
        return p.checkExactNotificationSetting().catch(function () { return { exact_alarm: 'granted' }; });
      }).then(function (ex) {
        if (ex && ex.exact_alarm === 'denied' && window.confirm('Android needs "Alarms & reminders" allowed to fire at the exact minute. Open that screen now? Without it the reminder can arrive a few minutes late.')) {
          return p.changeExactNotificationSetting().catch(function () {});
        }
        return null;
      }).then(function () {
        return p.schedule({ notifications: [{
          id: nid, title: v.title, body: note ? 'Tap to open ' + note.name : 'Limitless Notepad reminder',
          schedule: { at: new Date(at), allowWhileIdle: true }, channelId: 'reminders',
          smallIcon: ICON, iconColor: COLOR, extra: { noteId: id || null }
        }] });
      }).then(function () {
        var list = reminders();
        list.push({ id: nid, at: at, title: v.title, noteId: id || null });
        saveReminders(list);
        LN.toast('Reminder set for ' + N.stampText(new Date(at)));
      });
    });
  }

  function cancelReminder(rid) {
    var p = plug();
    var list = reminders().filter(function (r) { return r.id !== rid; });
    saveReminders(list);
    return p ? p.cancel({ notifications: [{ id: rid }] }) : Promise.resolve();
  }

  function manage() {
    var s = LN.ui.sheet('Reminders');
    function paint() {
      s.body.textContent = '';
      var list = reminders();
      if (!list.length) { s.body.appendChild(LN.ui.el('div', 'set-empty', 'No upcoming reminders.')); return; }
      var g = LN.ui.el('div', 'set-group');
      list.forEach(function (r) {
        var row = LN.ui.el('div', 'set-row');
        var info = LN.ui.el('div', 'set-info');
        info.appendChild(LN.ui.el('div', 'set-label', r.title));
        info.appendChild(LN.ui.el('div', 'set-desc', N.stampText(new Date(r.at))));
        var b = LN.ui.el('button', 'btn small', 'Cancel');
        b.type = 'button';
        b.addEventListener('click', function () {
          cancelReminder(r.id).then(paint, function (e) { LN.toast(N.msg(e)); });
        });
        row.appendChild(info);
        row.appendChild(b);
        g.appendChild(row);
      });
      s.body.appendChild(g);
    }
    paint();
  }

  // ---------- permanent notification ----------
  function applyPermanent() {
    var p = plug();
    var on = !!LN.store.get('permanentNote');
    if (!p) return Promise.resolve();
    if (!on) return p.cancel({ notifications: [{ id: PERM_ID }] }).catch(function () {});
    return allowed().then(setup).then(function () {
      return p.schedule({ notifications: [{
        id: PERM_ID, title: 'Limitless Notepad', body: 'Tap to open. Use New note for a quick capture.',
        ongoing: true, autoCancel: false, channelId: 'permanent', actionTypeId: 'LN_QUICK',
        smallIcon: ICON, iconColor: COLOR, extra: { perm: true }
      }] });
    }).catch(function (e) {
      LN.store.set('permanentNote', false);
      throw e;
    });
  }

  // ---------- taps ----------
  function quickNote() {
    var name = 'Quick note ' + N.stampName() + '.md';
    return LN.vault.create('file', name, null).then(function (f) {
      LN.tree.render();
      LN.tabs.open(f.id);
    });
  }

  function onAction(ev) {
    var extra = ev && ev.notification ? ev.notification.extra : null;
    if (ev && ev.actionId === 'new') { quickNote().catch(function (e) { LN.toast(N.msg(e)); }); return; }
    if (extra && extra.noteId && LN.vault.get(extra.noteId)) {
      LN.tabs.open(extra.noteId);
      LN.tree.select(extra.noteId, true);
    }
  }

  function init() {
    var p = plug();
    if (!p) return;
    p.addListener('localNotificationActionPerformed', onAction);
    saveReminders(reminders());
    if (LN.store.get('permanentNote')) applyPermanent().catch(function () {});
  }

  LN.notify = {
    init: init, remind: remind, manage: manage, reminders: reminders,
    cancelReminder: cancelReminder, applyPermanent: applyPermanent, quickNote: quickNote
  };
})(window.LN = window.LN || {});
