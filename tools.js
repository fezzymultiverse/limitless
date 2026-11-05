(function (LN) {
  'use strict';

  // The ⋯ sheet: quick access to device features and export tools.
  function groups() {
    return [
      { title: 'AI', rows: [
        { icon: 'spark', label: 'Ask AI about this note', run: function () { LN.ai.openPanel(); return null; } },
        { icon: 'lock', label: 'API key vault', run: function () { LN.keys.openVault(); return null; } }
      ] },
      { title: 'Export / Convert', rows: [
        { icon: 'file', label: 'Export as PDF', run: function () { return LN.converter.exportAs('pdf'); } },
        { icon: 'file', label: 'Export as DOCX', run: function () { return LN.converter.exportAs('docx'); } },
        { icon: 'file', label: 'Export as PPTX', run: function () { return LN.converter.exportAs('pptx'); } }
      ] },
      { title: 'Share', rows: [
        { icon: 'share', label: 'Share link', run: function () { return LN.share.link(); } },
        { icon: 'share', label: 'Share as a web page', run: function () { return LN.share.asPage(); } },
        { icon: 'upload', label: 'Share file', run: function () { return LN.share.file(); } },
        { icon: 'file', label: 'Share text', run: function () { return LN.share.text(); } }
      ] },
      { title: 'Insert into the note', rows: [
        { icon: 'plus', label: 'Add link, voice note, music or document', run: function () { LN.addmenu.open(); return null; } },
        { icon: 'calendar', label: 'Date and time', run: function () { return LN.insert.dateTime(); } },
        { icon: 'pin', label: 'My location', run: function () { return LN.insert.location(); } },
        { icon: 'user', label: 'Contact', run: function () { return LN.insert.contact(); } },
        { icon: 'calendar', label: 'Today\'s events', run: function () { return LN.insert.todaysEvents(); } },
        { icon: 'camera', label: 'Take a photo', run: function () { return LN.insert.photo(); } },
        { icon: 'gallery', label: 'Image from gallery', run: function () { return LN.insert.gallery(); } }
      ] },
      { title: 'Plugins', rows: [
        { icon: 'calendar', label: 'Calendar and daily notes', run: function () { LN.plugins.calendar(); return null; } },
        { icon: 'file-plus', label: 'Today\'s daily note', run: function () { return LN.plugins.openDaily(); } },
        { icon: 'file', label: 'Templater: insert template', run: function () { return LN.plugins.insertTemplate(); } },
        { icon: 'file-plus', label: 'Templater: new note from template', run: function () { return LN.plugins.newFromTemplate(); } },
        { icon: 'table', label: 'Dataview dashboard', run: function () { return LN.plugins.dashboard(); } }
      ] },
      { title: 'Plan', rows: [
        { icon: 'calendar', label: 'Add a calendar event', run: function () { return LN.insert.addEvent(); } },
        { icon: 'bell', label: 'Remind me', run: function () { return LN.notify.remind(); } },
        { icon: 'bell', label: 'Reminders', run: function () { return LN.notify.manage(); } },
        { icon: 'file-plus', label: 'Quick note', run: function () { return LN.notify.quickNote(); } }
      ] },
      { title: 'Media', rows: [
        { icon: 'music', label: 'Music player', run: function () { LN.music.open(); return null; } }
      ] },
      { title: 'Vault', rows: [
        { icon: 'bin', label: 'Recycle bin', run: function () { LN.bin.open(); return null; } }
      ] },
      { title: 'Device', rows: [
        { icon: 'shield', label: 'Device access', run: function () { LN.settings.open('device'); return null; } },
        { icon: 'sliders', label: 'Notes tools settings', run: function () { LN.settings.open('notes'); return null; } }
      ] }
    ];
  }

  function open() {
    var s = LN.ui.sheet('Note tools');
    groups().forEach(function (g) {
      s.body.appendChild(LN.ui.el('div', 'set-section', g.title));
      var box = LN.ui.el('div', 'set-group nav');
      g.rows.forEach(function (r) {
        var b = LN.ui.el('button', 'set-nav');
        b.type = 'button';
        var ic = LN.ui.el('span', 'set-ico');
        ic.innerHTML = LN.icon(r.icon, 18);
        b.appendChild(ic);
        b.appendChild(LN.ui.el('span', 'set-nav-label', r.label));
        b.addEventListener('click', function () {
          s.close();
          var p;
          try { p = r.run(); } catch (e) { p = Promise.reject(e); }
          Promise.resolve(p).catch(function (e) { LN.toast(LN.native.msg(e)); });
        });
        box.appendChild(b);
      });
      s.body.appendChild(box);
    });
  }

  LN.tools = { open: open };
})(window.LN = window.LN || {});
