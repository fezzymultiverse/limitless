// Headless smoke test for V0.7.6 stage 2 (image viewer, media embeds, music extras) at 360 px. Needs Playwright for Node. Run: node tests/smoke-media.js
var http=require('http'),fs=require('fs'),path=require('path');
var root=path.join(__dirname,'..','www');
var types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'};
var srv=http.createServer(function(q,r){var p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';var f=path.join(root,p);fs.readFile(f,function(e,d){if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8767);
var pw=require('playwright');
(async function(){
  var b=await pw.chromium.launch();
  var page=await (await b.newContext({viewport:{width:360,height:780}})).newPage();
  var errs=[],fails=0;
  page.on('console',function(m){if(m.type()==='error')errs.push(m.text());});
  page.on('pageerror',function(e){errs.push('PAGEERR '+e.message);});
  function ok(c,m){console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;}
  await page.goto('http://localhost:8767/');
  await page.waitForSelector('#btn-settings');
  await page.waitForTimeout(1200);
  // two PNGs in the vault root, one wav embedded in a note
  await page.evaluate(async function(){
    function png(color,w,h){var c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);return new Promise(function(r){c.toBlob(function(bl){bl.arrayBuffer().then(function(a){r(new Uint8Array(a));});});});}
    var a=await png('#ff6a00',120,60), b2=await png('#5fff00',80,80);
    await LN.vault.importFile('a.png',null,a); await LN.vault.importFile('b.png',null,b2);
    var wav=new Uint8Array(44+800);var dv=new DataView(wav.buffer);
    function s(o,t){for(var i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i));}
    s(0,'RIFF');dv.setUint32(4,36+800,true);s(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,8000,true);dv.setUint32(28,8000,true);dv.setUint16(32,1,true);dv.setUint16(34,8,true);s(36,'data');dv.setUint32(40,800,true);
    await LN.vault.importFile('beep.wav',null,wav);
    await LN.vault.importFile('n.md',null,'# Hi\n\n![[a.png]]\n\n![[beep.wav]]\n');
  });
  var ids=await page.evaluate(function(){return LN.vault.children(null).map(function(n){return n.id+'|'+n.name;});});
  var id=function(nm){return (ids.filter(function(x){return x.split('|')[1]===nm;})[0]||'').split('|')[0];};
  // image viewer
  await page.evaluate(function(i){LN.tabs.open(i);},id('a.png'));
  await page.waitForSelector('.img-view');
  await page.waitForTimeout(500);
  var t1=await page.textContent('.vw-note');
  ok(/1\/2/.test(t1)&&/120 × 60/.test(t1),'viewer shows 1/2 and size: '+t1);
  await page.click('button[aria-label="Next image"]');
  await page.waitForTimeout(300);
  var t2=await page.textContent('.vw-note');
  ok(/2\/2/.test(t2)&&/80 × 80/.test(t2),'next image: '+t2);
  await page.click('button[aria-label="Previous image"]');
  await page.waitForTimeout(300);
  await page.click('button[aria-label="Rotate right"]');
  await page.waitForTimeout(600);
  var t3=await page.textContent('.vw-note');
  ok(/60 × 120/.test(t3)&&/90°/.test(t3),'rotate right swaps dimensions: '+t3);
  await page.click('button[aria-label="Zoom in"]');
  ok((await page.textContent('button[aria-label="Fit to screen"]'))!=='Fit','zoom changes label');
  await page.click('button:has-text("Slideshow")');
  await page.waitForTimeout(3600);
  var t4=await page.textContent('.vw-note');
  ok(/2\/2/.test(t4),'slideshow advanced: '+t4);
  await page.click('button:has-text("Stop")');
  ok(await page.$('button:has-text("Slideshow")')!==null,'slideshow stops');
  // media embed in a note
  await page.evaluate(function(i){LN.tabs.open(i);},id('n.md'));
  await page.waitForTimeout(400);
  var seg=await page.$('text=Preview');
  if(seg) await seg.click();
  await page.waitForTimeout(600);
  ok(await page.$('.preview audio.embed-media')!==null,'audio embed renders a player');
  ok(await page.$('.preview img[src^="blob:"]')!==null,'image embed renders');
  // music extras
  await page.evaluate(function(){LN.store.set('musicList',[{id:'x1',name:'one.mp3',kind:'scan',uri:'x'},{id:'x2',name:'two.flac',kind:'scan',uri:'y'}]);LN.music.init();LN.music.open();});
  await page.waitForSelector('.music-speed');
  await page.click('.music-speed');
  ok((await page.textContent('.music-speed'))==='1.25×','speed cycles to 1.25×: '+await page.textContent('.music-speed'));
  await page.click('.music-sleep');
  ok(/Sleep 1[45]m/.test(await page.textContent('.music-sleep')),'sleep timer 15 min: '+await page.textContent('.music-sleep'));
  await page.click('.music-sleep'); await page.click('.music-sleep'); await page.click('.music-sleep');
  ok((await page.textContent('.music-sleep'))==='Sleep','sleep timer cycles back to off');
  await page.fill('.music-find','two');
  ok((await page.$$('.music-row')).length===1,'search filters list to 1');
  await page.fill('.music-find','zzz');
  ok(await page.$('.music-list .set-empty')!==null,'search shows empty message');
  var sets=await page.evaluate(function(){return [LN.store.get('musicSpeed')];});
  ok(sets[0]===1.25,'speed saved');
  await page.screenshot({path:require('os').tmpdir()+'/ln-shot-music.png'});
  var bad=errs.filter(function(e){return !/Failed to load resource/.test(e);});
  ok(bad.length===0,'no console errors '+JSON.stringify(bad));
  var ov=await page.evaluate(function(){return document.documentElement.scrollWidth>document.documentElement.clientWidth;});
  ok(!ov,'no horizontal overflow');
  await b.close();srv.close();
  console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})();
