import os, re
from playwright.sync_api import sync_playwright

PAIRS = [
    ("Raw_BELL!A1",                    "Raw_BELL-A1-v6.txt"),
    ("Raw_SMV!A1",                     "Raw_SMV-A1-v2.txt"),
    ("SOURCE OF TRUTH!A1",             "SOURCE-OF-TRUTH-A1-v3.txt"),
    ("CAL_FEED!A3",                    "CAL_FEED-A3-v2.txt"),
    ("CAL_FEED!H3",                    "CAL_FEED-H3-v2.txt"),
    ("CAL_FEED!A1",                    "CAL_FEED-A1-grid-SEPT-v1.txt"),
    ("CAL_FEED!H1",                    "CAL_FEED-H1-grid-OCT-v1.txt"),
    ("MISMATCH!A2",                    "MISMATCH-A2-v4.txt"),
    ("TEST-2026.09 (SEPT)!J321",       "TEST-SEPT-J321-v4.txt"),
]


def norm(s):
    return s.strip().replace("\n", "").replace("\r", "")


def nav(page, ref, addr):
    for _ in range(4):
        page.evaluate("document.querySelector('#t-name-box').focus()")
        page.wait_for_timeout(250)
        page.keyboard.press("Control+a")
        page.keyboard.type(ref)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2200)
        if page.evaluate("()=>document.querySelector('#t-name-box').value").strip() == addr:
            return True
    return False


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://localhost:9333")
    PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
    page = next((x for x in PAGES if "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM" in x.url), None)
    if page is None:
        raise SystemExit("JATIM RARA tab not open in the browser (found: "
                         + ", ".join(x.url.split("/d/")[1][:22] for x in PAGES if "/d/" in x.url) + ")")
    page.bring_to_front()
    page.bring_to_front()
    tabs = page.evaluate("()=>[...document.querySelectorAll('.docs-sheet-tab-name')].map(e=>e.textContent.trim())")
    print("tabs:", tabs)
    print()
    for cell, fn in PAIRS:
        tab = cell.split("!")[0]
        addr = cell.split("!")[1]
        if tab not in tabs:
            print(f"{cell:<30} TAB GONE          -> {fn}  (DEAD)")
            continue
        ok = nav(page, cell, addr)
        if not ok:
            print(f"{cell:<30} NAV FAILED        -> {fn}")
            continue
        live = page.evaluate("""()=>{const e=document.querySelector('#t-formula-bar-input')||document.querySelector('.cell-input');
            return e?(e.innerText||e.textContent||''):''}""")
        disk = open(fn, encoding="utf-8").read() if os.path.exists(fn) else None
        if disk is None:
            print(f"{cell:<30} live={len(norm(live)):>5}   FILE MISSING")
        else:
            same = norm(live).replace("'", "'") == norm(disk).replace("'", "'")
            print(f"{cell:<30} live={len(norm(live)):>5}  {fn:<30} {'MATCH' if same else 'DIFFERS'}")
