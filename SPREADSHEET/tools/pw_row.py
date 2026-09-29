import sys, urllib.parse, csv, io
from playwright.sync_api import sync_playwright

def pick_page(ctx):
    for pg in ctx.pages:
        if "spreadsheets/d/" in pg.url:
            return pg
    return ctx.pages[0]

def grab(page, doc, sheet, limit=200000):
    url = (f"https://docs.google.com/spreadsheets/d/{doc}/gviz/tq"
           f"?tqx=out:csv&sheet={urllib.parse.quote(sheet)}")
    js = """async (args) => {
        const res = await fetch(args[0], {credentials: 'include'});
        const t = await res.text();
        return t.substring(0, args[1]);
    }"""
    return page.evaluate(js, [url, limit])

def main():
    doc, sheet = sys.argv[1], sys.argv[2]
    nrows = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9333")
        page = pick_page(b.contexts[0])
        txt = grab(page, doc, sheet)
    rows = list(csv.reader(io.StringIO(txt)))
    if not rows:
        print("empty"); return
    hdr = rows[0]
    print(f"{sheet}: {len(hdr)} columns, showing {min(nrows, len(rows)-1)} data row(s)\n")
    for r in rows[1:1+nrows]:
        for i, h in enumerate(hdr):
            v = r[i] if i < len(r) else "<MISSING>"
            if v == "" : v = "(blank)"
            print(f"  {i+1:>3} {h[:38]:<38} = {v[:60]}")
        print("-" * 80)

main()
