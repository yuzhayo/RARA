import subprocess, sys
from playwright.sync_api import sync_playwright

NAMEBOX_JS = "() => document.querySelector('#t-name-box').value"
FORMULA_JS = "() => {const e=document.querySelector('#t-formula-bar-input')||document.querySelector('.cell-input'); return e ? (e.innerText||e.textContent||'') : '';}"


def set_clip(text):
    subprocess.run(["powershell", "-NoProfile", "-Command",
                    "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
                   input=text.encode("utf-8"), capture_output=True)


def nav(page, address):
    for _ in range(4):
        page.evaluate("document.querySelector('#t-name-box').focus()")
        page.wait_for_timeout(250)
        page.keyboard.press("Control+a")
        page.keyboard.type(address)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2100)
        if page.evaluate(NAMEBOX_JS).strip().replace("$", "") == address.split("!")[-1].replace("$", ""):
            return True
    return False


def main():
    target = sys.argv[1]
    formula_file = sys.argv[2]
    clear_cell = sys.argv[3] if len(sys.argv) > 3 else None

    formula = open(formula_file, encoding="utf-8").read()
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9333")
        PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
    page = next((x for x in PAGES if "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM" in x.url), None)
    if page is None:
        raise SystemExit("JATIM RARA tab not open in the browser (found: "
                         + ", ".join(x.url.split("/d/")[1][:22] for x in PAGES if "/d/" in x.url) + ")")
    page.bring_to_front()
        page.bring_to_front()
        if clear_cell:
            nav(page, clear_cell)
            page.keyboard.press("Delete")
            page.wait_for_timeout(800)
            print("cleared", clear_cell)
        assert nav(page, target), f"nav failed -> {target}"
        set_clip(formula)
        page.keyboard.press("Control+v")
        page.wait_for_timeout(10000)
        print(f"pasted into {target}")
        print("cell now:", page.evaluate(FORMULA_JS).strip()[:100])


main()
