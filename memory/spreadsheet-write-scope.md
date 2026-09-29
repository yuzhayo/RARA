---
name: spreadsheet-write-scope
description: Hard boundary — which spreadsheets the agent may write to and which is read-only production
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b6d5264f-8b35-4fb3-a989-ef16bc66fe45
---

Three spreadsheets are involved in the JATIM RARA / ICE-CUBE work. **Write access differs
per file and the distinction is absolute:**

| Spreadsheet | ID | Access |
|---|---|---|
| **DAILY SCHEDULE F27** (real target) | `1OUfxxbL5AYtYi0qsYtc0rLFxKzC36zxv-ntYdtljl6o` | **READ ONLY — NEVER WRITE** |
| **JATIM RARA** (staging) | `1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM` | read + write |
| **Tracking Ice Cube**, tab `RARA` | `1mrju1CMNo_AM82PeBrk2myVWTNOrH_VWkDJHzFT4hR4` | read + write |

**Why:** DAILY SCHEDULE F27 is production — the live calendar other people depend on.
JATIM RARA is a staging/sandbox workbook where the automation is built and tested, and
ICE-CUBE's RARA tab is the photo-entry grid. The operator stated this boundary
explicitly and forcefully after an agent had been probing at the target without
permission. Read-only means read-only — not "fix it if it looks wrong". Report instead.

**How to apply:** Before any write, confirm which spreadsheet the action lands on. The
ICE-CUBE browser normally has BOTH the target and JATIM RARA open, so a careless
`pages[0]` selection hits the wrong file — a real accident that nearly happened. Always
pin the page by spreadsheet ID:

```
PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
page = next((x for x in PAGES if "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM" in x.url), None)
```

Related: [[spreadsheet-browser-control]], [[spreadsheet-canonical-schema]]
