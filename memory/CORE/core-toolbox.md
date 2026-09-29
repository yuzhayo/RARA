---
name: core-toolbox
description: "The 10 pw_* scripts: exact syntax, which ID, when to use, gotchas"
updated: 2026-09-29
---

# Toolbox — SPREADSHEET/tools (all on port 9333, verified 2026-09-29)

## Which tool when

| Need | Command | Notes |
|---|---|---|
| Is browser up? / open JATIM | `python tools/pw_open.py` | Attaches if up; REFUSES to create profile. PROFILE fixed 2026-09-29 → `C:\RARA\BROWSER-AUTOMATION`. Navigates to JATIM on launch |
| Write formula from backup | `python tools/pw_put.py <CellRef> <formula-file> [clear]` | e.g. `pw_put.py "CAL_FEED!A3" CAL_FEED-A3-v2.txt`. Nav via Name Box, verifies landing. Verify paste by reading back. FIXED 2026-09-29: body lived outside the `with` block (IndentationError + dead connection) — script never ran before that date |
| Audit ALL backups vs live | `python tools/pw_audit.py` | 8 pairs. **Needs JATIM RARA open** or exits naming open IDs. TEST pair removed 2026-09-29 (file never on disk) |
| Read tab(s) as CSV (JATIM) | `python tools/pw_read.py [tab ...]` | `SHEET_ID` hardcoded JATIM. No-arg reads default set |
| Read ANY doc tab as CSV | `python tools/pw_src.py <docId> <sheet> [limit]` | Generic — doc from argv. In-page fetch, no navigation, no state change. Limit = chars (default 4000) |
| Peek rows of any doc | `python tools/pw_row.py <docId> <sheet> [nrows]` | Generic, default 2 rows, pretty columns |
| Validate a tab | `python tools/pw_check.py <tab>` | Row/col counts + column samples (JATIM) |
| Read one live formula | `python tools/pw_inspect.py [tab] [cell]` | Defaults `Raw_BELL A1`. Tab-switch via Ctrl+PageDown cycling |
| Colour-fill rows | `python tools/pw_fill.py` | ⚠️ Brittle: hardcoded `ROWS=[22,24,…]` + screen coords `FILL_BTN=(864,85)`. Breaks on other resolutions/machines — confirm before use |
| What's open / signed in? | `python tools/pw_icecube.py` | Lists spreadsheet pages; probes **Tracking** id `1mrju…` (NOT JATIM) |

## Rules

- JATIM work: open it first (`pw_open.py`), pin by ID, verify nav, verify paste.
  Never trust length checks.
- Content questions: gviz (`pw_read/src/row`) — indices are NOT sheet rows.
- Position questions: Name Box + clipboard TSV — the only truth for addresses.
- `pw_src.py` is the safe probe: no navigation, works on any doc ID, usable
  while the operator's browser state must not change. Small targeted peeks only.
- **BAN: full-CSV dump + offline spreadsheet analysis.** Tried and proven
  inefficient (2026-09-29: three full fetches + python harness to answer a
  status question). Allowed ONLY when clipboard / audit / inspect cannot answer
  at all — and then say so in one line before doing it.
