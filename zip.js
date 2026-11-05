(function (LN) {
  'use strict';
  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8');
  var T = null;

  function crc32(b) {
    if (!T) {
      T = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        T[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) crc = T[(crc ^ b[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (a) { return new Uint8Array(a); });
  }
  function inflate(bytes) { return pipe(bytes, new DecompressionStream('deflate-raw')); }
  function deflate(bytes) { return pipe(bytes, new CompressionStream('deflate-raw')); }

  // Read a zip. Entries keep their raw compressed bytes so untouched files are copied byte for byte on save.
  function parse(buf) {
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    var eocd = -1;
    for (var i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid zip based file');
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var list = [];
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      var ent = {
        flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true),
        time: dv.getUint16(p + 12, true), date: dv.getUint16(p + 14, true),
        crc: dv.getUint32(p + 16, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true),
        off: dv.getUint32(p + 42, true),
        name: dec.decode(u.subarray(p + 46, p + 46 + nl))
      };
      var lo = ent.off;
      var data = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      ent.raw = u.subarray(data, data + ent.csize);
      ent.data = null;
      list.push(ent);
      p += 46 + nl + xl + cl;
    }
    return new Pkg(list);
  }

  function Pkg(list) {
    this.list = list;
    this.map = {};
    var self = this;
    list.forEach(function (x) { self.map[x.name] = x; });
  }
  Pkg.prototype.has = function (name) { return !!this.map[name]; };
  Pkg.prototype.bytes = function (name) {
    var x = this.map[name];
    if (!x) return Promise.reject(new Error('Missing ' + name));
    if (x.data) return Promise.resolve(x.data);
    if (x.method === 0) { x.data = x.raw; return Promise.resolve(x.raw); }
    if (x.method !== 8) return Promise.reject(new Error('Unsupported zip method'));
    return inflate(x.raw).then(function (d) { x.data = d; return d; });
  };
  Pkg.prototype.text = function (name) { return this.bytes(name).then(function (b) { return dec.decode(b); }); };
  Pkg.prototype.setBytes = function (name, bytes) {
    var x = this.map[name];
    if (!x) {
      x = { flags: 0x800, method: 0, time: 0, date: 0x21, name: name };
      this.list.push(x);
      this.map[name] = x;
    }
    x.data = bytes; x.raw = null; x.dirty = true;
  };
  Pkg.prototype.setText = function (name, s) { this.setBytes(name, enc.encode(s)); };
  Pkg.prototype.remove = function (name) {
    this.list = this.list.filter(function (x) { return x.name !== name; });
    delete this.map[name];
  };

  // Build the zip. Changed files are compressed; untouched files are copied as they were.
  Pkg.prototype.build = function () {
    var items = this.list.map(function (x) { return { x: x, data: x.dirty ? x.data : null, keep: x.dirty ? null : x }; });
    return Promise.all(items.map(function (it) {
      if (it.keep) return it;
      var d = it.data;
      return (typeof CompressionStream === 'function' ? deflate(d) : Promise.resolve(null)).then(function (c) {
        it.crc = crc32(d); it.usize = d.length;
        if (c && c.length < d.length) { it.method = 8; it.body = c; } else { it.method = 0; it.body = d; }
        return it;
      });
    })).then(function (rows) {
      var parts = [], central = [], off = 0;
      rows.forEach(function (it) {
        var x = it.x, nm = enc.encode(x.name);
        var method = it.keep ? x.method : it.method;
        var body = it.keep ? x.raw : it.body;
        var crc = it.keep ? x.crc : it.crc;
        var usize = it.keep ? x.usize : it.usize;
        var flags = (x.flags | 0x800) & ~0x08;
        var h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, flags, true);
        h.setUint16(8, method, true); h.setUint16(10, x.time, true); h.setUint16(12, x.date, true);
        h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, usize, true);
        h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
        var c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true);
        c.setUint16(10, method, true); c.setUint16(12, x.time, true); c.setUint16(14, x.date, true);
        c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, usize, true);
        c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
        parts.push(new Uint8Array(h.buffer), nm, body);
        central.push(new Uint8Array(c.buffer), nm);
        off += 30 + nm.length + body.length;
      });
      var csize = 0;
      central.forEach(function (c) { csize += c.length; });
      var e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, rows.length, true); e.setUint16(10, rows.length, true);
      e.setUint32(12, csize, true); e.setUint32(16, off, true);
      return new Blob(parts.concat(central, [new Uint8Array(e.buffer)])).arrayBuffer().then(function (a) { return new Uint8Array(a); });
    });
  };

  function blankPkg(files) {
    var pk = new Pkg([]);
    Object.keys(files).forEach(function (k) { pk.setText(k, files[k]); });
    return pk.build();
  }

  function ser(doc) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^?]*\?>\s*/, '');
  }

  LN.zip = { create: function () { return new Pkg([]); }, ser: ser, blankPkg: blankPkg, parse: parse, crc32: crc32, enc: enc, dec: dec };
})(window.LN = window.LN || {});
