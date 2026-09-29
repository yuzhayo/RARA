import sys, urllib.parse
from playwright.sync_api import sync_playwright

def pick_page(ctx):
    for pg in ctx.pages:
        if "spreadsheets/d/" in pg.url:
            return pg
    return ctx.pages[0]

def fetch_text(page, url, limit=4000):
    js = """async (args) => {
        try {
            const res = await fetch(args[0], {credentials: 'include'});
            const t = await res.text();
            return {ok: true, status: res.status, len: t.length, txt: t.substring(0, args[1])};
        } catch (e) {
            return {ok: false, err: String(e)};
        }
    }"""
    return page.evaluate(js, [url, limit])

def main():
    doc = sys.argv[1]
    sheet = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 4000
    url = (f"https://docs.google.com/spreadsheets/d/{doc}/gviz/tq"
           f"?tqx=out:csv&sheet={urllib.parse.quote(sheet)}")
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9333")
        page = pick_page(b.contexts[0])
        r = fetch_text(page, url, limit)
        if not r.get("ok"):
            print("FETCH FAILED:", r.get("err"))
            return
        print(f"HTTP {r['status']}  total_len={r['len']}")
        print(r["txt"])

main()
