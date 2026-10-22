import json, time, os
from playwright.sync_api import sync_playwright
errs, dialogs = [], []
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(extra) if (extra and not cond) else ''))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 360, 'height': 740}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    policy = {'dismiss_if': None}
    def on_dialog(d):
        dialogs.append(d.message)
        if policy['dismiss_if'] and policy['dismiss_if'] in d.message: d.dismiss()
        else: d.accept()
    pg.on('dialog', on_dialog)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.LN && LN.vault && LN.vault.all().length>0 && LN.backup && LN.secure && LN.diag')
    ok('loads with no console errors', not errs, errs)
    # seed
    pg.evaluate('''async()=>{const a=await LN.vault.create('file','a.md',null); await LN.vault.update(a.id||a,'hello'); const b=await LN.vault.create('file','b.md',null); await LN.vault.update(b.id||b,'bee');}''')
    names = pg.evaluate('LN.vault.all().map(n=>n.name)')
    ok('seed notes exist', 'a.md' in names and 'b.md' in names, names)
    # backup (auto => kept inside the app, no download)
    r = pg.evaluate('LN.backup.run({auto:true}).then(r=>({files:r.files,bytes:r.bytes,where:r.where}))')
    ok('backup runs and verifies', r['files'] >= 2 and r['bytes'] > 0, r)
    ok('lastBackup recorded', pg.evaluate('LN.store.get("lastBackup")>0 && LN.store.get("lastBackupError")===""'))
    lst = pg.evaluate('LN.backup.list().then(l=>l.map(x=>({files:x.files,kind:x.kind})))')
    ok('internal copy listed', len(lst) == 1, lst)
    # identical plan => nothing to restore
    same = pg.evaluate('''LN.backup.list().then(l=>LN.backup._plan(l[0].bytes)).then(p=>p.counts)''')
    ok('plan: identical data => nothing created/replaced/kept', same['created']==0 and same['replaced']==0 and same['kept']==0, same)
    # corrupt + foreign zips rejected
    bad = pg.evaluate('''LN.backup.restoreBytes(new Uint8Array([1,2,3,4])).then(()=>'accepted',e=>'rejected: '+e.message)''')
    ok('corrupt file rejected', bad.startswith('rejected'), bad)
    foreign = pg.evaluate('''(async()=>{const z=LN.zip.create(); z.setText('x.txt','hi'); const by=await z.build(); try{await LN.backup.restoreBytes(by); return 'accepted'}catch(e){return 'rejected: '+e.message}})()''')
    ok('foreign zip rejected', foreign.startswith('rejected'), foreign)
    # newer local note is never overwritten
    pg.evaluate('''(async()=>{const a=LN.vault.all().find(n=>n.name==='a.md'); await LN.vault.update(a.id,'changed later')})()''')
    plan = pg.evaluate('''LN.backup.list().then(l=>LN.backup._plan(l[0].bytes)).then(p=>p.counts)''')
    ok('plan: newer local => kept as copy', plan['kept'] == 1 and plan['replaced'] == 0, plan)
    # real restore, page reloads after
    pg.evaluate('''LN.backup.list().then(l=>LN.backup.restoreBytes(l[0].bytes))''')
    pg.wait_for_timeout(2500); pg.wait_for_function('window.LN && LN.vault && LN.vault.all().length>0')
    after = pg.evaluate('LN.vault.all().filter(n=>n.type==="file").map(n=>[n.name,n.content])')
    d = dict(after)
    ok('restore keeps newer local a.md', d.get('a.md') == 'changed later', after)
    copy = [k for k in d if 'backup copy' in k]
    ok('restore adds backup copy with old text', len(copy) == 1 and d[copy[0]] == 'hello', after)
    ok('restore made a safety backup', pg.evaluate('LN.backup.list().then(l=>l.some(x=>x.kind==="safety"))'))
    ok('restore dialogs were shown', any('Restore' in m or 'restore' in m or 'backup' in m for m in dialogs), dialogs)
    # settings pages
    def page_text(label):
        pg.evaluate('LN.settings.open()'); pg.wait_for_timeout(150)
        pg.get_by_role('button', name=label, exact=False).first.click(); pg.wait_for_timeout(500)
        return pg.evaluate('document.querySelector(".settings-sheet .sheet-body").innerText')
    t = page_text('Backup')
    ok('Backup page shows actions', all(s in t for s in ['Back up now','Last backup','Automatic backup','Restore from a backup file']), t[:200])
    ok('Backup page fits 360px', pg.evaluate('document.documentElement.scrollWidth<=360'))
    t = page_text('Diagnostics')
    ok('Diagnostics page shows storage line', 'files' in t and 'Copy full report' in t and 'Delete all my data' in t, t[:300])
    pg.wait_for_timeout(600)
    ok('storage status filled in', 'Checking' not in pg.evaluate('document.querySelector(".settings-sheet .sheet-body").innerText'))
    rep = pg.evaluate('LN.diag.report()')
    ok('report has no keys/notes', 'Limitless Notepad' in rep and 'hello' not in rep and 'gsk_' not in rep, rep[:200])
    pg.get_by_role('button', name='View log').click(); pg.wait_for_timeout(300)
    ok('log sheet opens', pg.locator('.diag-log').count() == 1)
    pg.evaluate('LN.ui.closeAll()')
    t = page_text('Security')
    ok('Security page has clipboard clearing (no PIN)', 'Clear copied text' in t, t[:300])
    ok('no errors after browsing settings', not errs, errs)
    pg.screenshot(path='/home/claude/diag.png')

    # --- PIN flow for the PIN-only items + export warning
    pg.evaluate('LN.settings.open("security")'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Set PIN').click(); pg.wait_for_timeout(500)
    inputs = pg.locator('.sheet input, .lock input, input[type=password], input[inputmode=numeric]')
    print('pin inputs:', inputs.count())
    pg.screenshot(path='/home/claude/pin.png')
    ctx.storage_state(path='/home/claude/state.json')
    b.close()
print(sum(1 for _, c in res if c), '/', len(res), 'passed'); print('ERRS', errs)
