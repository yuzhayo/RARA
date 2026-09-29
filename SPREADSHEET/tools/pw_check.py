import sys, urllib.parse, csv, io
from playwright.sync_api import sync_playwright

STG = "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM"

def pick(ctx):
    for pg in ctx.pages:
        if "spreadsheets/d/" in pg.url:
            return pg
    return ctx.pages[0]

def main():
    tab = sys.argv[1]
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9333")
        page = pick(b.contexts[0])
        url = (f"https://docs.google.com/spreadsheets/d/{STG}/gviz/tq"
               f"?tqx=out:csv&sheet={urllib.parse.quote(tab)}")
        txt = page.evaluate(
            "async (u) => { const r = await fetch(u,{credentials:'include'}); return await r.text(); }",
            url)
    rows = list(csv.reader(io.StringIO(txt)))
    while rows and all(c.strip() == "" for c in rows[-1]):
        rows.pop()
    print(f"TAB {tab}  ->  {len(rows)} parsed rows ({len(rows)-1} data)  x {len(rows[0])} cols")
    return rows

if __name__ == "__main__":
    rows = main()
    hdr = rows[0]
    for idx in (1, 2, 3, len(rows) - 1):
        r = rows[idx]
        print(f"\n--- row {idx} ---")
        for i in (0, 2, 3, 4, 5, 6, 9, 19, 22, 120, 121):
            v = r[i] if i < len(r) else "<MISSING>"
            print(f"   col{i+1:>3} {hdr[i][:30]:<30} = {v[:55]}")
