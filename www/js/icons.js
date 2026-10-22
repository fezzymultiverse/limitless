(function (LN) {
  'use strict';
  var P = {
    'mic': '<rect x="6" y="2" width="4" height="7" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2M6 14h4"/>',
    'menu': '<path d="M2 4h12M2 8h12M2 12h12"/>',
    'x': '<path d="M4 4l8 8M12 4l-8 8"/>',
    'chevron': '<path d="M6 4l4 4-4 4"/>',
    'arrow-up': '<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/>',
    'arrow-down': '<path d="M8 3v10M3.5 8.5L8 13l4.5-4.5"/>',
    'reorder': '<path d="M3 4h7M3 8h5M3 12h7M13 3v10M11 11l2 2 2-2M11 5l2-2 2 2"/>',
    'folder': '<path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z"/>',
    'folder-plus': '<path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z"/><path d="M8 7v4M6 9h4"/>',
    'file': '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    'file-plus': '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/><path d="M8 8v4M6 10h4"/>',
    'code': '<path d="M6 4L2 8l4 4M10 4l4 4-4 4"/>',
    'table': '<rect x="2" y="3" width="12" height="10"/><path d="M2 7h12M6 3v10"/>',
    'edit': '<path d="M3 13l.7-3L11 2.7 13.3 5 6 12.3z"/>',
    'move': '<path d="M2 8h12M10 4l4 4-4 4"/>',
    'bin': '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5"/><path d="M7 7v3.5M9 7v3.5"/>',
    'restore': '<path d="M2.5 3v3h3"/><path d="M3 6a5.5 5.5 0 111 5"/>',
    'trash': '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5"/>',
    'upload': '<path d="M8 11V3M5 6l3-3 3 3M3 13h10"/>',
    'download': '<path d="M8 3v8M5 8l3 3 3-3M3 13h10"/>',
    'sun': '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
    'moon': '<path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z"/>',
    'gear': '<path d="M6.68 3.07L6.95 1.38L9.05 1.38L9.32 3.07L10.55 3.58L11.94 2.58L13.42 4.06L12.42 5.45L12.93 6.68L14.62 6.95L14.62 9.05L12.93 9.32L12.42 10.55L13.42 11.94L11.94 13.42L10.55 12.42L9.32 12.93L9.05 14.62L6.95 14.62L6.68 12.93L5.45 12.42L4.06 13.42L2.58 11.94L3.58 10.55L3.07 9.32L1.38 9.05L1.38 6.95L3.07 6.68L3.58 5.45L2.58 4.06L4.06 2.58L5.45 3.58z"/><circle cx="8" cy="8" r="2.3"/>',
    'spark': '<path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z"/>',
    'chevron-down': '<path d="M4 6l4 4 4-4"/>',
    'back': '<path d="M10 4L6 8l4 4"/>',
    'eye': '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    'sync': '<path d="M13 6.5A5 5 0 004 4.5M3 9.5a5 5 0 009 2M4 2v2.5h2.5M12 14v-2.5H9.5"/>',
    'sliders': '<path d="M2 4.5h12M2 11.5h12"/><circle cx="5.5" cy="4.5" r="1.5"/><circle cx="10.5" cy="11.5" r="1.5"/>',
    'more': '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    'bell': '<path d="M4 11V7a4 4 0 018 0v4l1 1.5H3zM6.5 14h3"/>',
    'pin': '<path d="M8 14V9M5 9h6l-1-3V3H6v3z"/>',
    'music': '<path d="M6 12V3l7-1.5V10"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="11.5" cy="10" r="1.5"/>',
    'share': '<circle cx="4" cy="8" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="12" cy="12" r="1.7"/><path d="M5.5 7.2l5-2.4M5.5 8.8l5 2.4"/>',
    'camera': '<path d="M2 5.5h2.5L6 3.5h4l1.5 2H14V13H2z"/><circle cx="8" cy="9" r="2.3"/>',
    'calendar': '<rect x="2" y="3.5" width="12" height="10.5" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/>',
    'battery': '<rect x="1.5" y="5" width="11" height="6" rx="1"/><path d="M14 7v2M4 7.5v1M6.5 7.5v1"/>',
    'user': '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-3 2.2-4.5 5-4.5s5 1.5 5 4.5"/>',
    'lock': '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
    'finger': '<path d="M4 6.5a4 4 0 018 0"/><path d="M5.5 14c0-1.5-.5-2.5-.5-4a3 3 0 016 0c0 1.5.5 2.5.5 4"/><path d="M8 10c0 2 .5 3 1 4"/>',
    'shield': '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/>',
    'image': '<rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="5.5" cy="6.5" r="1"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/>',
    'palette': '<circle cx="8" cy="8" r="6"/><circle cx="5.5" cy="7" r=".6"/><circle cx="8" cy="5" r=".6"/><circle cx="10.5" cy="7" r=".6"/>',
    'play': '<path d="M4 2.5v11l9-5.5z"/>',
    'pause': '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>',
    'skip-back': '<path d="M12 3L5 8l7 5z"/><path d="M4 2.5v11"/>',
    'skip-forward': '<path d="M4 3l7 5-7 5z"/><path d="M12 2.5v11"/>',
    'shuffle': '<path d="M2 4h3l6 8h3M2 12h3l2.3-3M11 4h3M11 4l2-1.5M11 4l2 1.5M11 12h3M11 12l2-1.5M11 12l2 1.5"/>',
    'repeat': '<path d="M3 5.5h8a2 2 0 012 2V9M13 10.5H5a2 2 0 01-2-2V7"/><path d="M4.5 3.5L3 5.5l1.5 2M11.5 12.5L13 10.5l-1.5-2"/>',
    'undo': '<path d="M5 3L2.5 5.5 5 8"/><path d="M2.5 5.5H9a4 4 0 010 8H5"/>',
    'redo': '<path d="M11 3l2.5 2.5L11 8"/><path d="M13.5 5.5H7a4 4 0 000 8h4"/>',
    'checkbox': '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8.2l1.9 1.9 3.3-3.8"/>',
    'list': '<circle cx="3" cy="4" r=".7"/><circle cx="3" cy="8" r=".7"/><circle cx="3" cy="12" r=".7"/><path d="M6 4h8M6 8h8M6 12h8"/>',
    'quote': '<path d="M2.5 3v10"/><path d="M6 5h8M6 8h8M6 11h5"/>',
    'link': '<path d="M6.5 9.5l3-3M7 4.5l.9-.9a2.8 2.8 0 014 4l-.9.9M9 11.5l-.9.9a2.8 2.8 0 01-4-4l.9-.9"/>',
    'brackets': '<path d="M6 2.5H3.5v11H6M10 2.5h2.5v11H10"/>',
    'hash': '<path d="M6.5 2.5L5 13.5M11 2.5L9.5 13.5M3 6h10.5M2.5 10h10.5"/>',
    'hr': '<path d="M2 8h12"/><path d="M4 4.5h8M4 11.5h8" opacity=".45"/>',
    'indent': '<path d="M2 3h12M8 6.5h6M8 9.5h6M2 13h12"/><path d="M2 6l3 2.2L2 10.4z"/>',
    'eye-off': '<path d="M2.5 8S4.8 4 8 4c1 0 1.9.3 2.7.8M13.5 8s-.8 1.5-2.3 2.6M6.2 6.3a2.3 2.3 0 003.5 3.1M3 3l10 10"/>',
    'gallery': '<rect x="2" y="2.5" width="9.5" height="8.5" rx="1"/><path d="M4.5 13.5h8.5a1 1 0 001-1V5.5"/><circle cx="5.2" cy="5.3" r=".9"/><path d="M2.5 9.8l3-2.8 2.5 2.2 1.6-1.4 2 2"/>',
    'find': '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L14 14"/>',
    'selectall': '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke-dasharray="2.2 1.6"/><path d="M5.5 8h5"/>',
    'codeblock': '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6.7 6.3L5 8l1.7 1.7M9.3 6.3L11 8l-1.7 1.7"/>',
    'outdent': '<path d="M2 3h12M8 6.5h6M8 9.5h6M2 13h12"/><path d="M5 6L2 8.2l3 2.2z"/>',
    'send': '<path d="M14 2L7 9M14 2l-4.5 12-2.5-5-5-2.5z"/>',
    'plus': '<path d="M8 3v10M3 8h10"/>'
  };
  LN.icon = function (name, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" ' +
      'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + (P[name] || '') + '</svg>';
  };
  LN.paintIcons = function (root) {
    var list = (root || document).querySelectorAll('[data-icon]');
    for (var i = 0; i < list.length; i++) {
      list[i].innerHTML = LN.icon(list[i].getAttribute('data-icon'), 18);
    }
  };
})(window.LN = window.LN || {});
