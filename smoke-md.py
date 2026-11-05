# Browser smoke test for WIP5 markdown upgrades at 360 px. Needs Python Playwright and
#   python3 -m http.server 8765 --directory www
import sys, json
from playwright.sync_api import sync_playwright

DEMO = """# Demo note

> [!tip] Pro move
> Callouts hold **bold**, lists and code.
> - one
>   - nested

> [!warning]- Folded warning
> Hidden until opened.

> [!danger] Danger
> Careful here.

```js
// comment
const total = items.map(x => x.price * 2).reduce((a, b) => a + b, 0);
console.log("sum", total, true);
```

```sh
$ pkg install nmap -y
echo "$HOME" # home
```

```python
def hello(name="Fezzy"):
    return f"hi {name}"
```

```json
{"name": "limitless", "v": 7, "ok": true}
```

1. First
   - sub a
   - sub b
2. Second
- [ ] task open
- [x] task done

| Tool | Kind | Status |
|------|:----:|-------:|
| Notes | md | ready |
| Vault | enc | ready |
| Music | media | ready |

> Plain quote
> second line
"""

errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=None)
    ctx = b.new_context(viewport={'width': 360, 'height': 740}, device_scale_factor=2, permissions=['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_timeout(1200)
    pg.evaluate("""async (src) => {
      const n = await LN.vault.create('file', 'demo-wip5.md', null);
      await LN.vault.update(n.id, src);
      LN.tabs.open(n.id);
    }""", DEMO)
    pg.wait_for_timeout(600)
    pg.click('[data-mode="preview"]')
    pg.wait_for_timeout(500)
    res = {}
    res['cb'] = pg.locator('.preview .cb').count()
    res['copy_btn'] = pg.locator('.preview .cb-copy').count()
    res['tokens'] = pg.locator('.preview .cb [class^="tk-"]').count()
    res['callouts'] = pg.locator('.preview .co').count()
    res['nested_ul'] = pg.locator('.preview ul ul').count()
    res['ol_ul'] = pg.locator('.preview ol ul').count()
    res['sticky_th'] = pg.evaluate("getComputedStyle(document.querySelector('.preview .tbl th')).position")
    res['h_overflow'] = pg.evaluate("document.documentElement.scrollWidth > innerWidth")
    # folded callout: closed by default, opens on tap
    d = pg.locator('.preview details.co').first
    res['fold_closed'] = d.get_attribute('open') is None
    d.locator('summary').click(); pg.wait_for_timeout(300)
    res['fold_open_after_tap'] = d.get_attribute('open') is not None
    # copy button
    pg.locator('.preview .cb-copy').first.click(); pg.wait_for_timeout(300)
    res['copy_label'] = pg.locator('.preview .cb-copy').first.inner_text()
    try:
        res['clipboard'] = pg.evaluate("navigator.clipboard.readText()")[:30]
    except Exception as e:
        res['clipboard'] = 'unreadable: ' + str(e)[:60]
    pg.wait_for_timeout(1600)
    res['copy_label_reset'] = pg.locator('.preview .cb-copy').first.inner_text()
    pg.screenshot(path='/home/claude/shot-light-1.png')
    pg.evaluate("document.querySelector('.preview').scrollTop = 700")
    pg.wait_for_timeout(200)
    pg.screenshot(path='/home/claude/shot-light-2.png')
    # dark
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    pg.evaluate("document.querySelector('.preview').scrollTop = 0")
    pg.wait_for_timeout(300)
    pg.screenshot(path='/home/claude/shot-dark-1.png')
    # edit <-> preview switching keeps working
    pg.click('[data-mode="edit"]'); pg.wait_for_timeout(200)
    res['editor_visible'] = pg.locator('#editor').is_visible()
    pg.click('[data-mode="split"]'); pg.wait_for_timeout(300)
    res['split_both'] = pg.locator('#editor').is_visible() and pg.locator('#preview').is_visible()
    b.close()
print(json.dumps(res, indent=1))
print('CONSOLE ERRORS:', errs if errs else 'none')
