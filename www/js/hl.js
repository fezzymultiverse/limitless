(function (LN) {
  'use strict';
  // Tiny syntax highlighter. Pure string work, no libraries (the CSP only allows our own scripts).
  // Every piece of text is HTML-escaped before it is wrapped, so output is safe for innerHTML.
  // If a language fails to compile (old WebView without a regex feature) the code is shown plain.

  var MAX_CHARS = 30000; // above this, show plain text so a huge paste never freezes the phone

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var STR_DQ = '"(?:\\\\.|[^"\\\\\\n])*"?';
  var STR_SQ = "'(?:\\\\.|[^'\\\\\\n])*'?";
  var NUM = '\\b(?:0[xX][\\da-fA-F]+|\\d+\\.?\\d*(?:[eE][+-]?\\d+)?)\\b';
  var CALL = '\\b[A-Za-z_$][\\w$]*(?=\\s*\\()';
  var TYPE = '\\b[A-Z][\\w$]*\\b';

  function words(list) { return '\\b(?:' + list + ')\\b'; }

  var KW_JS = 'break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await|get|set|interface|type|enum|implements|public|private|protected|readonly|as|declare|namespace|abstract|true|false|null|undefined|NaN|Infinity';
  var KW_PY = 'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None|self|cls';
  var KW_C = 'int|long|short|char|float|double|void|bool|boolean|string|struct|enum|union|typedef|static|const|final|public|private|protected|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|finally|throw|throws|import|package|include|using|namespace|fn|let|mut|pub|use|mod|impl|trait|match|func|go|defer|chan|range|var|val|fun|null|nil|true|false|this|self|super|override|abstract|extern|volatile|unsigned|signed|sizeof|auto|template|typename|operator|function|echo|require|as|in|is';
  var KW_SH = 'if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|return|exit|local|export|source|alias|unset|set|readonly|break|continue|select|trap|eval|exec';
  var BI_SH = 'echo|cd|ls|cat|grep|sed|awk|chmod|chown|mkdir|rm|cp|mv|pkg|apt|apt-get|pip|pip3|npm|npx|git|curl|wget|python|python3|node|sudo|tar|unzip|zip|ssh|scp|touch|head|tail|find|xargs|sort|uniq|wc|cut|tr|kill|ps|printf|read|test|nmap|tor|proxychains4';
  var KW_SQL = 'select|from|where|insert|into|values|update|set|delete|create|table|alter|drop|index|join|inner|left|right|outer|on|group|by|order|having|limit|offset|as|and|or|not|null|is|in|like|between|distinct|union|all|case|when|then|else|end|primary|key|foreign|references|default|unique|constraint|begin|commit|rollback|exists|asc|desc|count|sum|avg|min|max|int|integer|text|varchar|boolean|date|timestamp';

  // Each language: flags + ordered [class, source] rules. At one position the earlier rule wins.
  // Sources use non-capturing groups only; each rule becomes one capture group.
  var DEFS = {
    js: { f: 'g', r: [
      ['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|(?![\\s\\S]))'],
      ['s', STR_DQ + '|' + STR_SQ + '|`(?:\\\\[\\s\\S]|[^`\\\\])*`?'],
      ['n', NUM],
      ['k', words(KW_JS)],
      ['f', CALL],
      ['t', TYPE]
    ] },
    clike: { f: 'gm', r: [
      ['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|(?![\\s\\S]))|^[ \\t]*#[^\\n]*'],
      ['s', STR_DQ + '|' + STR_SQ + '|`(?:\\\\[\\s\\S]|[^`\\\\])*`?'],
      ['n', NUM],
      ['k', words(KW_C)],
      ['f', CALL],
      ['t', TYPE]
    ] },
    json: { f: 'g', r: [
      ['a', '"(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:)'],
      ['s', STR_DQ],
      ['n', '-?\\b\\d+\\.?\\d*(?:[eE][+-]?\\d+)?\\b'],
      ['k', words('true|false|null')]
    ] },
    html: { f: 'g', r: [
      ['c', '<!--[\\s\\S]*?(?:-->|(?![\\s\\S]))|<![A-Za-z][^>]*>'],
      ['t', '<\\/?[A-Za-z][\\w:-]*|\\/?>'],
      ['s', '(?<==\\s*)(?:"[^"\\n]*"?|\'[^\'\\n]*\'?)'],
      ['a', '[\\w:@.-]+(?=\\s*=)'],
      ['n', '&#?\\w+;']
    ] },
    css: { f: 'g', r: [
      ['c', '\\/\\*[\\s\\S]*?(?:\\*\\/|(?![\\s\\S]))'],
      ['s', STR_DQ + '|' + STR_SQ],
      ['k', '@[\\w-]+|!important'],
      ['v', '--[\\w-]+'],
      ['n', '#[\\da-fA-F]{3,8}\\b|\\b\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch)?\\b'],
      ['f', '[\\w-]+(?=\\()'],
      ['a', '[\\w-]+(?=\\s*:)']
    ] },
    sh: { f: 'gm', r: [
      ['c', '(?:^|(?<=\\s))#[^\\n]*'],
      ['p', '^[ \\t]*\\$(?=\\s)'],
      ['s', '"(?:\\\\.|[^"\\\\])*"?|\'[^\']*\'?'],
      ['v', '\\$(?:\\{[^}\\n]*\\}?|\\w+|[@#?!*$-])'],
      ['k', words(KW_SH)],
      ['f', words(BI_SH)],
      ['a', '(?<=\\s)--?[A-Za-z][\\w-]*'],
      ['n', NUM]
    ] },
    py: { f: 'g', r: [
      ['c', '#[^\\n]*'],
      ['s', '[rbfRBF]{0,2}(?:"""[\\s\\S]*?(?:"""|(?![\\s\\S]))|\'\'\'[\\s\\S]*?(?:\'\'\'|(?![\\s\\S])))|[rbfRBF]{0,2}' + STR_DQ + '|[rbfRBF]{0,2}' + STR_SQ],
      ['a', '@[\\w.]+'],
      ['n', NUM],
      ['k', words(KW_PY)],
      ['f', '\\b[A-Za-z_]\\w*(?=\\s*\\()'],
      ['t', '\\b[A-Z]\\w*\\b']
    ] },
    yaml: { f: 'gm', r: [
      ['c', '(?:^|(?<=\\s))#[^\\n]*'],
      ['a', '^[ \\t-]*[\\w."\'/-]+(?=\\s*:(?:\\s|$))'],
      ['s', STR_DQ + '|' + STR_SQ],
      ['n', NUM],
      ['k', words('true|false|null|yes|no|on|off')]
    ] },
    sql: { f: 'gi', r: [
      ['c', '--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|(?![\\s\\S]))'],
      ['s', "'(?:''|[^'])*'?"],
      ['n', NUM],
      ['k', words(KW_SQL)],
      ['f', '\\b[A-Za-z_]\\w*(?=\\s*\\()']
    ] },
    md: { f: 'gm', r: [
      ['k', '^#{1,6}[^\\n]*'],
      ['c', '^>[^\\n]*'],
      ['s', '`[^`\\n]+`'],
      ['a', '\\[\\[[^\\]\\n]+\\]\\]'],
      ['f', '\\[[^\\]\\n]*\\]\\([^)\\n]*\\)'],
      ['t', '\\*\\*[^*\\n]+\\*\\*'],
      ['n', '^[ \\t]*(?:[-*+]|\\d+\\.)(?=\\s)']
    ] },
    diff: { f: 'gm', r: [
      ['h', '^@@[^\\n]*'],
      ['c', '^(?:\\+\\+\\+|---|diff |index )[^\\n]*'],
      ['ins', '^\\+[^\\n]*'],
      ['del', '^-[^\\n]*']
    ] }
  };

  var ALIAS = {
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', javascript: 'js', typescript: 'js', node: 'js',
    json: 'json', jsonc: 'json', json5: 'json',
    html: 'html', htm: 'html', xml: 'html', svg: 'html', xhtml: 'html',
    css: 'css', scss: 'css', less: 'css',
    sh: 'sh', bash: 'sh', zsh: 'sh', shell: 'sh', console: 'sh', termux: 'sh',
    py: 'py', python: 'py',
    yaml: 'yaml', yml: 'yaml', toml: 'yaml', ini: 'yaml',
    sql: 'sql',
    md: 'md', markdown: 'md',
    diff: 'diff', patch: 'diff',
    java: 'clike', kotlin: 'clike', kt: 'clike', c: 'clike', cpp: 'clike', cc: 'clike', h: 'clike', hpp: 'clike',
    cs: 'clike', csharp: 'clike', go: 'clike', rust: 'clike', rs: 'clike', swift: 'clike', php: 'clike', dart: 'clike', scala: 'clike'
  };

  var compiled = {}; // name -> { re, cls } or false when the engine cannot build it

  function compile(name) {
    if (compiled.hasOwnProperty(name)) return compiled[name];
    var d = DEFS[name], out = false;
    if (d) {
      try {
        var src = d.r.map(function (x) { return '(' + x[1] + ')'; }).join('|');
        out = { re: new RegExp(src, d.f), cls: d.r.map(function (x) { return x[0]; }) };
      } catch (e) {
        out = false;
        if (LN.log) LN.log('hl: could not build ' + name + ': ' + (e && e.message));
      }
    }
    compiled[name] = out;
    return out;
  }

  function normalize(lang) {
    var k = String(lang || '').toLowerCase().replace(/^language-|^lang-/, '');
    return ALIAS.hasOwnProperty(k) ? ALIAS[k] : '';
  }

  // Returns escaped HTML. Unknown language, too much code or a failed build gives escaped plain text.
  function highlight(code, lang) {
    code = String(code == null ? '' : code);
    var name = normalize(lang);
    if (!name || code.length > MAX_CHARS) return esc(code);
    var c = compile(name);
    if (!c) return esc(code);
    var re = c.re, out = '', last = 0, m, guard = 0;
    re.lastIndex = 0;
    while ((m = re.exec(code)) !== null) {
      if (++guard > 60000) break; // belt and braces against a runaway loop
      if (m[0] === '') { re.lastIndex++; continue; }
      var g = 1;
      while (g < m.length && m[g] === undefined) g++;
      var cls = c.cls[g - 1];
      if (!cls) { re.lastIndex = m.index + 1; continue; }
      out += esc(code.slice(last, m.index)) + '<span class="tk-' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) res(); else rej(new Error('Copy was blocked'));
    });
  }

  function flash(btn, text, ok) {
    if (btn.__t) clearTimeout(btn.__t);
    btn.textContent = text;
    btn.classList.toggle('ok', !!ok);
    btn.classList.toggle('bad', !ok);
    btn.__t = setTimeout(function () {
      btn.textContent = 'Copy';
      btn.classList.remove('ok');
      btn.classList.remove('bad');
    }, 1400);
  }

  // One delegated click listener per root (the preview pane); safe to call on every render.
  function bind(root) {
    if (!root || root.__hlBound) return;
    root.__hlBound = true;
    root.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!btn || !root.contains(btn)) return;
      var box = btn.closest('.cb');
      var code = box ? box.querySelector('code') : null;
      if (!code) return;
      e.preventDefault();
      copyText(code.textContent).then(function () { flash(btn, 'Copied', true); }, function () {
        flash(btn, 'Failed', false);
        if (LN.toast) LN.toast('Couldn\'t copy. Select the text and copy it by hand.');
      });
    });
  }

  LN.hl = { highlight: highlight, normalize: normalize, bind: bind, escape: esc };
})(window.LN = window.LN || {});
