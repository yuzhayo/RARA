"""
pw_open.py — make sure the ICE-CUBE browser is up on port 9333.

This does NOT create a profile. The profile is assigned by the operator and the
browser is normally already running; creating a new user-data-dir silently gives
you an empty, logged-out profile that looks like it works and isn't.

  - already listening on 9333  -> say so and exit (attach, don't launch)
  - profile folder missing     -> refuse, and say where it should be

If you genuinely need a fresh browser, get the operator to start it.
"""

import pathlib
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

PORT = 9333
PROFILE = pathlib.Path(r"C:\RARA\BROWSER-AUTOMATION")
SHEET = "https://docs.google.com/spreadsheets/d/1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM/edit"


def already_up() -> bool:
    try:
        with urllib.request.urlopen(f"http://localhost:{PORT}/json/version", timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def main() -> int:
    if already_up():
        print(f"already running on port {PORT} - attaching, launching nothing.")
        return 0

    if not PROFILE.is_dir():
        print(f"REFUSING TO LAUNCH.\n"
              f"  profile not found: {PROFILE}\n"
              f"  This script does not create profiles. Ask the operator to start\n"
              f"  the browser, or point PROFILE at the real one.")
        return 1

    print(f"nothing on {PORT}; launching with {PROFILE.name} ...")
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE),
            headless=False,
            no_viewport=True,
            args=[
                f"--remote-debugging-port={PORT}",
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(SHEET, wait_until="domcontentloaded", timeout=60000)
        print("BROWSER UP", flush=True)
        print("URL:", page.url, flush=True)
        while True:
            time.sleep(5)
    return 0


if __name__ == "__main__":
    sys.exit(main())
