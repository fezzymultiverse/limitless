// Headless smoke test for the V0.7.5 key vault at 360 px. Needs Playwright for Node. Run: node tests/smoke-keys.js
var http=require('http'),fs=require('fs'),path=require('path');
var root=require('path').join(__dirname,'..','www');
var types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'};
var srv=http.createServer(function(q,r){var p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';var f=path.join(root,p);fs.readFile(f,function(e,d){if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8766);
var pw=require('playwright');
var G1='gsk_'+'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6';
var G2='gsk_'+'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4';
var A1='AIza'+'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
(async function(){
  var b=await pw.chromium.launch();
  var ctx=await b.newContext({viewport:{width:360,height:780},deviceScaleFactor:2});
  var page=await ctx.newPage();
  var errs=[];
  page.on('console',function(m){if(m.type()==='error')errs.push(m.text());});
  page.on('pageerror',function(e){errs.push('PAGEERR '+e.message);});
  await page.route('https://api.groq.com/**',function(route){
    var h=route.request().headers();var auth=h['authorization']||'';
    var cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'*'};
    if(route.request().method()==='OPTIONS'){return route.fulfill({status:204,headers:cors});}
    if(auth.indexOf(G2)>=0) return route.fulfill({status:401,headers:cors,contentType:'application/json',body:JSON.stringify({error:{message:'Invalid API Key'}})});
    return route.fulfill({status:200,headers:Object.assign({'x-ratelimit-limit-requests':'14400','x-ratelimit-remaining-requests':'14210','x-ratelimit-limit-tokens':'6000','x-ratelimit-remaining-tokens':'5800'},cors),contentType:'application/json',body:JSON.stringify({data:[{id:'llama-3.3-70b-versatile'},{id:'llama-3.1-8b-instant'}],choices:[{message:{content:'ready'}}]})});
  });
  await page.route('https://generativelanguage.googleapis.com/**',function(route){
    var cors={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
    if(route.request().method()==='OPTIONS'){return route.fulfill({status:204,headers:cors});}
    return route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}],candidates:[{content:{parts:[{text:'ready'}]}}]})});
  });
  await page.goto('http://localhost:8766/');
  await page.waitForSelector('#btn-settings');
  await page.waitForTimeout(1200);
  await page.click('#btn-settings');
  await page.click('text=AI >> nth=0');
  await page.waitForTimeout(300);
  await page.screenshot({path:require('os').tmpdir()+'/ln-shot-settings_ai.png'});
  await page.click('text=Open API key vault');
  await page.waitForSelector('.kv-add textarea');
  var doc='Notes\nGROQ_API_KEY='+G1+'\nbackup groq: '+G2+'\n| Gemini main | '+A1+' |\nopenai '+('sk-proj-'+'abcdefghijklmnopqrstuvwxyz0123456789ABCD')+'\n';
  await page.evaluate(function(d){var ta=document.querySelector('.kv-add textarea');ta.value=d;ta.dispatchEvent(new Event('paste',{bubbles:true}));},doc);
  await page.waitForTimeout(2500);
  var res=await page.textContent('.kv-res');
  console.log('RESULT:',res);
  await page.screenshot({path:require('os').tmpdir()+'/ln-shot-vault.png'});
  // upload a file with keys
  await page.setInputFiles('.kv-add input[type=file]',{name:'keys.env',mimeType:'text/plain',buffer:Buffer.from('X='+'AIza'+'SyZ9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J\n'+G1+'\n')});
  await page.waitForTimeout(1500);
  console.log('UPLOAD:',await page.textContent('.kv-res'));
  await page.click('text=Test all');
  await page.waitForTimeout(2500);
  await page.evaluate(function(){document.querySelector('.sheet-body').scrollTop=0;});
  await page.screenshot({path:require('os').tmpdir()+'/ln-shot-vault2.png'});
  var rows=await page.$$eval('.kv-key',function(r){return r.map(function(x){return x.innerText.replace(/\n+/g,' | ');});});
  console.log(rows.join('\n'));
  var over=await page.evaluate(function(){return document.documentElement.scrollWidth>window.innerWidth||document.querySelector('.sheet-body').scrollWidth>document.querySelector('.sheet-body').clientWidth;});
  console.log('HORIZONTAL OVERFLOW:',over);
  console.log('ERRORS:',JSON.stringify(errs));
  await b.close();srv.close();
})().catch(function(e){console.log('SMOKE FAIL',e.message);process.exit(1);});
