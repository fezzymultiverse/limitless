(function (LN) {
  'use strict';
  // V0.7.20 Juice WRLD words and the time-of-day greeting. Loaded in <head> so the loading screen can use it at once.
  // RULES for this list: spoken words from interviews and his own public posts only. NO song lyrics. Every entry names
  // where it was said. Words from people who worked with him are marked as theirs (by) and are about his work.
  //   t = text, by = who, src = where, k = 'w' (his words on work and making things) | 'o' (about how he worked) | 's' (999 / spirit)

  var LIST = [
    { t: 'I don’t even write, I’m freestyle everything. It just come out of my soul.', by: 'Juice WRLD', src: 'Clash interview', k: 'w' },
    { t: 'When you are creative you can take your demons and put them in the form of a song.', by: 'Juice WRLD', src: 'Clash interview', k: 'w' },
    { t: 'Everything else I made in about 72 hours. I made like 23 songs in those days.', by: 'Juice WRLD, on Death Race for Love', src: 'Rolling Stone, 2019', k: 'w' },
    { t: 'I have songs for the trap house, songs for the sock hop, songs for the Caribbeans, songs for raves, songs for slow dancing.', by: 'Juice WRLD', src: 'Rolling Stone, 2019', k: 'w' },
    { t: 'My new album has no boundaries. I finally found my own style, and it’s the best feeling ever.', by: 'Juice WRLD', src: 'Billboard, 2019', k: 'w' },
    { t: 'I want to be that person that leads people out of the place they’re at.', by: 'Juice WRLD', src: 'Billboard, 2019', k: 's' },
    { t: 'I talk about sh*t that other people are scared to talk about.', by: 'Juice WRLD', src: 'Clash interview', k: 'w' },
    { t: 'Any rap that’s talking about what you’re going through is “emo rap.”', by: 'Juice WRLD', src: 'Billboard, 2019', k: 'w' },
    { t: 'I took the hell I was going through (666) and flipped it over into something positive (999).', by: 'Juice WRLD', src: 'his X account, 2018', k: 's' },
    { t: '999 represents taking whatever hell, whatever bad situation, whatever struggle you’re going through…', by: 'Juice WRLD', src: 'MTV News', k: 's' },
    { t: 'I speak from the standpoint of the true definition of an imperfect person.', by: 'Juice WRLD', src: 'Billboard, 2019', k: 's' },
    { t: 'I was put on this earth for a reason.', by: 'Juice WRLD', src: 'New York Times, April 2019', k: 's' },
    { t: 'I’ve never seen him actually write.', by: 'Rvssian, producer, on working with Juice WRLD', src: 'Rolling Stone, 2019', k: 'o' },
    { t: 'I feel like he’s one of the first people I’ve worked with personally who never runs out.', by: 'Hit-Boy, producer', src: 'Rolling Stone, 2019', k: 'o' },
    { t: 'He records so fast. He records like Future and Young Thug, but better.', by: 'Lil Bibby, on Juice WRLD', src: 'Complex', k: 'o' },
    { t: 'He was doing three songs a night.', by: 'Steven Victor, on Juice WRLD at Def Jam', src: 'Billboard, 2019', k: 'o' }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function greeting(d) {
    d = d || new Date();
    var h = d.getHours();
    if (h >= 5 && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    if (h >= 17 && h < 21) return 'Good Evening';
    return 'Late Night';
  }
  function timeText(d) {
    d = d || new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function dateText(d) {
    d = d || new Date();
    try { return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return d.toDateString(); }
  }

  // A new quote on every launch. Walks the whole list before any repeat. Kept in localStorage, so it survives restarts.
  function launchIndex() {
    var i = 0;
    try { i = parseInt(localStorage.getItem('ln.quote.i') || '-1', 10); } catch (e) { i = -1; }
    if (isNaN(i)) i = -1;
    i = (i + 1) % LIST.length;
    try { localStorage.setItem('ln.quote.i', String(i)); } catch (e) { /* storage blocked: same quote is fine */ }
    return i;
  }
  var launch = null;
  function current() { if (launch === null) launch = launchIndex(); return LIST[launch]; }
  function filtered(kinds) { return LIST.filter(function (q) { return kinds.indexOf(q.k) >= 0; }); }

  LN.quotes = { list: LIST, greeting: greeting, timeText: timeText, dateText: dateText, current: current, filtered: filtered };
})(window.LN = window.LN || {});
