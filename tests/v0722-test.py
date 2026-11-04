# V0.7.22 browser test at 390x780 (phone). Needs Python Playwright, python-pptx, python-docx, openpyxl, reportlab and:
#   python3 -m http.server 8765 --directory www
# The AI provider is mocked (LN.ai.ask / LN.ai.configured are replaced), so no key or network is used.
import base64, math, os, struct, tempfile, wave
from playwright.sync_api import sync_playwright

TMP = os.environ.get('TMPDIR') or tempfile.gettempdir()
FX = os.path.join(TMP, 'ln0722-fx'); os.makedirs(FX, exist_ok=True)
SHOTS = os.environ.get('SHOTS', os.path.join(TMP, 'ln0722-shots')); os.makedirs(SHOTS, exist_ok=True)
URL = os.environ.get('LN_URL', 'http://localhost:8765/index.html')
res, errs = [], []

def ok(name, cond, info=''):
    res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(info) if (info and not cond) else ''))

def make_fixtures():
    from pptx import Presentation
    from pptx.util import Inches
    import docx, openpyxl
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4, landscape
    p = Presentation(); p.slide_width = Inches(13.333); p.slide_height = Inches(7.5)
    for i in range(5):
        s = p.slides.add_slide(p.slide_layouts[1]); s.shapes.title.text = 'Slide %d' % (i + 1); s.placeholders[1].text = 'Point one\nPoint two'
    p.save(FX + '/deck.pptx')
    c = canvas.Canvas(FX + '/mixed.pdf')
    for i in range(6):
        c.setPageSize(landscape(A4) if i == 2 else A4); c.setFont('Helvetica', 28); c.drawString(60, 500, 'Page %d' % (i + 1)); c.showPage()
    c.save()
    d = docx.Document()
    for i in range(30): d.add_paragraph('Paragraph %d. ' % i + 'Words ' * 25)
    d.save(FX + '/doc.docx')
    wb = openpyxl.Workbook(); ws = wb.active
    for r in range(1, 40): ws.append(['Row %d' % r, r, r * 2, 'text'])
    wb.save(FX + '/sheet.xlsx')
    with wave.open(FX + '/tone.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
        w.writeframes(b''.join(struct.pack('<h', int(8000 * math.sin(2 * math.pi * 440 * t / 8000))) for t in range(8000 * 4)))

def b64(p): return base64.b64encode(open(p, 'rb').read()).decode()

JS_OPEN = """async ([n,d])=>{const u=Uint8Array.from(atob(d),c=>c.charCodeAt(0));const f=await LN.vault.importFile(n,null,u);LN.tabs.open(f.id);return f.id}"""
JS_NOTE = """async ([n,t])=>{const f=await LN.vault.importFile(n,null,t);LN.tabs.open(f.id);return f.id}"""

make_fixtures()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 390, 'height': 780}, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL)
    pg.wait_for_function('window.LN && LN.vault && LN.tabs && LN.noteai && LN.soundtrack && LN.vertical', timeout=20000)
    pg.wait_for_selector('#vault-loading', state='hidden', timeout=20000)

    # ---------- vertical viewing ----------
    H = "document.querySelector('.slide-wrap, .pdf-wrap, .doc-wrap, .tbl-wrap')"
    for name, sel in (('deck.pptx', '.slide-wrap'), ('mixed.pdf', '.pdf-wrap')):
        pg.evaluate(JS_OPEN, [name, b64(FX + '/' + name)]); pg.wait_for_timeout(2500)
        m = pg.evaluate("""(sel)=>{const w=document.querySelector(sel);const c=document.getElementById('attachment-preview');const bar=document.querySelector('.preview .vw-bar');
          return {h:w.clientHeight,cardH:c.offsetHeight,slim:c.classList.contains('slim'),docW:document.documentElement.scrollWidth,barOver:bar.scrollWidth>bar.clientWidth+1,wrapOver:w.scrollWidth>w.clientWidth+1}}""", sel)
        ok(name + ': file card is one slim line', m['slim'] and m['cardH'] < 60, m)
        ok(name + ': document area is at least 560 px tall', m['h'] >= 560, m)
        ok(name + ': nothing scrolls sideways', m['docW'] == 390 and not m['wrapOver'], m)
        ok(name + ': whole toolbar fits without sideways scroll', not m['barOver'], m)
        pg.screenshot(path=SHOTS + '/' + name.replace('.', '_') + '.png')
    pg.evaluate(JS_OPEN, ['deck.pptx', b64(FX + '/deck.pptx')]); pg.wait_for_timeout(2500)
    # Full on slides, then Back closes it
    pg.evaluate("[...document.querySelectorAll('.vw-bar button')].find(b=>b.textContent==='Full').click()"); pg.wait_for_timeout(300)
    r = pg.evaluate("(()=>{const e=document.querySelector('.preview.pdf-full');if(!e)return null;const b=e.getBoundingClientRect();return [b.left,b.top,b.width,b.height]})()")
    ok('pptx: Full covers the whole screen', r and r[2] == 390 and r[3] == 780, r)
    pg.screenshot(path=SHOTS + '/deck_full.png')
    ok('pptx: phone Back closes Full', pg.evaluate("window.LNBack()") == 1 and pg.evaluate("!document.querySelector('.preview.pdf-full')"))
    # pinch: two fingers moving apart zooms in (slides get wider than the screen)
    w0 = pg.evaluate("document.querySelector('.slide').getBoundingClientRect().width")
    pg.evaluate("""(()=>{const e=document.querySelector('.preview.vw');const mk=(x,y,i)=>new Touch({identifier:i,target:e,clientX:x,clientY:y});
      e.dispatchEvent(new TouchEvent('touchstart',{touches:[mk(150,400,1),mk(240,400,2)],bubbles:true}));
      e.dispatchEvent(new TouchEvent('touchmove',{touches:[mk(60,400,1),mk(330,400,2)],bubbles:true,cancelable:true}));
      e.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true}));})()""")
    pg.wait_for_timeout(300)
    w1 = pg.evaluate("document.querySelector('.slide').getBoundingClientRect().width")
    ok('pptx: pinch out zooms in', w1 > w0 * 1.3, (w0, w1))
    pg.evaluate("[...document.querySelectorAll('.vw-bar button')].find(b=>b.textContent==='-').click()")
    for name in ('doc.docx', 'sheet.xlsx'):
        pg.evaluate(JS_OPEN, [name, b64(FX + '/' + name)]); pg.wait_for_timeout(2000)
        ok(name + ': has a Full button and slim card', pg.evaluate("!![...document.querySelectorAll('.vw-bar button')].find(b=>b.textContent==='Full')") and pg.evaluate("document.getElementById('attachment-preview').classList.contains('slim')"))
        pg.screenshot(path=SHOTS + '/' + name.replace('.', '_') + '.png')

    # ---------- AI actions (mocked provider) ----------
    pg.evaluate("""(()=>{window.__calls=[];LN.ai.configured=()=>true;LN.store.set('aiConfirm',false);
      LN.ai.ask=(msgs,o)=>{window.__calls.push({system:o.system,user:msgs[0].content});
        const s=o.system;
        if(/TL;DR/.test(s)) return Promise.resolve('Here you go:\\n- First point **bold**\\n- Second point\\n* Third point\\n- Fourth ignored');
        if(/extract tasks/.test(s)) return Promise.resolve('- [ ] Call Sam\\n- [ ] Book the venue\\n- [ ] Call Sam');
        if(/continue the text/.test(s)) return Promise.resolve('the rest of the sentence. And one more line.');
        if(/tag notes/.test(s)) return Promise.resolve('#Code #Research, security #Work');
        return Promise.reject(new Error('unexpected'));}})()""")
    body = 'Call Sam about the venue and then book it. Remember the budget must stay low. The meeting went well and we'
    pg.evaluate(JS_NOTE, ['ai-note.md', body]); pg.wait_for_timeout(800)
    ok('AI strip shows on a text note', pg.evaluate("!document.getElementById('noteai').hidden"))
    click = lambda a: pg.evaluate("(a)=>document.querySelector('#noteai [data-a=\"'+a+'\"]').click()", a)
    val = lambda: pg.evaluate("document.getElementById('editor').value")
    click('sum'); pg.wait_for_timeout(500)
    v = val()
    ok('Summarize: 3-bullet TL;DR at the top', v.startswith('> **TL;DR**\n> - First point bold\n> - Second point\n> - Third point\n\nCall Sam'), v[:120])
    click('sum'); pg.wait_for_timeout(500)
    ok('Summarize again replaces the block, no duplicate', val().count('TL;DR') == 1, val()[:200])
    sent = pg.evaluate("window.__calls[1].user")
    ok('Summarize does not send the old TL;DR back to the AI', 'TL;DR' not in sent)
    click('tasks'); pg.wait_for_timeout(500)
    v = val()
    ok('Extract tasks: clean checklist at the end, duplicates dropped', v.rstrip().endswith('## Tasks\n- [ ] Call Sam\n- [ ] Book the venue') and v.count('- [ ] Call Sam') == 1, v[-120:])
    click('tasks'); pg.wait_for_timeout(500)
    ok('Extract tasks again adds nothing already there', val().count('- [ ] Book the venue') == 1)
    pg.evaluate("(()=>{const t=document.getElementById('editor');const i=t.value.indexOf('and we')+6;t.setSelectionRange(i,i);})()")
    click('cont'); pg.wait_for_timeout(500)
    ok('Continue inserts at the cursor with a space', 'and we the rest of the sentence. And one more line.' in val(), val()[-200:])
    ok('Continue sent only the text before the cursor', pg.evaluate("!window.__calls[window.__calls.length-1].user.includes('## Tasks')"))
    click('tags'); pg.wait_for_selector('.noteai-sheet', timeout=3000)
    chips = pg.evaluate("[...document.querySelectorAll('.noteai-chips button')].map(b=>b.textContent)")
    ok('Auto-tag suggests clean tags', chips == ['#Code', '#Research', '#Security', '#Work'], chips)
    pg.screenshot(path=SHOTS + '/tag_sheet.png')
    pg.evaluate("[...document.querySelectorAll('.noteai-chips button')][3].click()")
    pg.evaluate("document.querySelector('.noteai-row .go').click()"); pg.wait_for_timeout(400)
    ok('Auto-tag puts the ticked tags on the last line', val().rstrip().endswith('#Code #Research #Security') and not pg.evaluate("!!document.querySelector('.noteai-sheet')"), val()[-80:])
    pg.evaluate("(()=>{LN.ai.ask=()=>Promise.reject(new Error('Bad key'));})()")
    click('sum'); pg.wait_for_timeout(500)
    ok('A failed AI call re-enables the buttons and keeps the note', pg.evaluate("!document.querySelector('#noteai [data-a=sum]').disabled") and val().count('TL;DR') == 1)
    pg.evaluate("(()=>{LN.ai.configured=()=>false;})()")
    before = val(); click('tasks'); pg.wait_for_timeout(300)
    ok('No AI key: note untouched', val() == before)
    pg.evaluate("(()=>{LN.ai.configured=()=>true;})()")

    # ---------- soundtrack ----------
    pg.evaluate(JS_NOTE, ['song-note.md', '---\ntitle: Song\n---\nBody text here\n']); pg.wait_for_timeout(700)
    ok('player hidden when the note has no soundtrack', pg.evaluate("document.getElementById('soundtrack').hidden"))
    with pg.expect_file_chooser() as fc:
        pg.evaluate("document.querySelector('#noteai [data-a=audio]').click()")
    fc.value.set_files(FX + '/tone.wav'); pg.wait_for_timeout(1500)
    v = val()
    ok('Add audio writes one soundtrack line after the frontmatter', v == '---\ntitle: Song\n---\nsoundtrack:: tone.wav\nBody text here\n', repr(v))
    ok('audio file is saved in Attachments/Music', pg.evaluate("LN.vault.all().some(n=>n.name==='tone.wav'&&n.bytes&&LN.vault.get(n.parent).name==='Music')"))
    ok('player is visible with the file name', pg.evaluate("!document.getElementById('soundtrack').hidden && document.querySelector('.st-name').textContent==='tone.wav'"))
    pg.wait_for_timeout(500)
    pg.screenshot(path=SHOTS + '/soundtrack_idle.png')
    pg.evaluate("document.querySelector('.st-play').click()"); pg.wait_for_timeout(1400)
    st = pg.evaluate("(()=>{const a=document.querySelector('#soundtrack');return {label:a.querySelector('.st-play').getAttribute('aria-label'),time:a.querySelector('.st-time').textContent,range:+a.querySelector('input').value}})()")
    ok('Play starts the audio, progress moves', st['label'] == 'Pause' and st['range'] > 0 and not st['time'].startswith('0:00 /'), st)
    pg.screenshot(path=SHOTS + '/soundtrack_playing.png')
    pg.evaluate("(()=>{const r=document.querySelector('#soundtrack input');r.value=900;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));})()"); pg.wait_for_timeout(300)
    ok('Dragging the progress bar seeks', pg.evaluate("document.querySelector('.st-time').textContent.startsWith('0:03') || document.querySelector('.st-time').textContent.startsWith('0:04') || document.querySelector('.st-time').textContent.startsWith('0:00')"))
    pg.evaluate("document.querySelector('.st-play').click()"); pg.wait_for_timeout(200)
    ok('Pause works', pg.evaluate("document.querySelector('.st-play').getAttribute('aria-label')==='Play'"))
    # switching notes stops and hides it
    pg.evaluate(JS_NOTE, ['plain.md', 'no music here']); pg.wait_for_timeout(1000)
    ok('player hides on a note without a soundtrack', pg.evaluate("document.getElementById('soundtrack').hidden"))
    pg.evaluate("LN.tabs.open(LN.vault.all().find(n=>n.name==='song-note.md').id)"); pg.wait_for_timeout(1000)
    ok('player comes back when the note is reopened', pg.evaluate("!document.getElementById('soundtrack').hidden"))
    pg.evaluate("document.querySelector('.st-rm').click()"); pg.wait_for_timeout(500)
    ok('Remove takes the line out and hides the player, file stays', val() == '---\ntitle: Song\n---\nBody text here\n' and pg.evaluate("document.getElementById('soundtrack').hidden && LN.vault.all().some(n=>n.name==='tone.wav')"), repr(val()))
    # strip and player never show on a PDF
    pg.evaluate(JS_OPEN, ['mixed2.pdf', b64(FX + '/mixed.pdf')]); pg.wait_for_timeout(1500)
    ok('AI strip and player hidden on a PDF', pg.evaluate("document.getElementById('noteai').hidden && document.getElementById('soundtrack').hidden"))

    ok('no console errors', not errs, errs[:5])
    b.close()
print('%d/%d passed' % (sum(res), len(res)))
raise SystemExit(0 if all(res) else 1)
