(function (LN) {
  'use strict';
  function activeMarkdown() {
    var el = document.getElementById('editor');
    if (!el) throw new Error('Open a note before exporting.');
    return el.value || '';
  }
  function filename(ext) {
    var name = (document.getElementById('st-file') || {}).textContent || 'Limitless-Note';
    name = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Limitless-Note';
    return name + '.' + ext;
  }
  function save(blob, name) {
    // Prefer the Android Documents folder when Capacitor Filesystem is available;
    // keep browser download as a safe fallback for web builds and plugin failures.
    var native = LN.native;
    var fs = native && native.plugin ? native.plugin('Filesystem') : null;
    function download() {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      return blob;
    }
    if (!fs || !native.bytesToB64 || !blob.arrayBuffer) return Promise.resolve(download());
    return blob.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      return fs.writeFile({
        path: 'LimitlessNotepad/' + name,
        directory: 'DOCUMENTS',
        data: native.bytesToB64(bytes),
        recursive: true
      }).then(function () {
        LN.toast('Saved to Documents/LimitlessNotepad/' + name);
        return blob;
      });
    }).catch(function () {
      return download();
    });
  }
  function xml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function htmlDoc(md) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>Limitless Notepad</title><style>' +
      'body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#222}' +
      'pre,code{background:#f2f2f2;padding:.2em;border-radius:4px}pre{padding:12px;white-space:pre-wrap}blockquote{border-left:3px solid #888;padding-left:1em;color:#555}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px}' +
      '</style></head><body>' + LN.md.render(md) + '</body></html>';
  }
  function downloadHtmlPdf(md) {
    // PDF.js is a PDF reader, not a PDF generator. Use the browser/Android print-to-PDF flow.
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open(); doc.write(htmlDoc(md)); doc.close();
    setTimeout(function () {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      finally { setTimeout(function(){frame.remove();}, 1500); }
    }, 300);
    LN.toast('Use the print dialog to save this note as a PDF.');
    return Promise.resolve({ method: 'print-dialog', filename: filename('pdf') });
  }
  function docx(md) {
    var lines = md.split(/\r?\n/), paras = lines.map(function (line) {
      var m = /^(#{1,6})\s+(.*)$/.exec(line);
      var text = m ? m[2] : line;
      if (!text) return '<w:p/>';
      var pPr = m ? '<w:pPr><w:pStyle w:val="Heading' + m[1].length + '"/></w:pPr>' : '';
      return '<w:p>' + pPr + '<w:r><w:t xml:space="preserve">' + xml(text) + '</w:t></w:r></w:p>';
    }).join('');
    var files = {
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paras+'<w:sectPr/></w:body></w:document>'
    };
    return LN.zip.blankPkg(files);
  }
  function pptx(md) {
    var pages = [], current = {title:'', body:[]};
    md.split(/\r?\n/).forEach(function(line) {
      var h = /^(#{1,2})\s+(.*)$/.exec(line);
      if (h && (current.title || current.body.length)) { pages.push(current); current={title:h[2],body:[]}; }
      else if (h) current.title=h[2];
      else if (line.trim()) current.body.push(line.replace(/^[-*+]\s+/,'• '));
    });
    if (current.title || current.body.length || !pages.length) pages.push(current);
    // Export a valid editable text document package with slide-like page sections in OOXML.
    // Keep the format honest: each page is represented as a slide in the generated presentation.
    var esc=xml, slides=pages.map(function(pg,i){
      var texts=[pg.title || ('Page '+(i+1))].concat(pg.body).slice(0,28);
      var shapes=texts.map(function(t,j){var y=500000+j*380000;return '<p:sp><p:nvSpPr><p:cNvPr id="'+(j+2)+'" name="Text '+j+'"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="700000" y="'+y+'"/><a:ext cx="7800000" cy="300000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="'+(j===0?2800:1800)+'"/><a:t>'+esc(t)+'</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>';}).join('');
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'+shapes+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    });
    var files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'+slides.map(function(_,i){return '<Override PartName="/ppt/slides/slide'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';}).join('')+'</Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
      'ppt/presentation.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>'+slides.map(function(_,i){return '<p:sldId id="'+(256+i)+'" r:id="rId'+(i+1)+'"/>';}).join('')+'</p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
      'ppt/_rels/presentation.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+slides.map(function(_,i){return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide'+(i+1)+'.xml"/>';}).join('')+'</Relationships>'
    };
    slides.forEach(function(s,i){files['ppt/slides/slide'+(i+1)+'.xml']=s;});
    return LN.zip.blankPkg(files);
  }
  function exportAs(kind) {
    var md=activeMarkdown();
    if (kind==='pdf') return downloadHtmlPdf(md);
    var pkg=kind==='docx'?docx(md):pptx(md);
    return Promise.resolve(pkg).then(function(bytes){
      return save(new Blob([bytes],{type:kind==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}),filename(kind));
    });
  }
  LN.converter={html:function(md){return htmlDoc(md);}, exportAs:exportAs, toDocx:docx, toPptx:pptx};
})(window.LN=window.LN||{});
