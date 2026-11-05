(function (LN) {
  'use strict';

  // Codec for putting a note into a URL fragment: JSON {v,n,k,t} (view version, name, kind,
  // text) -> UTF-8 bytes -> deflate-raw (CompressionStream, when available) -> base64url,
  // prefixed "z." for compressed or "u." for the uncompressed fallback so the viewer always
  // knows how to undo it, even on a browser without the Compression Streams API.

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64url(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function streamToBytes(stream) {
    var reader = stream.getReader();
    var chunks = [];
    var total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        chunks.push(r.value);
        total += r.value.length;
        return pump();
      });
    }
    return pump().then(function () {
      var out = new Uint8Array(total);
      var off = 0;
      chunks.forEach(function (c) { out.set(c, off); off += c.length; });
      return out;
    });
  }

  function deflateRaw(bytes) {
    if (typeof CompressionStream !== 'function') return Promise.reject(new Error('no CompressionStream'));
    var cs = new CompressionStream('deflate-raw');
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return streamToBytes(cs.readable);
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('no DecompressionStream'));
    var ds = new DecompressionStream('deflate-raw');
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return streamToBytes(ds.readable);
  }

  // obj -> "z.<base64url>" (compressed) or "u.<base64url>" (plain) if compression isn't available
  function encode(obj) {
    var json = JSON.stringify(obj);
    var bytes = new TextEncoder().encode(json);
    return deflateRaw(bytes).then(function (packed) {
      return 'z.' + b64url(packed);
    }, function () {
      return 'u.' + b64url(bytes);
    });
  }

  // "z.<...>" or "u.<...>" -> obj
  function decode(str) {
    str = String(str || '');
    var tag = str.slice(0, 2);
    var body = str.slice(2);
    if (tag !== 'z.' && tag !== 'u.') return Promise.reject(new Error('Not a Limitless Notepad share link'));
    var bytes = fromB64url(body);
    var raw = tag === 'z.' ? inflateRaw(bytes) : Promise.resolve(bytes);
    return raw.then(function (b) {
      var json = new TextDecoder().decode(b);
      var obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object') throw new Error('Not a Limitless Notepad share link');
      return obj;
    }, function (e) {
      throw new Error(tag === 'z.' ? 'This link needs a browser that supports decompression.' : (e && e.message) || 'Could not read this link');
    });
  }

  LN.sharecodec = { encode: encode, decode: decode, b64url: b64url, fromB64url: fromB64url };
})(window.LN = window.LN || {});
