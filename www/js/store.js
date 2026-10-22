(function (LN) {
  'use strict';
  var KEY = 'ln.settings.v1';
  var VKEY = 'ln.vaultstate.';
  var defaults = {
    theme: 'light', collapsed: false, viewMode: 'edit', openTabs: [], activeTab: null, expanded: {},
    // V0.3.0 general and appearance
    accent: 'orange', fontSize: 15, editorFont: 'mono', editorSize: 14, lineWrap: true, cursorBlink: true,
    uiFont: 'default', previewFont: 'auto', previewSize: 16, editorWeight: 400, editorTrack: 0,
    autosaveMs: 500, confirmDelete: true, showStatus: true,
    // V0.3.0 AI
    aiProvider: 'groq', groqKey: '', groqModel: 'llama-3.3-70b-versatile',
    geminiKey: '', geminiModel: 'gemini-2.5-flash', aiTemp: 0.3, aiTempV: 0, aiSystem: '',
    // V0.7.8 Mistral
    mistralKey: '', mistralModel: 'mistral-small-latest',
    // V0.3.0 folder sync and watch
    folderMode: 'off', folderLabel: '', capFolder: 'LimitlessNotepad', safUri: '',
    syncOut: false, mirrorDeletes: false, watchOn: false, watchSec: 10,
    folderIndex: {}, lastSync: '', lastCheck: '',
    // V0.4.0 vaults
    vaults: [{ id: 'default', name: 'My vault' }], activeVault: 'default',
    // V0.4.0 device access
    shareBase: '', wakeLock: false, permanentNote: false, musicFolder: 'Music', photoFolder: 'Photos',
    locationLink: true, calAlert: 10, reminders: [], musicList: [],
    // V0.5.0 security
    lockAuto: 60000, lockSecure: true,
    // V0.6.1 privacy
    aiConfirm: false, permsIntro: false,
    // V0.7.5 API key vault: extra keys per provider, their stats, and what to do with keys spotted in pasted text
    aiKeys: {}, aiKeyMeta: {}, aiKeyWatch: 'ask',
    // V0.7.0 backup, security, editor, sync
    backupAuto: 'off', backupKeep: 5, lastBackup: 0, lastBackupNote: '', lastBackupError: '',
    lockIdle: 0, lockBg: false, clipClear: 0, exportWarn: true,
    lineNumbers: false, spellcheck: false, editorLine: 1.7, defaultExt: 'md', htmlScripts: true,
    binOn: true, binDays: 30,
    greenHi: false, resume: null, resumeUi: null, destId: null, newDest: 'tapped', watermark: 'leaf', watermarkOp: 12, musicSpeed: 1, musicShuffle: false, musicRepeat: 'off', musicLast: null, imgSlideSec: 3,
    conflictMode: 'folder', syncExclude: '', extraFolders: [], syncRetry: true, lastSyncOk: 0, lastSyncError: '',
    // V0.7.17 home screen: the notes opened most recently (ids, newest first), kept per vault
    recentNotes: []
  };
  // These belong to one vault. The first vault ("default") keeps using the old storage, so nothing is lost.
  var VAULT_KEYS = ['openTabs', 'activeTab', 'expanded', 'folderMode', 'folderLabel', 'capFolder', 'safUri', 'syncOut',
    'mirrorDeletes', 'watchOn', 'watchSec', 'folderIndex', 'lastSync', 'lastCheck',
    'conflictMode', 'syncExclude', 'lastSyncOk', 'lastSyncError', 'extraFolders', 'resume', 'destId', 'recentNotes'];
  var cache = null;
  var vcache = null;
  function load() {
    if (cache) return cache;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    cache = Object.assign({}, defaults, saved);
    // V0.7.8: the old default creativity of 0.7 made answers drift. Move it to 0.3 once; a value you picked on purpose stays.
    if (cache.aiTempV !== 2) {
      if (cache.aiTemp === 0.7) cache.aiTemp = 0.3;
      cache.aiTempV = 2;
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* storage full or blocked */ }
    }
    // V0.7.15: the highlights go back to orange. Anyone who saved the green option once is moved over a single time.
    if (cache.greenV !== 1) {
      cache.greenHi = false;
      cache.greenV = 1;
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* storage full or blocked */ }
    }
    if (!Array.isArray(cache.vaults) || !cache.vaults.length) cache.vaults = defaults.vaults.slice();
    if (!cache.vaults.some(function (v) { return v.id === cache.activeVault; })) cache.activeVault = cache.vaults[0].id;
    return cache;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) { /* storage full or blocked */ }
  }
  function activeId() { return load().activeVault || 'default'; }
  function perVault(k) { return VAULT_KEYS.indexOf(k) >= 0 && activeId() !== 'default'; }
  function vload() {
    if (vcache) return vcache;
    try { vcache = JSON.parse(localStorage.getItem(VKEY + activeId()) || '{}') || {}; } catch (e) { vcache = {}; }
    return vcache;
  }
  LN.store = {
    get: function (k) {
      if (perVault(k)) { var v = vload(); return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : defaults[k]; }
      return load()[k];
    },
    set: function (k, val) {
      if (perVault(k)) {
        var v = vload();
        v[k] = val;
        try { localStorage.setItem(VKEY + activeId(), JSON.stringify(v)); } catch (e) { /* storage full or blocked */ }
        return;
      }
      load()[k] = val;
      save();
    },
    // used by the vault switcher for vaults that aren't open
    setVaultState: function (id, obj) {
      try { localStorage.setItem(VKEY + id, JSON.stringify(obj || {})); } catch (e) { /* storage full or blocked */ }
    },
    // Put every setting back to its default. Vault list, active vault, AI keys and per-vault folder links stay.
    resetSettings: function () {
      var c = load();
      var keep = {};
      ['vaults', 'activeVault', 'groqKey', 'geminiKey', 'mistralKey', 'aiKeys', 'aiKeyMeta', 'musicList', 'reminders', 'lastBackup', 'lastBackupNote', 'permsIntro'].forEach(function (k) { keep[k] = c[k]; });
      cache = Object.assign({}, defaults, keep);
      save();
    },
    defaults: function (k) { return defaults[k]; },
    dropVaultState: function (id) {
      try { localStorage.removeItem(VKEY + id); } catch (e) { /* ignore */ }
    }
  };
})(window.LN = window.LN || {});
