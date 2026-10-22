// Chromium smoke test at 360 px for the Recycle bin. Needs Playwright for Node and:
//   python3 -m http.server 8765 --directory www
'use strict';
var pw = require('playwright');
var errs = [], res = [];
function ok(n, c, x) { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' :: ' + JSON.stringify(x) : '')); }
(async function () {
  var b = await pw.chromium.launch();
  var pg = await (await b.newContext({ viewport: { width: 360, height: 740 } })).newPage();
  pg.on('console', function (m) { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', function (e) { errs.push('PAGEERR ' + e); });
  pg.on('dialog', function (d) { d.accept(); });
  await pg.goto('http://localhost:8765/index.html');
  await pg.waitForFunction('window.LN && LN.bin && LN.vault && LN.vault.all().length>0');
  ok('loads with no console errors', !errs.length, errs);
  await pg.click('#btn-menu');
  // select a seeded file and delete through the real button
  var id = await pg.evaluate('LN.vault.all().find(n=>n.name==="Shortcuts.md").id');
  await pg.evaluate('LN.tree.select("' + id + '")');
  await pg.click('#t-delete');
  await pg.waitForFunction('LN.vault.binCount()===1');
  ok('delete moved it to the bin', await pg.evaluate('!LN.vault.get("' + id + '")'));
  ok('toast has an Undo button', await pg.isVisible('.toast .toast-act'));
  ok('badge shows 1', (await pg.textContent('.bin-badge')) === '1');
  await pg.screenshot({ path: '/tmp/bin-toast.png' });
  await pg.click('.toast .toast-act');
  await pg.waitForFunction('LN.vault.binCount()===0');
  ok('Undo restored it to Welcome', await pg.evaluate('LN.vault.path("' + id + '")') === 'Welcome/Shortcuts.md');
  // folder delete, then use the screen
  var fid = await pg.evaluate('LN.vault.all().find(n=>n.name==="Welcome").id');
  await pg.evaluate('LN.tree.select("' + fid + '")');
  await pg.click('#t-delete');
  await pg.waitForFunction('LN.vault.binCount()===1');
  await pg.evaluate('LN.tabs.closeMany([])');
  await pg.click('.vault-bin');
  await pg.waitForSelector('.bin-row');
  var txt = await pg.innerText('.ai-sheet .sheet-body');
  ok('screen lists the folder with details', /Welcome/.test(txt) && /2 items inside/.test(txt) && /Goes in 30 days/.test(txt), txt);
  await pg.screenshot({ path: '/tmp/bin-sheet.png' });
  await pg.click('.bin-row button:has-text("Preview")');
  ok('preview lists contents', /Start here\.md/.test(await pg.innerText('.ai-sheet:last-of-type .sheet-body')));
  await pg.click('.ai-sheet:last-of-type .sheet-x');
  await pg.click('.bin-row button:has-text("Restore")');
  await pg.waitForFunction('LN.vault.binCount()===0');
  ok('folder restored with children', await pg.evaluate('LN.vault.all().filter(n=>/^Welcome/.test(LN.vault.path(n.id))).length') === 3);
  ok('empty state shown', /Nothing here/.test(await pg.innerText('.ai-sheet .sheet-body')));
  await pg.click('.ai-sheet .sheet-x');
  // bin off = permanent
  await pg.evaluate('LN.store.set("binOn", false)');
  var sid = await pg.evaluate('LN.vault.all().find(n=>n.name==="hello.sh").id');
  await pg.evaluate('LN.tree.select("' + sid + '")');
  await pg.click('#t-delete');
  await pg.waitForFunction('!LN.vault.get("' + sid + '")');
  ok('bin off deletes for good', await pg.evaluate('LN.vault.binCount()') === 0);
  await pg.evaluate('LN.store.set("binOn", true)');
  // survives reload
  var kid = await pg.evaluate('LN.vault.all().find(n=>n.name==="sample.csv").id');
  await pg.evaluate('LN.tree.select("' + kid + '")');
  await pg.click('#t-delete');
  await pg.waitForFunction('LN.vault.binCount()===1');
  await pg.reload();
  await pg.waitForFunction('window.LN && LN.bin && LN.vault.all().length>0');
  ok('bin survives reload, hidden from tree', await pg.evaluate('LN.vault.binCount()') === 1 && !(await pg.evaluate('LN.vault.search("sample").length')));
  // settings page + tools row
  await pg.evaluate('LN.settings.open("bin")');
  var st = await pg.innerText('.settings-sheet .sheet-body');
  ok('settings page', /Use the Recycle bin/.test(st) && /Empty items after/.test(st) && /1 item/.test(st), st.slice(0, 200));
  await pg.screenshot({ path: '/tmp/bin-settings.png' });
  await pg.evaluate('LN.settings.close()');
  await pg.evaluate('LN.tools.open()');
  ok('tools sheet has Recycle bin', /Recycle bin/.test(await pg.innerText('.ai-sheet .sheet-body')));
  var rep = await pg.evaluate('LN.diag.report()');
  ok('diagnostics report mentions the bin', /Recycle bin: on/.test(rep), rep.slice(0, 300));
  // no horizontal overflow at 360
  ok('no sideways scroll', await pg.evaluate('document.documentElement.scrollWidth<=360'));
  ok('no console errors at the end', !errs.length, errs);
  await b.close();
  process.exit(res.every(Boolean) ? 0 : 1);
})().catch(function (e) { console.log('CRASH', e); process.exit(1); });
