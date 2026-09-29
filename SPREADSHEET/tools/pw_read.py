import sys, json, urllib.parse
from playwright.sync_api import sync_playwright

SHEET_ID = "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM"

def main():
    names = sys.argv[1:] or []
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9333")
        ctx = b.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        # gviz endpoint: returns CSV for a named tab, using the logged-in session
        def csv_of(tab):
            url = (f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq"
                   f"?tqx=out:csv&sheet={urllib.parse.quote(tab)}")
            return page.evaluate("""async (u) => {
                const r = await fetch(u, {credentials:'include'});
                return r.status + '\\n' + (await r.text());
            }""", url)

        if not names:
            print("TITLE:", page.title())
            print("URL:", page.url)
            return

        out = {}
        for t in names:
            txt = csv_of(t)
            out[t] = txt
            print("=" * 70)
            print("TAB:", t)
            print("=" * 70)
            print(txt[:3000])

main()
