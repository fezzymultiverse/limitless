(function (LN) {
  'use strict';

  // Bridge to the Capacitor plugins. A plain script (no bundler) can't use
  // Capacitor.Plugins.X directly: that object only holds plugins that were registered.
  // registerPlugin() hands back a proxy to the native side and may be called once per name.
  var cache = {};

  function cap() { return window.Capacitor || null; }

  function isNative() {
    var C = cap();
    return !!(C && C.isNativePlatform && C.isNativePlatform());
  }

  function plugin(name) {
    if (!isNative()) return null;
    if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];
    var C = cap();
    var p = null;
    try {
      var has = C.isPluginAvailable ? C.isPluginAvailable(name) : true;
      if (has && C.registerPlugin) p = C.registerPlugin(name);
      else if (has && C.Plugins && C.Plugins[name]) p = C.Plugins[name];
    } catch (e) { p = null; }
    cache[name] = p;
    return p;
  }

  function fileUrl(uri) {
    var C = cap();
    return C && C.convertFileSrc ? C.convertFileSrc(uri) : uri;
  }

  function msg(e) { return e && e.message ? e.message : String(e || 'Something went wrong'); }

  function b64ToBytes(b64) {
    var s = atob(b64 || '');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(s);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function stampName(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
  }

  function stampText(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // value for <input type="datetime-local"> in local time
  function localInput(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function safeName(s) {
    return String(s || '').replace(/[\\\/:*?"<>|]/g, '').replace(/^\.+/, '').trim();
  }

  LN.native = {
    isNative: isNative, plugin: plugin, fileUrl: fileUrl, msg: msg,
    b64ToBytes: b64ToBytes, bytesToB64: bytesToB64,
    stampName: stampName, stampText: stampText, localInput: localInput, safeName: safeName
  };
})(window.LN = window.LN || {});
