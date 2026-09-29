import sys, json
from playwright.sync_api import sync_playwright

PORT = 9333
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://localhost:{PORT}")
    ctx = b.contexts[0]
    print("pages:", len(ctx.pages))
    for pg in ctx.pages:
        try:
            t = pg.title()
        except Exception as e:
            t = f"<{type(e).__name__}>"
        print(f"   {t[:44]:<46} {pg.url[:78]}")
    # who is signed in on this profile?
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        who = pg.evaluate("""async () => {
            try {
                const r = await fetch('https://docs.google.com/spreadsheets/d/1mrju1CMNo_AM82PeBrk2myVWTNOrH_VWkDJHzFT4hR4/edit',
                                       {credentials:'include'});
                return r.status;
            } catch(e) { return 'ERR '+String(e).slice(0,60); }
        }""")
        print("\nsheets fetch status for ICE-CUBE spreadsheet:", who)
    except Exception as e:
        print("probe failed:", str(e)[:100])
