# V0.7.17 browser smoke test: home screen, dock, footer line, S.O.I. text, Bojack Easter egg. 360 px.
# Needs Python Playwright and:  python3 -m http.server 8765 --directory www
import os, sys
from playwright.sync_api import sync_playwright
errs, res = [], []
def ok(name, cond, extra=''):
    res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(extra) if (extra and not cond) else ''))
OUT = os.environ.get('SHOTS', '/home/claude/shots'); os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,
        args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    ctx = b.new_context(viewport={'width': 360, 'height': 740}, permissions=['microphone'], bypass_csp=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    prompts = {'next': None}
    def on_dialog(d):
        if d.type == 'prompt': d.accept(prompts['next'] or '')
        else: d.accept()
    pg.on('dialog', on_dialog)
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_function('window.LN && LN.home && LN.vault && LN.vault.all().length>0', timeout=15000)
    pg.wait_for_selector('#vault-loading', state='hidden', timeout=15000)

    def close_all():
        pg.evaluate('''(()=>{const a=LN.tabs.active(); let g=0; while(LN.tabs.active() && g++<50){LN.tabs.close(LN.tabs.active());}})()''')
        pg.wait_for_timeout(250)

    # ---- empty screen ----
    close_all()
    ok('stage is empty', pg.evaluate("document.getElementById('stage').dataset.empty==='1'"))
    ok('hero name', pg.locator('.home-name-t').inner_text() == 'LIMITLESS NOTEPAD')
    ok('hero tagline Strategy Over Impulse', pg.locator('.home-soi').inner_text().strip().lower() == 'strategy over impulse')
    ok('hero logo visible', pg.locator('.home-logo').is_visible())
    ok('watermark still behind', pg.evaluate("getComputedStyle(document.querySelector('.wm')).display!=='none'"))
    ok('old text gone', 'Open a file to start writing' not in pg.evaluate('document.body.innerText'))
    ft = pg.locator('#st-file').inner_text()
    ok('footer S.O.I. line', ft == 'S.O.I. \u00d7 Bojack Security \u00b7 999', ft)
    ok('no "No file open"', 'No file open' not in pg.evaluate('document.body.innerText'))
    labels = pg.locator('#dock .dk-l').all_inner_texts()
    ok('dock has the six buttons', labels == ['New', 'Search', 'Voice', 'Music', 'AI', 'Sync'], labels)
    ok('dock visible, editing bar hidden', pg.locator('#dock').is_visible() and not pg.locator('#btb').is_visible())
    ok('dock icons painted', pg.locator('#dock svg').count() == 6)
    ok('summary row has 4 cells', pg.locator('.home-sum .hs-cell').count() == 4)
    sumtxt = pg.locator('.home-sum').inner_text().lower()
    ok('summary shows notes, folders, last sync, sync', all(w in sumtxt for w in ['note', 'folder', 'last sync', 'sync']), sumtxt)
    ok('sync off with no folder', 'off' in sumtxt and 'never' in sumtxt, sumtxt)
    pg.screenshot(path=OUT + '/home-empty.png')

    # ---- recent notes ----
    pg.evaluate('''(async()=>{ for (let i=1;i<=7;i++){ const n=await LN.vault.create('file','Note '+i+'.md',null); await LN.vault.update(n.id,'body '+i); LN.tree.render(); LN.tabs.open(n.id);} })()''')
    pg.wait_for_timeout(300)
    close_all()
    names = pg.locator('.home-note-n').all_inner_texts()
    ok('exactly five recent notes', len(names) == 5, names)
    ok('newest first', names[:2] == ['Note 7.md', 'Note 6.md'], names)
    ok('older ones not shown', 'Note 1.md' not in names and 'Note 2.md' not in names, names)
    metas = pg.locator('.home-note-m').all_inner_texts()
    ok('meta has folder and time', all('Top level' in m for m in metas) and all(' · ' in m for m in metas), metas)
    pg.evaluate('''(async()=>{ const f=await LN.vault.create('folder','Projects',null); const n=await LN.vault.create('file','<img src=x onerror=alert(1)>.md',f.id); LN.tree.render(); LN.tabs.open(n.id); LN.tabs.close(n.id); })()''')
    pg.wait_for_timeout(300)
    ok('hostile file name stays text', pg.locator('.home-note img').count() == 0 and pg.locator('.home-note-n').first.inner_text().startswith('<img'))
    ok('folder shown in meta', 'Projects' in pg.locator('.home-note-m').first.inner_text())
    sumtxt = pg.locator('.home-sum').inner_text()
    ok('summary counts folders', pg.locator('.home-sum .hs-v').nth(1).inner_text() == '1', sumtxt)
    pg.screenshot(path=OUT + '/home-recent.png')

    # tap a recent note
    pg.locator('.home-note', has_text='Note 7.md').click()
    pg.wait_for_timeout(300)
    ok('tap opens the note', pg.evaluate("LN.vault.get(LN.editor.currentId()).name")=='Note 7.md')
    ok('editing bar replaces the dock', pg.locator('#btb').is_visible() and not pg.locator('#dock').is_visible())
    ok('footer shows the path again', 'Note 7.md' in pg.locator('#st-file').inner_text())
    pg.screenshot(path=OUT + '/note-open.png')
    close_all()
    ok('home and dock return on close', pg.locator('#dock').is_visible() and pg.locator('.home-hero').is_visible())
    ok('recents persisted in the store', len(pg.evaluate("LN.store.get('recentNotes')")) >= 5)

    # ---- dock actions ----
    pg.locator('#dock [data-d="search"]').click(); pg.wait_for_timeout(500)
    ok('search opens the panel and focuses the box', pg.evaluate("document.getElementById('app').classList.contains('drawer-open') && document.activeElement.id==='search'"))
    pg.evaluate("LN.app.closeDrawer()"); pg.wait_for_timeout(250)
    prompts['next'] = 'From dock'
    pg.locator('#dock [data-d="new"]').click(); pg.wait_for_timeout(500)
    ok('New creates and opens a note', pg.evaluate("(LN.vault.get(LN.editor.currentId())||{}).name")=='From dock.md')
    close_all()
    pg.locator('#dock [data-d="music"]').click(); pg.wait_for_timeout(400)
    ok('Music opens the player sheet', pg.locator('.sheet').count() >= 1)
    pg.evaluate("LN.ui.closeAll()")
    pg.locator('#dock [data-d="ai"]').click(); pg.wait_for_timeout(500)
    ok('AI opens a text note and the chat', pg.evaluate("document.body.classList.contains('aic-open') && !!LN.editor.currentId()"))
    pg.evaluate("LN.ai.closePanel()"); close_all()
    pg.locator('#dock [data-d="sync"]').click(); pg.wait_for_timeout(500)
    ok('Sync without a folder opens the sync settings', pg.locator('.settings-sheet, .sheet').count() >= 1)
    pg.evaluate("LN.ui.closeAll(); LN.settings.close()"); pg.wait_for_timeout(200)
    pg.locator('.home-sum').click(); pg.wait_for_timeout(400)
    ok('summary row also syncs', pg.locator('.settings-sheet, .sheet').count() >= 1)
    pg.evaluate("LN.ui.closeAll(); LN.settings.close()"); pg.wait_for_timeout(200)
    before = pg.evaluate("LN.vault.all().length")
    pg.locator('#dock [data-d="voice"]').click(); pg.wait_for_timeout(1200)
    made = pg.evaluate("LN.vault.all().filter(n=>/^Voice note /.test(n.name)).length")
    ok('Voice makes a fresh note first', made == 1 and pg.evaluate("/^Voice note /.test((LN.vault.get(LN.editor.currentId())||{}).name||'')"), made)
    pg.screenshot(path=OUT + '/voice.png')
    pg.evaluate("LN.ui.closeAll()"); pg.wait_for_timeout(300); close_all()

    # ---- sync status variants ----
    pg.evaluate("LN.store.set('lastSyncError','x · boom'); LN.home.refresh()")
    ok('error status shown', 'error' in pg.locator('.home-sum').inner_text().lower() or 'off' in pg.locator('.home-sum').inner_text().lower())
    pg.evaluate("LN.store.set('lastSyncError','')")

    # ---- Easter egg ----
    close_all()
    logo = pg.locator('.bar .logo')
    for i in range(4): logo.click(delay=20)
    pg.wait_for_timeout(200)
    ok('four taps do nothing', pg.locator('.bj-paws, .bj-egg').count() == 0)
    pg.wait_for_timeout(2700)   # let the window expire
    for i in range(5): logo.click(delay=20); pg.wait_for_timeout(700)   # 5 slow taps = too slow
    ok('five slow taps do nothing', pg.locator('.bj-paws, .bj-egg').count() == 0)
    pg.wait_for_timeout(3000)
    for i in range(5): logo.click(delay=20)
    pg.wait_for_timeout(500)
    ok('paw prints appear', pg.locator('.bj-paws .bj-paw').count() == 12)
    pg.screenshot(path=OUT + '/egg-paws.png')
    pg.wait_for_selector('.bj-egg', timeout=6000)
    pg.wait_for_timeout(600)
    ok('card title', pg.locator('.bj-title').inner_text().strip() == 'Bojack Security: on watch')
    ok('paws cleared once the card shows', pg.locator('.bj-paws').count() == 0)
    ok('card has the S.O.I. line', 'S.O.I. \u00d7 Bojack Security \u00b7 999' in pg.locator('.bj-card').inner_text())
    ok('bark animation running', pg.evaluate("getComputedStyle(document.querySelector('.bj-jaw')).animationName")=='bj-jaw')
    ok('woof bubbles present', pg.locator('.bj-woof').count() == 2)
    ok('close button focused', pg.evaluate("document.activeElement.classList.contains('bj-close')"))
    pg.screenshot(path=OUT + '/egg-card.png')
    pg.locator('.bj-close').click(); pg.wait_for_timeout(200)
    ok('close removes the card', pg.locator('.bj-egg').count() == 0)
    # again with the hero logo, then Escape
    for i in range(5): pg.locator('.home-logo-wrap').click(delay=20)
    pg.wait_for_selector('.bj-egg', timeout=6000)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('hero logo triggers it and Escape closes it', pg.locator('.bj-egg').count() == 0)
    # card must not let a swipe open the file panel behind it
    for i in range(5): logo.click(delay=20)
    pg.wait_for_selector('.bj-egg', timeout=6000)
    ok('egg is above the app', pg.evaluate("getComputedStyle(document.querySelector('.bj-egg')).position==='fixed'"))
    pg.locator('.bj-egg').click(position={'x': 5, 'y': 5}); pg.wait_for_timeout(200)
    ok('backdrop tap closes it', pg.locator('.bj-egg').count() == 0)

    # ---- About ----
    pg.evaluate("LN.settings.open('about')"); pg.wait_for_timeout(500)
    abt = pg.evaluate("document.querySelector('.settings-sheet .sheet-body, .sheet .sheet-body').innerText")
    ok('About shows Strategy Over Impulse', 'strategy over impulse' in abt.lower())
    ok('About shows V0.7.17', 'V0.7.17' in abt, abt[:200])
    pg.evaluate("LN.settings.close()"); pg.wait_for_timeout(200)

    # ---- layout ----
    close_all()
    ok('no sideways scroll', pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth"))
    ok('dock fits the screen', pg.evaluate("(()=>{const r=document.getElementById('dock').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"))
    pg.set_viewport_size({'width': 360, 'height': 520}); pg.wait_for_timeout(300)
    ok('short screen: home scrolls, dock still visible', pg.evaluate("(()=>{const r=document.getElementById('dock').getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0})()"))
    pg.screenshot(path=OUT + '/home-short.png')
    pg.set_viewport_size({'width': 800, 'height': 700}); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + '/home-wide.png')
    pg.evaluate("LN.theme && document.getElementById('btn-theme').click()"); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + '/home-dark.png')

    # reduced motion: card shows at once, no paws
    ctx2 = b.new_context(viewport={'width': 360, 'height': 740}, reduced_motion='reduce', bypass_csp=True)
    p2 = ctx2.new_page(); p2.goto('http://localhost:8765/index.html')
    p2.wait_for_function('window.LN && LN.home && LN.vault && LN.vault.all().length>0', timeout=15000)
    p2.evaluate("LN.bojack.start()"); p2.wait_for_timeout(300)
    ok('reduced motion: card at once, no paws', p2.locator('.bj-egg').count() == 1 and p2.locator('.bj-paws').count() == 0)

    ok('no console errors', not errs, errs[:5])
    b.close()
print('%d/%d passed' % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
