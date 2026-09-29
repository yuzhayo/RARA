# Memory — C:\RARA

Two projects live here, plus one rule that applies to every session.

---

## ICE-CUBE — WhatsApp report photos into the "Tracking Ice Cube" sheet

- [ICE CUBE photo tool](ice-cube-photo-tool.md) — the pipeline at `C:\RARA\ICE-CUBE`:
  scan → download → verify → insert → read back. Stage folders, the 12 banned
  approaches, and why each boundary sits where it does.
- [NEVER touch Chrome profile auth](never-touch-chrome-profile-auth.md) — **the hard
  rule.** Never relocate a signed-in Chrome profile, never force-kill Chrome. Both
  wipe Google sign-in, and one of them already did, on 2026-09-26.

## SPREADSHEET — JATIM RARA / BELLS-SMV daily schedule

- [Spreadsheet write scope](spreadsheet-write-scope.md) — **DAILY SCHEDULE F27 is READ
  ONLY**; JATIM RARA and ICE-CUBE's `RARA` tab are writable.
- [Spreadsheet browser control](spreadsheet-browser-control.md) — the ICE-CUBE browser
  on port 9333; what works for reading a sheet and what does not.
- [Spreadsheet canonical schema](spreadsheet-canonical-schema.md) — topology, the
  122-column canonical schema, the live tabs.
- [Google Sheets formula traps](google-sheets-formula-traps.md) — `LET` names that look
  like cell references; `&` and `REPT` need `ARRAYFORMULA`.

**Start here:** `C:\RARA\SPREADSHEET\HANDOFF.md` — the full operational handoff
(scope, write boundary, live cells, browser setup, rules, validation, open items).

---

## The one fact both projects share

`C:\RARA\BROWSER-AUTOMATION` — the browser profile, sitting **beside** both projects
rather than inside either. Start it with
`ICE-CUBE\ICE-CUBE-TOOLS\start-automation-chrome.bat`; stop it with
`stop-automation-chrome.bat`.

**Closing the window is not enough** — Chrome leaves the profile's processes running
and they hold port 9333.

Its sign-in is NOT path-bound: the profile has been copied, moved and renamed, and the
sheet kept opening with no login prompt each time. Do not confuse that with the
junction incident, which is the different and dangerous one.
