---
name: spreadsheet-browser-control
description: "How to drive the Google Sheets browser for the JATIM RARA / ICE-CUBE work — which profile, which port, and what does not work"
metadata: 
  node_type: memory
  type: reference
  originSessionId: b6d5264f-8b35-4fb3-a989-ef16bc66fe45
---

**Use the ICE-CUBE browser. Never create a new profile.**

```
chrome.exe --user-data-dir="C:\RARA\BROWSER-AUTOMATION"
           --profile-directory=Default
           --remote-debugging-port=9333
```

**The profile sits beside the projects, not inside ICE-CUBE.** It was called
`ICE-CUBE-AUTOMATION` and lived inside `ICE-CUBE\` until 2026-09-29, when it moved to
`C:\RARA\` and was renamed `BROWSER-AUTOMATION` - both old paths are gone.

It has been copied, moved and renamed, and its Google sign-in survived all three
(measured 2026-09-29), so a move is not the risk it looks like. Do not confuse that
with the junction incident, which is a different failure and destroyed a real
profile's accounts.

Better than launching it by hand: `ICE-CUBE\ICE-CUBE-TOOLS\start-automation-chrome.bat`
starts it, and `stop-automation-chrome.bat` closes it properly — closing the window
leaves its processes running, holding port 9333.

It is normally already running — **attach to port 9333, launch nothing.**

**Why not the default Chrome profile:** since Chrome 136, `--remote-debugging-port` is
**ignored when the user-data-dir is the default Chrome path**, even when passed
explicitly. A dedicated user-data-dir sidesteps that — which is why ICE-CUBE's works.
An agent once spent hours on a hand-made empty `pw_profile` before finding this.

`C:\RARA\ICE-CUBE\` is a separate project (photo capture + OCR into a
spreadsheet) with its own `config.json`, tools, docs and session. Its browser is the one
to borrow.

**Reading techniques**
- Any tab as CSV: `/gviz/tq?tqx=out:csv&sheet=NAME` via in-page `fetch(...,{credentials:'include'})`.
  Content is trustworthy; **row indices are NOT sheet row numbers** — do not use them to
  place formulas.
- A cell's live formula: DOM `#t-formula-bar-input`.
- Exact range values: select via the Name Box → `Ctrl+C` → read the Windows clipboard
  (`Get-Clipboard -Raw`), parse as TSV. **Only trustworthy way to get absolute positions.**
- A single-cell copy returns the FORMULA, not the value — copy a range instead.
- Navigate via the Name Box (accepts cross-sheet refs like `Raw_BELL!A1`).
  Playwright tab *clicking* does not work in Sheets.

**Always verify navigation landed** (read back the Name Box), and **verify a paste by
reading the formula back** — not by checking its length. A length check once let a failed
paste pass unnoticed.

**Does not work — don't retry these**
- Conditional-formatting sidebar (material design; selectors land on the comment panel)
- Native pivot creation/configuration (drag-and-drop; Sheets also blocks overwriting pivot output)
- Chrome's `--remote-debugging-port` on the default user-data-dir

See [[spreadsheet-write-scope]] for which files may be written.
