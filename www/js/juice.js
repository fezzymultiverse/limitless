(function (LN) {
  'use strict';
  // V0.7.20 Juice WRLD tribute. (1) the home greeting + a work quote, (2) the "999" story that opens when you tap the home
  // logo twice. Everything here is built with textContent; no note data is ever put in innerHTML.
  //
  // Facts policy: every number below was checked against a named source (listed at the bottom of the story).
  //   [CONFIRMED]  stated by a named source
  //   [PLAUSIBLE]  an interpretation, or a figure sources disagree on
  // No song lyrics are reproduced anywhere in the app.

  function el(tag, cls, text) { return LN.ui.el(tag, cls, text); }

  // ---------- the story ----------
  var NS = 'http://www.w3.org/2000/svg';
  function logo999() {
    // Three hand-drawn 9s: a bowl and a tail each. Orange gradient with a soft glow; the stroke draws itself in.
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 178 86');
    svg.setAttribute('class', 't9-logo');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '999');
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<linearGradient id="t9g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB347"/><stop offset=".55" stop-color="#FF6A00"/><stop offset="1" stop-color="#E24A00"/></linearGradient>' +
      '<filter id="t9f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    svg.appendChild(defs);
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', 'url(#t9g)');
    g.setAttribute('stroke-width', '9');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');
    g.setAttribute('filter', 'url(#t9f)');
    [0, 58, 116].forEach(function (x, i) {
      var bowl = document.createElementNS(NS, 'ellipse');
      bowl.setAttribute('cx', String(x + 22)); bowl.setAttribute('cy', '26'); bowl.setAttribute('rx', '15'); bowl.setAttribute('ry', '17');
      var tail = document.createElementNS(NS, 'path');
      tail.setAttribute('d', 'M' + (x + 37) + ' 26 C' + (x + 37) + ' 50 ' + (x + 31) + ' 68 ' + (x + 11) + ' 74');
      [bowl, tail].forEach(function (n, j) {
        n.setAttribute('pathLength', '100');
        n.setAttribute('class', 't9-draw');
        n.style.animationDelay = (i * 0.22 + j * 0.12) + 's';
        g.appendChild(n);
      });
    });
    svg.appendChild(g);
    return svg;
  }

  function tag(kind) {
    var s = el('span', 't9-tag ' + (kind === 'C' ? 'c' : 'p'), kind === 'C' ? 'CONFIRMED' : 'PLAUSIBLE');
    return s;
  }
  function para(text, kind) {
    var p = el('p', 't9-p');
    p.appendChild(document.createTextNode(text + ' '));
    if (kind) p.appendChild(tag(kind));
    return p;
  }
  function stat(big, small, src) {
    var d = el('div', 't9-stat');
    d.appendChild(el('div', 't9-big', big));
    d.appendChild(el('div', 't9-small', small));
    d.appendChild(el('div', 't9-src', src));
    return d;
  }
  function quote(text, who) {
    var b = el('blockquote', 't9-q');
    b.appendChild(el('p', '', '“' + text + '”'));
    b.appendChild(el('cite', '', '— ' + who));
    return b;
  }
  function chapter(num, title, nodes) {
    var s = el('section', 't9-ch');
    var h = el('h3', 't9-h');
    h.appendChild(el('span', 't9-n', num));
    h.appendChild(document.createTextNode(title));
    s.appendChild(h);
    nodes.forEach(function (n) { s.appendChild(n); });
    return s;
  }
  function grid(items) {
    var g = el('div', 't9-grid');
    items.forEach(function (i) { g.appendChild(i); });
    return g;
  }
  function list(items) {
    var u = el('ul', 't9-ul');
    items.forEach(function (t) { u.appendChild(el('li', '', t)); });
    return u;
  }

  function buildStory() {
    var frag = document.createDocumentFragment();

    frag.appendChild(chapter('01', 'The meaning', [
      para('Juice WRLD took 666, the number people call the mark of the beast, and turned it upside down. 999 was his way of saying: whatever hell you are in, flip it into something that pushes you forward.', 'C'),
      quote('999 represents taking whatever hell, whatever bad situation, whatever struggle you’re going through…', 'Juice WRLD, MTV News'),
      quote('I took the hell I was going through (666) and flipped it over into something positive (999).', 'Juice WRLD, on X, 2018'),
      para('He carried it everywhere: tattooed on the back of his right hand and across his left wrist, in his Instagram name, on his merch, on his plane (the 999AIRCRAFT) and in the title of his 2017 EP.', 'C'),
      para('Philosophy in one line: you do not wait for the pain to leave. You turn it into work, and the work becomes the way out.', 'P')
    ]));

    frag.appendChild(chapter('02', 'The artist', [
      para('Jarad Higgins, born December 2, 1998 in Chicago. Stage name Juice WRLD. A debut album at 19 (Goodbye & Good Riddance, triple platinum), a number-one second album at 20 (Death Race for Love, March 2019). He died on December 8, 2019 in Oak Lawn, Illinois, at 21.', 'C'),
      para('He started on a cellphone, recording his first tracks himself, and as a teenager he was the youngest member of a group called Team Imperial, where his freestyles impressed the older members.', 'C')
    ]));

    frag.appendChild(chapter('03', 'The work: in and out, in and out', [
      grid([
        stat('23', 'songs in about 72 hours, in his own words, for Death Race for Love', 'Rolling Stone, 2019'),
        stat('~20', 'songs with producer Hit-Boy in about two weeks. Hit-Boy: “he was sleeping in the studio”', 'Rolling Stone, 2019'),
        stat('3 / night', 'full songs, not sketches, over roughly three weeks at Def Jam in New York', 'Steven Victor, Billboard, 2019'),
        stat('45 min', 'for two songs (“HeMotions” and “Big”) in the same session', 'Rolling Stone, 2019'),
        stat('30 min', 'for one finished vocal session', 'Billboard, 2019'),
        stat('~2,000', 'unreleased songs, reported by unnamed sources. Nobody has verified a final count, and some people say more', 'Digital Music News, 2020')
      ]),
      para('Two sources describe the album’s timeline differently: Rolling Stone has Juice saying most of it came out of about 72 hours, Billboard says it was finished in about five days of near-nonstop sessions in Hollywood. Both agree on the intensity.', 'C'),
      para('Around the world through 2018 and 2019 he kept a heavy touring schedule on top of the studio. In one interview he said he had gone four days without sleeping.', 'C'),
      para('A producer said that as soon as a beat played he did not listen more than five seconds before saying “load it up.” Another said they never saw him actually write.', 'C')
    ]));

    frag.appendChild(chapter('04', 'How he made it', [
      quote('I don’t even write, I’m freestyle everything. It just come out of my soul.', 'Juice WRLD, Clash'),
      para('He freestyled the lyrics instead of writing them, sometimes finishing a whole song in minutes, starting from a beat and the first idea that hit. When he worried he would lose an idea he kept it in a voice memo. Producers have said even “Lucid Dreams” and “All Girls Are the Same” were freestyles, and that he wrote to beats they sent and sent songs back.', 'C'),
      para('The pattern worth noticing: capture first, judge later, keep the volume high, and never wait for a perfect moment.', 'P')
    ]));

    frag.appendChild(chapter('05', 'The Abyss', [
      para('The HBO Max documentary Juice WRLD: Into the Abyss (directed by Tommy Oliver, released December 16, 2021) is built from his own footage. The abyss is the dark place his songs come from, and the place he kept returning to. 999 is the rope out of it.', 'C'),
      para('He was open about the other side of the story. Addiction was part of his life from a young age, and he spoke about it in his own voice:', 'C'),
      quote('When I was getting high at a young age, I’d be scared to tell people. That wasn’t normal.', 'Juice WRLD, New York Times, April 2019'),
      para('Reporting after his death says he agreed to go to rehab shortly before he died, to lower his tolerance rather than to stop. Chris Long, from his circle, said: \u201CHe didn\u2019t want to stop.\u201D', 'C'),
      para('Music and the work were what he kept choosing, even with the risks. That is a reading of what the footage and the people around him describe, not something he said in those words.', 'P'),
      para('On January 22, 2020 the announced cause of death was toxic levels of oxycodone and codeine. He was 21.', 'C'),
      para('Read it honestly: the output and the craft are the part to admire. The pills are not the engine of the music, they are the cost. The same road that fed the volume ended it. His mother, Carmela Wallace, turned that into the Live Free 999 Fund, which helps people struggling with addiction.', 'C')
    ]));

    frag.appendChild(chapter('06', 'What he wanted for the world', [
      quote('I want to be that person that leads people out of the place they’re at.', 'Juice WRLD, Billboard, 2019'),
      quote('When you are creative you can take your demons and put them in the form of a song.', 'Juice WRLD, Clash'),
      quote('I talk about sh*t that other people are scared to talk about.', 'Juice WRLD, Clash'),
      para('He wanted people to say the hard thing out loud, to make something from it and to know they were not alone in it. He also showed that a kid with a phone and an idea can build a whole body of work, and that is why he is an idol to people who create.', 'P')
    ]));

    frag.appendChild(chapter('07', 'Work like Juice in your workspace', [
      list([
        'Capture first: open Voice from the home dock the second an idea shows up. Edit later.',
        'Freestyle your first draft in a new note. Do not stop to fix it.',
        'Work in batches. One session, several notes, then review.',
        'Document the work as you do it. Dates, takes and versions are your own documentary.',
        'Keep your folders in the order you work in: Edit order in the file panel.',
        'Copy the output habits, not the damage. Sleep, eat and get help when you need it. The work needs you alive.'
      ]),
      para('Tag: this section is practical advice built on the sources above, not a quote from him.', 'P')
    ]));

    var src = el('section', 't9-src-list');
    src.appendChild(el('h4', 't9-sh', 'Sources'));
    src.appendChild(list([
      'Clash Magazine interview, “To Infinity: JuiceWRLD Interviewed”',
      'Billboard cover story, 2019, and Billboard 2018 and 2019 interviews',
      'Rolling Stone, “Juice WRLD Proves He’s More Than a One-Hit Wonder on Death Race for Love”, 2019',
      'Complex: Into the Abyss review; interview with the team behind Juice WRLD',
      'Nicki Swift on the meaning of 999 (quoting MTV News); his X post, 2018',
      'Wikipedia: Juice Wrld; Juice Wrld: Into the Abyss',
      'Digital Music News, Jan 29 2020, on the unreleased-song estimate'
    ]));
    src.appendChild(el('p', 't9-fine', 'Spoken words only; no song lyrics. If you can correct a fact, the sources above are where to check it.'));
    frag.appendChild(src);
    return frag;
  }

  var overlay = null;
  var lastFocus = null;

  function close() {
    if (!overlay) return;
    var o = overlay;
    overlay = null;
    o.classList.remove('in');
    o.classList.add('out');
    setTimeout(function () { o.remove(); }, 260);
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* best effort */ } }
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  function open() {
    if (overlay) return;
    lastFocus = document.activeElement;
    var o = el('div', 't9');
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', '999: the story of Juice WRLD');
    var bd = el('div', 't9-bd');
    bd.addEventListener('click', close);
    var card = el('div', 't9-card');
    var x = el('button', 't9-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = LN.icon('x', 18);
    x.addEventListener('click', close);
    var scroll = el('div', 't9-scroll');

    var head = el('header', 't9-head');
    head.appendChild(el('div', 't9-eyebrow', 'Jarad Higgins · 1998–2019'));
    head.appendChild(el('h2', 't9-title', 'JUICE WRLD'));
    head.appendChild(el('p', 't9-sub', 'The 999 story. Read it like a documentary.'));
    scroll.appendChild(head);
    scroll.appendChild(buildStory());

    var foot = el('footer', 't9-foot');
    foot.appendChild(el('p', 't9-end', 'Whatever hell you are going through, flip it. Strategy Over Impulse.'));
    foot.appendChild(logo999());
    foot.appendChild(el('p', 't9-legacy', 'Legends never die.'));
    var done = el('button', 't9-done', 'Back to work');
    done.type = 'button';
    done.addEventListener('click', close);
    foot.appendChild(done);
    scroll.appendChild(foot);

    card.appendChild(x);
    card.appendChild(scroll);
    o.appendChild(bd);
    o.appendChild(card);
    document.getElementById('app').appendChild(o);
    overlay = o;
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function () { o.classList.add('in'); });
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* haptics are optional */ }
    try { x.focus(); } catch (e) { /* best effort */ }
  }

  // ---------- double tap on the logo ----------
  // Two quick taps open the story. A third tap right after cancels it, so the five-tap Bojack egg still works.
  function bind(node) {
    if (!node) return;
    var taps = 0, last = 0, timer = null;
    node.addEventListener('click', function () {
      var now = Date.now();
      taps = now - last < 450 ? taps + 1 : 1;
      last = now;
      if (timer) { clearTimeout(timer); timer = null; }
      if (taps === 2) {
        timer = setTimeout(function () { timer = null; taps = 0; open(); }, 420);
      }
    });
  }

  // ---------- home greeting + work quote ----------
  var hello = null;
  function paintHello() {
    if (!hello) return;
    var d = new Date();
    hello.g.textContent = LN.quotes.greeting(d);
    hello.t.textContent = LN.quotes.timeText(d);
    hello.d.textContent = LN.quotes.dateText(d);
  }
  var qi = -1;
  function nextQuote(step) {
    var pool = LN.quotes.filtered(['w', 'o']);
    if (qi < 0) {
      var c = LN.quotes.current();
      qi = Math.max(0, pool.indexOf(c));
    } else qi = (qi + (step || 1)) % pool.length;
    var q = pool[qi];
    hello.q.textContent = '“' + q.t + '”';
    hello.by.textContent = '— ' + q.by + ' · ' + q.src;
  }
  function build() {
    var wrap = el('div', 'home-hello');
    var g = el('div', 'hh-greet');
    var row = el('div', 'hh-row');
    var t = el('span', 'hh-time');
    var d = el('span', 'hh-date');
    row.appendChild(t);
    row.appendChild(d);
    var w = el('div', 'hh-welcome', 'Welcome back. Keep documenting the work.');
    var qb = el('button', 'hh-quote');
    qb.type = 'button';
    qb.setAttribute('aria-label', 'Next quote');
    var q = el('span', 'hh-q');
    var by = el('span', 'hh-by');
    qb.appendChild(q);
    qb.appendChild(by);
    qb.addEventListener('click', function () { nextQuote(1); });
    wrap.appendChild(g);
    wrap.appendChild(row);
    wrap.appendChild(w);
    wrap.appendChild(qb);
    hello = { root: wrap, g: g, t: t, d: d, q: q, by: by };
    paintHello();
    nextQuote(0);
    setInterval(function () { if (!document.hidden) paintHello(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) paintHello(); });
    return wrap;
  }

  LN.juice = { open: open, close: close, bind: bind, build: build };
})(window.LN = window.LN || {});
