from playwright.sync_api import sync_playwright
errs, dialogs, res = [], [], []
def ok(name, cond, extra=''):
    res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(extra) if (extra and not cond) else ''))
def unlock(pg):
    pg.wait_for_selector('.ln-lock', timeout=8000)
    for ch in '12345678': pg.keyboard.press(ch)
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.ln-lock', state='detached', timeout=8000)
    pg.wait_for_function('window.LN && LN.vault && LN.vault.all().length>0', timeout=8000)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 360, 'height': 740}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pol = {'dismiss': None}
    def on_dialog(d):
        dialogs.append(d.message)
        (d.dismiss if pol['dismiss'] and pol['dismiss'] in d.message else d.accept)()
    pg.on('dialog', on_dialog)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.LN && LN.vault && LN.vault.all().length>0 && LN.secure')
    pg.evaluate('''(async()=>{const a=await LN.vault.create('file','secret.md',null); await LN.vault.update(a.id||a,'top secret'); LN.tree.select(a.id||a,true);})()''')
    # set a PIN through the real flow
    pg.evaluate('LN.settings.open("security")'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Set PIN').click(); pg.wait_for_timeout(400)
    ins = pg.locator('input[type=password], input[inputmode=numeric]')
    for i in range(ins.count()): ins.nth(i).fill('12345678')
    pg.locator('.sheet button', has_text='OK').click()
    pg.wait_for_timeout(3000)
    print('hasPin:', pg.evaluate('LN.lock.hasPin()'))
    if not pg.evaluate('LN.lock.hasPin()'):
        pg.screenshot(path='/home/claude/pin_fail.png'); print(pg.evaluate('document.body.innerText.slice(0,400)'))
    ok('PIN set', pg.evaluate('LN.lock.hasPin()'))
    pg.evaluate('LN.settings.open("security")'); pg.wait_for_timeout(300)
    t = pg.evaluate('document.querySelector(".settings-sheet .sheet-body").innerText')
    ok('Security shows new PIN-only items', all(s in t for s in ['Lock as soon as the app goes to the background','Lock after no use','Warn before sending a note out','Clear copied text']), t[:400])
    # lockBg on: instant return locks even with a 15 min setting
    pg.evaluate('LN.store.set("lockBg", true); LN.store.set("lockAuto", 900000)')
    pg.evaluate('''(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__h}); window.__h=true; document.dispatchEvent(new Event('visibilitychange')); window.__h=false; document.dispatchEvent(new Event('visibilitychange'));})()''')
    try:
        pg.wait_for_selector('.ln-lock', timeout=8000); locked = True
    except Exception: locked = False
    ok('lockBg locks on instant return despite 15 min setting', locked)
    if locked: unlock(pg)
    # lockBg off, 1 min setting: instant return must NOT lock
    pg.evaluate('LN.store.set("lockBg", false); LN.store.set("lockAuto", 60000); window.__m=1')
    pg.evaluate('''(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__h}); window.__h=true; document.dispatchEvent(new Event('visibilitychange')); window.__h=false; document.dispatchEvent(new Event('visibilitychange'));})()''')
    pg.wait_for_timeout(1800)
    ok('lockBg off: 1 min setting does not lock on instant return', pg.evaluate('window.__m===1') and pg.locator('.ln-lock').count()==0)
    # idle lock: move the clock past 1 minute, wait for the 5 s check
    pg.evaluate('LN.store.set("lockIdle", 60000); const real=Date.now; Date.now=()=>real()+61000;')
    try:
        pg.wait_for_selector('.ln-lock', timeout=9000); locked = True
    except Exception: locked = False
    ok('idle auto-lock fires', locked)
    if locked: unlock(pg)
    pg.evaluate('LN.store.set("lockIdle", 0)')
    # export warning
    dialogs.clear(); pol['dismiss'] = 'unprotected'
    pg.evaluate('LN.tree.select(LN.vault.all().find(n=>n.name==="secret.md").id,true)')
    dl = []
    pg.on('download', lambda d: dl.append(d))
    pg.evaluate('document.getElementById("t-export").click()'); pg.wait_for_timeout(700)
    ok('export asks first when PIN is on', any('unprotected' in m for m in dialogs), dialogs)
    ok('declining the warning cancels the export', not dl)
    pol['dismiss'] = None
    pg.evaluate('document.getElementById("t-export").click()'); pg.wait_for_timeout(900)
    ok('accepting the warning exports', len(dl) == 1)
    # warning off => no dialog
    dialogs.clear(); pg.evaluate('LN.store.set("exportWarn", false)')
    pg.evaluate('document.getElementById("t-export").click()'); pg.wait_for_timeout(700)
    ok('exportWarn off => no dialog', not dialogs, dialogs)
    pg.evaluate('LN.store.set("exportWarn", true)')
    # clipboard clearing wrapper is installed and does not throw
    ok('secure.copied does not throw', pg.evaluate('(()=>{LN.store.set("clipClear",30); LN.secure.copied("abc"); return true})()'))
    # ---- Delete all my data (decline backup, type DELETE)
    pg.evaluate('LN.settings.open("diag")'); pg.wait_for_timeout(400)
    pol['dismiss'] = 'Save a backup first'
    pg.get_by_role('button', name='Delete all my data').first.click(); pg.wait_for_timeout(700)
    inp = pg.locator('.sheet input[placeholder="DELETE"]'); inp.fill('delete')
    pg.get_by_role('button', name='Delete everything').click(); pg.wait_for_timeout(300)
    ok('lowercase delete refused with message', 'capital' in pg.evaluate('document.body.innerText') and pg.evaluate('LN.vault.all().some(n=>n.name==="secret.md")'))
    inp.fill('DELETE')
    pg.get_by_role('button', name='Delete everything').click()
    pg.wait_for_timeout(3500); pg.wait_for_function('window.LN && LN.vault && window.LN.store')
    pg.wait_for_timeout(1500)
    left = pg.evaluate('''(async()=>{const dbs=await indexedDB.databases(); return {dbs:dbs.map(d=>d.name), keys:Object.keys(localStorage), notes:LN.vault.all().map(n=>n.name), pin:LN.lock.hasPin()}})()''')
    print(left)
    ok('secret note gone after delete-all', 'secret.md' not in left['notes'])
    ok('PIN removed after delete-all', not left['pin'])
    ok('old backup db is gone or empty', 'limitless-notepad-backups' not in left['dbs'] or pg.evaluate('LN.backup.list().then(l=>l.length)')==0)
    ok('no page errors', not [e for e in errs if 'PAGEERR' in e], errs)
    b.close()
print(sum(res), '/', len(res)); print('ERRS', errs)
