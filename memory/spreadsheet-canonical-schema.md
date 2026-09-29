---
name: spreadsheet-canonical-schema
description: "JATIM/BELLS-SMV daily-schedule spreadsheet project — topology, 122-col canonical schema, and the two Google Sheets formula traps that cost days"
metadata: 
  node_type: memory
  type: project
  originSessionId: b6d5264f-8b35-4fb3-a989-ef16bc66fe45
---

Two Google Forms (BELLS-GDM `1-FfkvG46…`, SMV `1_9-zq5…`) with similar-but-different columns are normalized into **one 122-column canonical schema**, one formula per tab, in the staging workbook `1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9u8eRM`.

**Canonical layout (122 cols):** 22 header fields → 98 SKU columns → Issue + Insight.
- BELLS-only column: `TL` (pos 7). SMV-only: `Jumlah Botol Sampling yang di bawa` (pos 16).
- BELLS repeats `Nama BA`/`Nama Outlet` **six times** (positions 20–31) because the form branches on TL; each row fills exactly one pair (verified 782/782 rows). These collapse to 2 canonical columns by concatenation.
- BELLS source is 131 cols (`A:EA`), SMV is 121 (`A:DQ`). SKU block is identical in both: BELLS `AF:DY`, SMV `T:DM`.

**Two traps that caused every failure** — see [[google-sheets-formula-traps]]:
1. A `LET` name matching `≤3 letters + digits` is read as a **cell reference** (`c1`→C1, `ch1`→CH1 since CH is a real column) → `#NAME?` with the misleading message "a LET name is duplicated". Use 4+ letters (`chunk1` is safe; no column exceeds `ZZZ`).
2. `&` and `REPT` are **not array-native** — without `ARRAYFORMULA` they return one scalar and `HSTACK` pads every other row with `#N/A`.

**Live tabs:** `Raw_BELL` (5 chunked IMPORTRANGEs `A2:AE`/`AF2:BE`/`BF2:CE`/`CF2:DE`/`DF2:EA`; 3237 rows) and `Raw_SMV` (1 pull `A2:DQ`; 560 rows). Both self-contained, headers byte-identical. A `RAW_PULL` helper tab was built then deleted once both tabs became standalone.

**Browser control** — attach to the **ICE-CUBE browser on CDP 9333**; helper scripts in
`C:\RARA\SPREADSHEET\tools`. See [[spreadsheet-browser-control]] for the setup and what
does not work, and [[spreadsheet-write-scope]] for which files may be written.
Tab *clicking* fails under Playwright, but the Name Box accepts cross-sheet refs
(`Raw_BELL!A1`) and the formula bar (`#t-formula-bar-input`) reads live formulas.
Google Sheets serves any tab as CSV to a logged-in session via
`gviz/tq?tqx=out:csv&sheet=<tab>`.

**Workspace:** everything lives under `C:\RARA\` (a git repo) — `SPREADSHEET\` and
`ICE-CUBE\` as siblings. The older `C:\SPREADSHEET` path is stale.
