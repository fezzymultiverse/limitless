(function (LN) {
  'use strict';

  var MIME = {
    png: 'image/png', apng: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
    tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif'
  };
  // Formats the Android WebView usually cannot draw. They are still stored, shared and exported.
  var WEAK = { tif: 1, tiff: 1, heic: 1, heif: 1 };
  var AUDIO_EMBED = { mp3: 1, wav: 1, ogg: 1, oga: 1, opus: 1, m4a: 1, m4b: 1, aac: 1, flac: 1, weba: 1, amr: 1, wma: 1, mka: 1, mid: 1, midi: 1, aif: 1, aiff: 1 };
  var VIDEO_EMBED = { mp4: 1, m4v: 1, webm: 1, mkv: 1, mov: 1, '3gp': 1, ogv: 1 };
  var MEDIA_MIME = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', m4b: 'audio/mp4',
    aac: 'audio/aac', flac: 'audio/flac', weba: 'audio/webm', amr: 'audio/amr', wma: 'audio/x-ms-wma', mka: 'audio/x-matroska',
    mid: 'audio/midi', midi: 'audio/midi', aif: 'audio/aiff', aiff: 'audio/aiff',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', '3gp': 'video/3gpp', ogv: 'video/ogg'
  };
  var urls = [];

  function mimeOf(name) { return MIME[LN.ext(name)] || 'application/octet-stream'; }

  function revokeAll() {
    urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* already gone */ } });
    urls = [];
  }

  var STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
  var MAX_ROTATE_PIXELS = 48000000;

  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  // Image file viewer: fit, zoom (buttons, pinch, double tap), rotate, previous and next image
  // in the same folder (buttons or swipe), slideshow, info and a copy button for the ![[name]] embed.
  // Images are read only, so bytes() hands back what was opened.
  function mount(el, bytes, api) {
    el.textContent = '';
    el.classList.add('vw');
    var startNode = LN.vault.get(LN.editor.currentId());
    var cur = startNode || { name: 'Image', bytes: bytes };
    var curBytes = bytes;
    var scale = 0;                       // 0 = fit to the screen
    var rot = 0;                         // 0, 90, 180, 270 (view only, the file is never changed)
    var url = '';
    var rotUrl = '';
    var dead = false;
    var slideTimer = 0;

    var bar = document.createElement('div');
    bar.className = 'vw-bar';
    function btn(text, label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }
    var info = document.createElement('span');
    info.className = 'vw-note';

    var wrap = document.createElement('div');
    wrap.className = 'img-wrap';
    var img = document.createElement('img');
    img.className = 'img-view';

    function siblings() {
      if (!startNode) return [];
      return LN.vault.children(startNode.parent || null).filter(function (n) {
        return n.type !== 'folder' && LN.kindOf(n.name) === 'img' && n.bytes && n.bytes.length;
      });
    }
    function indexOfCur() {
      var list = siblings();
      for (var i = 0; i < list.length; i++) if (list[i].id === cur.id) return { list: list, i: i };
      return { list: list, i: -1 };
    }

    function natural() { return img.naturalWidth || img.clientWidth || 1; }
    function currentScale() { return scale || (img.clientWidth / natural()) || 1; }
    function apply() {
      if (!scale) {
        img.classList.remove('zoom');
        img.style.width = '';
      } else {
        img.classList.add('zoom');
        img.style.width = Math.round(natural() * scale) + 'px';
      }
      pct.textContent = scale ? Math.round(scale * 100) + '%' : 'Fit';
    }
    function setScale(v) {
      v = Math.max(0.05, Math.min(8, v));
      scale = v;
      apply();
    }
    function step(dir) {
      var c = currentScale();
      var next = null;
      if (dir > 0) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i] > c + 0.001) { next = STEPS[i]; break; } }
      else { for (var j = STEPS.length - 1; j >= 0; j--) if (STEPS[j] < c - 0.001) { next = STEPS[j]; break; } }
      if (next == null) return;
      scale = next;
      apply();
    }

    function dropRotated() {
      if (rotUrl) { try { URL.revokeObjectURL(rotUrl); } catch (e) { /* already gone */ } rotUrl = ''; }
    }

    function showInfo() {
      var pos = indexOfCur();
      var head = pos.list.length > 1 && pos.i >= 0 ? (pos.i + 1) + '/' + pos.list.length + ' · ' : '';
      var dims = img.naturalWidth && img.naturalHeight ? img.naturalWidth + ' × ' + img.naturalHeight + ' · ' : '';
      info.textContent = head + dims + size(curBytes.length) + (rot ? ' · ' + rot + '°' : '');
      title.textContent = cur.name;
    }

    // The rotated picture is drawn once onto a canvas so the layout, zoom and scrolling stay the same as for any other image.
    function rotated() {
      if (!rot) { dropRotated(); img.src = url; return; }
      var w = img.naturalWidth, h = img.naturalHeight;
      var src = url;
      if (!w || !h) { LN.toast('Wait for the image to load'); rot = 0; return; }
      if (w * h > MAX_ROTATE_PIXELS) { LN.toast('Image is too large to rotate'); rot = 0; return; }
      var probe = new Image();
      probe.onload = function () {
        if (dead) return;
        try {
          var c = document.createElement('canvas');
          var swap = rot === 90 || rot === 270;
          c.width = swap ? h : w;
          c.height = swap ? w : h;
          var g = c.getContext('2d');
          g.translate(c.width / 2, c.height / 2);
          g.rotate(rot * Math.PI / 180);
          g.drawImage(probe, -w / 2, -h / 2);
          c.toBlob(function (b) {
            if (dead || !b) return;
            dropRotated();
            rotUrl = URL.createObjectURL(b);
            img.src = rotUrl;
          }, 'image/png');
        } catch (e) { LN.toast('Could not rotate this image'); rot = 0; showInfo(); }
      };
      probe.onerror = function () { LN.toast('Could not rotate this image'); rot = 0; showInfo(); };
      probe.src = src;
    }
    function rotate(dir) {
      rot = (rot + (dir > 0 ? 90 : 270)) % 360;
      rotated();
    }

    function load(node, bts) {
      cur = node;
      curBytes = bts;
      rot = 0;
      scale = 0;
      dropRotated();
      if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ } }
      url = URL.createObjectURL(new Blob([bts], { type: mimeOf(node.name) }));
      img.alt = node.name;
      wrap.querySelector('.img-fail') && wrap.querySelector('.img-fail').remove();
      img.hidden = false;
      img.src = url;
      wrap.scrollTop = 0;
      wrap.scrollLeft = 0;
    }

    function go(dir) {
      var pos = indexOfCur();
      if (pos.list.length < 2 || pos.i < 0) return false;
      var n = pos.list[(pos.i + dir + pos.list.length) % pos.list.length];
      load(n, n.bytes);
      return true;
    }

    function stopSlides() {
      if (slideTimer) { clearInterval(slideTimer); slideTimer = 0; }
      if (play) { play.classList.remove('on'); play.textContent = 'Slideshow'; }
    }
    function toggleSlides() {
      if (slideTimer) { stopSlides(); return; }
      if (siblings().length < 2) { LN.toast('Only one image in this folder'); return; }
      var sec = Number(LN.store.get('imgSlideSec')) || 3;
      sec = Math.max(1, Math.min(30, sec));
      play.classList.add('on');
      play.textContent = 'Stop';
      slideTimer = setInterval(function () { if (!go(1)) stopSlides(); }, sec * 1000);
    }

    var title = document.createElement('span');
    title.className = 'vw-title';
    btn('‹', 'Previous image', function () { stopSlides(); go(-1); });
    btn('›', 'Next image', function () { stopSlides(); go(1); });
    btn('−', 'Zoom out', function () { step(-1); });
    var pct = btn('Fit', 'Fit to screen', function () { scale = 0; apply(); });
    btn('+', 'Zoom in', function () { step(1); });
    btn('100%', 'Actual size', function () { scale = 1; apply(); });
    btn('⟲', 'Rotate left', function () { rotate(-1); });
    btn('⟳', 'Rotate right', function () { rotate(1); });
    var play = btn('Slideshow', 'Start or stop the slideshow', toggleSlides);
    btn('Copy embed', 'Copy the note embed for this image', function () {
      var text = '![[' + cur.name + ']]';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { LN.toast('Copied ' + text); }, function () { LN.toast('Copy failed'); });
      } else LN.toast(text);
    });
    bar.appendChild(title);
    bar.appendChild(info);

    img.addEventListener('load', function () { showInfo(); apply(); });
    img.addEventListener('error', function () {
      var e = LN.ext(cur.name);
      var msg = document.createElement('div');
      msg.className = 'img-fail';
      msg.textContent = WEAK[e]
        ? 'This device can\'t draw ' + e.toUpperCase() + ' pictures. The file is kept safely: export it, or convert it to JPG or PNG to view it here.'
        : 'Could not open this image. The file may be damaged or its format may not be supported on this device.';
      img.hidden = true;
      wrap.appendChild(msg);
      info.textContent = size(curBytes.length);
      title.textContent = cur.name;
    });

    // Touch: pinch to zoom, double tap to toggle zoom, swipe sideways (when fitted) for the next or previous image.
    var pinch = null, lastTap = 0, swipe = null;
    function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    wrap.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) {
        pinch = { d: dist(ev.touches), s: currentScale() };
        swipe = null;
      } else if (ev.touches.length === 1) {
        swipe = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
      }
    }, { passive: true });
    wrap.addEventListener('touchmove', function (ev) {
      if (pinch && ev.touches.length === 2) {
        ev.preventDefault();
        var d = dist(ev.touches);
        if (pinch.d > 0) setScale(pinch.s * d / pinch.d);
      }
    }, { passive: false });
    wrap.addEventListener('touchend', function (ev) {
      if (pinch) { if (ev.touches.length < 2) pinch = null; return; }
      if (!swipe || ev.changedTouches.length !== 1) return;
      var dx = ev.changedTouches[0].clientX - swipe.x;
      var dy = ev.changedTouches[0].clientY - swipe.y;
      var dt = Date.now() - swipe.t;
      swipe = null;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
        var now = Date.now();
        if (now - lastTap < 320) { lastTap = 0; if (scale) { scale = 0; apply(); } else setScale(2); }
        else lastTap = now;
        return;
      }
      if (!scale && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 600) { stopSlides(); go(dx < 0 ? 1 : -1); }
    }, { passive: true });

    wrap.appendChild(img);
    el.appendChild(bar);
    el.appendChild(wrap);
    load(cur, curBytes);
    return {
      bytes: function () { return Promise.resolve(bytes); },
      destroy: function () {
        dead = true;
        stopSlides();
        dropRotated();
        try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ }
      }
    };
  }

  // Turns ![[name]] placeholders from md.js into pictures, audio players or video players stored in the vault.
  function hydrate(root) {
    revokeAll();
    var list = root.querySelectorAll('img[data-ln-img]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var name = el.getAttribute('data-ln-img');
      var f = LN.vault.findNote(name);
      if (!f || !f.bytes) {
        el.replaceWith(document.createTextNode('[file not found: ' + name + ']'));
        continue;
      }
      var e = LN.ext(f.name);
      if (AUDIO_EMBED[e] || VIDEO_EMBED[e]) {
        var mu = URL.createObjectURL(new Blob([f.bytes], { type: MEDIA_MIME[e] || 'audio/mpeg' }));
        urls.push(mu);
        var m = document.createElement(VIDEO_EMBED[e] ? 'video' : 'audio');
        m.className = 'embed-media';
        m.controls = true;
        m.preload = 'metadata';
        if (VIDEO_EMBED[e]) m.setAttribute('playsinline', '');
        m.title = f.name;
        m.src = mu;
        var holder = document.createElement('div');
        holder.className = 'embed-media-wrap';
        holder.appendChild(m);
        var cap = document.createElement('div');
        cap.className = 'embed-media-cap';
        cap.textContent = f.name;
        holder.appendChild(cap);
        el.replaceWith(holder);
        continue;
      }
      var u = URL.createObjectURL(new Blob([f.bytes], { type: mimeOf(f.name) }));
      urls.push(u);
      el.src = u;
      el.addEventListener('error', (function (img, nm) {
        return function () { img.replaceWith(document.createTextNode('[cannot show ' + nm + ' on this device]')); };
      })(el, f.name));
    }
  }

  LN.imgv = { mount: mount, hydrate: hydrate };
})(window.LN = window.LN || {});
