---
name: core-formula-traps
description: "Sheets semantics that silently break big LET/array formulas"
updated: 2026-09-29
---

# Formula traps (generic — every one cost days)

**1. A `LET` name must not look like a cell reference.** Sheets reads `1–3
letters + digits` as an A1 address — `c1` → `C1`, `ch1` → `CH1` (`CH` is a real
column; Sheets goes to `ZZZ`). The resulting `#NAME?` claims *"a LET name is
duplicated"*, which is misleading — nothing is duplicated, the name collided
with an address. **Use 4+ letter names** (`chunk1` is safe). Detect it by reading
the formula back: an invalid name renders UPPERCASE, a valid one keeps casing.

**2. `&`, `REPT`, `LEFT`, `IF(SEQUENCE(...))` are not array-native.**
`CHOOSECOLS`, `HSTACK`, `VSTACK`, `FILTER` expand across rows by themselves;
those four do not. Without `ARRAYFORMULA` they compute a single scalar and the
downstream `HSTACK` pads every remaining row with `#N/A`. Symptom: row 1 correct,
everything below `#N/A`, only in the columns built from those constructs.
Fix: `ARRAYFORMULA(colA & colB)`, `ARRAYFORMULA(REPT(col;0))`.

**3. `MONTH(empty)` returns 12.** A blank cell is date serial `0` = 30 Dec 1899.
An open-ended range drags in hundreds of blank rows, all registering as
**December**. Harmless for Sep/Oct, fatal if you ever filter month 12. Guard with
`ARRAYFORMULA(LEN(datecol)>0)`.

**4. `FILTER` with no matches returns an ERROR, not an empty array.** A
diagnostic that finds nothing shows `#VALUE!` instead of a clean empty list.
`IFERROR` alone leaves a stray blank row. **Count before filtering:**
`cnt; SUM(ok*1)` then `IF(cnt=0; blank; …)`.

**5. `IMPORTRANGE` is size-limited per call.** ~103k cells works; ~334k and ~437k
fail. A 131-column × 3,237-row source needs chunked calls (5 worked) — one wide
call fails. Split into ≤~100k cells per call.

**6. An open range is a promise to do maximum work forever.** It returns the
sheet's grid height (often 1,000 rows) when only part holds data, and that
oversized array feeds every `MATCH`. **Filter to non-blank rows before any
per-row work.** Capping rows buys speed with silent data loss — filter, don't cap.

**7. Renaming a tab rewrites the sheet NAME in formulas — never the RANGE.**
`'X'!$B$321:$B$396` becomes `'X-renamed'!$B$321:$B$396`: same rows, which may now
hold completely different data. The formula looks healthy and matches the wrong
people. Lookups reference whole columns and let the match find the row.
Exception (2026-09-29 reversal): grid OUTPUT placed mid-sheet stays bounded to
the live block rows — a whole-column grid spills 1000×30 and fits nowhere real.
Bounded rows are then a maintenance item, re-checked whenever the grid looks short.
