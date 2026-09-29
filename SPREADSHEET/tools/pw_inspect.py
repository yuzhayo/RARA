import sys, subprocess
from playwright.sync_api import sync_playwright

def set_clip(text):
    subprocess.run(["powershell", "-NoProfile", "-Command",
                    "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
                   input=text.encode("utf-8"), capture_output=True)

def goto_cell(page, cell):
    page.evaluate("document.querySelector('#t-name-box').focus()")
    page.wait_for_timeout(200)
    page.keyboard.press("Control+a")
    page.keyboard.type(cell)
    page.keyboard.press("Enter")
    page.wait_for_timeout(1200)

def active_tab(page):
    return page.evaluate("""() => {
        const e = document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name');
        return e ? e.textContent.trim() : null;
    }""")

def switch_tab(page, name, max_hops=15):
    """Cycle sheets with Ctrl+PageDown until the active tab matches."""
    page.locator("body").click(position={"x": 5, "y": 5})
    for _ in range(max_hops):
        if active_tab(page) == name:
            return True
        page.keyboard.press("Control+PageDown")
        page.wait_for_timeout(1200)
    return active_tab(page) == name

def main():
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9333")
        PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
    page = next((x for x in PAGES if "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM" in x.url), None)
    if page is None:
        raise SystemExit("JATIM RARA tab not open in the browser (found: "
                         + ", ".join(x.url.split("/d/")[1][:22] for x in PAGES if "/d/" in x.url) + ")")
    page.bring_to_front()
        page.bring_to_front()

        # 1. clear the stray #REF! cell
        goto_cell(page, "A2000")
        page.keyboard.press("Delete")
        page.wait_for_timeout(600)
        print("cleared A2000")

        # 2. switch tab
        ok = switch_tab(page, sys.argv[1] if len(sys.argv) > 1 else "Raw_BELL")
        print("tab click:", ok, "| url gid:", page.url.split("gid=")[-1][:14])

        # 3. go to the cell and read the formula bar
        goto_cell(page, sys.argv[2] if len(sys.argv) > 2 else "A1")
        fb = page.evaluate("""() => {
            const el = document.querySelector('#t-formula-bar-input') ||
                       document.querySelector('.cell-input');
            return el ? (el.innerText || el.textContent || '') : '(formula bar not found)';
        }""")
        print("FORMULA BAR:", fb[:400])

if __name__ == "__main__":
    main()
