---
name: core-browser
description: "Automation-browser pattern: attach to 9333, pin page by ID, verify everything, Sheets reading techniques"
updated: 2026-09-29
---

# Browser control (pattern — values in DOMAIN/domain-boundaries.md)

**Attach to the automation browser. Never create a profile.** It is normally
already running — connect to the debug port, launch nothing. If it is down, say
so and let the operator start it. Creating a fresh user-data-dir produces an
empty, logged-out profile that *looks* like it works — the tooling refuses that
on purpose (an agent once burned hours on a hand-made empty profile).

**Why dedicated:** since Chrome 136, `--remote-debugging-port` is **ignored when
the user-data-dir is the default Chrome path**, even when passed explicitly. A
dedicated user-data-dir sidesteps it.

**Pin the page by spreadsheet ID before acting.** The browser normally has
several spreadsheets open; a careless `pages[0]` lands on the wrong file — a
real accident that nearly happened:

```
PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
page = next((x for x in PAGES if "<ID>" in x.url), None)
```

## Reading techniques (what works, what lies)

- **Any tab as CSV:** `/gviz/tq?tqx=out:csv&sheet=NAME` via in-page
  `fetch(...,{credentials:'include'})`. Content is trustworthy; **row indices are
  NOT sheet row numbers** — never use them to place formulas. Needs no tab open.
- **A cell's live formula:** DOM element `#t-formula-bar-input`.
- **Exact range values:** select via the Name Box → `Ctrl+C` → read the Windows
  clipboard (`Get-Clipboard -Raw`) and parse as TSV. **The only trustworthy
  source of absolute positions and values.**
- **A single-cell copy returns the FORMULA, not the value.** Copy a range instead.
- **Navigate with the Name Box** — it accepts cross-sheet refs (`Raw_BELL!A1`).
  Playwright tab *clicking* does not work in Sheets.

**Always verify navigation landed** (read the Name Box back), and **verify a
paste by reading the formula back** — not by checking its length. A length check
once let a failed paste pass unnoticed.

## Do not attempt (tried, failed, recorded)

- Driving the conditional-formatting sidebar (material-design panel; selectors
  land on the comment panel instead).
- Creating or configuring native pivots (drag-and-drop, and Sheets blocks writing
  over pivot output).
- `--remote-debugging-port` on the **default** Chrome user-data-dir.
