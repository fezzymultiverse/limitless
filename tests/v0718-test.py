# V0.7.18 browser smoke test: logo in header, + in tab strip, edge swipe, calendar, templater, dataview. 360 px.
# Needs Python Playwright and:  python3 -m http.server 8765 --directory www
import os
from playwright.sync_api import sync_playwright
errs, res = [], []
def ok(n, c, x=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (' :: ' + str(x) if (x and not c) else ''))
OUT = os.environ.get('SHOTS', '/home/claude/shots'); os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 360, 'height': 740}, has_touch=True, bypass_csp=False)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.on('dialog', lambda d: d.accept('Test note' if d.type == 'prompt' else ''))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_function('window.LN && LN.plugins && LN.vault && LN.vault.all().length>0', timeout=15000)
    pg.wait_for_selector('#vault-loading', state='hidden', timeout=15000)
    ok('header logo image', pg.evaluate("document.querySelector('.logo-mark').naturalWidth>0"))
    ok('+ button in tab strip', pg.locator('#tabs .tab-add:not(.tab-cal)').count() == 1)
    ok('edge strip visible on phone', pg.locator('#edge').is_visible())
    pg.evaluate("LN.app.closeDrawer()")
    pg.evaluate("""(()=>{const e=document.getElementById('edge');const mk=(t,x,y)=>new Touch({identifier:1,target:e,clientX:x,clientY:y});
      e.dispatchEvent(new TouchEvent('touchstart',{touches:[mk(0,4,300)],bubbles:true}));
      e.dispatchEvent(new TouchEvent('touchmove',{touches:[mk(0,60,305)],bubbles:true}));})()""")
    ok('edge swipe opens the panel', pg.evaluate("document.getElementById('app').classList.contains('drawer-open')"))
    ok('edge hidden while panel open', not pg.locator('#edge').is_visible())
    pg.evaluate("LN.app.closeDrawer()")
    # templater + daily note + dataview
    pg.evaluate("LN.plugins.openDaily(new Date(2026,9,18))")
    pg.wait_for_timeout(600)
    ok('daily note created from Daily template', pg.evaluate("LN.vault.all().some(n=>n.name==='2026-10-18.md' && /Sunday, 18 October 2026/.test(n.content) && /\\[\\[2026-10-19\\]\\]/.test(n.content))"))
    ok('starter templates exist', pg.evaluate("['Daily.md','Meeting.md','Dashboard.md'].every(x=>LN.vault.all().some(n=>n.name===x))"))
    pg.evaluate("LN.plugins.dashboard()")
    pg.wait_for_timeout(600)
    pg.evaluate("document.querySelector('[data-mode=preview]').click()")
    pg.wait_for_timeout(500)
    ok('dataview blocks rendered', pg.locator('#preview .dv table, #preview .dv ul').count() >= 2, pg.inner_html('#preview')[:400])
    pg.screenshot(path=OUT + '/v0718-dashboard.png')
    pg.evaluate("LN.plugins.calendar()")
    pg.wait_for_timeout(300)
    ok('calendar shows a dot for the daily note', pg.locator('.cal-day.has').count() >= 1)
    pg.screenshot(path=OUT + '/v0718-calendar.png')
    pg.evaluate("LN.ui.closeAll()")
    pg.click('#tabs .tab-add:not(.tab-cal)')
    pg.wait_for_timeout(500)
    ok('+ creates and opens a note', pg.evaluate("LN.vault.all().some(n=>n.name==='Test note.md')"))
    ok('no console errors', not errs, errs[:5])
    b.close()
print('%d/%d passed' % (sum(res), len(res)))
