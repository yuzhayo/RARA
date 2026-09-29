---
name: out-calendar-pipeline
description: "OUT-CALENDAR: forms → raw → SOURCE OF TRUTH → CAL_FEED → grid; MISMATCH; validation; open items"
updated: 2026-09-29
---

# OUT-CALENDAR pipeline

Automate the `Rara Raditya Moniko Tama` block of the monthly calendar. ONLY that
block — every other TL block is hand-entered by others. Full ops doc:
`SPREADSHEET/HANDOFF.md` (this file is the memory summary).

```
BELLS form ──► Raw_BELL ─┐
                         ├─► SOURCE OF TRUTH ──► CAL_FEED ──► calendar grid
SMV form ────► Raw_SMV ──┘    739 rows x 122      166 x 6 (month 9)
                              (area-scoped)
                                      └─► MISMATCH   diagnostic — feed rows with no
                                                     home in the target block
STAGING ─────────────────────────────────────────► independent fallback (DO NOT TOUCH)
```

Workbook **"JATIM RARA"** tabs:
`STAGING · Raw_BELL · Raw_SMV · SOURCE OF TRUTH · CAL_FEED · MISMATCH ·
2026.09 (SEPT)-importrange · Sheet10` — all 8 confirmed live 2026-09-29
(CSV serves with data; headers match canonical order).

- `2026.09 (SEPT)-importrange` = LIVE production data from F27. Reference only.
- Source form URLs live in **cell A1 of `Raw_BELL` and `Raw_SMV`** — read them
  from there, never retype. (BELLS-GDM `1-Ffkv…`, SMV `1_9-zq5…` also embedded in
  the txt backups.)

## Live cells

| Cell | Holds | Produces |
|---|---|---|
| `Raw_BELL!A1` | 5 IMPORTRANGEs over `A2:AE` `AF2:BE` `BF2:CE` `CF2:DE` `DF2:EA` | 3238 x 122 |
| `Raw_SMV!A1` | 1 IMPORTRANGE over `A2:DQ` | 561 x 122 |
| `SOURCE OF TRUTH!A1` | VSTACK of both, AREA-filtered, header re-attached | 739 rows (738 data) x 122 |
| `CAL_FEED!A3` | feed, month 9 (live: Sep rows flowing, e.g. LAVITA/23 TENGGILIS/CMSA) | 166 x 6 |
| `CAL_FEED!H3` | feed, month 10 (self-removing dummy row until real data) | 1 row |
| `CAL_FEED!A1` / `H1` | parked grid formulas Sept/Oct — intentionally `#REF!` | — |
| `MISMATCH!A2` | diagnostic | 0–N rows (0 live 2026-09-29: every feed row has a home) |

Backups: `SPREADSHEET/<TAB>-<CELL>-v<N>.txt`, verified character-for-character.
Re-check: `python tools/pw_audit.py` (needs JATIM open in browser; 2026-09-29 it
wasn't — only Tracking was). NOTE: the old `TEST-2026.09 (SEPT)!J321` audit pair
was removed 2026-09-29 — backup file never existed on disk, tab gone.

## MISMATCH (informational — do not act unless asked)

Feed rows whose `(Nama BA, Outlet)` exists nowhere in the target block.
Col E = containment match (strict, case-insensitive).

| You see | Meaning |
|---|---|
| `-- none --` | outlet genuinely absent. Roster question, not naming — no formula fixes it |
| a name in col E | same outlet spelled differently — fixable by normalising |
| same `(BA, outlet)` twice one date | duplicate form submission; `MATCH` takes first |

## Validation (against the ORIGINAL FORMS — never tab-vs-tab)

1. Pull both forms' `Form Responses 1` via gviz. 2. Build `(Nama BA, Nama
   Outlet, day)` → Brand Focus. 3. Read the target block by **clipboard**, not
   gviz. 4. Compare cell by cell. `OFF` cells are hand-typed markers — exclude.
   Second date field = day (see `DOMAIN/domain-scope.md`).

## Open items (known, parked)

- `CAL_FEED!H1` still references the September row range — repoint when the
  October grid block exists.
- Month rollover is manual BY DESIGN (locked months preferred over selector).
- Area key one row imprecise: `Sudarsih` (another TL's BA) inside the 738.
  Harmless (never matches a block row); exact fix needs TL key + name roster.
