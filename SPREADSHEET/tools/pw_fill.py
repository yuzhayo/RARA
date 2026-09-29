import subprocess
from playwright.sync_api import sync_playwright

ROWS = [22, 24, 26, 33, 34, 40, 51, 61, 66, 73, 75, 80, 84, 87, 94, 99, 113, 116, 128]
FILL_BTN = (864, 85)          # #t-cell-color
RED_SWATCH = (870, 244)       # docs-material-colorpalette-colorswatch, rgb(204,65,37)


def nav(page, address, expect):
    for _ in range(4):
        page.evaluate("document.querySelector('#t-name-box').focus()")
        page.wait_for_timeout(220)
        page.keyboard.press("Control+a")
        page.keyboard.type(address)
        page.keyboard.press("Enter")
        page.wait_for_timeout(1700)
        if page.evaluate("()=>document.querySelector('#t-name-box').value").strip() == expect:
            return True
    return False


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
        done = 0
        for r in ROWS:
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)
            if not nav(page, f"CAL_FEED!A{r}:F{r}", f"A{r}:F{r}"):
                print(f"  row {r}: NAV FAILED")
                continue
            page.mouse.click(FILL_BTN[0], FILL_BTN[1])
            page.wait_for_timeout(1100)
            page.mouse.click(RED_SWATCH[0], RED_SWATCH[1])
            page.wait_for_timeout(700)
            done += 1
            print(f"  row {r}: filled  ({done}/{len(ROWS)})")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        # show the top of the feed so the fills are visible
        nav(page, "CAL_FEED!A1:F50", "A1:F50")
        page.wait_for_timeout(1200)
        page.screenshot(path="C:/RARA/SPREADSHEET/filled.png")
        print("done, screenshot saved")


main()
