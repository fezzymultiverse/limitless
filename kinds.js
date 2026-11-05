(function (LN) {
  'use strict';
  // Binary kinds are stored as bytes and opened in a viewer.
  // doc = odt/ods/odp/epub/rtf, media = audio and video, bin = anything else that is not text.
  var BIN = { pdf: 1, pptx: 1, docx: 1, xlsx: 1, img: 1, doc: 1, media: 1, bin: 1 };
  var IMG = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, avif: 1, ico: 1, jfif: 1, apng: 1, jpe: 1, pjpeg: 1, pjp: 1, tif: 1, tiff: 1, heic: 1, heif: 1 };
  var DOC = { odt: 1, ods: 1, odp: 1, epub: 1, rtf: 1 };
  var MEDIA = {
    mp3: 1, wav: 1, ogg: 1, oga: 1, opus: 1, m4a: 1, m4b: 1, aac: 1, flac: 1, weba: 1, amr: 1,
    wma: 1, mka: 1, mid: 1, midi: 1, aif: 1, aiff: 1,
    mp4: 1, webm: 1, mkv: 1, mov: 1, '3gp': 1, m4v: 1, ogv: 1
  };
  // json and xml are text, with a Tree view next to the text (V0.7.4)
  var DATA = { json: 1, geojson: 1, xml: 1, rss: 1, atom: 1, xsd: 1, xsl: 1, xslt: 1, plist: 1, kml: 1, gpx: 1 };
  var ALIAS = {
    docm: 'docx', dotx: 'docx', dotm: 'docx',
    xlsm: 'xlsx', xltx: 'xlsx', xltm: 'xlsx',
    pptm: 'pptx', ppsx: 'pptx', potx: 'pptx', potm: 'pptx', ppsm: 'pptx'
  };
  var ARCHIVE = {
    zip: 1, rar: 1, '7z': 1, tar: 1, gz: 1, tgz: 1, bz2: 1, xz: 1, apk: 1, jar: 1, aab: 1, iso: 1,
    exe: 1, dll: 1, so: 1, bin: 1, dat: 1, db: 1, sqlite: 1, doc: 1, xls: 1, ppt: 1, dex: 1, ttf: 1, otf: 1, woff: 1, woff2: 1
  };

  function ext(name) {
    var m = /\.([^.]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  // md, html, csv, data, text, or a binary kind: pdf, pptx, docx, xlsx, img, doc, media, bin
  LN.kindOf = function (name) {
    var e = ext(name);
    if (e === 'md' || e === 'markdown') return 'md';
    if (e === 'html' || e === 'htm' || e === 'xhtml') return 'html';
    if (e === 'csv' || e === 'tsv') return 'csv';
    if (IMG[e]) return 'img';
    if (DOC[e]) return 'doc';
    if (MEDIA[e]) return 'media';
    if (ALIAS[e]) return ALIAS[e];
    if (ARCHIVE[e]) return 'bin';
    if (BIN[e]) return e;
    if (DATA[e]) return 'data';
    return 'text';
  };
  // A stored file with bytes but a text-looking name (an unknown extension that held binary data) is kind bin
  LN.kindOfNode = function (n) {
    var k = LN.kindOf(n && n.name);
    if (n && n.bytes && !BIN[k]) return 'bin';
    return k;
  };
  LN.isBin = function (kind) { return !!BIN[kind]; };
  LN.ext = ext;

  // Read bytes as text. Returns { text, enc } or null when the bytes are not text.
  // UTF-8 first, then UTF-16 with a byte order mark, then Windows-1252 if the bytes look like text.
  LN.decodeText = function (u) {
    var n = u.length;
    if (n === 0) return { text: '', enc: 'UTF-8' };
    try {
      if (n >= 2 && u[0] === 0xFF && u[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(u.subarray(2)), enc: 'UTF-16 LE' };
      if (n >= 2 && u[0] === 0xFE && u[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(u.subarray(2)), enc: 'UTF-16 BE' };
    } catch (e) { /* decoder missing, fall through */ }
    var lim = Math.min(n, 8192), odd = 0, i;
    for (i = 0; i < lim; i++) if (u[i] === 0) return null;
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u), enc: 'UTF-8' }; } catch (e2) { /* not utf-8 */ }
    for (i = 0; i < lim; i++) {
      var b = u[i];
      if (b < 9 || (b > 13 && b < 32 && b !== 27)) odd++;
    }
    if (odd / lim > 0.02) return null;
    try { return { text: new TextDecoder('windows-1252').decode(u), enc: 'Windows-1252' }; } catch (e3) { return null; }
  };
})(window.LN = window.LN || {});
