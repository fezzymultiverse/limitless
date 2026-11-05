(function (LN) {
  'use strict';
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function kids(el, name) {
    return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1 && n.localName === name && n.namespaceURI === W; });
  }
  function all(el, name) { return Array.prototype.slice.call(el.getElementsByTagNameNS(W, name)); }

  function paraText(p) {
    var out = '';
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType !== 1) return;
        if (c.namespaceURI === W && c.localName === 't') out += c.textContent;
        else if (c.namespaceURI === W && c.localName === 'tab') out += '\t';
        else if (c.namespaceURI === W && c.localName === 'br') out += ' ';
        else walk(c);
      });
    })(p);
    return out;
  }

  function setParaText(doc, p, text) {
    var runs = all(p, 'r');
    var r = runs[0];
    if (!r) {
      r = doc.createElementNS(W, 'w:r');
      p.appendChild(r);
    }
    runs.slice(1).forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
    Array.prototype.slice.call(r.childNodes).forEach(function (c) {
      if (!(c.namespaceURI === W && c.localName === 'rPr')) r.removeChild(c);
    });
    var t = doc.createElementNS(W, 'w:t');
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    t.textContent = text;
    r.appendChild(t);
  }

  function styleOf(p) {
    var ps = kids(p, 'pPr')[0];
    var st = ps ? kids(ps, 'pStyle')[0] : null;
    var v = st ? (st.getAttributeNS(W, 'val') || st.getAttribute('w:val') || '') : '';
    var m = /^heading\s*(\d)/i.exec(v);
    if (m) return 'h' + Math.min(6, +m[1]);
    if (/^title$/i.test(v)) return 'h1';
    if (ps && kids(ps, 'numPr')[0]) return 'li';
    return 'p';
  }

  function mount(el, bytes, api) {
    var pkg = LN.zip.parse(bytes);
    var doc = null;
    el.textContent = '';
    el.classList.add('vw');
    var page = document.createElement('div');
    page.className = 'docpage';
    el.appendChild(page);
    var map = [];

    function mkPara(p) {
      var tag = styleOf(p);
      var d = document.createElement(/^h\d$/.test(tag) ? tag : 'div');
      d.className = 'dp' + (tag === 'li' ? ' li' : '');
      d.contentEditable = 'plaintext-only';
      d.spellcheck = false;
      d.textContent = paraText(p);
      d._p = p;
      return d;
    }

    function build(node, host) {
      Array.prototype.forEach.call(node.childNodes, function (c) {
        if (c.nodeType !== 1 || c.namespaceURI !== W) return;
        if (c.localName === 'p') host.appendChild(mkPara(c));
        else if (c.localName === 'tbl') {
          var t = document.createElement('table');
          t.className = 'doctbl';
          kids(c, 'tr').forEach(function (tr) {
            var r = document.createElement('tr');
            kids(tr, 'tc').forEach(function (tc) {
              var td = document.createElement('td');
              build(tc, td);
              r.appendChild(td);
            });
            t.appendChild(r);
          });
          host.appendChild(t);
        } else if (c.localName === 'sdt') {
          var content = kids(c, 'sdtContent')[0];
          if (content) build(content, host);
        }
      });
    }

    page.addEventListener('input', function (e) {
      var d = e.target.closest ? e.target.closest('.dp') : null;
      if (!d || !d._p) return;
      setParaText(doc, d._p, d.textContent);
      api.dirty();
    });

    page.addEventListener('keydown', function (e) {
      var d = e.target.closest ? e.target.closest('.dp') : null;
      if (!d || !d._p) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        var np = d._p.cloneNode(true);
        all(np, 'r').forEach(function (r) { r.parentNode.removeChild(r); });
        all(np, 'hyperlink').forEach(function (h) { h.parentNode.removeChild(h); });
        d._p.parentNode.insertBefore(np, d._p.nextSibling);
        var nd = mkPara(np);
        d.parentNode.insertBefore(nd, d.nextSibling);
        nd.focus();
        api.dirty();
      } else if (e.key === 'Backspace' && d.textContent === '' && d._p.parentNode && kids(d._p.parentNode, 'p').length > 1) {
        e.preventDefault();
        var prev = d.previousElementSibling;
        d._p.parentNode.removeChild(d._p);
        d.parentNode.removeChild(d);
        if (prev && prev.focus) prev.focus();
        api.dirty();
      }
    });

    pkg.text('word/document.xml').then(function (xml) {
      doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read this document');
      var body = doc.getElementsByTagNameNS(W, 'body')[0];
      build(body, page);
    }).catch(function (e) {
      page.textContent = 'Could not open this file. ' + (e && e.message ? e.message : '');
    });

    return {
      bytes: function () {
        pkg.setText('word/document.xml', LN.zip.ser(doc));
        return pkg.build();
      },
      destroy: function () { el.textContent = ''; }
    };
  }

  function blank() {
    var P = LN.zip.parse;
    var CT = XMLDECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    var RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var DOC = XMLDECL + '<w:document xmlns:w="' + W + '"><w:body><w:p><w:r><w:t>New document</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
    return LN.zip.blankPkg({ '[Content_Types].xml': CT, '_rels/.rels': RELS, 'word/document.xml': DOC });
  }

  LN.docx = { mount: mount, blank: blank };
})(window.LN = window.LN || {});
