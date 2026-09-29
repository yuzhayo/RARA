---
name: domain-boundaries
description: "Write scope (3 spreadsheet IDs), shared profile, ports, pin-by-ID"
updated: 2026-09-29
---

# Domain boundaries

## Write scope (absolute — per file, not per output)

| Spreadsheet | ID | Access |
|---|---|---|
| **DAILY SCHEDULE F27** (live calendar = production) | `1OUfxxbL5AYtYi0qsYtc0rLFxKzC36zxv-ntYdtljl6o` | **READ ONLY — NEVER WRITE** |
| **JATIM RARA** (staging workbook) | `1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM` | read + write |
| **Tracking Ice Cube**, tab `RARA` (photo grid) | `1mrju1CMNo_AM82PeBrk2myVWTNOrH_VWkDJHzFT4hR4` | read + write |

F27 is production — the live calendar other people depend on. Read-only means
read-only, not "fix it if it looks wrong". Report instead. (Boundary stated
after an agent probed the target without permission.)

The browser normally has several spreadsheets open. **Pin the page by ID:**

```
PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
page = next((x for x in PAGES if "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM" in x.url), None)
```

## Shared automation profile

```
chrome.exe --user-data-dir="C:\RARA\BROWSER-AUTOMATION"
           --profile-directory=Default
           --remote-debugging-port=9333
```
- Sibling of the workspace, not inside it (~600–713 MB of browser data must not
  travel with the code; git-ignored). Moved here 2026-09-29 from
  `ICE-CUBE/ICE-CUBE-AUTOMATION` (old path gone; HANDOFF §4 and `pw_open.py`
  fixed 2026-09-29).
- Sign-in survived copy + move + rename, measured 2026-09-29. Losing it costs
  one re-sign-in — the safe failure (see `CORE/core-chrome-auth.md`).
- Start: `ICE-CUBE/ICE-CUBE-TOOLS/start-automation-chrome.bat`. Stop:
  `stop-automation-chrome.bat` (never force-kill; window-close leaves ~12
  processes holding the port). Verified 2026-09-29: up on 9333.
- The launcher opens the Tracking sheet (`1mrju…`), NOT JATIM — pin by ID.

## Ports

- **9333** — automation Chrome CDP. Deliberately ≠ 9222 so it can never collide
  with the real Chrome. Verified up 2026-09-29.
- **9223** — WhatsApp Desktop WebView2, via machine-wide
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. Verified up 2026-09-29.
